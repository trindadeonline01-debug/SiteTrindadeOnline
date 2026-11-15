import { createClient } from '@supabase/supabase-js'
import { jogosOgImage, jogosOgSize } from '@/lib/jogosOgImage'

export const size = jogosOgSize
export const contentType = 'image/png'
export const alt = 'Jogue e ganhe cashback — Trindade Online'

// O token do link fica só no servidor (service role): a tabela de ofertas não é pública.
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let loja = 'Trindade Online'
  if (/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
    const { data: o } = await supabase.from('jogo_ofertas_pedido').select('company_id').eq('token', token).maybeSingle()
    if (o) { const { data: c } = await supabase.from('companies').select('name').eq('id', o.company_id).maybeSingle(); if (c?.name) loja = c.name }
  }
  return jogosOgImage(loja, 'Jogue e ganhe cashback', 'Quiz ou Caça-Palavras: vale a sua primeira jogada')
}
