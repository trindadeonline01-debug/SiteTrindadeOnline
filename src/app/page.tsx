'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import CookieBanner from '@/components/CookieBanner'

/* ─── tipos ─────────────────────────────────────────────── */
interface Company {
  id: string
  name: string
  slug: string
  description: string | null
  category_id: string
  is_active: boolean
  trial_ends_at: string | null
  plan_status: string | null
  avg_rating: number
  total_reviews: number
  categories?: { name: string; emoji?: string } | null
  company_photos?: { photo_url: string; is_primary: boolean; order?: number }[]
}

interface Highlight {
  id: string
  company_id: string
  scope: string
  companies?: {
    name: string
    slug: string
    avg_rating: number
    total_reviews: number
    categories?: { name: string; emoji?: string } | null
    company_photos?: { photo_url: string; is_primary: boolean; order?: number }[]
  } | null
}

interface Listing {
  id: string
  title: string
  price: number | null
  listing_type: string
  company_name: string | null
  created_at: string
}

interface Banner {
  id: string
  title: string
  subtitle: string | null
  description: string | null
  link_url: string | null
  display_order: number
}

/* ─── categorias fixas ───────────────────────────────────── */
const CATEGORIES = [
  { slug: 'comercios',        label: 'Comércios',         emoji: '🏪', href: '/categoria/comercios',        color: '#fff3cd', },
  { slug: 'servicos',         label: 'Serviços',           emoji: '🔧', href: '/categoria/servicos',         color: '#dbeafe', },
  { slug: 'gastronomia',      label: 'Gastronomia',        emoji: '🍕', href: '/categoria/gastronomia',      color: '#fee2e2', },
  { slug: 'empregos',         label: 'Empregos',           emoji: '💼', href: '/empregos',                   color: '#dcfce7', },
  { slug: 'imoveis',          label: 'Imóveis',            emoji: '🏠', href: '/imoveis',                    color: '#ede9fe', },
  { slug: 'desapega',         label: 'Desapega',           emoji: '🏷️', href: '/desapega',                   color: '#ffedd5', },
  { slug: 'achados-perdidos', label: 'Achados & Perdidos', emoji: '📍', href: '/achados-perdidos',           color: '#ccfbf1', },
  { slug: 'igrejas',          label: 'Igrejas',            emoji: '⛪', href: '/categoria/igrejas',          color: '#fce7f3', },
]

/* ─── helpers ────────────────────────────────────────────── */
function isVisible(c: Company) {
  if (!c.is_active) return false
  if (c.plan_status === 'pago') return true
  if (c.trial_ends_at && new Date(c.trial_ends_at) > new Date()) return true
  return false
}

function Stars({ rating }: { rating: number }) {
  const r = Math.round(rating)
  return <span style={{ color: '#C9951A', fontSize: 11 }}>{'★'.repeat(r)}{'☆'.repeat(5 - r)}</span>
}

