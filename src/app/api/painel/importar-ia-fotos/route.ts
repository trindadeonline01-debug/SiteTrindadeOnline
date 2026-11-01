import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

// Rota separada (não dentro de /api/painel/importar-ia) de propósito: juntar
// a extração do cardápio com a busca de foto na internet numa chamada só
// estourava o teto de 300s da function em cardápio grande + várias buscas
// (504 real, Satolo's/outras lojas, out/2026). Cada chamada agora tem seu
// próprio orçamento de tempo.
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Teto de produtos por chamada.
const MAX_WEB_PHOTO_SEARCH = 6

// A IA (Haiku, sem ferramenta de busca) só escreve a consulta em inglês; quem
// acha a imagem é o servidor, direto em bancos de imagem gratuitos. A busca web
// do Claude devolve texto de página, quase nunca a URL de uma imagem — por isso
// voltava "não achou foto" em tudo (e a versão avançada dava 504, 1/nov/2026).
const QuerySchema = z.object({
  consultas: z.array(z.object({
    ref: z.string(),
    consulta: z.string(),
    consulta_ampla: z.string(),
  })),
})

const UA = 'TrindadeOnline/1.0 (https://trindadeonline.com.br; trindadeonline01@gmail.com)'

async function getJson(url: string, ms = 9000): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

async function openverse(q: string): Promise<string | null> {
  const j = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=10&category=photograph&license_type=commercial&mature=false`)
  const r = (j?.results || []).find((x: any) => x?.thumbnail || x?.url)
  return r ? (r.thumbnail || r.url) : null
}

async function wikimedia(q: string): Promise<string | null> {
  const j = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrlimit=10&prop=imageinfo&iiprop=url|mime&iiurlwidth=800&format=json&origin=*`)
  const pages = Object.values(j?.query?.pages || {}) as any[]
  for (const pg of pages) {
    const ii = pg?.imageinfo?.[0]
    if (ii && /^image\/(jpeg|png|webp)$/.test(ii.mime) && (ii.thumburl || ii.url)) return ii.thumburl || ii.url
  }
  return null
}

async function acharImagem(q: string): Promise<string | null> {
  if (!q.trim()) return null
  return (await openverse(q)) || (await wikimedia(q))
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Falta configurar a ANTHROPIC_API_KEY na Vercel pra essa função funcionar.' }, { status: 500 })
    }

    const body = await req.json()
    const { access_token, company_id, produtos } = body as { access_token: string; company_id: string; produtos: { nome: string; categoria: string | null; descricao?: string | null; ref?: string | null }[] }
    if (!access_token || !company_id || !Array.isArray(produtos) || produtos.length === 0) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company) return NextResponse.json({ error: 'empresa não encontrada' }, { status: 404 })
    if (company.owner_id !== userData.user.id) {
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
      if (profile?.user_type !== 'admin') {
        return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
      }
    }

    const lista = produtos.slice(0, MAX_WEB_PHOTO_SEARCH)
    // "ref" identifica cada produto sem depender do nome (nomes repetem no
    // mesmo catálogo). Quem não manda ref (importação de cardápio) casa por nome.
    const refDe = (n: { ref?: string | null }, i: number) => String(n.ref ?? i)
    const listaTxt = lista.map((n, i) => {
      const desc = (n.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 240)
      return `- [ref ${refDe(n, i)}] ${n.nome}${n.categoria ? ` (categoria: ${n.categoria})` : ''}${desc ? ` — composição/descrição: ${desc}` : ''}`
    }).join('\n')
    const prompt = `Vou procurar uma foto ilustrativa de cada produto abaixo num banco de imagens (Openverse/Wikimedia Commons), cujo índice é em inglês. Pra cada produto escreva:
- "consulta": 2 a 5 palavras em inglês descrevendo o item com a composição real (ex: "cheeseburger with fried egg", "grilled picanha steak sandwich"). Use NOME, CATEGORIA e DESCRIÇÃO juntos; a descrição diz do que o item é feito.
- "consulta_ampla": 1 a 2 palavras em inglês, genérica, pra usar se a consulta específica não achar nada (ex: "hamburger", "pizza", "grilled fish").
Nome de combo/kit/marca: foque na comida principal. Não coloque nomes de lojas nem "combo".

Produtos:
${listaTxt}

Devolva uma entrada pra CADA produto, repetindo em "ref" exatamente o valor de [ref ...].`

    const anthropic = new Anthropic()
    const response = await anthropic.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      output_config: { format: zodOutputFormat(QuerySchema) },
      messages: [{ role: 'user', content: prompt }],
    }, { timeout: 30_000, maxRetries: 0 })

    const consultas = response.parsed_output?.consultas || []
    const motivos: Record<string, string> = {}
    const fotos: { ref: string; nome: string; foto_url: string }[] = []

    await Promise.all(lista.map(async (n, i) => {
      const ref = refDe(n, i)
      const c = consultas.find(x => String(x.ref) === ref)
      if (!c) { motivos[ref] = 'a IA não devolveu consulta de busca'; return }
      const url = (await acharImagem(c.consulta)) || (await acharImagem(c.consulta_ampla))
      if (url) fotos.push({ ref, nome: n.nome, foto_url: url })
      else motivos[ref] = `nenhuma imagem nos bancos gratuitos pra "${c.consulta}" / "${c.consulta_ampla}"`
    }))

    return NextResponse.json({ fotos, motivos })
  } catch (err: any) {
    const msg = /timed? ?out|timeout|abort/i.test(String(err?.message)) ? 'a busca demorou demais' : (err?.message || 'falha ao buscar fotos')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
