import { createClient } from '@supabase/supabase-js'
import { cashbackOgImage, jogosOgSize } from '@/lib/jogosOgImage'
import { lerQuizPcts, lerCacaBonus } from '@/lib/jogosPremio'

export const size = jogosOgSize
export const contentType = 'image/png'
export const alt = 'Jogue e ganhe cashback — Trindade Online'

// O token do link fica só no servidor (service role): a tabela de ofertas não é pública.
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let loja = 'Trindade Online', max = 10
  if (/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
    const { data: o } = await supabase.from('jogo_ofertas_pedido').select('company_id').eq('token', token).maybeSingle()
    if (o) {
      const [{ data: c }, { data: q }] = await Promise.all([
        supabase.from('companies').select('name').eq('id', o.company_id).maybeSingle(),
        supabase.from('quiz_campanhas').select('marcos, caca_marcos').eq('company_id', o.company_id).maybeSingle(),
      ])
      if (c?.name) loja = c.name
      if (q) { max = Math.max(...lerQuizPcts(q.marcos), ...lerCacaBonus(q.caca_marcos)) }
    }
  }
  return cashbackOgImage(loja, max)
}
