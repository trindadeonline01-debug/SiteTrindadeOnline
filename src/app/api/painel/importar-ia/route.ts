import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cliente separado (chave anon) só pra validar o access_token de quem chamou
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MAX_PAGE_TEXT = 60000 // ~15-20k tokens, teto de segurança pro custo/tamanho do request
// PDF e fotos chegam como URL do Storage, não mais em base64 dentro do
// corpo do POST — o corpo de uma função da Vercel tem teto de ~4,5MB,
// aplicado pela própria plataforma ANTES do código desta rota rodar
// (tentar checar o tamanho aqui dentro, como um `if` no começo da função,
// não adianta: se o corpo já estourou o teto, o código nunca chega a
// executar). A Vercel recusa com "Request Entity Too Large" em texto
// puro, e o `res.json()` do cliente quebrava nisso com "Unexpected token
// 'R', 'Request En'..." — aconteceu de verdade duas vezes (fotos e depois
// PDF) com o Ricardo, set/2026. Baixando o arquivo aqui, do lado do
// servidor, a partir de uma URL pequena, esse teto de corpo nem entra em
// jogo — só o teto de sanidade abaixo (bem mais generoso, é só pra não
// tentar processar algo absurdo).
const MAX_PHOTO_BYTES = 8 * 1024 * 1024 // teto por foto baixada (compressImage do cliente já mira bem menos que isso)
const MAX_PDF_BYTES = 25 * 1024 * 1024 // teto pro PDF baixado
type ImgMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const ALLOWED_IMG_TYPES: ImgMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const OpcaoSchema = z.object({ nome: z.string(), preco: z.number() })
const GrupoSchema = z.object({
  nome: z.string(),
  obrigatorio: z.boolean(),
  minimo: z.number(),
  maximo: z.number(),
  regra: z.enum(['soma', 'maior_valor']),
  opcoes: z.array(OpcaoSchema),
})
const ProdutoSchema = z.object({
  nome: z.string(),
  categoria: z.string().nullable(),
  descricao: z.string().nullable(),
  preco: z.number(),
  foto_url: z.string().nullable(),
  grupos: z.array(GrupoSchema),
})
const CardapioSchema = z.object({ produtos: z.array(ProdutoSchema) })

const INSTRUCOES = `Você vai extrair o cardápio completo a partir do conteúdo fornecido (link de site, PDF ou fotos de um cardápio) e devolver os produtos encontrados no formato estruturado pedido.

Regras importantes:
1. Pule produtos claramente esgotados/indisponíveis.
2. PREÇO — a informação mais crítica do cardápio, confira com cuidado antes de anotar:
   - Se houver preço riscado ao lado de um preço novo (promoção), use sempre o preço novo — o que o cliente paga de fato.
   - Item customizável tipo "monte seu combo, a partir de R$X": anote esse valor em "preco" e acrescente "(a partir de)" no final da descrição — nunca invente qual seria o preço final montado.
   - Nunca invente ou arredonde um preço. Se não conseguir ler um preço com certeza razoável, não inclua esse produto em vez de adivinhar.
   - Releia os preços antes de responder: qualquer valor abaixo de R$3 pra um prato/combo normal provavelmente foi lido errado — confira de novo.
3. "categoria" é a seção/aba do cardápio onde o produto está (ex: "Bebidas", "Lanches", "Sobremesas"). Sempre preencha quando der pra identificar.
4. "grupos" é pra opcionais/adicionais reais (ex: escolha de sabor, tamanho, adicionais pagos) — nome do grupo, se é obrigatório escolher, mínimo e máximo de opções, a regra de preço ("soma" = soma cada opção escolhida ao preço do produto; "maior_valor" = cobra só a opção mais cara escolhida) e a lista de opções com preço (0 se a opção for grátis). Produto sem opcional: "grupos" é uma lista vazia, não invente grupo que não existe.
5. "foto_url": só preencha com uma URL de imagem real e específica desse produto (nunca repita a mesma foto genérica em vários produtos, nunca invente uma URL). Se não tiver uma URL de foto de verdade pra esse produto, deixe null.
6. Não invente produto, descrição ou preço que não esteja no material fornecido — melhor faltar um item do que inventar um errado.`

