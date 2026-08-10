import Image from 'next/image'
import WAButton from '@/components/WAButton'
import OneSignalInit from '@/components/OneSignalInit'
import CookieBanner from '@/components/CookieBanner'
import HomeSearchBox from '@/components/home/HomeSearchBox'
import HomeBannerCarousel from '@/components/home/HomeBannerCarousel'
import HomeBottomNav from '@/components/home/HomeBottomNav'
import HomeAbertoAgora from '@/components/home/HomeAbertoAgora'
import { createServerSupabase } from '@/lib/supabase-server'
import { isOpenNow, HourRow } from '@/lib/businessHours'

interface PaidCompany {
  id: string; name: string; slug: string; avg_rating: number; total_reviews: number
  category?: { name: string; emoji?: string } | null
  photos?: { url: string; order: number }[]
}

interface OpenCompany {
  id: string; name: string; slug: string; plan: string; delivery_available: boolean
  category?: { emoji?: string } | null
  photos?: { url: string; order: number }[]
  subcategories?: { subcategory: { id: string; name: string; emoji: string } | null }[]
  hours?: HourRow[]
}

interface Listing {
  id: string; title: string; price: number | null
  type: string; created_at: string
  photos?: { url: string; order: number }[]
}

interface Banner {
  id: string; title: string; subtitle: string | null; description: string | null
  link_url: string | null; image_url: string | null; image_url_mobile: string | null; display_order: number
}

// Carrosséis de empresas pagas na home — 1 por categoria, ordem pedida:
// gastronomia primeiro, depois comércios, depois serviços
const PAID_CAROUSELS: [string, string, string, string][] = [
  ['00000000-0000-0000-0000-000000000003', 'gastronomia', '🍽️ GASTRONOMIA', '/categoria/gastronomia'],
  ['00000000-0000-0000-0000-000000000001', 'comercios',   '🏪 COMÉRCIOS',    '/categoria/comercios'],
  ['00000000-0000-0000-0000-000000000002', 'servicos',    '🔧 SERVIÇOS',     '/categoria/servicos'],
]
const PAID_CAROUSEL_SIZE = 10

// sort(() => Math.random()-0.5) é um shuffle enviesado — pra listas
// pequenas, mistura pouco e sempre deixa os mesmos no topo. Fisher-Yates
// é o shuffle de verdade, com distribuição uniforme
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function Stars({ rating }: { rating: number }) {
  const r = Math.round(rating)
  return <span style={{ color: '#C9951A', fontSize: 11 }}>{'★'.repeat(r)}{'☆'.repeat(5 - r)}</span>
}

const TEMAS: Record<string, { heroBg: string, dest: string }> = {
  'classico-preto':  { heroBg: '#111111', dest: '#C9951A' },
  'trindade-quente': { heroBg: '#7A2020', dest: '#F0A500' },
  'verde-raiz':      { heroBg: '#1A3A2A', dest: '#5DBF8A' },
  'azul-confianca':  { heroBg: '#0D2B45', dest: '#3A9FD8' },
  'terra-morna':     { heroBg: '#3D2B1A', dest: '#D4845A' },
  'branco-limpo':    { heroBg: '#F5F5F5', dest: '#C9951A' },
}

const PULSE_PRESETS: Record<string, { bg: string, text: string }> = {
  classico: { bg: '#111111', text: '#C9951A' },
  promocao: { bg: '#C0392B', text: '#FFFFFF' },
  frete:    { bg: '#0F8050', text: '#FFFFFF' },
  urgente:  { bg: '#E07030', text: '#FFFFFF' },
  elegante: { bg: '#FFFFFF', text: '#111111' },
}

