import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Conta quem abriu o link de jogos que saiu no WhatsApp: `r` = link "enquanto você espera" (jogo_links_enviados),
// `p` = link do jogo com cashback do delivery (jogo_ofertas_pedido). Monitor em admin → Jogos.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const OK = /^[A-Za-z0-9_-]{8,64}$/

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { r?: string; p?: string }
  const tabela = b.r ? 'jogo_links_enviados' : b.p ? 'jogo_ofertas_pedido' : null
  const token = String(b.r || b.p || '')
  if (!tabela || !OK.test(token)) return NextResponse.json({ ok: false })
  const { data } = await sb.from(tabela).select('id, acessos, primeiro_acesso_em').eq('token', token).maybeSingle()
  if (data) {
    const agora = new Date().toISOString()
    await sb.from(tabela).update({ acessos: (data.acessos || 0) + 1, primeiro_acesso_em: data.primeiro_acesso_em || agora, ultimo_acesso_em: agora }).eq('id', data.id)
  }
  return NextResponse.json({ ok: true })
}
