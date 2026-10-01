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
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Teto de produtos por chamada — cada um gasta pelo menos uma rodada de
// web_search, e isso precisa caber dentro do maxDuration acima.
const MAX_WEB_PHOTO_SEARCH = 12

const FotoWebSchema = z.object({
  resultados: z.array(z.object({ nome: z.string(), foto_url: z.string().nullable() })),
})

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Falta configurar a ANTHROPIC_API_KEY na Vercel pra essa função funcionar.' }, { status: 500 })
    }

    const body = await req.json()
    const { access_token, company_id, produtos } = body as { access_token: string; company_id: string; produtos: { nome: string; categoria: string | null }[] }
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
    const listaTxt = lista.map(n => `- ${n.nome}${n.categoria ? ` (${n.categoria})` : ''}`).join('\n')
    const prompt = `Pra cada produto da lista abaixo, use a ferramenta de busca na internet e encontre UMA foto que representa bem esse tipo de produto — não precisa ser desse estabelecimento específico, pode ser uma foto ilustrativa/genérica do prato ou item (ex: foto de stock, site de receita, Wikipedia, cardápio de outro lugar), só precisa parecer de verdade com o que o nome descreve.

Produtos:
${listaTxt}

Regras:
- "foto_url" só pode ser uma URL que você realmente encontrou nos resultados de busca — nunca invente ou monte uma URL.
- Prefira link direto de imagem (termina em .jpg/.jpeg/.png/.webp) quando a busca trouxer um.
- Se não achar nada que pareça razoável pra algum produto, devolva foto_url null pra ele — melhor sem foto do que uma foto errada.
- Devolva um resultado pra CADA produto da lista, usando exatamente o mesmo "nome" que apareceu acima.`

    const anthropic = new Anthropic()
    const response = await anthropic.messages.parse({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: Math.min(lista.length * 2, 24) }],
      output_config: { format: zodOutputFormat(FotoWebSchema) },
      messages: [{ role: 'user', content: prompt }],
    })

    const parsed = response.parsed_output
    const fotos = (parsed?.resultados || []).filter(r => !!r.foto_url) as { nome: string; foto_url: string }[]
    return NextResponse.json({ fotos })
  } catch (err: any) {
    // Busca de foto nunca pode travar o import do cardápio em si — quem
    // chama essa rota já trata falha aqui como "segue sem essas fotos".
    return NextResponse.json({ error: err?.message || 'falha ao buscar fotos' }, { status: 500 })
  }
}