export default async function HomePage() {
  // O login guarda a sessão no localStorage do navegador (não em cookie),
  // então esse cliente de servidor nunca vê quem está logado — serve só
  // pra buscar dado público. Quem é o usuário (pra nav mobile, busca etc.)
  // continua sendo resolvido no navegador, no HomeBottomNav/HomeSearchBox.
  const supabaseServer = await createServerSupabase()

  // Todas as consultas daqui são independentes entre si — rodam em paralelo
  // em vez de uma esperar a outra terminar, o que cortava bastante o tempo
  // até a home aparecer com conteúdo de verdade. Agora rodam no servidor,
  // antes de mandar qualquer HTML pro navegador — sem tela de carregando.
  const types = ['desapega', 'emprego', 'imovel']

  const [bannersRes, paidResults, listingResults, pulseRes, settingsRes] = await Promise.all([
    supabaseServer.from('banners').select('*').eq('active', true).order('display_order'),
    Promise.all(PAID_CAROUSELS.map(([categoryId]) =>
      supabaseServer.from('companies')
        .select('id, name, slug, avg_rating, total_reviews, category:categories(name,emoji), photos:company_photos(url,order)')
        .eq('plan', 'paid').eq('status', 'active').eq('category_id', categoryId)
    )),
    Promise.all(types.map(type =>
      supabaseServer.from('listings')
        .select('id, title, price, type, created_at, photos:listing_photos(url,order)')
        .eq('type', type).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(5)
    )),
    supabaseServer.from('pulse_messages').select('id, message').eq('active', true).order('display_order'),
    supabaseServer.from('site_settings').select('key,value'),
  ])

  // SHUFFLE — ordem aleatória a cada carregamento
  const banners = shuffle((bannersRes.data || []) as Banner[])

  // Empresas pagas por categoria — todo mundo no plano pago é buscado (sem
  // limite na consulta), embaralhado de verdade e só então cortado nas
  // primeiras 10 — assim a cada carregamento é um recorte diferente do
  // total, não sempre as mesmas
  const paidCompanies: Record<string, PaidCompany[]> = {}
  PAID_CAROUSELS.forEach(([, key], i) => {
    paidCompanies[key] = shuffle((paidResults[i].data || []) as any as PaidCompany[]).slice(0, PAID_CAROUSEL_SIZE)
  })

  const recentListings: Record<string, Listing[]> = {}
  types.forEach((type, i) => { recentListings[type] = (listingResults[i].data || []) as Listing[] })

  const pulseMessages = pulseRes.data || []

  let siteTheme = 'classico-preto'
  let bannerEnabled = true
  let pulseColorPreset = 'classico'
  let abertoAgoraEnabled = false
  let entregandoAgoraEnabled = false
  const siteSettings = settingsRes.data
  if (siteSettings) {
    const theme = siteSettings.find((s: any) => s.key === 'active_theme')
    const bannerSetting = siteSettings.find((s: any) => s.key === 'banner_enabled')
    const pulseColor = siteSettings.find((s: any) => s.key === 'pulse_color_preset')
    const abertoAgora = siteSettings.find((s: any) => s.key === 'aberto_agora_enabled')
    const entregandoAgora = siteSettings.find((s: any) => s.key === 'entregando_agora_enabled')
    if (theme) siteTheme = theme.value || 'classico-preto'
    if (bannerSetting) bannerEnabled = bannerSetting.value === 'true'
    if (pulseColor) pulseColorPreset = pulseColor.value || 'classico'
    abertoAgoraEnabled = abertoAgora?.value === 'true'
    entregandoAgoraEnabled = entregandoAgora?.value === 'true'
  }

  const tema = TEMAS[siteTheme] || TEMAS['classico-preto']

  // "Aberto agora"/"Entregando agora" — só busca esse tanto de dado (todas
  // as empresas ativas + horário) quando pelo menos uma das duas seções
  // está ligada em Aparência. Enquanto as duas estiverem desativadas (hoje
  // em dia), essa consulta nem roda
  let openCompanies: OpenCompany[] = []
  let deliveringCompanies: OpenCompany[] = []
  let abertoAgoraChips: { id: string; name: string; emoji: string; count: number }[] = []

  if (abertoAgoraEnabled || entregandoAgoraEnabled) {
    const { data: candidates } = await supabaseServer
      .from('companies')
      .select('id, name, slug, plan, delivery_available, category:categories(emoji), photos:company_photos(url,order), subcategories:company_subcategories(subcategory:subcategories(id,name,emoji)), hours:company_hours(day_of_week,open_time,close_time,closed)')
      .eq('status', 'active')

    const open = ((candidates || []) as any as OpenCompany[]).filter(c => isOpenNow(c.hours))
    // Paga primeiro (mesma prioridade dos outros carrosséis da home),
    // embaralhado dentro de cada grupo pra dar visibilidade igual
    openCompanies = [...shuffle(open.filter(c => c.plan === 'paid')), ...shuffle(open.filter(c => c.plan !== 'paid'))]

    if (entregandoAgoraEnabled) {
      deliveringCompanies = openCompanies.filter(c => c.delivery_available)
    }

    if (abertoAgoraEnabled) {
      const counts = new Map<string, { id: string; name: string; emoji: string; count: number }>()
      openCompanies.forEach(c => {
        (c.subcategories || []).forEach(s => {
          const sub = s.subcategory
          if (!sub) return
          const cur = counts.get(sub.id)
          if (cur) cur.count++
          else counts.set(sub.id, { id: sub.id, name: sub.name, emoji: sub.emoji, count: 1 })
        })
      })
      abertoAgoraChips = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; color: #111; }


        .hero { padding: 28px 16px 8px; text-align: center; margin: 0; }
        .hero-title { font-family: 'Bebas Neue', sans-serif; font-size: clamp(30px, 8vw, 72px); letter-spacing: 4px; line-height: 1; margin-bottom: 8px; display: block; }
        .hero-title span { color: #C9951A; }
        .hero-sub { font-size: clamp(12px, 3vw, 16px); color: #888; margin-bottom: 20px; display: block; }
        .hero-search-wrap {
          display: flex; max-width: 600px; margin: 0 auto; align-items: center; gap: 8px;
          background: #fff; border: 2px solid #C9951A; border-radius: 50px;
          padding: 6px 6px 6px 16px; box-shadow: 0 4px 20px rgba(201,149,26,.12);
          transform: none; position: relative; z-index: 20;
        }
        .hero-search-wrap input { flex: 1; border: none; background: transparent; font-size: 16px; font-family: 'Inter', sans-serif; color: #222; outline: none; }
        .hero-search-wrap input::placeholder { color: #BBB; }
        .search-suggestions { position:absolute; top:100%; left:0; right:0; background:#fff; border:1.5px solid #C9951A; border-radius:14px; margin-top:6px; box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:100; overflow:hidden; }
        .sug-item { display:flex; align-items:center; gap:10px; padding:10px 16px; cursor:pointer; transition:background .12s; border-bottom:0.5px solid #F5F2EC; }
        .sug-item:last-child { border-bottom:none; }
        .sug-item:hover { background:#FEF3E2; }
        .sug-ico { font-size:14px; flex-shrink:0; }
        .sug-label { font-size:13px; font-weight:600; color:#111; text-align:left; }
        .sug-sub { font-size:11px; color:#AAA; margin-top:1px; text-align:left; }
        .hero-search-btn { background: #C9951A; border: none; border-radius: 50px; padding: 9px 16px; color: #fff; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; } @media(max-width: 480px) { .hero-search-btn { padding: 8px 10px; font-size: 12px; } .hero-search-wrap { padding: 4px 4px 4px 12px; } }
        @media(min-width: 768px) {
          .hero { padding: 43px 20px 48px; }
          .hero-title, .hero-sub { display: block; }
          .hero-search-wrap {
            display: flex; max-width: 600px; margin: 0 auto; align-items: center; gap: 8px;
            background: #fff; border: 2px solid #C9951A; border-radius: 50px;
            padding: 6px 6px 6px 20px; box-shadow: 0 4px 20px rgba(201,149,26,.12);
            transform: none; position: relative; z-index: 20;
          }
          .hero-search-wrap input { flex: 1; border: none; background: transparent; font-size: 15px; font-family: 'Inter', sans-serif; color: #222; outline: none; }
          .hero-search-wrap input::placeholder { color: #BBB; }
          .search-suggestions { position:absolute; top:100%; left:0; right:0; background:#fff; border:1.5px solid #C9951A; border-radius:14px; margin-top:6px; box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:100; overflow:hidden; }
        .sug-item { display:flex; align-items:center; gap:10px; padding:10px 16px; cursor:pointer; transition:background .12s; border-bottom:0.5px solid #F5F2EC; }
        .sug-item:last-child { border-bottom:none; }
        .sug-item:hover { background:#FEF3E2; }
        .sug-ico { font-size:14px; flex-shrink:0; }
        .sug-label { font-size:13px; font-weight:600; color:#111; text-align:left; }
        .sug-sub { font-size:11px; color:#AAA; margin-top:1px; text-align:left; }
        .hero-search-btn { background: #C9951A; border: none; border-radius: 50px; padding: 10px 24px; color: #fff; font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
        }

        /* BANNER */
        @media(max-width: 767px) {
          .banner-inner-wrap { height: auto; aspect-ratio: 5/2; padding-top: 0; }
        }
        .pulse-ticker { width: 100%; background: #111; padding: 9px 0; }
        .pulse-track-clip { max-width: 1200px; margin: 0 auto; overflow: hidden; }
        .pulse-track { display: flex; width: max-content; animation: pulse-scroll linear infinite; }
        .pulse-item { color: #C9951A; font-size: 13px; font-weight: 600; white-space: nowrap; padding: 0 24px; font-family: 'Inter', sans-serif; position: relative; }
        .pulse-item::after { content: '•'; position: absolute; right: -2px; color: #555; }
        @keyframes pulse-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        .banner-outer { width: 100%; }
        .banner-inner-wrap {
          width: 100%; height: 359px;
          background: linear-gradient(105deg, #1a0f00 0%, #3d2200 50%, #5c3300 100%);
          display: flex; align-items: center; position: relative; overflow: hidden; padding-top: 30px;
        }
        @media(max-width: 767px) {
          .banner-inner-wrap { height: auto; min-height: unset; padding-top: 0; display: block; }
          .banner-img { position: relative !important; inset: unset !important; width: 100% !important; height: auto !important; object-fit: contain !important; display: block; }
          .banner-content-wrap { display: none; }
        }
        .banner-deco { position: absolute; right: 8%; top: 50%; transform: translateY(-50%); font-size: 130px; opacity: 0.08; pointer-events: none; }
        .banner-content-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px; width: 100%; position: relative; z-index: 2; }
        .banner-title-text { font-family: 'Bebas Neue', sans-serif; font-size: 46px; color: #fff; line-height: 1; margin-bottom: 4px; }
        .banner-sub-text { color: #ccc; font-size: 14px; margin-bottom: 4px; }
        .banner-desc-text { color: #999; font-size: 12px; }

        /* setas do banner — abaixo do banner, junto com os dots, não mais
           sobrepondo a imagem */
        .banner-arrow {
          width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
          background: #fff; border: 1.5px solid #E0DDD8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s;
        }
        .banner-arrow:hover { border-color: #C9951A; background: #FEF3E2; }

        /* dots + setas — fora do banner, entre banner e categorias */
        .banner-dots-outer {
          display: flex; justify-content: center; align-items: center; gap: 12px;
          padding: 10px 0 0;
          background: #F0EDE8;
        }
        .banner-dots-row { display: flex; align-items: center; gap: 8px; }
        .banner-dot {
          height: 8px; border-radius: 4px; cursor: pointer;
          transition: all 0.3s; background: rgba(0,0,0,0.18);
        }
        .banner-dot.on { background: #C9951A; }

        .main-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

        .cat-overlap { margin-top: -40px; position: relative; z-index: 10; }
        .cat-card-wrap { background: #fff; border: 1px solid #e0e0e0; border-radius: 14px; padding: 24px 28px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
        .cat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; }
        @media(min-width: 768px) { .cat-grid { grid-template-columns: repeat(8,1fr); gap: 0; } }
        .cat-item { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 20px 8px; border-radius: 10px; cursor: pointer; text-decoration: none; position: relative; transition: background 0.15s; }
        .cat-item:not(:last-child)::after { content: ""; position: absolute; right: 0; top: 20%; height: 60%; width: 1px; background: #e8e8e4; }
        .cat-item:hover { background: #faf9f6; }
        .cat-item:hover svg { stroke: #C9951A; }
        .cat-item:hover .cat-label { color: #C9951A; }
        .cat-item svg { width: 70px; height: 70px; stroke: #111; stroke-width: 0.8; fill: none; stroke-linecap: round; stroke-linejoin: round; transition: stroke 0.15s; }
        .cat-label { font-size: 12px; color: #111; text-align: center; line-height: 1.3; font-weight: 600; transition: color 0.15s; } @media(max-width: 767px) { .cat-item { padding: 12px 4px; gap: 8px; } .cat-item svg { width: 40px; height: 40px; } .cat-label { font-size: 10px; } }

        .sec-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; margin-top: 28px; }
        .sec-title { font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: #999; letter-spacing: 2px; }
        .sec-link { font-size: 12px; color: #C9951A; font-weight: 500; text-decoration: none; }
        .sec-link:hover { text-decoration: underline; }
        .divider { height: 1px; background: #F0EDE8; margin: 20px 0 0; }

        .dest-grid { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .dest-grid::-webkit-scrollbar { display: none; }
        @media(min-width: 768px)  { .dest-grid { display: grid; grid-template-columns: repeat(3,1fr); overflow: visible; } }
        @media(min-width: 1024px) { .dest-grid { grid-template-columns: repeat(4,1fr); } }
        .dest-card { flex-shrink: 0; width: 148px; background: #fff; border: 2px solid #C9951A; border-radius: 14px; overflow: hidden; cursor: pointer; transition: all .18s; text-decoration: none; }
        .dest-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,.1); }
        @media(min-width: 768px) { .dest-card { width: auto; } }
        .dest-img { height: 90px; background: #FEF3E2; display: flex; align-items: center; justify-content: center; font-size: 36px; position: relative; overflow: hidden; }
        .dest-body { padding: 10px 11px; }
        .dest-name { font-size: 12px; font-weight: 600; color: #222; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dest-cat  { font-size: 10px; color: #AAA; margin-bottom: 4px; }
        .badge-dest { position: absolute; top: 6px; right: 6px; background: #C9951A; color: #111; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 3px; }

        .recent-section { margin-top: 22px; }
        .recent-section-hdr { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
        .recent-section-title { font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: #999; letter-spacing: 2px; }
        .recent-scroll { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .recent-scroll::-webkit-scrollbar { display: none; }
        @media(min-width: 768px) { .recent-scroll { display: grid; grid-template-columns: repeat(4,1fr); overflow: visible; } }
        @media(min-width: 1024px) { .recent-scroll { grid-template-columns: repeat(5,1fr); } }
        .recent-card { flex-shrink: 0; width: 46vw; max-width: 210px; text-decoration: none; display: block; }
        @media(min-width: 480px) { .recent-card { width: 190px; } }
        @media(min-width: 768px) { .recent-card { width: auto; } }
        .recent-card-img { width: 100%; aspect-ratio: 1/1; border-radius: 14px; overflow: hidden; background: #F0EDE8; display: flex; align-items: center; justify-content: center; font-size: 34px; margin-bottom: 8px; position: relative; }
        .recent-card-img img { width: 100%; height: 100%; object-fit: cover; }
        .recent-card-title { font-size: 14px; font-weight: 600; color: #111; line-height: 1.3; margin-bottom: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .recent-card-sub { font-size: 13px; color: #888; }
        .recent-card-price { font-size: 13px; color: #C9951A; font-weight: 700; }

        /* ABERTO AGORA / ENTREGANDO AGORA */
        .oa-title { display: flex; align-items: center; gap: 7px; }
        .oa-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #2E9E5B; box-shadow: 0 0 0 3px rgba(46,158,91,0.22); flex-shrink: 0; }
        .oa-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 10px; margin-top: -2px; scrollbar-width: none; }
        .oa-chips::-webkit-scrollbar { display: none; }
        .oa-chip { flex-shrink: 0; font-size: 12px; font-weight: 600; padding: 6px 13px; border-radius: 20px; background: #fff; border: 1px solid #E0DDD8; color: #666; font-family: 'Inter', sans-serif; white-space: nowrap; cursor: pointer; }
        .oa-chip.on { background: #C9951A; border-color: #C9951A; color: #fff; }
        .oa-badge { position: absolute; top: 8px; left: 8px; display: flex; align-items: center; gap: 4px; background: rgba(17,17,17,0.85); color: #6FE3A0; font-size: 9px; font-weight: 800; padding: 3px 8px 3px 6px; border-radius: 20px; letter-spacing: .3px; }
        .oa-badge-dot { width: 5px; height: 5px; border-radius: 50%; background: #3FDE7F; flex-shrink: 0; }
        .dv-badge { position: absolute; top: 8px; left: 8px; background: rgba(17,17,17,0.85); font-size: 13px; padding: 4px 6px; border-radius: 20px; line-height: 1; }
        .oa-empty { font-size: 13px; color: #AAA; padding: 12px 0 4px; }

        /* cards compactos — cabem 4 por tela no mobile + uma fatia do 5º
           (os carrosséis normais usam .recent-card, feito pra 2 por tela) */
        .oa-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .oa-scroll::-webkit-scrollbar { display: none; }
        @media(min-width: 768px) { .oa-scroll { display: grid; grid-template-columns: repeat(4,1fr); overflow: visible; gap: 14px; } }
        @media(min-width: 1024px) { .oa-scroll { grid-template-columns: repeat(5,1fr); } }
        .oa-card { flex-shrink: 0; width: 20vw; max-width: 80px; text-decoration: none; display: block; }
        @media(min-width: 480px) { .oa-card { width: 84px; } }
        @media(min-width: 768px) { .oa-card { width: auto; } }
        .oa-card-img { width: 100%; aspect-ratio: 1/1; border-radius: 10px; overflow: hidden; background: #F0EDE8; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 5px; position: relative; }
        @media(min-width: 768px) { .oa-card-img { border-radius: 14px; font-size: 34px; margin-bottom: 8px; } }
        .oa-card-img img { width: 100%; height: 100%; object-fit: cover; }
        .oa-card-title { font-size: 10.5px; font-weight: 600; color: #111; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        @media(min-width: 768px) { .oa-card-title { font-size: 14px; } }
        .oa-card-sub { font-size: 8.5px; color: #888; margin-top: 1px; }
        @media(min-width: 768px) { .oa-card-sub { font-size: 13px; margin-top: 2px; } }
        @media(max-width: 767px) {
          .oa-badge { font-size: 6.5px; padding: 2px 5px 2px 4px; gap: 2px; top: 4px; left: 4px; }
          .oa-badge-dot { width: 4px; height: 4px; }
          .dv-badge { font-size: 9px; padding: 3px 4px; top: 4px; left: 4px; }
        }

        .cta-section { margin: 36px 0 48px; background: linear-gradient(135deg,#1A1A1A,#333); border-radius: 20px; padding: 36px 32px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; }
        @media(min-width: 768px) { .cta-section { flex-direction: row; text-align: left; justify-content: space-between; padding: 36px 48px; } }
        .cta-title { font-family: 'Bebas Neue', sans-serif; font-size: clamp(22px,3vw,30px); color: #fff; letter-spacing: 1px; margin-bottom: 6px; }
        .cta-title span { color: #C9951A; }
        .cta-sub  { font-size: 13px; color: #AAA; }
        .cta-btn  { background: #C9951A; color: #fff; border: none; border-radius: 12px; padding: 14px 28px; font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; text-decoration: none; display: inline-block; }
        .cta-btn:hover { background: #B8841A; }
        .cta-note { font-size: 11px; color: #888; margin-top: 4px; }

        .footer { background: #111; border-top: 2px solid #C9951A; padding: 36px 24px 24px; margin-top: 48px; }
        .fi { max-width: 1200px; margin: 0 auto; }
        .footer-top { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 32px; margin-bottom: 32px; }
        @media(max-width: 767px) { .footer-top { grid-template-columns: 1fr 1fr; gap: 24px; } }
        @media(max-width: 480px) { .footer-top { grid-template-columns: 1fr; } }
        .f-logo { font-family: 'Bebas Neue', sans-serif; font-size: 22px; color: #fff; letter-spacing: 2px; margin-bottom: 8px; text-decoration: none; display: block; }
        .f-logo span { color: #C9951A; }
        .f-desc { font-size: 12px; color: #888; font-weight: 500; line-height: 1.7; max-width: 220px; }
        .f-col-title { font-family: 'Bebas Neue', sans-serif; font-size: 11px; color: #C9951A; letter-spacing: 1.5px; margin-bottom: 12px; }
        .f-link { display: block; font-size: 12px; color: #AAA; font-weight: 700; text-decoration: none; margin-bottom: 8px; transition: color .15s; }
        .f-link:hover { color: #C9951A; }
        .footer-bottom { border-top: 0.5px solid #1A1A1A; padding-top: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .f-copy { font-size: 11px; color: #C9951A; font-weight: 700; }
        .f-copy span { color: #888; font-weight: 600; }
        .f-legal { display: flex; gap: 16px; }
        .f-legal a { font-size: 11px; color: #C9951A; font-weight: 700; text-decoration: none; }

        .empty-state { text-align: center; padding: 32px 20px; color: #AAA; font-size: 13px; }
        .skeleton { background: linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 10px; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* HERO */}
      <section className="hero" style={{background: tema.heroBg}}>
        <h1 className="hero-title" style={{color: siteTheme === 'branco-limpo' ? '#111' : '#fff'}}>TRINDADE <span style={{color: tema.dest}}>ONLINE</span></h1>
        <p className="hero-sub">Conectando moradores, comércios e serviços do bairro Trindade</p>
        <HomeSearchBox />
      </section>

      {(openCompanies.length > 0 || deliveringCompanies.length > 0) && (
        <div className="main-wrap" style={{marginTop: 20}}>
          {abertoAgoraEnabled && <HomeAbertoAgora companies={openCompanies} chips={abertoAgoraChips} />}

          {entregandoAgoraEnabled && deliveringCompanies.length > 0 && (
            <div className="recent-section">
              <div className="recent-section-hdr">
                <span className="recent-section-title">🛵 ENTREGANDO AGORA</span>
              </div>
              <div className="oa-scroll">
                {deliveringCompanies.map(c => {
                  const cover = [...(c.photos || [])].sort((a, b) => a.order - b.order)[0]?.url
                  return (
                    <a key={c.id} className="oa-card" href={`/empresa/${c.slug}`}>
                      <div className="oa-card-img">
                        {cover ? <Image src={cover} alt={c.name} fill sizes="(max-width:639px) 20vw, 120px" style={{objectFit:'cover'}} /> : (c.category?.emoji || '🏪')}
                        <span className="dv-badge">🛵</span>
                      </div>
                      <div className="oa-card-title">{c.name}</div>
                      <div className="oa-card-sub">entrega própria</div>
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {pulseMessages.length > 0 && (() => {
        const fillCount = Math.max(1, Math.ceil(14 / pulseMessages.length))
        const pulseFilled = Array.from({length: fillCount}).flatMap(() => pulseMessages)
        return (
          <div className="pulse-ticker" style={{background: PULSE_PRESETS[pulseColorPreset]?.bg || '#111111'}}>
            <div className="pulse-track-clip">
              <div className="pulse-track" style={{animationDuration: `${Math.max(15, pulseFilled.length * 6)}s`}}>
                {[...pulseFilled, ...pulseFilled].map((m, i) => (
                  <span key={i} className="pulse-item" style={{color: PULSE_PRESETS[pulseColorPreset]?.text || '#C9951A'}}>{m.message}</span>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {bannerEnabled && <HomeBannerCarousel banners={banners} />}

      {/* CONTEÚDO */}
      <div className="main-wrap">

        {/* CARDS CUPONS + PROMOÇÕES */}
        <div className="cat-overlap" style={{marginTop:24,marginBottom:0}}>
          <div className="cat-card-wrap" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,padding:'0',background:'transparent',border:'none',boxShadow:'none'}}>
            <a href="/cupons" style={{borderRadius:16,overflow:'hidden',textDecoration:'none',display:'block'}}>
              <img src="https://plfuznchzuzardkfjmqo.supabase.co/storage/v1/object/public/company-photos/cupom_banner.png" alt="Cupons Relâmpago" style={{width:'100%',height:'auto',display:'block',borderRadius:16}}/>
            </a>
            <a href="/promocoes" style={{borderRadius:16,overflow:'hidden',textDecoration:'none',display:'block'}}>
              <img src="https://plfuznchzuzardkfjmqo.supabase.co/storage/v1/object/public/company-photos/promocoes_banner.png" alt="Promoções da Semana" style={{width:'100%',height:'auto',display:'block',borderRadius:16}}/>
            </a>
          </div>
        </div>

        {/* CATEGORIAS */}
        <div className="cat-overlap" style={{marginTop: 14}}>
          <div className="cat-card-wrap">
            <div className="cat-grid">
              <a className="cat-item" href="/categoria/comercios">
                <svg viewBox="0 0 24 24"><path d="M3 9l1-5h16l1 5"/><path d="M3 9a2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0 2 2 2 2 0 0 0 2-2"/><path d="M5 20v-9"/><path d="M19 20v-9"/><rect x="9" y="14" width="6" height="6"/><path d="M3 20h18"/></svg>
                <span className="cat-label">Comércios</span>
              </a>
              <a className="cat-item" href="/categoria/servicos">
                <svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                <span className="cat-label">Serviços</span>
              </a>
              <a className="cat-item" href="/categoria/gastronomia">
                <svg viewBox="0 0 24 24"><path d="M12 2 L22 20 Q12 23 2 20 Z"/><path d="M5.5 18.5 Q12 22 18.5 18.5"/><circle cx="12" cy="10" r="1"/><circle cx="9" cy="14" r="0.8"/><circle cx="15" cy="14" r="0.8"/></svg>
                <span className="cat-label">Gastronomia</span>
              </a>
              <a className="cat-item" href="/empregos">
                <svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 12h20"/></svg>
                <span className="cat-label">Empregos</span>
              </a>
              <a className="cat-item" href="/imoveis">
                <svg viewBox="0 0 24 24"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
                <span className="cat-label">Imóveis</span>
              </a>
              <a className="cat-item" href="/desapega">
                <svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                <span className="cat-label">Desapega</span>
              </a>
              <a className="cat-item" href="/achados-perdidos">
                <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span className="cat-label">Achados & Perdidos</span>
              </a>
              <a className="cat-item" href="/categoria/igrejas">
                <svg viewBox="0 0 24 24"><path d="M12 2v4M10 4h4"/><path d="M5 10l7-4 7 4v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V10z"/><path d="M10 21v-7h4v7"/></svg>
                <span className="cat-label">Igrejas</span>
              </a>
            </div>
          </div>
        </div>

        {/* EMPRESAS PAGAS — 1 carrossel por categoria (gastronomia, comércios,
            serviços), ordem embaralhada a cada carregamento pra dar visibilidade
            igual a todo mundo no plano pago */}
        {PAID_CAROUSELS.some(([, key]) => (paidCompanies[key] || []).length > 0) && (
          <>
            <div className="divider" />
            {PAID_CAROUSELS.map(([, key, title, href]) => {
              const list = paidCompanies[key] || []
              if (list.length === 0) return null
              return (
                <div key={key} className="recent-section">
                  <div className="recent-section-hdr">
                    <span className="recent-section-title">{title}</span>
                    <a href={href} className="sec-link" style={{ marginLeft: 'auto' }}>Ver tudo →</a>
                  </div>
                  <div className="recent-scroll">
                    {list.map(c => {
                      const cover = [...(c.photos || [])].sort((a, b) => a.order - b.order)[0]?.url
                      return (
                        <a key={c.id} className="recent-card" href={`/empresa/${c.slug}`}>
                          <div className="recent-card-img">
                            {cover ? <Image src={cover} alt={c.name} fill sizes="(max-width:639px) 45vw, 220px" style={{objectFit:'cover'}} /> : (c.category?.emoji || '🏪')}
                          </div>
                          <div className="recent-card-title">{c.name}</div>
                          <div className="recent-card-sub">
                            {c.category?.emoji} {c.category?.name || ''}
                            {c.avg_rating > 0 && <> · <Stars rating={c.avg_rating} /> {c.avg_rating.toFixed(1)}</>}
                          </div>
                        </a>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ANÚNCIOS RECENTES — estilo Airbnb, sem container */}
        {((recentListings['desapega']||[]).length > 0 || (recentListings['emprego']||[]).length > 0 || (recentListings['imovel']||[]).length > 0) && (
        <>
        <div className="divider" />

        {(recentListings['desapega'] || []).length > 0 && (
        <div className="recent-section">
          <div className="recent-section-hdr">
            <span className="recent-section-title">🏷️ DESAPEGA</span>
            <a href="/desapega" className="sec-link" style={{marginLeft:'auto'}}>Ver tudo →</a>
          </div>
          <div className="recent-scroll">
            {(recentListings['desapega'] || []).map(l => (
              <a key={l.id} className="recent-card" href={`/anuncio/${l.id}`}>
                <div className="recent-card-img">
                  {l.photos?.length ? (
                    <Image src={[...l.photos].sort((a,b)=>a.order-b.order)[0]?.url} alt={l.title} fill sizes="(max-width:639px) 45vw, 220px" style={{objectFit:'cover'}}/>
                  ) : '🏷️'}
                </div>
                <div className="recent-card-title">{l.title}</div>
                {l.price && <div className="recent-card-price">R$ {l.price.toLocaleString('pt-BR')}</div>}
              </a>
            ))}
          </div>
        </div>
        )}

        {(recentListings['emprego'] || []).length > 0 && (
        <div className="recent-section">
          <div className="recent-section-hdr">
            <span className="recent-section-title">💼 EMPREGOS</span>
            <a href="/empregos" className="sec-link" style={{marginLeft:'auto'}}>Ver tudo →</a>
          </div>
          <div className="recent-scroll">
            {(recentListings['emprego'] || []).map(l => (
              <a key={l.id} className="recent-card" href={`/anuncio/${l.id}`}>
                <div className="recent-card-img">
                  {l.photos?.length ? (
                    <Image src={[...l.photos].sort((a,b)=>a.order-b.order)[0]?.url} alt={l.title} fill sizes="(max-width:639px) 45vw, 220px" style={{objectFit:'cover'}}/>
                  ) : '💼'}
                </div>
                <div className="recent-card-title">{l.title}</div>
                <div className="recent-card-sub">Vaga de emprego</div>
              </a>
            ))}
          </div>
        </div>
        )}

        {(recentListings['imovel'] || []).length > 0 && (
        <div className="recent-section">
          <div className="recent-section-hdr">
            <span className="recent-section-title">🏠 IMÓVEIS</span>
            <a href="/imoveis" className="sec-link" style={{marginLeft:'auto'}}>Ver tudo →</a>
          </div>
          <div className="recent-scroll">
            {(recentListings['imovel'] || []).map(l => (
              <a key={l.id} className="recent-card" href={`/anuncio/${l.id}`}>
                <div className="recent-card-img">
                  {l.photos?.length ? (
                    <Image src={[...l.photos].sort((a,b)=>a.order-b.order)[0]?.url} alt={l.title} fill sizes="(max-width:639px) 45vw, 220px" style={{objectFit:'cover'}}/>
                  ) : '🏠'}
                </div>
                <div className="recent-card-title">{l.title}</div>
                {l.price && <div className="recent-card-price">R$ {l.price.toLocaleString('pt-BR')}/mês</div>}
              </a>
            ))}
          </div>
        </div>
        )}
        </>
        )}

        {/* CTA */}
        <div className="cta-section">
          <div>
            <div className="cta-title">SEU NEGÓCIO NO <span>TRINDADE ONLINE</span></div>
            <div className="cta-sub">Alcance milhares de moradores do bairro todos os dias</div>
            <div className="cta-note">Ativação imediata · Pagamento via Pix</div>
          </div>
          <a className="cta-btn" href="/empresa/cadastrar">+ Cadastrar minha empresa</a>
        </div>

      </div>

      {/* FOOTER */}
      <footer className="footer">
        <div className="fi">
          <div className="footer-top">
            <div>
              <a className="f-logo" href="/">TRINDADE <span>ONLINE</span></a>
              <div className="f-desc">O portal digital do bairro Trindade em São Gonçalo/RJ. Conectando moradores, comércios e histórias.</div>
            </div>
            <div>
              <div className="f-col-title">EXPLORAR</div>
              <a className="f-link" href="/categoria/comercios">🏪 Comércios</a>
              <a className="f-link" href="/categoria/gastronomia">🍕 Gastronomia</a>
              <a className="f-link" href="/categoria/servicos">🔧 Serviços</a>
              <a className="f-link" href="/categoria/igrejas">⛪ Igrejas</a>
            </div>
            <div>
              <div className="f-col-title">COMUNIDADE</div>
              <a className="f-link" href="/desapega">🏷️ Desapega</a>
              <a className="f-link" href="/empregos">💼 Empregos</a>
              <a className="f-link" href="/imoveis">🏠 Imóveis</a>
              <a className="f-link" href="/achados-perdidos">📍 Achados & Perdidos</a>
            </div>
            <div>
              <div className="f-col-title">SUA EMPRESA</div>
              <a className="f-link" href="/empresa/cadastrar">+ Cadastrar empresa</a>
              <a className="f-link" href="/login">Entrar na plataforma</a>
              <a className="f-link" href="/cadastro">Criar conta grátis</a>
              <a className="f-link" href="/termos">Termos de Uso</a>
              <a className="f-link" href="/termos">Política de Privacidade</a>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="f-copy">© 2026 Trindade Online · <span>Trindade, São Gonçalo/RJ</span></div>
            <div className="f-legal">
              <a href="/termos">Termos de Uso</a>
              <a href="/termos">Privacidade</a>
              <a href="/termos">LGPD</a>
            </div>
          </div>
        </div>
      </footer>

      <CookieBanner />
      <HomeBottomNav />
      <WAButton/>
      <OneSignalInit/>
    </>
  )
}
