import Image from 'next/image'
import { after } from 'next/server'
import WAButton from '@/components/WAButton'
import OneSignalInit from '@/components/OneSignalInit'
import CookieBanner from '@/components/CookieBanner'
import HomeSearchBox from '@/components/home/HomeSearchBox'
import HomeBannerCarousel from '@/components/home/HomeBannerCarousel'
import HomeAbertoAgora from '@/components/home/HomeAbertoAgora'
import HomeComunidadeTabs from '@/components/home/HomeComunidadeTabs'
import ScrollRow from '@/components/home/ScrollRow'
import { createServerSupabase } from '@/lib/supabase-server'
import { isOpenNow, HourRow } from '@/lib/businessHours'
import { CATEGORY_IMAGES } from '@/lib/categoryImages'

interface PaidCompany {
  id: string; name: string; slug: string; avg_rating: number; total_reviews: number
  category?: { name: string; emoji?: string } | null
  photos?: { url: string; order: number }[]
}

interface OpenCompany {
  id: string; name: string; slug: string; plan: string; delivery_available: boolean; flexible_hours: boolean; store_paused?: boolean
  category?: { emoji?: string } | null
  photos?: { url: string; order: number }[]
  subcategories?: { subcategory: { id: string; name: string; emoji: string } | null }[]
  hours?: HourRow[]
}

interface Listing {
  id: string; title: string; price: number | null
  type: string; subtype: string | null; created_at: string
  photos?: { url: string; order: number }[]
}

interface Banner {
  id: string; title: string; subtitle: string | null; description: string | null
  link_url: string | null; image_url: string | null; image_url_mobile: string | null; display_order: number
}

interface Oferta {
  id: string; kind: 'cupom' | 'promocao'; title: string; expires_at: string
  discount_type?: string; discount_value?: number; image_url?: string | null
  company: { name: string; slug: string; photos?: { url: string; order: number }[] } | null
}

// Categorias fixas da home (KNOWLEDGE_BASE.md §1) — as 4 primeiras contam
// empresas cadastradas; as 4 últimas (Comunidade) contam anúncios/vagas
// ativos, então usam a contagem de listings por tipo, não de companies
const CAT_DEFS: { slug: string; label: string; categoryId?: string; listingType?: string; icon: string }[] = [
  { slug: 'comercios',   label: 'Comércios',    categoryId: '00000000-0000-0000-0000-000000000001', icon: 'shop' },
  { slug: 'servicos',    label: 'Serviços',     categoryId: '00000000-0000-0000-0000-000000000002', icon: 'wrench' },
  { slug: 'gastronomia', label: 'Gastronomia',  categoryId: '00000000-0000-0000-0000-000000000003', icon: 'food' },
  { slug: 'empregos',    label: 'Empregos',     listingType: 'emprego', icon: 'job' },
  { slug: 'imoveis',     label: 'Imóveis',      listingType: 'imovel', icon: 'home' },
  { slug: 'desapega',    label: 'Desapega',     listingType: 'desapega', icon: 'tag' },
  { slug: 'achados',     label: 'Achados & Perdidos', listingType: 'achado', icon: 'pin' },
  { slug: 'igrejas',     label: 'Igrejas',      categoryId: '00000000-0000-0000-0000-000000000008', icon: 'church' },
]

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

function fmtDesconto(o: Oferta) {
  if (o.kind !== 'cupom' || o.discount_value == null) return null
  return o.discount_type === 'fixed' ? `R$ ${o.discount_value.toFixed(2).replace('.', ',')} off` : `${o.discount_value}% off`
}

function ofertaCover(o: Oferta): string | null {
  if (o.image_url) return o.image_url
  const photos = o.company?.photos
  if (!photos?.length) return null
  return [...photos].sort((a, b) => a.order - b.order)[0]?.url || null
}

function tempoRestante(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expirado'
  const h = Math.floor(diff / 3600000)
  if (h > 24) return `Termina em ${Math.floor(h / 24)}d`
  if (h > 0) return `Termina em ${h}h`
  return `Termina em ${Math.floor(diff / 60000)}min`
}

