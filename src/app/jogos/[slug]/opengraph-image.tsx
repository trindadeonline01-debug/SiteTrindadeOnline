import { createClient } from '@supabase/supabase-js'
import { jogosOgImage, jogosOgSize } from '@/lib/jogosOgImage'

export const size = jogosOgSize
export const contentType = 'image/png'
export const alt = 'Jogos — Trindade Online'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data } = await supabase.from('companies').select('name').eq('slug', slug).maybeSingle()
  return jogosOgImage(data?.name || 'Trindade Online', 'Jogue enquanto seu pedido fica pronto', 'Quiz e Caça-Palavras para passar o tempo')
}