function CoverPhoto({ photos, name, style }: { photos?: { photo_url: string; is_primary: boolean; order?: number }[]; name: string; style?: React.CSSProperties }) {
  const sorted = [...(photos || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const primary = sorted.find(p => p.is_primary) || sorted[0]
  if (primary) return <img src={primary.photo_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} />
  return <span style={{ fontSize: 28 }}>🏪</span>
}

/* ═══════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════ */
export default function HomePage() {
  const router = useRouter()

  const [user, setUser]               = useState<any>(null)
  const [userType, setUserType]       = useState<string | null>(null)
  const [userName, setUserName]       = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [banners, setBanners]         = useState<Banner[]>([])
  const [activeBanner, setActiveBanner] = useState(0)
  const [highlights, setHighlights]   = useState<Highlight[]>([])
  const [newCompanies, setNewCompanies] = useState<Company[]>([])
  const [recentListings, setRecentListings] = useState<Record<string, Listing[]>>({})
  const [loading, setLoading]         = useState(true)

  /* ── auth ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase.from('profiles').select('user_type, name').eq('id', session.user.id).single()
          .then(({ data }) => {
            setUserType(data?.user_type ?? null)
            setUserName(data?.name ?? null)
          })
      }
    })
  }, [])

  /* ── dados ── */
  const loadData = useCallback(async () => {
    setLoading(true)

    const { data: bannersData } = await supabase
      .from('banners').select('*').eq('active', true).order('display_order')
    setBanners(bannersData || [])

    const { data: hlData } = await supabase
      .from('highlights')
      .select(`id, company_id, scope,
        companies ( name, slug, avg_rating, total_reviews,
          categories ( name, emoji ),
          company_photos ( photo_url, is_primary, order )
        )`)
      .eq('scope', 'home')
      .limit(8)
    setHighlights((hlData || []) as any)

    const { data: newData } = await supabase
      .from('companies')
      .select(`id, name, slug, description, category_id, is_active,
        trial_ends_at, plan_status, avg_rating, total_reviews,
        categories ( name, emoji ),
        company_photos ( photo_url, is_primary, order )`)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10)
    const visible = ((newData || []) as any as Company[]).filter(isVisible)
    setNewCompanies(visible.slice(0, 6))

    const types = ['desapega', 'emprego', 'imovel']
    const map: Record<string, Listing[]> = {}
    for (const type of types) {
      const { data: ld } = await supabase
        .from('listings').select('id, title, price, listing_type, company_name, created_at')
        .eq('listing_type', type).eq('is_resolved', false)
        .order('created_at', { ascending: false }).limit(3)
      map[type] = (ld || []) as Listing[]
    }
    setRecentListings(map)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  /* ── banner rotativo ── */
  useEffect(() => {
    if (banners.length <= 1) return
    const t = setInterval(() => setActiveBanner(p => (p + 1) % banners.length), 5000)
    return () => clearInterval(t)
  }, [banners.length])

  /* ── busca ── */
  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      const q = searchQuery.trim()
      supabase.from('search_logs').insert({ query: q, user_id: user?.id || null }).then(() => {})
      router.push(`/busca?q=${encodeURIComponent(q)}`)
    }
  }

  async function handleSair() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const currentBanner = banners[activeBanner]

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; color: #111; }

        /* ── NAV ── */
        .site-header { background: #fff; border-bottom: 1px solid #EDE8E0; position: sticky; top: 0; z-index: 50; }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 12px 20px; display: flex; align-items: center; gap: 12px; justify-content: space-between; }
        .logo { display: flex; align-items: baseline; flex-shrink: 0; text-decoration: none; }
        .logo-main { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: #111; letter-spacing: 2px; }
        .logo-dot  { font-family: 'Bebas Neue', sans-serif; font-size: 18px; color: #DDD; margin: 0 5px; }
        .logo-gold { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: #C9951A; letter-spacing: 2px; }
        .nav-actions { display: flex; align-items: center; gap: 8px; }
        .btn-painel   { background: #111; color: #C9951A; border: none; border-radius: 10px; padding: 9px 16px; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; text-decoration: none; display: none; }
        .btn-sair     { background: transparent; color: #666; border: 1px solid #333; border-radius: 10px; padding: 8px 12px; font-size: 12px; font-weight: 500; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; display: none; }
        .btn-entrar   { display: none; align-items: center; gap: 5px; background: transparent; color: #C9951A; border: 1.5px solid #C9951A; border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; text-decoration: none; }
        .btn-cad      { background: #C9951A; color: #fff; border: none; border-radius: 10px; padding: 9px 16px; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; text-decoration: none; display: none; }
        .btn-fav      { color: #555; font-size: 13px; text-decoration: none; display: none; }
        .btn-perfil   { color: #555; font-size: 13px; text-decoration: none; display: none; }
        @media(min-width: 768px) {
          .btn-painel { display: block; }
          .btn-sair   { display: block; }
          .btn-entrar { display: flex; }
          .btn-cad    { display: block; }
          .btn-fav    { display: block; }
          .btn-perfil { display: block; }
        }

        /* ── HERO ──
           Fonte título: Bebas Neue, 72px (clamp 42px→72px), letter-spacing 4px
           Fonte subtítulo: Inter, 16px (clamp 14px→16px), cor #888
           Campo busca: pill border-radius 50px, borda 2px solid #C9951A
           Botão Buscar: background #C9951A, cor #fff, border-radius 50px
        */
        .hero { background: linear-gradient(160deg, #fff 0%, #FEF8EC 60%, #FEF3E2 100%); padding: 40px 20px 36px; text-align: center; border-bottom: 1px solid #EDE8E0; }
        .hero-title { font-family: 'Bebas Neue', sans-serif; font-size: clamp(42px, 6vw, 72px); letter-spacing: 4px; line-height: 1; margin-bottom: 8px; display: none; }
        .hero-title span { color: #C9951A; }
        .hero-sub { font-size: clamp(14px, 2vw, 16px); color: #888; margin-bottom: 24px; display: none; }
        .hero-search-wrap { display: none; }
        @media(min-width: 768px) {
          .hero { padding: 51px 20px 0; }
          .hero-title, .hero-sub { display: block; }
          .hero-search-wrap {
            display: flex;
            max-width: 600px;
            margin: 0 auto;
            align-items: center;
            gap: 8px;
            background: #fff;
            border: 2px solid #C9951A;
            border-radius: 50px;
            padding: 6px 6px 6px 20px;
            box-shadow: 0 4px 20px rgba(201,149,26,.12);
            transform: translateY(50%);
            position: relative;
            z-index: 20;
          }
          .hero-search-wrap input { flex: 1; border: none; background: transparent; font-size: 15px; font-family: 'Inter', sans-serif; color: #222; outline: none; }
          .hero-search-wrap input::placeholder { color: #BBB; }
          .hero-search-btn { background: #C9951A; border: none; border-radius: 50px; padding: 10px 24px; color: #fff; font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
        }

        /* ── BANNER full-width ── */
        .banner-outer { width: 100%; }
        .banner-inner-wrap {
          width: 100%;
          height: 312px;
          background: linear-gradient(105deg, #1a0f00 0%, #3d2200 50%, #5c3300 100%);
          display: flex;
          align-items: center;
          position: relative;
          overflow: hidden;
          padding-top: 30px;
        }
        .banner-deco { position: absolute; right: 8%; top: 50%; transform: translateY(-50%); font-size: 130px; opacity: 0.08; pointer-events: none; }
        .banner-content-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px; width: 100%; position: relative; z-index: 2; }
        .banner-title-text { font-family: 'Bebas Neue', sans-serif; font-size: 46px; color: #fff; line-height: 1; margin-bottom: 4px; }
        .banner-sub-text { color: #ccc; font-size: 14px; margin-bottom: 4px; }
        .banner-desc-text { color: #999; font-size: 12px; }
        .banner-dots { position: absolute; bottom: 14px; right: 20px; display: flex; gap: 6px; }
        .banner-dot { height: 7px; border-radius: 4px; cursor: pointer; transition: width 0.3s; background: rgba(255,255,255,0.25); }
        .banner-dot.on { background: #C9951A; }

        /* ── CONTAINER CENTRAL ── */
        .main-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

        /* categorias sobrepostas */
        .cat-overlap { margin-top: -40px; position: relative; z-index: 10; }
        .cat-card-wrap {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 14px;
          padding: 24px 26px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        }
        .cat-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; }
        @media(min-width: 768px) { .cat-grid { grid-template-columns: repeat(8,1fr); gap: 4px; } }
        .cat-item { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px; border-radius: 8px; cursor: pointer; text-decoration: none; transition: background 0.15s; }
        .cat-item:hover { background: #fdf6e3; }
        .cat-icon-wrap { width: 58px; height: 58px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; }
        .cat-label { font-size: 11px; color: #555; text-align: center; line-height: 1.3; font-weight: 500; }

        /* seções */
        .sec-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; margin-top: 28px; }
        .sec-title { font-family: 'Bebas Neue', sans-serif; font-size: 13px; color: #999; letter-spacing: 2px; }
        .sec-link { font-size: 12px; color: #C9951A; font-weight: 500; text-decoration: none; }
        .sec-link:hover { text-decoration: underline; }
        .divider { height: 1px; background: #F0EDE8; margin: 20px 0 0; }

        /* destaques */
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

        /* anúncios */
        .listings-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media(min-width: 768px) { .listings-grid { grid-template-columns: repeat(3,1fr); } }
        .listing-col { background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; overflow: hidden; }
        .listing-col-hdr { padding: 11px 14px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 8px; background: #fafafa; }
        .lch-title { font-size: 13px; font-weight: 600; color: #111; }
        .listing-item { padding: 9px 14px; border-bottom: 1px solid #f5f5f5; display: block; text-decoration: none; }
        .listing-item:last-child { border-bottom: none; }
        .listing-item:hover { background: #fafaf8; }
        .li-title { font-size: 12px; color: #333; margin-bottom: 2px; }
        .li-meta  { font-size: 11px; color: #999; }
        .li-price { font-size: 12px; color: #b8860b; font-weight: 600; }

        /* recentes */
        .rec-grid { display: flex; flex-direction: column; border: 0.5px solid #EDE8E0; border-radius: 14px; overflow: hidden; background: #fff; }
        @media(min-width: 768px)  { .rec-grid { display: grid; grid-template-columns: repeat(2,1fr); } }
        @media(min-width: 1024px) { .rec-grid { grid-template-columns: repeat(3,1fr); } }
        .rec-item { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-bottom: 0.5px solid #F5F2EC; cursor: pointer; transition: background .15s; text-decoration: none; }
        .rec-item:hover { background: #FAFAF8; }
        .rec-icon { width: 44px; height: 44px; border-radius: 11px; background: #F0EDE8; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; border: 0.5px solid #E0DDD8; overflow: hidden; }
        .rec-name { font-size: 13px; font-weight: 600; color: #222; margin-bottom: 2px; }
        .rec-cat  { font-size: 11px; color: #999; margin-bottom: 3px; }
        .rec-new  { font-size: 10px; color: #0F8050; font-weight: 600; }

        /* CTA */
        .cta-section { margin: 36px 0 48px; background: linear-gradient(135deg,#1A1A1A,#333); border-radius: 20px; padding: 36px 32px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; }
        @media(min-width: 768px) { .cta-section { flex-direction: row; text-align: left; justify-content: space-between; padding: 36px 48px; } }
        .cta-title { font-family: 'Bebas Neue', sans-serif; font-size: clamp(22px,3vw,30px); color: #fff; letter-spacing: 1px; margin-bottom: 6px; }
        .cta-title span { color: #C9951A; }
        .cta-sub  { font-size: 13px; color: #AAA; }
        .cta-btn  { background: #C9951A; color: #fff; border: none; border-radius: 12px; padding: 14px 28px; font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; text-decoration: none; display: inline-block; }
        .cta-btn:hover { background: #B8841A; }
        .cta-note { font-size: 11px; color: #888; margin-top: 4px; }

        /* FOOTER */
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

        /* empty / loading */
        .empty-state { text-align: center; padding: 32px 20px; color: #AAA; font-size: 13px; }
        .skeleton { background: linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 10px; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* ── HEADER ───────────────────────────────────────────── */}
      <header className="site-header">
        <div className="header-inner">
          <a className="logo" href="/">
            <span className="logo-main">TRINDADE</span>
            <span className="logo-dot">·</span>
            <span className="logo-gold">ONLINE</span>
          </a>

          <div className="nav-actions">
            {user ? (
              <>
                {userType === 'user' && <>
                  <a className="btn-fav"    href="/favoritos">❤ Favoritos</a>
                  <a className="btn-perfil" href="/perfil">👤 Perfil</a>
                </>}
                <a className="btn-painel" href={userType === 'admin' ? '/admin' : '/painel'}>
                  {userType === 'admin' ? 'Admin →' : `Meu painel →`}
                </a>
                <button className="btn-sair" onClick={handleSair}>Sair</button>
              </>
            ) : (
              <a className="btn-entrar" href="/login">Entrar</a>
            )}
            <a className="btn-cad" href="/empresa/cadastrar">+ Cadastrar empresa</a>
          </div>
        </div>
      </header>

      {/* ── HERO ─────────────────────────────────────────────── */}
      {/* Fonte título: Bebas Neue | Fonte subtítulo: Inter | Busca: pill borda dourada */}
      <section className="hero">
        <h1 className="hero-title">TRINDADE <span>ONLINE</span></h1>
        <p className="hero-sub">Conectando moradores, comércios e serviços do bairro Trindade</p>
        <form className="hero-search-wrap" onSubmit={handleSearch}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="O que você está procurando?"
          />
          <button type="submit" className="hero-search-btn">Buscar</button>
        </form>
      </section>

      {/* ── BANNER FULL-WIDTH ────────────────────────────────── */}
      <div className="banner-outer">
        {currentBanner ? (
          <a
            href={currentBanner.link_url || '#'}
            style={{ display: 'block', textDecoration: 'none' }}
          >
            <div className="banner-inner-wrap">
              <div className="banner-deco">🏗️</div>
              <div className="banner-content-wrap">
                <div className="banner-title-text">{currentBanner.title}</div>
                {currentBanner.subtitle    && <div className="banner-sub-text">{currentBanner.subtitle}</div>}
                {currentBanner.description && <div className="banner-desc-text">{currentBanner.description}</div>}
              </div>
              {banners.length > 1 && (
                <div className="banner-dots">
                  {banners.map((_, i) => (
                    <span
                      key={i}
                      className={`banner-dot${i === activeBanner ? ' on' : ''}`}
                      style={{ width: i === activeBanner ? 20 : 7 }}
                      onClick={e => { e.preventDefault(); setActiveBanner(i) }}
                    />
                  ))}
                </div>
              )}
            </div>
          </a>
        ) : (
          <div className="banner-inner-wrap" style={{ justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: '#555' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📢</div>
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 20, color: '#C9951A' }}>Espaço para anunciante</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Entre em contato para anunciar aqui</div>
            </div>
          </div>
        )}
      </div>

      {/* ── CONTEÚDO CENTRALIZADO ───────────────────────────── */}
      <div className="main-wrap">

        {/* CATEGORIAS — sobrepostas ao banner */}
        <div className="cat-overlap">
          <div className="cat-card-wrap">
            <div className="cat-grid">
              {CATEGORIES.map(cat => (
                <a key={cat.slug} className="cat-item" href={cat.href}>
                  <div className="cat-icon-wrap" style={{ background: cat.color }}>
                    <span style={{ fontSize: 20 }}>{cat.emoji}</span>
                  </div>
                  <span className="cat-label">{cat.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* EMPRESAS EM DESTAQUE */}
        {!loading && highlights.length > 0 && (
          <>
            <div className="divider" />
            <div className="sec-hdr">
              <span className="sec-title">EM DESTAQUE</span>
              <a className="sec-link" href="/busca">Ver todos</a>
            </div>
            <div className="dest-grid">
              {highlights.map(hl => {
                const c = hl.companies
                if (!c) return null
                const photos = c.company_photos || []
                return (
                  <a key={hl.id} className="dest-card" href={`/empresa/${c.slug}`}>
                    <div className="dest-img">
                      <CoverPhoto photos={photos} name={c.name} />
                      <span className="badge-dest">DESTAQUE</span>
                    </div>
                    <div className="dest-body">
                      <div className="dest-name">{c.name}</div>
                      <div className="dest-cat">{(c.categories as any)?.emoji} {(c.categories as any)?.name || ''}</div>
                      {c.avg_rating > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Stars rating={c.avg_rating} />
                          <span style={{ fontSize: 10, color: '#999' }}>{c.avg_rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  </a>
                )
              })}
            </div>
          </>
        )}
        {loading && (
          <>
            <div className="divider" />
            <div className="sec-hdr"><span className="sec-title">EM DESTAQUE</span></div>
            <div className="dest-grid">
              {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 148, borderRadius: 14 }} />)}
            </div>
          </>
        )}

        {/* ANÚNCIOS RECENTES */}
        <div className="divider" />
        <div className="sec-hdr">
          <span className="sec-title">ANÚNCIOS RECENTES</span>
        </div>
        <div className="listings-grid">
          {/* Desapega */}
          <div className="listing-col">
            <div className="listing-col-hdr">
              <span>🏷️</span>
              <span className="lch-title">Desapega</span>
              <a href="/desapega" style={{ marginLeft: 'auto', fontSize: 11, color: '#C9951A', fontWeight: 500, textDecoration: 'none' }}>ver todos</a>
            </div>
            {(recentListings['desapega'] || []).length === 0
              ? <div className="empty-state" style={{ padding: '16px 14px' }}>Nenhum anúncio ainda</div>
              : (recentListings['desapega'] || []).map(l => (
                  <a key={l.id} className="listing-item" href={`/anuncio/${l.id}`}>
                    <div className="li-title">{l.title}</div>
                    {l.price && <div className="li-price">R$ {l.price.toLocaleString('pt-BR')}</div>}
                  </a>
                ))
            }
          </div>

          {/* Empregos */}
          <div className="listing-col">
            <div className="listing-col-hdr">
              <span>💼</span>
              <span className="lch-title">Empregos</span>
              <a href="/empregos" style={{ marginLeft: 'auto', fontSize: 11, color: '#C9951A', fontWeight: 500, textDecoration: 'none' }}>ver todos</a>
            </div>
            {(recentListings['emprego'] || []).length === 0
              ? <div className="empty-state" style={{ padding: '16px 14px' }}>Nenhuma vaga ainda</div>
              : (recentListings['emprego'] || []).map(l => (
                  <a key={l.id} className="listing-item" href={`/anuncio/${l.id}`}>
                    <div className="li-title">{l.title}</div>
                    {l.company_name && <div className="li-meta">{l.company_name}</div>}
                  </a>
                ))
            }
          </div>

          {/* Imóveis */}
          <div className="listing-col">
            <div className="listing-col-hdr">
              <span>🏠</span>
              <span className="lch-title">Imóveis</span>
              <a href="/imoveis" style={{ marginLeft: 'auto', fontSize: 11, color: '#C9951A', fontWeight: 500, textDecoration: 'none' }}>ver todos</a>
            </div>
            {(recentListings['imovel'] || []).length === 0
              ? <div className="empty-state" style={{ padding: '16px 14px' }}>Nenhum imóvel ainda</div>
              : (recentListings['imovel'] || []).map(l => (
                  <a key={l.id} className="listing-item" href={`/anuncio/${l.id}`}>
                    <div className="li-title">{l.title}</div>
                    {l.price && <div className="li-price">R$ {l.price.toLocaleString('pt-BR')}/mês</div>}
                  </a>
                ))
            }
          </div>
        </div>

        {/* RECÉM CADASTRADOS */}
        <div className="divider" />
        <div className="sec-hdr">
          <span className="sec-title">RECÉM CADASTRADOS</span>
          <a className="sec-link" href="/busca">Ver todos</a>
        </div>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />)}
          </div>
        ) : newCompanies.length === 0 ? (
          <div className="empty-state">Nenhuma empresa cadastrada ainda.</div>
        ) : (
          <div className="rec-grid">
            {newCompanies.map(c => (
              <a key={c.id} className="rec-item" href={`/empresa/${c.slug}`}>
                <div className="rec-icon">
                  <CoverPhoto photos={c.company_photos} name={c.name} />
                </div>
                <div>
                  <div className="rec-name">{c.name}</div>
                  <div className="rec-cat">{(c.categories as any)?.emoji} {(c.categories as any)?.name || '—'}</div>
                  <div className="rec-new">● Novo · Trindade</div>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="cta-section">
          <div>
            <div className="cta-title">SEU NEGÓCIO NO <span>TRINDADE ONLINE</span></div>
            <div className="cta-sub">Alcance milhares de moradores do bairro todos os dias</div>
            <div className="cta-note">7 dias grátis · Sem cartão de crédito</div>
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
    </>
  )
}