const TEMAS: Record<string, { heroBg: string, dest: string }> = {
  'classico-preto':  { heroBg: '#111111', dest: '#FFC531' },
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
  // continua sendo resolvido no navegador, no BottomNav global/HomeSearchBox.
  const supabaseServer = await createServerSupabase()

  // Todas as consultas daqui são independentes entre si — rodam em paralelo
  // em vez de uma esperar a outra terminar, o que cortava bastante o tempo
  // até a home aparecer com conteúdo de verdade. Agora rodam no servidor,
  // antes de mandar qualquer HTML pro navegador — sem tela de carregando.
  const types = ['desapega', 'emprego', 'imovel', 'achado']
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const nowIso = new Date().toISOString()

  const [bannersRes, paidResults, listingResults, pulseRes, settingsRes, newCompaniesRes, companiesCountRes, searchesCountRes, waClicksCountRes, couponsRes, catCounts] = await Promise.all([
    supabaseServer.from('banners').select('*').eq('active', true).order('display_order'),
    Promise.all(PAID_CAROUSELS.map(([categoryId]) =>
      supabaseServer.from('companies')
        .select('id, name, slug, avg_rating, total_reviews, category:categories(name,emoji), photos:company_photos(url,order)')
        .eq('plan', 'paid').eq('status', 'active').eq('category_id', categoryId)
        .limit(80) // amostra grande o bastante pro shuffle continuar variado, sem escalar sem limite conforme mais empresas assinam
    )),
    Promise.all(types.map(type =>
      supabaseServer.from('listings')
        .select('id, title, price, type, subtype, created_at, photos:listing_photos(url,order)')
        .eq('type', type).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(5)
    )),
    supabaseServer.from('pulse_messages').select('id, message').eq('active', true).order('display_order'),
    supabaseServer.from('site_settings').select('key,value'),
    // Novos na Trindade (ESPECIFICACAO.md §10.1) — recém-cadastrados dos
    // últimos 30 dias, recompensa quem acabou de pagar aparecendo na home
    supabaseServer.from('companies')
      .select('id, name, slug, avg_rating, total_reviews, category:categories(name,emoji), photos:company_photos(url,order)')
      .eq('status', 'active').gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false }).limit(10),
    // Faixa "anuncie" com números reais (ESPECIFICACAO.md §10.1 item 8)
    supabaseServer.from('companies').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabaseServer.from('search_logs').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    supabaseServer.from('whatsapp_clicks').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    // Ofertas do bairro — cupons ativos de verdade, no lugar dos dois
    // banners fixos de imagem (pareciam arte de banco pronta). Promoções
    // da Semana ficou fora daqui a pedido do Ricardo (set/2026) — visual
    // ainda não tem um formato bom, desligado até segunda ordem.
    supabaseServer.from('coupons')
      .select('id,title,discount_type,discount_value,expires_at,company:companies(name,slug,photos:company_photos(url,order))')
      .eq('active', true).gt('expires_at', nowIso)
      .order('created_at', { ascending: false }).limit(6),
    // Contagem por categoria/tipo pros cards de categoria (empresas ativas
    // ou, pra Comunidade, anúncios/vagas ativos)
    Promise.all(CAT_DEFS.map(c => c.categoryId
      ? supabaseServer.from('companies').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('category_id', c.categoryId)
      : supabaseServer.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('type', c.listingType!)
    )),
  ])

  // Reparo de fotos quebradas roda sozinho: dispara em cadeia a partir de
  // uma visita real na home (sem depender de ninguém clicar em botão no
  // admin). Não trava mais em "já tá rodando" — quem decide isso (inclusive
  // destravar corrente morta) é o próprio /api/admin/repair-photos; aqui só
  // para de chamar quando o flag vira "done".
  const photoMigrationStatus = (settingsRes.data || []).find(s => s.key === 'photo_migration_status')?.value
  if (photoMigrationStatus !== 'done') {
    after(async () => {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://trindadeonline.com.br'
        await fetch(`${siteUrl}/api/admin/repair-photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto: true, offset: 0 }),
        })
      } catch {}
    })
  }

  // DESATIVADO: a passagem de validação (decodificar cada foto com sharp e
  // apagar o que "não abre") teve falso positivo em massa — apagou fotos que
  // renderizavam certinho no navegador. Não disparar mais até entender a
  // causa raiz do falso positivo. Ver commit que desativa isso.

  // SHUFFLE — ordem aleatória a cada carregamento
  const banners = shuffle((bannersRes.data || []) as Banner[])

  // Empresas pagas por categoria — todo mundo no plano pago é buscado (sem
  // limite na consulta), embaralhado de verdade e só então cortado nas
  // primeiras 10 — assim a cada carregamento é um recorte diferente do
  // total, não sempre as mesmas
  //
  // REGRA TEMPORÁRIA: empresa sem nenhuma foto cadastrada não aparece nos
  // destaques da home (fica só com o emoji da categoria, o que não fica bom
  // num carrossel de destaque). Não detecta foto corrompida-mas-presente
  // ainda — a checagem que tentava isso teve falso positivo em massa e foi
  // desativada; enquanto não tiver uma forma confiável de checar isso, só
  // filtra por "tem foto".
  const paidCompanies: Record<string, PaidCompany[]> = {}
  PAID_CAROUSELS.forEach(([, key], i) => {
    const comFoto = ((paidResults[i].data || []) as any as PaidCompany[]).filter(c => (c.photos || []).length > 0)
    paidCompanies[key] = shuffle(comFoto).slice(0, PAID_CAROUSEL_SIZE)
  })

  // Ofertas do bairro — só cupons por enquanto (Promoções da Semana
  // desligada, ver comentário na query acima), no lugar dos dois banners
  // de imagem fixa
  const ofertas: Oferta[] = ((couponsRes.data || []) as any[])
    .map(c => ({ id: c.id, kind: 'cupom' as const, title: c.title, expires_at: c.expires_at, discount_type: c.discount_type, discount_value: c.discount_value, company: c.company }))
    .slice(0, 6)

  const categoryCounts: Record<string, number> = {}
  CAT_DEFS.forEach((c, i) => { categoryCounts[c.slug] = catCounts[i].count || 0 })

  const recentListings: Record<string, Listing[]> = {}
  types.forEach((type, i) => { recentListings[type] = (listingResults[i].data || []) as Listing[] })

  const newCompanies = (((newCompaniesRes.data || []) as any) as PaidCompany[]).filter(c => (c.photos || []).length > 0)

  const stats = {
    companies: companiesCountRes.count || 0,
    searches: searchesCountRes.count || 0,
    waClicks: waClicksCountRes.count || 0,
  }

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
      .select('id, name, slug, plan, delivery_available, flexible_hours, store_paused, category:categories(emoji), photos:company_photos(url,order), subcategories:company_subcategories(subcategory:subcategories(id,name,emoji)), hours:company_hours(day_of_week,open_time,close_time,closed)')
      .eq('status', 'active')

    const open = ((candidates || []) as any as OpenCompany[])
      .filter(c => (c.photos || []).length > 0) // mesma regra temporária: sem foto não aparece em destaque
      .filter(c => isOpenNow(c.hours, c.flexible_hours, c.store_paused))
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
        body { font-family: 'Archivo', sans-serif; background: var(--concrete); color: var(--ink); }


        .hero { padding: 28px 16px 8px; text-align: center; margin: 0; }
        .hero-title { font-family: 'Anton', sans-serif; font-size: clamp(30px, 8vw, 72px); letter-spacing: 1px; line-height: 1; margin-bottom: 8px; display: block; text-transform: uppercase; }
        .hero-title span { color: var(--sign-dark); }
        .hero-sub { font-size: clamp(12px, 3vw, 16px); color: #888; margin-bottom: 20px; display: block; font-family: 'Archivo', sans-serif; }
        /* Campo de busca como placa física amarela — elemento assinatura
           do portal (ESPECIFICACAO.md §11.1). Bloco sólido no lugar do
           branco-com-borda-dourada de antes; a sombra deslocada imita o
           efeito de placa impressa/pintada em vez de card flutuante. */
        .hero-search-wrap {
          display: flex; max-width: 600px; margin: 0 auto; align-items: center; gap: 8px;
          background: var(--sign); border: 2.5px solid var(--ink); border-radius: 14px;
          padding: 6px 6px 6px 16px; box-shadow: 4px 4px 0 var(--ink);
          transform: none; position: relative; z-index: 20;
        }
        .hero-search-wrap input { flex: 1; border: none; background: transparent; font-size: 16px; font-family: 'Archivo', sans-serif; font-weight: 500; color: var(--ink); outline: none; }
        .hero-search-wrap input::placeholder { color: var(--ink-2); opacity: .55; }
        .search-suggestions { position:absolute; top:100%; left:0; right:0; background:var(--paper); border:2px solid var(--ink); border-radius:12px; margin-top:8px; box-shadow:4px 4px 0 rgba(21,18,16,.25); z-index:100; overflow:hidden; }
        .sug-item { display:flex; align-items:center; gap:10px; padding:10px 16px; cursor:pointer; transition:background .12s; border-bottom:0.5px solid var(--line); }
        .sug-item:last-child { border-bottom:none; }
        .sug-item:hover { background:var(--concrete-2); }
        .sug-ico { font-size:14px; flex-shrink:0; }
        .sug-label { font-size:13px; font-weight:600; color:var(--ink); text-align:left; font-family:'Archivo',sans-serif; }
        .sug-sub { font-size:11px; color:var(--muted); margin-top:1px; text-align:left; }
        .hero-search-btn { background: var(--ink); border: none; border-radius: 10px; padding: 9px 16px; color: var(--sign); font-size: 13px; font-weight: 700; font-family: 'Archivo', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; } @media(max-width: 480px) { .hero-search-btn { padding: 8px 10px; font-size: 12px; } .hero-search-wrap { padding: 4px 4px 4px 12px; } }
        @media(min-width: 768px) {
          .hero { padding: 43px 20px 48px; }
          .hero-title, .hero-sub { display: block; }
          .hero-search-wrap {
            display: flex; max-width: 600px; margin: 0 auto; align-items: center; gap: 8px;
            background: var(--sign); border: 2.5px solid var(--ink); border-radius: 14px;
            padding: 6px 6px 6px 20px; box-shadow: 5px 5px 0 var(--ink);
            transform: none; position: relative; z-index: 20;
          }
          .hero-search-wrap input { flex: 1; border: none; background: transparent; font-size: 15px; font-family: 'Archivo', sans-serif; font-weight: 500; color: var(--ink); outline: none; }
          .hero-search-wrap input::placeholder { color: var(--ink-2); opacity: .55; }
          .hero-search-btn { background: var(--ink); border: none; border-radius: 10px; padding: 10px 24px; color: var(--sign); font-size: 14px; font-weight: 700; font-family: 'Archivo', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
        }

        /* BANNER */
        @media(max-width: 767px) {
          .banner-inner-wrap { height: auto; aspect-ratio: 5/2; padding-top: 0; }
        }
        .pulse-ticker { width: 100%; background: var(--ink); padding: 9px 0; }
        .pulse-track-clip { max-width: 1200px; margin: 0 auto; overflow: hidden; }
        .pulse-track { display: flex; width: max-content; animation: pulse-scroll linear infinite; }
        .pulse-item { color: var(--sign); font-size: 13px; font-weight: 600; white-space: nowrap; padding: 0 24px; font-family: 'Archivo', sans-serif; position: relative; }
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
        .banner-title-text { font-family: 'Anton', sans-serif; font-size: 46px; color: #fff; line-height: 1; margin-bottom: 4px; text-transform: uppercase; }
        .banner-sub-text { color: #ccc; font-size: 14px; margin-bottom: 4px; font-family: 'Archivo', sans-serif; }
        .banner-desc-text { color: #999; font-size: 12px; font-family: 'Archivo', sans-serif; }

        /* setas do banner — abaixo do banner, junto com os dots, não mais
           sobrepondo a imagem */
        .banner-arrow {
          width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
          background: var(--paper); border: 1.5px solid var(--line);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s;
        }
        .banner-arrow:hover { border-color: var(--sign-dark); background: var(--concrete-2); }

        /* dots + setas — fora do banner, entre banner e categorias */
        .banner-dots-outer {
          display: flex; justify-content: center; align-items: center; gap: 12px;
          padding: 10px 0 0;
          background: var(--concrete);
        }
        .banner-dots-row { display: flex; align-items: center; gap: 8px; }
        .banner-dot {
          height: 8px; border-radius: 4px; cursor: pointer;
          transition: all 0.3s; background: rgba(0,0,0,0.18);
        }
        .banner-dot.on { background: var(--sign); }

        .main-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

        .cat-overlap { margin-top: -40px; position: relative; z-index: 10; }
        .cat-card-wrap { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 24px 28px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
        /* No mobile a grade antiga some (vira o trilho de círculos abaixo) —
           pedido direto do Ricardo, texto tipo "Achados & Perdidos" cortava
           na grade de 2 colunas mesmo sem a caixa branca. */
        @media(max-width: 767px) { .cat-card-wrap { display: none; } }
        .cat-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .cat-item { display: flex; align-items: center; gap: 12px; padding: 13px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; text-decoration: none; transition: border-color 0.15s, background 0.15s; }
        .cat-item:hover { border-color: var(--ink); background: var(--concrete-2); }
        .cat-item .sq { width: 56px; height: 56px; border-radius: 8px; background: var(--concrete-2); flex-shrink: 0; position: relative; overflow: hidden; }
        .cat-txt { min-width: 0; }
        .cat-label { font-size: 14px; color: var(--ink); line-height: 1.25; font-weight: 600; font-family: 'Archivo', sans-serif; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cat-count { font-size: 11.5px; color: var(--muted); font-family: 'Archivo', sans-serif; }

        /* TRILHO DE CATEGORIAS — só no mobile, estilo OLX: círculo + nome,
           desliza na horizontal, sem contagem (mockup aprovado por Ricardo). */
        .cat-scroll-wrap { position: relative; }
        .cat-scroll { display: none; }
        @media(max-width: 767px) {
          .cat-scroll { display: flex; gap: 16px; overflow-x: auto; padding: 4px 4px 8px; scrollbar-width: none; }
          .cat-scroll::-webkit-scrollbar { display: none; }
        }
        .cat-circ-item { flex: 0 0 auto; width: 72px; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; text-decoration: none; }
        .cat-circ { width: 64px; height: 64px; border-radius: 50%; background: var(--concrete-2); border: 1px solid var(--line); position: relative; overflow: hidden; }
        .cat-circ-lbl { font-size: 12px; font-weight: 600; color: var(--ink); line-height: 1.25; font-family: 'Archivo', sans-serif; }
        /* Setinhas pretas discretas nas bordas — só indicam que dá pra
           correr o dedo pros dois lados, não têm função de clique. */
        .cat-scroll-hint { display: none; }
        @media(max-width: 767px) {
          .cat-scroll-hint { display: flex; align-items: center; justify-content: center; position: absolute; top: 36px; transform: translateY(-50%); width: 16px; height: 16px; color: var(--ink); font-size: 13px; font-weight: 800; pointer-events: none; opacity: .55; }
          .cat-scroll-hint.left { left: -6px; }
          .cat-scroll-hint.right { right: -6px; }
        }

        .sec-hdr { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 14px; margin-top: 32px; gap: 14px; }
        .sec-eyebrow { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--sign-dark); font-weight: 700; margin-bottom: 4px; display: block; font-family: 'Archivo', sans-serif; }
        .sec-title { font-family: 'Anton', sans-serif; font-size: 21px; color: var(--ink); letter-spacing: .5px; text-transform: uppercase; line-height: 1; }
        .sec-link { font-size: 12px; color: var(--sign-dark); font-weight: 600; text-decoration: none; font-family: 'Archivo', sans-serif; white-space: nowrap; }
        .sec-link:hover { text-decoration: underline; }
        .divider { height: 1px; background: var(--line); margin: 20px 0 0; }

        /* OFERTAS DO BAIRRO — cupom/promoção reais, card flat no lugar do
           banner de imagem fixa */
        .offs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px; }
        @media(max-width: 900px) { .offs-grid { grid-template-columns: repeat(2, 1fr); } }
        @media(max-width: 560px) { .offs-grid { grid-template-columns: 1fr; } }
        .of-card { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; text-decoration: none; display: flex; flex-direction: column; transition: border-color .15s, transform .15s; }
        .of-card:hover { border-color: var(--ink); transform: translateY(-2px); }
        .of-tag { font-size: 9.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; padding: 6px 12px; color: #fff; }
        .of-tag.cupom { background: var(--alert); }
        .of-tag.promo { background: var(--ink); }
        .of-body { padding: 13px; flex: 1; display: flex; gap: 10px; align-items: flex-start; }
        .of-img { width: 44px; height: 44px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: var(--concrete-2); display: flex; align-items: center; justify-content: center; font-size: 18px; position: relative; }
        .of-img img { width: 100%; height: 100%; object-fit: cover; }
        .of-text { flex: 1; min-width: 0; }
        .of-who { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 5px; }
        .of-title { font-family: 'Anton', sans-serif; font-size: 17px; margin: 0 0 4px; line-height: 1.1; text-transform: uppercase; color: var(--ink); }
        .of-ft { padding: 10px 13px; border-top: 1px dashed var(--line); display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; }
        .of-ft .l { color: var(--muted); font-weight: 600; }
        .of-ft .g { font-weight: 700; color: var(--sign-dark); }

        .dest-grid { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .dest-grid::-webkit-scrollbar { display: none; }
        @media(min-width: 768px)  { .dest-grid { display: grid; grid-template-columns: repeat(3,1fr); overflow: visible; } }
        @media(min-width: 1024px) { .dest-grid { grid-template-columns: repeat(4,1fr); } }
        .dest-card { flex-shrink: 0; width: 148px; background: var(--paper); border: 2px solid var(--sign-dark); border-radius: 14px; overflow: hidden; cursor: pointer; transition: all .18s; text-decoration: none; }
        .dest-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,.1); }
        @media(min-width: 768px) { .dest-card { width: auto; } }
        .dest-img { height: 90px; background: var(--concrete-2); display: flex; align-items: center; justify-content: center; font-size: 36px; position: relative; overflow: hidden; }
        .dest-body { padding: 10px 11px; }
        .dest-name { font-size: 12px; font-weight: 600; color: var(--ink-2); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'Archivo', sans-serif; }
        .dest-cat  { font-size: 10px; color: var(--muted); margin-bottom: 4px; }
        .badge-dest { position: absolute; top: 6px; right: 6px; background: var(--sign); color: var(--ink); font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 3px; }

        .recent-section { margin-top: 48px; }
        .recent-section-hdr { display: flex; align-items: flex-end; gap: 7px; margin-bottom: 12px; }
        .recent-section-title { font-family: 'Anton', sans-serif; font-size: 21px; color: var(--ink); letter-spacing: .5px; text-transform: uppercase; line-height: 1; }
        .recent-scroll { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .recent-scroll::-webkit-scrollbar { display: none; }
        .recent-card { flex-shrink: 0; width: 46vw; max-width: 210px; text-decoration: none; display: block; }
        @media(min-width: 480px) { .recent-card { width: 190px; } }
        .recent-card-img { width: 100%; aspect-ratio: 1/1; border-radius: 14px; overflow: hidden; background: var(--concrete-2); display: flex; align-items: center; justify-content: center; font-size: 34px; margin-bottom: 8px; position: relative; }
        .recent-card-img img { width: 100%; height: 100%; object-fit: cover; }
        .recent-card-title { font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.3; margin-bottom: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-family: 'Archivo', sans-serif; }
        .recent-card-price { font-size: 13px; color: var(--sign-dark); font-weight: 700; }

        /* ABERTO AGORA / ENTREGANDO AGORA */
        .oa-title { display: flex; align-items: center; gap: 7px; }
        .oa-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #2E9E5B; box-shadow: 0 0 0 3px rgba(46,158,91,0.22); flex-shrink: 0; }
        .oa-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 10px; margin-top: -2px; scrollbar-width: none; }
        .oa-chips::-webkit-scrollbar { display: none; }
        .oa-chip { flex-shrink: 0; font-size: 12px; font-weight: 600; padding: 6px 13px; border-radius: 20px; background: var(--paper); border: 1px solid var(--line); color: var(--muted); font-family: 'Archivo', sans-serif; white-space: nowrap; cursor: pointer; }
        .oa-chip.on { background: var(--sign); border-color: var(--sign); color: var(--ink); }
        .oa-badge { position: absolute; top: 8px; left: 8px; display: flex; align-items: center; gap: 4px; background: rgba(17,17,17,0.85); color: #6FE3A0; font-size: 9px; font-weight: 800; padding: 3px 8px 3px 6px; border-radius: 20px; letter-spacing: .3px; }
        .oa-badge-dot { width: 5px; height: 5px; border-radius: 50%; background: #3FDE7F; flex-shrink: 0; }
        .dv-badge { position: absolute; top: 8px; left: 8px; background: rgba(17,17,17,0.85); font-size: 13px; padding: 4px 6px; border-radius: 20px; line-height: 1; }
        .oa-empty { font-size: 13px; color: var(--muted); padding: 12px 0 4px; }
        .oa-band { background: var(--paper); padding: 18px 0 20px; }

        /* cards compactos — cabem 4 por tela no mobile + uma fatia do 5º.
           No desktop continua em fileira única (nunca quebra linha) — os
           cards a mais ficam disponíveis rolando de lado, sem barra de
           scroll visível (os carrosséis normais usam .recent-card, que
           vira grade com quebra de linha — esse aqui não quebra nunca) */
        .oa-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; cursor: grab; }
        .oa-scroll::-webkit-scrollbar { display: none; }
        .oa-scroll:active { cursor: grabbing; }
        @media(min-width: 768px) { .oa-scroll { gap: 16px; } }
        .oa-card { flex-shrink: 0; width: 20vw; max-width: 80px; text-decoration: none; display: block; }
        @media(min-width: 480px) { .oa-card { width: 84px; } }
        @media(min-width: 768px) { .oa-card { width: 112px; } }
        .oa-card-img { width: 100%; aspect-ratio: 1/1; border-radius: 10px; overflow: hidden; background: #F0EDE8; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 5px; position: relative; }
        @media(min-width: 768px) { .oa-card-img { border-radius: 14px; font-size: 34px; margin-bottom: 8px; } }
        .oa-card-img img { width: 100%; height: 100%; object-fit: cover; }
        .oa-card-title { font-size: 10.5px; font-weight: 600; color: var(--ink); line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-family: 'Archivo', sans-serif; }
        @media(min-width: 768px) { .oa-card-title { font-size: 14px; } }
        .oa-card-sub { font-size: 8.5px; color: var(--muted); margin-top: 1px; }
        @media(min-width: 768px) { .oa-card-sub { font-size: 13px; margin-top: 2px; } }
        @media(max-width: 767px) {
          .oa-badge { font-size: 6.5px; padding: 2px 5px 2px 4px; gap: 2px; top: 4px; left: 4px; }
          .oa-badge-dot { width: 4px; height: 4px; }
          .dv-badge { font-size: 9px; padding: 3px 4px; top: 4px; left: 4px; }
        }

        .cta-section { margin: 36px 0 48px; background: linear-gradient(135deg,var(--ink),var(--ink-2)); border-radius: 20px; padding: 36px 32px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; }
        @media(min-width: 768px) { .cta-section { flex-direction: row; text-align: left; justify-content: space-between; padding: 36px 48px; } }
        .cta-title { font-family: 'Anton', sans-serif; font-size: clamp(22px,3vw,30px); color: #fff; letter-spacing: .5px; margin-bottom: 6px; text-transform: uppercase; }
        .cta-title span { color: var(--sign); }
        .cta-sub  { font-size: 13px; color: #AAA; font-family: 'Archivo', sans-serif; }
        .cta-btn  { background: var(--sign); color: var(--ink); border: none; border-radius: 12px; padding: 14px 28px; font-size: 14px; font-weight: 700; font-family: 'Archivo', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; text-decoration: none; display: inline-block; }
        .cta-btn:hover { background: var(--sign-dark); color: #fff; }
        .cta-note { font-size: 11px; color: #888; margin-top: 4px; }

        .footer { background: var(--ink); border-top: 2px solid var(--sign); padding: 36px 24px 24px; margin-top: 48px; }
        .fi { max-width: 1200px; margin: 0 auto; }
        .footer-top { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 32px; margin-bottom: 32px; }
        @media(max-width: 767px) { .footer-top { grid-template-columns: 1fr 1fr; gap: 24px; } }
        @media(max-width: 480px) { .footer-top { grid-template-columns: 1fr; } }
        .f-logo { font-family: 'Anton', sans-serif; font-size: 20px; color: #fff; letter-spacing: .3px; margin-bottom: 8px; text-decoration: none; display: block; text-transform: uppercase; }
        .f-logo span { color: var(--sign); }
        .f-desc { font-size: 12px; color: #888; font-weight: 500; line-height: 1.7; max-width: 220px; font-family: 'Archivo', sans-serif; }
        .f-col-title { font-family: 'Archivo', sans-serif; font-size: 10.5px; font-weight: 800; color: var(--sign); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 12px; }
        .f-link { display: block; font-size: 12px; color: #AAA; font-weight: 700; text-decoration: none; margin-bottom: 8px; transition: color .15s; font-family: 'Archivo', sans-serif; }
        .f-link:hover { color: var(--sign); }
        .footer-bottom { border-top: 0.5px solid var(--ink-2); padding-top: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .f-copy { font-size: 11px; color: var(--sign); font-weight: 700; font-family: 'Archivo', sans-serif; }
        .f-copy span { color: #888; font-weight: 600; }
        .f-legal { display: flex; gap: 16px; }
        .f-legal a { font-size: 11px; color: var(--sign); font-weight: 700; text-decoration: none; font-family: 'Archivo', sans-serif; }

        .empty-state { text-align: center; padding: 32px 20px; color: var(--muted); font-size: 13px; }
        .skeleton { background: linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 10px; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* HERO */}
      <section className="hero" style={{background: tema.heroBg}}>
        <h1 className="hero-title" style={{color: siteTheme === 'branco-limpo' ? '#111' : '#fff'}}>TRINDADE <span style={{color: tema.dest}}>ONLINE</span></h1>
        <p className="hero-sub">Conectando moradores, comércios e serviços do bairro Trindade</p>
        <HomeSearchBox />
      </section>

      {abertoAgoraEnabled && openCompanies.length > 0 && (
        <section className="oa-band">
          <div className="main-wrap">
            <HomeAbertoAgora companies={openCompanies} chips={abertoAgoraChips} />
          </div>
        </section>
      )}

      {entregandoAgoraEnabled && deliveringCompanies.length > 0 && (
        <div className="main-wrap" style={{marginTop: 20}}>
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
                      {cover ? <Image src={cover} alt={c.name} fill sizes="(max-width:639px) 20vw, 120px" unoptimized style={{objectFit:'cover'}} /> : (c.category?.emoji || '🏪')}
                      <span className="dv-badge">🛵</span>
                    </div>
                    <div className="oa-card-title">{c.name}</div>
                    <div className="oa-card-sub">entrega própria</div>
                  </a>
                )
              })}
            </div>
          </div>
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

        {/* CATEGORIAS — ESPECIFICACAO.md §10.1 item 3, logo depois do
            hero de busca */}
        <div className="cat-overlap" style={{marginTop:24,marginBottom:0}}>
          <div className="cat-scroll-wrap">
          <span className="cat-scroll-hint left">‹</span>
          <span className="cat-scroll-hint right">›</span>
          <div className="cat-scroll">
            <a className="cat-circ-item" href="/categoria/comercios">
              <span className="cat-circ"><Image src={CATEGORY_IMAGES.comercios} alt="" fill sizes="64px" unoptimized style={{objectFit:'cover'}} /></span>
              <span className="cat-circ-lbl">Comércios</span>
            </a>
            <a className="cat-circ-item" href="/categoria/servicos">
              <span className="cat-circ"><Image src={CATEGORY_IMAGES.servicos} alt="" fill sizes="64px" unoptimized style={{objectFit:'cover'}} /></span>
              <span className="cat-circ-lbl">Serviços</span>
            </a>
            <a className="cat-circ-item" href="/categoria/gastronomia">
              <span className="cat-circ"><Image src={CATEGORY_IMAGES.gastronomia} alt="" fill sizes="64px" unoptimized style={{objectFit:'cover'}} /></span>
              <span className="cat-circ-lbl">Gastronomia</span>
            </a>
            <a className="cat-circ-item" href="/empregos">
              <span className="cat-circ"><Image src={CATEGORY_IMAGES.empregos} alt="" fill sizes="64px" unoptimized style={{objectFit:'cover'}} /></span>
              <span className="cat-circ-lbl">Empregos</span>
            </a>
            <a className="cat-circ-item" href="/imoveis">
              <span className="cat-circ"><Image src={CATEGORY_IMAGES.imoveis} alt="" fill sizes="64px" unoptimized style={{objectFit:'cover'}} /></span>
              <span className="cat-circ-lbl">Imóveis</span>
            </a>
            <a className="cat-circ-item" href="/desapega">
              <span className="cat-circ"><Image src={CATEGORY_IMAGES.desapega} alt="" fill sizes="64px" unoptimized style={{objectFit:'cover'}} /></span>
              <span className="cat-circ-lbl">Desapega</span>
            </a>
            <a className="cat-circ-item" href="/achados-perdidos">
              <span className="cat-circ"><Image src={CATEGORY_IMAGES.achados} alt="" fill sizes="64px" unoptimized style={{objectFit:'cover'}} /></span>
              <span className="cat-circ-lbl">Achados & Perdidos</span>
            </a>
            <a className="cat-circ-item" href="/categoria/igrejas">
              <span className="cat-circ"><Image src={CATEGORY_IMAGES.igrejas} alt="" fill sizes="64px" unoptimized style={{objectFit:'cover'}} /></span>
              <span className="cat-circ-lbl">Igrejas</span>
            </a>
          </div>
          </div>
          <div className="cat-card-wrap">
            <div className="cat-grid">
              <a className="cat-item" href="/categoria/comercios">
                <span className="sq"><Image src={CATEGORY_IMAGES.comercios} alt="" fill sizes="56px" unoptimized style={{objectFit:'cover'}} /></span>
                <span className="cat-txt"><span className="cat-label">Comércios</span><span className="cat-count">{categoryCounts.comercios} negócio{categoryCounts.comercios !== 1 ? 's' : ''}</span></span>
              </a>
              <a className="cat-item" href="/categoria/servicos">
                <span className="sq"><Image src={CATEGORY_IMAGES.servicos} alt="" fill sizes="56px" unoptimized style={{objectFit:'cover'}} /></span>
                <span className="cat-txt"><span className="cat-label">Serviços</span><span className="cat-count">{categoryCounts.servicos} negócio{categoryCounts.servicos !== 1 ? 's' : ''}</span></span>
              </a>
              <a className="cat-item" href="/categoria/gastronomia">
                <span className="sq"><Image src={CATEGORY_IMAGES.gastronomia} alt="" fill sizes="56px" unoptimized style={{objectFit:'cover'}} /></span>
                <span className="cat-txt"><span className="cat-label">Gastronomia</span><span className="cat-count">{categoryCounts.gastronomia} negócio{categoryCounts.gastronomia !== 1 ? 's' : ''}</span></span>
              </a>
              <a className="cat-item" href="/empregos">
                <span className="sq"><Image src={CATEGORY_IMAGES.empregos} alt="" fill sizes="56px" unoptimized style={{objectFit:'cover'}} /></span>
                <span className="cat-txt"><span className="cat-label">Empregos</span><span className="cat-count">{categoryCounts.empregos} vaga{categoryCounts.empregos !== 1 ? 's' : ''}</span></span>
              </a>
              <a className="cat-item" href="/imoveis">
                <span className="sq"><Image src={CATEGORY_IMAGES.imoveis} alt="" fill sizes="56px" unoptimized style={{objectFit:'cover'}} /></span>
                <span className="cat-txt"><span className="cat-label">Imóveis</span><span className="cat-count">{categoryCounts.imoveis} anúncio{categoryCounts.imoveis !== 1 ? 's' : ''}</span></span>
              </a>
              <a className="cat-item" href="/desapega">
                <span className="sq"><Image src={CATEGORY_IMAGES.desapega} alt="" fill sizes="56px" unoptimized style={{objectFit:'cover'}} /></span>
                <span className="cat-txt"><span className="cat-label">Desapega</span><span className="cat-count">{categoryCounts.desapega} item{categoryCounts.desapega !== 1 ? 'ns' : ''}</span></span>
              </a>
              <a className="cat-item" href="/achados-perdidos">
                <span className="sq"><Image src={CATEGORY_IMAGES.achados} alt="" fill sizes="56px" unoptimized style={{objectFit:'cover'}} /></span>
                <span className="cat-txt"><span className="cat-label">Achados & Perdidos</span><span className="cat-count">{categoryCounts.achados} aviso{categoryCounts.achados !== 1 ? 's' : ''}</span></span>
              </a>
              <a className="cat-item" href="/categoria/igrejas">
                <span className="sq"><Image src={CATEGORY_IMAGES.igrejas} alt="" fill sizes="56px" unoptimized style={{objectFit:'cover'}} /></span>
                <span className="cat-txt"><span className="cat-label">Igrejas</span><span className="cat-count">{categoryCounts.igrejas} local{categoryCounts.igrejas !== 1 ? 'is' : ''}</span></span>
              </a>
            </div>
          </div>
        </div>

        {/* OFERTAS DO BAIRRO — ESPECIFICACAO.md §10.1 item 5, cupons e
            promoções reais (não mais um banner de imagem fixa) */}
        {ofertas.length > 0 && (
          <div className="recent-section">
            <div className="sec-hdr">
              <div>
                <span className="sec-eyebrow">Vale por tempo limitado</span>
                <h2 className="sec-title">Ofertas do bairro</h2>
              </div>
              <a href="/ofertas" className="sec-link">Ver todas →</a>
            </div>
            <div className="offs-grid">
              {ofertas.map(o => {
                const cover = ofertaCover(o)
                return (
                <a key={`${o.kind}-${o.id}`} className="of-card" href="/ofertas">
                  <span className={`of-tag ${o.kind === 'cupom' ? 'cupom' : 'promo'}`}>
                    {o.kind === 'cupom' ? '⚡ Cupom relâmpago' : '🏷️ Promoção da semana'}
                  </span>
                  <div className="of-body">
                    <div className="of-img">
                      {cover ? <Image src={cover} alt="" fill sizes="44px" unoptimized style={{objectFit:'cover'}} /> : (o.kind === 'cupom' ? '🎟️' : '🏷️')}
                    </div>
                    <div className="of-text">
                      <div className="of-who">{o.company?.name || 'Trindade Online'}</div>
                      <div className="of-title">{o.title}</div>
                    </div>
                  </div>
                  <div className="of-ft">
                    <span className="l">{tempoRestante(o.expires_at)}</span>
                    {fmtDesconto(o) ? <span className="g">{fmtDesconto(o)}</span> : <span className="g">Ver oferta</span>}
                  </div>
                </a>
                )
              })}
            </div>
          </div>
        )}

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
                  <div className="sec-hdr">
                    <div>
                      <h2 className="recent-section-title">{title}</h2>
                    </div>
                    <a href={href} className="sec-link">Ver tudo →</a>
                  </div>
                  <ScrollRow trackClassName="recent-scroll">
                    {list.map(c => {
                      const cover = [...(c.photos || [])].sort((a, b) => a.order - b.order)[0]?.url
                      return (
                        <a key={c.id} className="recent-card" href={`/empresa/${c.slug}`}>
                          <div className="recent-card-img">
                            {cover ? <Image src={cover} alt={c.name} fill sizes="(max-width:639px) 45vw, 220px" unoptimized style={{objectFit:'cover'}} /> : (c.category?.emoji || '🏪')}
                          </div>
                          <div className="recent-card-title">{c.name}</div>
                        </a>
                      )
                    })}
                  </ScrollRow>
                </div>
              )
            })}
          </>
        )}

        {/* NOVOS NA TRINDADE — ESPECIFICACAO.md §10.1 item 6, recompensa
            quem acabou de pagar aparecendo na home nos primeiros 30 dias */}
        {newCompanies.length > 0 && (
          <div className="recent-section">
            <div className="divider" />
            <div className="sec-hdr">
              <div>
                <span className="sec-eyebrow">Recém-chegados</span>
                <h2 className="recent-section-title">✨ Novos na Trindade</h2>
              </div>
            </div>
            <ScrollRow trackClassName="recent-scroll">
              {newCompanies.map(c => {
                const cover = [...(c.photos || [])].sort((a, b) => a.order - b.order)[0]?.url
                return (
                  <a key={c.id} className="recent-card" href={`/empresa/${c.slug}`}>
                    <div className="recent-card-img">
                      {cover ? <Image src={cover} alt={c.name} fill sizes="(max-width:639px) 45vw, 220px" unoptimized style={{objectFit:'cover'}} /> : (c.category?.emoji || '🏪')}
                    </div>
                    <div className="recent-card-title">{c.name}</div>
                  </a>
                )
              })}
            </ScrollRow>
          </div>
        )}

        {/* COMUNIDADE — bloco único com abas, ESPECIFICACAO.md §10.1 item 7 */}
        {((recentListings['desapega']||[]).length > 0 || (recentListings['emprego']||[]).length > 0 || (recentListings['imovel']||[]).length > 0 || (recentListings['achado']||[]).length > 0) && (
          <>
            <div className="divider" />
            <HomeComunidadeTabs listings={recentListings} />
          </>
        )}

        {/* CTA — números reais, ESPECIFICACAO.md §10.1 item 8 */}
        <div className="cta-section">
          <div>
            <div className="cta-title">SEU NEGÓCIO NO <span>TRINDADE ONLINE</span></div>
            <div className="cta-sub">
              {stats.companies > 0 ? `${stats.companies} negócios já estão no ar` : 'Alcance milhares de moradores do bairro todos os dias'}
              {stats.searches > 0 && ` · ${stats.searches} buscas nos últimos 30 dias`}
              {stats.waClicks > 0 && ` · ${stats.waClicks} cliques no WhatsApp`}
            </div>
            <div className="cta-note">Ativação imediata · Pagamento via Pix</div>
          </div>
          <a className="cta-btn" href="/anunciar">+ Cadastrar minha empresa</a>
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
              <a className="f-link" href="/anunciar">+ Cadastrar empresa</a>
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
      <WAButton/>
      <OneSignalInit/>
    </>
  )
}