function csvField(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

function gruposToField(grupos: z.infer<typeof GrupoSchema>[]): string {
  return grupos
    .filter(g => g.opcoes.length > 0)
    .map(g => {
      const opcoesStr = g.opcoes.map(o => `${o.nome}=${o.preco.toFixed(2)}`).join(' ; ')
      return `${g.nome} | ${g.obrigatorio ? 'obrigatorio' : 'opcional'} | ${Math.max(0, Math.round(g.minimo))} | ${Math.max(1, Math.round(g.maximo))} | ${g.regra} | ${opcoesStr}`
    })
    .join(' && ')
}

function htmlToText(html: string): { text: string; imageUrls: string[] } {
  const imageUrls = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)).map(m => m[1])
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n')
    .trim()
  return { text, imageUrls }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Falta configurar a ANTHROPIC_API_KEY na Vercel pra essa função funcionar.' }, { status: 500 })
    }

    const body = await req.json()
    const { access_token, company_id, source } = body
    if (!access_token || !company_id || !source) {
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

    const content: Anthropic.Messages.ContentBlockParam[] = []

    if (source === 'url') {
      const url: string = body.url
      if (!url) return NextResponse.json({ error: 'informa o link do cardápio' }, { status: 400 })
      let html: string
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(20000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          },
        })
        if (!res.ok) return NextResponse.json({ error: `não deu pra acessar essa URL (status ${res.status})` }, { status: 400 })
        html = await res.text()
      } catch {
        return NextResponse.json({ error: 'não deu pra acessar essa URL (fora do ar ou demorou demais)' }, { status: 400 })
      }
      const { text, imageUrls } = htmlToText(html)
      if (text.length < 300) {
        return NextResponse.json({ error: 'Essa página não trouxe conteúdo suficiente pra ler — comum em cardápios que carregam por JavaScript (app do iFood, Anota Aí etc). Tenta importar por PDF ou fotos do cardápio.' }, { status: 422 })
      }
      const resolvedImages = [...new Set(imageUrls.map(src => { try { return new URL(src, url).toString() } catch { return null } }).filter((s): s is string => !!s))].slice(0, 300)
      content.push({
        type: 'text',
        text: `${INSTRUCOES}\n\nConteúdo da página (texto extraído do HTML):\n${text.slice(0, MAX_PAGE_TEXT)}\n\nURLs de imagem encontradas nessa mesma página (podem ser fotos de produtos — combine pelo contexto/proximidade no texto, nunca chute):\n${resolvedImages.join('\n')}`,
      })
    } else if (source === 'pdf') {
      const pdf_url: string = body.pdf_url
      if (!pdf_url) return NextResponse.json({ error: 'PDF não enviado' }, { status: 400 })
      let pdfRes: Response
      try {
        pdfRes = await fetch(pdf_url, { signal: AbortSignal.timeout(20000) })
      } catch {
        return NextResponse.json({ error: 'não consegui baixar o PDF enviado' }, { status: 400 })
      }
      if (!pdfRes.ok) return NextResponse.json({ error: 'não consegui baixar o PDF enviado' }, { status: 400 })
      const pdfBuf = Buffer.from(await pdfRes.arrayBuffer())
      if (pdfBuf.byteLength > MAX_PDF_BYTES) return NextResponse.json({ error: 'PDF grande demais' }, { status: 413 })
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBuf.toString('base64') } })
      content.push({ type: 'text', text: `${INSTRUCOES}\n\nO cardápio a ler é o PDF anexado.` })
    } else if (source === 'fotos') {
      // As fotos chegam como URL pública (já enviadas pro Storage pelo
      // cliente), não mais em base64 dentro do corpo do POST — o corpo de
      // uma função da Vercel tem teto de ~4,5MB, e 2-3 fotos de cardápio
      // (celular moderno, mesmo comprimidas) já estouravam isso sozinhas.
      // Quando estourava, a Vercel devolvia "Request Entity Too Large" em
      // TEXTO PURO antes do código desta rota sequer rodar — o cliente
      // tentava `res.json()` nessa resposta e quebrava com "Unexpected
      // token 'R', 'Request En'..." (achado real do Ricardo, set/2026).
      // Mandando só a URL (string pequena) e baixando a foto aqui, do lado
      // do servidor, esse teto de corpo de requisição nem entra em jogo.
      const foto_urls: string[] = body.foto_urls || []
      if (!foto_urls.length) return NextResponse.json({ error: 'nenhuma foto enviada' }, { status: 400 })
      if (foto_urls.length > 8) return NextResponse.json({ error: 'no máximo 8 fotos por vez' }, { status: 400 })
      for (const url of foto_urls) {
        let imgRes: Response
        try {
          imgRes = await fetch(url, { signal: AbortSignal.timeout(20000) })
        } catch {
          return NextResponse.json({ error: 'não consegui baixar uma das fotos enviadas' }, { status: 400 })
        }
        if (!imgRes.ok) return NextResponse.json({ error: 'não consegui baixar uma das fotos enviadas' }, { status: 400 })
        const buf = Buffer.from(await imgRes.arrayBuffer())
        if (buf.byteLength > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'uma das fotos ficou grande demais' }, { status: 413 })
        const contentType = imgRes.headers.get('content-type') || ''
        const media_type: ImgMediaType = (ALLOWED_IMG_TYPES as string[]).includes(contentType) ? (contentType as ImgMediaType) : 'image/jpeg'
        content.push({ type: 'image', source: { type: 'base64', media_type, data: buf.toString('base64') } })
      }
      content.push({ type: 'text', text: `${INSTRUCOES}\n\nO cardápio a ler são as fotos anexadas (podem ser várias páginas/ângulos de um cardápio físico).` })
    } else {
      return NextResponse.json({ error: 'origem inválida' }, { status: 400 })
    }

    const anthropic = new Anthropic()
    const response = await anthropic.messages.parse({
      model: 'claude-sonnet-5',
      // Acima de ~21.333 o SDK exige streaming (calcula um tempo esperado
      // pelo teto de tokens e recusa non-streaming além de 10min) — 20.000
      // fica seguro abaixo disso e ainda dá folga generosa pro maior
      // catálogo que já vimos aqui (Satolo's, 77 produtos ativos).
      max_tokens: 20000,
      output_config: { format: zodOutputFormat(CardapioSchema) },
      messages: [{ role: 'user', content }],
    })

    const parsed = response.parsed_output
    if (!parsed || parsed.produtos.length === 0) {
      return NextResponse.json({ error: 'não encontrei produtos nesse cardápio — confere se o link/arquivo está certo, ou tenta outro formato' }, { status: 422 })
    }

    const header = 'nome,categoria,descricao,preco,grupos,foto_url'
    const rows = parsed.produtos.map(p => [
      csvField(p.nome),
      csvField(p.categoria || ''),
      csvField(p.descricao || ''),
      p.preco.toFixed(2),
      csvField(gruposToField(p.grupos)),
      csvField(p.foto_url || ''),
    ].join(','))
    const csv = [header, ...rows].join('\n')

    const categoriasSet = new Set(parsed.produtos.map(p => (p.categoria || '').trim().toLowerCase()).filter(Boolean))
    const imagens = parsed.produtos.filter(p => p.foto_url).length
    const grupos = parsed.produtos.reduce((n, p) => n + p.grupos.filter(g => g.opcoes.length > 0).length, 0)

    return NextResponse.json({ categorias: categoriasSet.size, produtos: parsed.produtos.length, imagens, grupos, csv })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'falha ao ler o cardápio com IA' }, { status: 500 })
  }
}
