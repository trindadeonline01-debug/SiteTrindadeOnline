import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/requireUser'
import { enviarPushLoja } from '@/lib/pushLoja'

// Botão "Teste completo" do assistente de configuração do app da loja:
// manda um push de teste pros aparelhos da empresa (com a tela apagada o
// lojista confere se o tablet acorda e toca). Só dono da empresa ou admin.
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    const access = await requireCompanyAccess(req, companyId)
    if (access instanceof NextResponse) return access

    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      return NextResponse.json({ error: 'O envio de push ainda não está configurado no servidor.' }, { status: 503 })
    }
    const r = await enviarPushLoja(companyId, {
      title: 'Teste do Trindade Loja',
      body: 'Se você ouviu o toque, está tudo certo. Toque aqui para concluir.',
      data: { tipo: 'teste' },
    })
    if (r.enviados === 0) {
      return NextResponse.json({ error: r.falhas ? 'O Firebase recusou o envio. Veja os logs do servidor.' : 'Nenhum aparelho cadastrado ainda. Abra o app, aceite as notificações e tente de novo.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true, enviados: r.enviados })
  } catch (err) {
    console.error('[loja/teste-push]', err)
    return NextResponse.json({ error: 'falha ao enviar o teste' }, { status: 500 })
  }
}
