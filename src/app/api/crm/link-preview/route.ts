import { NextRequest, NextResponse } from 'next/server'

// Gera a prévia de link (imagem/título/site) que aparece dentro da bolha de
// mensagem, no estilo WhatsApp — busca as meta tags og: da página compartilhada.
// Sem dependência externa: extrai via regex mesmo, é só isso que precisamos.

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1$)|^172\.(1[6-9]|2\d|3[01])\./i

function extractMeta(html: string, prop: string): string | null {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i')
  const m1 = html.match(re1)
  if (m1) return m1[1]
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i')
  const m2 = html.match(re2)
  return m2 ? m2[1] : null
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url faltando' }, { status: 400 })

  let parsed: URL
  try { parsed = new URL(url) } catch { return NextResponse.json({ error: 'url inválida' }, { status: 400 }) }
  if (!/^https?:$/.test(parsed.protocol) || PRIVATE_HOST.test(parsed.hostname)) {
    return NextResponse.json({ error: 'url não permitida' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrindadeOnlineBot/1.0; +https://trindadeonline.com.br)' },
    })
    clearTimeout(timeout)
    if (!res.ok) return NextResponse.json({ title: null, image: null, siteName: parsed.hostname.replace(/^www\./, '') })

    const reader = res.body?.getReader()
    let html = ''
    if (reader) {
      const decoder = new TextDecoder()
      while (html.length < 200000) {
        const { done, value } = await reader.read()
        if (done) break
        html += decoder.decode(value, { stream: true })
      }
      reader.cancel().catch(() => {})
    } else {
      html = (await res.text()).slice(0, 200000)
    }

    const title = extractMeta(html, 'og:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null)
    let image = extractMeta(html, 'og:image')
    if (image) { try { image = new URL(image, parsed).toString() } catch { image = null } }
    if (image && !/^https:\/\//i.test(image)) image = null // evita mixed-content / imagem servida via http puro
    const siteName = extractMeta(html, 'og:site_name') || parsed.hostname.replace(/^www\./, '')

    return NextResponse.json({ title: title?.trim().slice(0, 200) || null, image, siteName })
  } catch {
    return NextResponse.json({ title: null, image: null, siteName: parsed.hostname.replace(/^www\./, '') })
  }
}
