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

export async function POST(req: NextRequest) {
  try {
    const { toSign } = await req.json()
    if (!toSign || typeof toSign !== 'string') {
      return NextResponse.json({ error: 'toSign obrigatório' }, { status: 400 })
    }
    const privateKey = process.env.QZ_PRIVATE_KEY
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
  const privateKey = process.env.QZ_PRIVATE_KEY
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
    return new NextResponse('ERRO — a chave privada está configurada mas não é válida (provavelmente colada errado na Vercel — quebra de linha ou texto cortado). Detalhe técnico: ' + (e?.message || ''), {
      status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}
