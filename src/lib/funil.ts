// Rastreio leve do funil do cardápio (nov/2026): de onde o cliente veio, se abriu, se montou carrinho e se
// deixou o carrinho para trás. Vai pra /api/loja/funil e alimenta a "Inteligência de consumo" da loja.
// Nunca pode atrapalhar a compra: qualquer falha é engolida em silêncio.
const KS = 'trindade_funil_sessao'
const KO = 'trindade_funil_origem'

function sessao(): string | null {
  try {
    let s = sessionStorage.getItem(KS)
    if (!s) { s = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); sessionStorage.setItem(KS, s) }
    return s
  } catch { return null }
}

export function origemDaVisita(): string {
  try {
    const salva = sessionStorage.getItem(KO)
    if (salva) return salva
    const q = new URLSearchParams(window.location.search)
    const explicita = (q.get('o') || q.get('utm_source') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)
    let o = explicita
    if (!o) {
      const ref = document.referrer
      if (!ref) o = 'direto'
      else {
        let host = '', path = ''
        try { const u = new URL(ref); host = u.hostname; path = u.pathname } catch { /* ignora */ }
        if (host === window.location.hostname) o = path.startsWith('/peca-agora') ? 'peca_agora' : path.startsWith('/empresa') ? 'perfil' : 'site'
        else if (/instagram|l\.instagram/.test(host)) o = 'instagram'
        else if (/facebook|fb\.com|l\.facebook/.test(host)) o = 'facebook'
        else if (/google/.test(host)) o = 'google'
        else if (/whatsapp|wa\.me/.test(host)) o = 'whatsapp'
        else if (/tiktok/.test(host)) o = 'tiktok'
        else o = 'outro_site'
      }
    }
    sessionStorage.setItem(KO, o)
    return o
  } catch { return 'direto' }
}

export type FunilEvento = 'cardapio_aberto' | 'carrinho_add' | 'carrinho_telefone' | 'pedido_feito'

export function funilTrack(companyId: string | undefined | null, evento: FunilEvento, extra: { produtoId?: string; itens?: { n: string; q: number }[]; telefone?: string } = {}) {
  if (!companyId || typeof window === 'undefined') return
  try {
    const s = sessao()
    if (!s) return
    if (evento === 'cardapio_aberto') {
      const k = KS + '_aberto_' + companyId
      if (sessionStorage.getItem(k)) return
      sessionStorage.setItem(k, '1')
    }
    fetch('/api/loja/funil', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ companyId, sessao: s, evento, origem: origemDaVisita(), ...extra }),
    }).catch(() => {})
  } catch { /* nunca atrapalha a compra */ }
}
