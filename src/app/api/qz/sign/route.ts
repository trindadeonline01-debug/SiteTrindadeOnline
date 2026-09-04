// Assina as mensagens que o QZ Tray manda pra confirmar a identidade do
// site antes de liberar acesso à impressora — troca o modo "anônimo" (que
// pede permissão de novo em quase toda conexão) pelo modo assinado, que o
// QZ Tray consegue lembrar de vez no "Site Manager" dele, igual já
// funciona pro concorrente Cardápio Web.
//
// A chave privada nunca sai do servidor. O front só manda o texto que
// precisa ser assinado (formato exato exigido pelo QZ Tray) e recebe de
// volta a assinatura em base64.
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Campo de variável de ambiente da Vercel costuma comer as quebras de
// linha do meio da chave quando é colada (vira tudo uma linha só, ou os
// "\n" viram texto literal de duas letras em vez de quebra de linha de
// verdade) — isso quebra o formato PEM mesmo com o conteúdo certo.
// Em vez de depender de colar perfeito, reconstrói o PEM certo a partir
// do que sobrou: acha os marcadores BEGIN/END, tira todo espaço/quebra
// de linha do meio e recoloca uma quebra a cada 64 caracteres, que é o
// formato que todo parser de PEM espera.
function normalizePrivateKey(raw: string): string {
  const unescaped = raw.trim().replace(/\\n/g, '\n')
  const match = unescaped.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/)
  if (!match) return unescaped
  const header = unescaped.includes('BEGIN RSA PRIVATE KEY') ? 'RSA PRIVATE KEY' : 'PRIVATE KEY'
  const body = match[1].replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) || []
  return `-----BEGIN ${header}-----\n${lines.join('\n')}\n-----END ${header}-----\n`
}

function loadPrivateKey(): string | null {
  const raw = process.env.QZ_PRIVATE_KEY
  if (!raw) return null
  return normalizePrivateKey(raw)
}

export async function POST(req: NextRequest) {
  try {
    const { toSign } = await req.json()
    if (!toSign || typeof toSign !== 'string') {
      return NextResponse.json({ error: 'toSign obrigatório' }, { status: 400 })
    }
    const privateKey = loadPrivateKey()
    if (!privateKey) {
      return NextResponse.json({ error: 'QZ_PRIVATE_KEY não configurada' }, { status: 500 })
    }
    const signature = crypto.sign('RSA-SHA512', Buffer.from(toSign, 'utf8'), privateKey).toString('base64')
    return NextResponse.json({ signature })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao assinar' }, { status: 500 })
  }
}

// Auto-teste pra diagnosticar direto pelo navegador — basta digitar esse
// endereço na barra do navegador (sem precisar copiar/colar nada) que ele
// já assina uma frase de teste e mostra em texto simples se funcionou.
export async function GET() {
  const privateKey = loadPrivateKey()
  if (!privateKey) {
    return new NextResponse('QZ_PRIVATE_KEY não está configurada na Vercel — precisa adicionar essa variável de ambiente.', {
      status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
  try {
    const signature = crypto.sign('RSA-SHA512', Buffer.from('teste', 'utf8'), privateKey).toString('base64')
    return new NextResponse('OK — certificado configurado certinho! Assinatura de teste: ' + signature.slice(0, 40) + '...', {
      status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (e: any) {
    return new NextResponse('ERRO — a chave privada está configurada mas não é válida. Detalhe técnico: ' + (e?.message || ''), {
      status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}
