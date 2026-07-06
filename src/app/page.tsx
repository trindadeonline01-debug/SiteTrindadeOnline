'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import CookieBanner from '@/components/CookieBanner'

interface Company {
  id: string; name: string; slug: string; description: string | null
  category_id: string; is_active: boolean; trial_ends_at: string | null
  plan_status: string | null; avg_rating: number; total_reviews: number
  categories?: { name: string; emoji?: string } | null
  company_photos?: { photo_url: string; is_primary: boolean; order?: number }[]
}

interface Highlight {
  id: string; company_id: string; scope: string
  companies?: {
    name: string; slug: string; avg_rating: number; total_reviews: number
    categories?: { name: string; emoji?: string } | null
    company_photos?: { photo_url: string; is_primary: boolean; order?: number }[]
  } | null
}

interface Listing {
  id: string; title: string; price: number | null
  listing_type: string; company_name: string | null; created_at: string
}

interface Banner {
  id: string; title: string; subtitle: string | null; description: string | null
  link_url: string | null; image_url: string | null; image_url_mobile: string | null; display_order: number
}

const CATEGORIES = [
  { slug: 'comercios',        label: 'Comércios',         href: '/categoria/comercios'   },
  { slug: 'servicos',         label: 'Serviços',           href: '/categoria/servicos'    },
  { slug: 'gastronomia',      label: 'Gastronomia',        href: '/categoria/gastronomia' },
  { slug: 'empregos',         label: 'Empregos',           href: '/empregos'              },
  { slug: 'imoveis',          label: 'Imóveis',            href: '/imoveis'               },
  { slug: 'desapega',         label: 'Desapega',           href: '/desapega'              },
  { slug: 'achados-perdidos', label: 'Achados & Perdidos', href: '/achados-perdidos'      },
  { slug: 'igrejas',          label: 'Igrejas',            href: '/categoria/igrejas'     },
]

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

export default function HomePage() {
  const router = useRouter()
  const [user, setUser]               = useState<any>(null)
  const [userType, setUserType]       = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<{type:string;label:string;sub:string;slug?:string;categorySlug?:string}[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const [banners, setBanners]         = useState<Banner[]>([])
  const [activeBanner, setActiveBanner] = useState(0)
  const [highlights, setHighlights]   = useState<Highlight[]>([])
  const [newCompanies, setNewCompanies] = useState<Company[]>([])
  const [recentListings, setRecentListings] = useState<Record<string, Listing[]>>({})
  const [loading, setLoading]         = useState(true)
  const [isMobile, setIsMobile]       = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase.from('profiles').select('user_type, name').eq('id', session.user.id).single()
          .then(({ data }) => { setUserType(data?.user_type ?? null) })
      }
    })
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)

    const { data: bannersData } = await supabase
      .from('banners').select('*').eq('active', true).order('display_order')
    // SHUFFLE — ordem aleatória a cada carregamento
    const shuffled = [...(bannersData || [])].sort(() => Math.random() - 0.5)
    setBanners(shuffled)

    const { data: hlData } = await supabase
      .from('highlights')
      .select(`id, company_id, scope,
        companies ( name, slug, avg_rating, total_reviews,
          categories ( name, emoji ),
          company_photos ( photo_url, is_primary, order )
        )`)
      .eq('scope', 'home').limit(8)
    setHighlights(([...(hlData || [])].sort(() => Math.random() - 0.5)) as any)

    const { data: newData } = await supabase
      .from('companies')
      .select(`id, name, slug, description, category_id, is_active,
        trial_ends_at, plan_status, avg_rating, total_reviews,
        categories ( name, emoji ),
        company_photos ( photo_url, is_primary, order )`)
      .eq('is_active', true).order('created_at', { ascending: false }).limit(10)
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

  useEffect(() => {
    if (banners.length <= 1) return
    const t = setInterval(() => setActiveBanner(p => (p + 1) % banners.length), 5000)
    return () => clearInterval(t)
  }, [banners.length])

  async function fetchSuggestions(q: string) {
    if (q.length < 2) { setSuggestions([]); return }
    const { data } = await supabase.rpc('buscar_empresas', { termo: q })
    const results: {type:string;label:string;sub:string}[] = []
    // Empresas
    if (data) {
      data.slice(0,5).forEach((c:any) => {
        const q_lower = q.toLowerCase()
        let motivo = c.category_name || ''
        if (c.address && c.address.toLowerCase().includes(q_lower)) motivo = `📍 ${c.address}`
        else if (c.category_name) motivo = c.category_name
        results.push({ type:'empresa', label: c.name, sub: motivo })
      })
    }
    // Tags — buscar empresas com tags matching
    const { data: tagData } = await supabase
      .from('companies')
      .select('name, tags')
      .eq('status','active')
      .eq('plan','paid')
      .limit(50)
    if (tagData) {
      tagData.forEach((c:any) => {
        if (c.tags) {
          c.tags.filter((t:string) => t.toLowerCase().includes(q.toLowerCase())).slice(0,2).forEach((t:string) => {
            if (!results.find(r => r.label.toLowerCase() === t.toLowerCase())) {
              results.push({ type:'tag', label: t, sub: c.name })
            }
          })
        }
      })
    }
    // Subcategorias
    const { data: subcatData } = await supabase
      .from('subcategories')
      .select('id, name, slug, category:categories(slug)')
      .ilike('name', `%${q}%`)
      .limit(3)
    if (subcatData) {
      subcatData.forEach((s:any) => {
        if (!results.find(r => r.label.toLowerCase() === s.name.toLowerCase())) {
          results.push({ type:'subcat', label: s.name, sub: 'Ver subcategoria', slug: s.slug, categorySlug: s.category?.slug })
        }
      })
    }

    setSuggestions(results.slice(0,8))
    setShowSuggestions(true)
  }

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
    window.location.href = '/'
  }

  function prevBanner() {
    setActiveBanner(p => (p - 1 + banners.length) % banners.length)
  }

  function nextBanner() {
    setActiveBanner(p => (p + 1) % banners.length)
  }

  const currentBanner = banners[activeBanner]

  // Escolhe imagem certa: mobile ou desktop
  function getBannerImage(b: Banner): string | null {
    if (isMobile && b.image_url_mobile) return b.image_url_mobile
    return b.image_url
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; color: #111; }

        .site-header { background: #fff; border-bottom: 1px solid #EDE8E0; position: sticky; top: 0; z-index: 50; }
        .header-inner { max-width: 1200px; margin: 0 auto; padding: 10px 14px; display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
        @media(min-width: 768px) { .header-inner { padding: 12px 20px; justify-content: space-between; } }
        .logo { display: none; align-items: baseline; flex-shrink: 0; text-decoration: none; }
        @media(min-width: 768px) { .logo { display: flex; } }
        .logo-main { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: #111; letter-spacing: 2px; }
        .logo-dot  { font-family: 'Bebas Neue', sans-serif; font-size: 18px; color: #DDD; margin: 0 5px; }
        .logo-gold { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: #C9951A; letter-spacing: 2px; }
        .nav-actions { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; justify-content: flex-end; width: 100%; }
        .btn-painel   { background: #111; color: #C9951A; border: none; border-radius: 10px; padding: 7px 12px; font-size: 12px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; text-decoration: none; display: block; }
        .btn-sair     { background: transparent; color: #666; border: 1px solid #333; border-radius: 10px; padding: 6px 10px; font-size: 11px; font-weight: 500; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; display: block; }
        .btn-entrar   { display: flex; align-items: center; gap: 5px; background: transparent; color: #C9951A; border: 1.5px solid #C9951A; border-radius: 10px; padding: 7px 12px; font-size: 12px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; text-decoration: none; }
        .btn-cad      { background: #C9951A; color: #fff; border: none; border-radius: 10px; padding: 7px 12px; font-size: 12px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; text-decoration: none; display: block; }
        .btn-fav      { color: #555; font-size: 13px; text-decoration: none; display: none; }
        .btn-perfil   { color: #555; font-size: 13px; text-decoration: none; display: none; }
        @media(min-width: 768px) {
          .btn-painel { display: block; } .btn-sair { display: block; }
          .btn-entrar { display: flex; } .btn-cad { display: block; }
          .btn-fav { display: block; } .btn-perfil { display: block; }
        }

        .hero { background: linear-gradient(160deg, #fff 0%, #FEF8EC 60%, #FEF3E2 100%); padding: 28px 16px 8px; text-align: center; border-bottom: 1px solid #EDE8E0; }
        @media(min-width: 768px) { .hero { padding: 43px 20px 0; } }
        .hero-title { font-family: 'Bebas Neue', sans-serif; font-size: clamp(30px, 8vw, 72px); letter-spacing: 4px; line-height: 1; margin-bottom: 8px; display: block; }
        .hero-title span { color: #C9951A; }
        .hero-sub { font-size: clamp(12px, 3vw, 16px); color: #888; margin-bottom: 20px; display: block; }
        .hero-search-wrap {
          display: flex; max-width: 600px; margin: 0 auto; align-items: center; gap: 8px;
          background: #fff; border: 2px solid #C9951A; border-radius: 50px;
          padding: 6px 6px 6px 16px; box-shadow: 0 4px 20px rgba(201,149,26,.12);
          transform: none; position: relative; z-index: 20; margin-bottom: 4px;
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
        .hero-search-btn { background: #C9951A; border: none; border-radius: 50px; padding: 9px 16px; color: #fff; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
        @media(min-width: 768px) {
          .hero { padding: 43px 20px 0; }
          .hero-title, .hero-sub { display: block; }
          .hero-search-wrap {
            display: flex; max-width: 600px; margin: 0 auto; align-items: center; gap: 8px;
            background: #fff; border: 2px solid #C9951A; border-radius: 50px;
            padding: 6px 6px 6px 20px; box-shadow: 0 4px 20px rgba(201,149,26,.12);
            transform: none; position: relative; z-index: 20; margin-bottom: 4px;
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
          .banner-inner-wrap { height: auto; aspect-ratio: 3/2; padding-top: 0; }
        }
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
          .banner-arrow { top: 50%; }
        }
        .banner-deco { position: absolute; right: 8%; top: 50%; transform: translateY(-50%); font-size: 130px; opacity: 0.08; pointer-events: none; }
        .banner-content-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px; width: 100%; position: relative; z-index: 2; }
        .banner-title-text { font-family: 'Bebas Neue', sans-serif; font-size: 46px; color: #fff; line-height: 1; margin-bottom: 4px; }
        .banner-sub-text { color: #ccc; font-size: 14px; margin-bottom: 4px; }
        .banner-desc-text { color: #999; font-size: 12px; }

        /* setas do banner */
        .banner-arrow {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 42px; height: 42px; border-radius: 50%;
          background: rgba(0,0,0,0.45); border: 1.5px solid rgba(255,255,255,0.2);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; z-index: 10; transition: background 0.2s;
        }
        .banner-arrow:hover { background: rgba(0,0,0,0.65); }
        .banner-arrow-left  { left: 14px; }
        .banner-arrow-right { right: 14px; }

        /* dots — fora do banner, entre banner e categorias */
        .banner-dots-outer {
          display: flex; justify-content: center; align-items: center; gap: 8px;
          padding: 10px 0 0;
          background: #F0EDE8;
        }
        .banner-dot {
          height: 8px; border-radius: 4px; cursor: pointer;
          transition: all 0.3s; background: rgba(0,0,0,0.18);
        }
        .banner-dot.on { background: #C9951A; }

        .main-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

        .cat-overlap { margin-top: -40px; position: relative; z-index: 10; }
        .cat-card-wrap { background: #fff; border: 1px solid #e0e0e0; border-radius: 14px; padding: 24px 28px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
        .cat-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 0; }
        @media(min-width: 768px) { .cat-grid { grid-template-columns: repeat(8,1fr); gap: 0; } }
        .cat-item { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 20px 8px; border-radius: 10px; cursor: pointer; text-decoration: none; position: relative; transition: background 0.15s; }
        .cat-item:not(:last-child)::after { content: ""; position: absolute; right: 0; top: 20%; height: 60%; width: 1px; background: #e8e8e4; }
        .cat-item:hover { background: #faf9f6; }
        .cat-item:hover svg { stroke: #C9951A; }
        .cat-item:hover .cat-label { color: #C9951A; }
        .cat-item svg { width: 70px; height: 70px; stroke: #111; stroke-width: 0.8; fill: none; stroke-linecap: round; stroke-linejoin: round; transition: stroke 0.15s; }
        .cat-label { font-size: 12px; color: #111; text-align: center; line-height: 1.3; font-weight: 600; transition: color 0.15s; }

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

        .rec-grid { display: flex; flex-direction: column; border: 0.5px solid #EDE8E0; border-radius: 14px; overflow: hidden; background: #fff; }
        @media(min-width: 768px)  { .rec-grid { display: grid; grid-template-columns: repeat(2,1fr); } }
        @media(min-width: 1024px) { .rec-grid { grid-template-columns: repeat(3,1fr); } }
        .rec-item { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-bottom: 0.5px solid #F5F2EC; cursor: pointer; transition: background .15s; text-decoration: none; }
        .rec-item:hover { background: #FAFAF8; }
        .rec-icon { width: 44px; height: 44px; border-radius: 11px; background: #F0EDE8; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; border: 0.5px solid #E0DDD8; overflow: hidden; }
        .rec-name { font-size: 13px; font-weight: 600; color: #222; margin-bottom: 2px; }
        .rec-cat  { font-size: 11px; color: #999; margin-bottom: 3px; }
        .rec-new  { font-size: 10px; color: #0F8050; font-weight: 600; }

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

      {/* HEADER */}
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
                  {userType === 'admin' ? 'Admin →' : 'Meu painel →'}
                </a>
                <button className="btn-sair" onClick={handleSair}>Sair</button>
              </>
            ) : (
              <>
                <a className="btn-entrar" href="/login">Entrar</a>
                <a className="btn-entrar" href="/cadastro" style={{borderColor:'#888',color:'#888'}}>+ Cadastrar morador</a>
              </>
            )}
            <a className="btn-cad" href="/empresa/cadastrar">+ Cadastrar empresa</a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <h1 className="hero-title">TRINDADE <span>ONLINE</span></h1>
        <p className="hero-sub">Conectando moradores, comércios e serviços do bairro Trindade</p>
        <div ref={searchRef} style={{position:'relative',width:'100%',maxWidth:600,margin:'0 auto'}}>
        <form className="hero-search-wrap" onSubmit={handleSearch}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); fetchSuggestions(e.target.value) }}
            onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="O que você está procurando?" />
          <button type="submit" className="hero-search-btn">Buscar</button>
        </form>
        {showSuggestions && suggestions.length > 0 && (
          <div className="search-suggestions">
            {suggestions.map((s, i) => (
              <div key={i} className="sug-item" onMouseDown={() => {
                setSearchQuery(s.label)
                setShowSuggestions(false)
                if (s.type === 'subcat' && s.categorySlug && s.slug) {
                  window.location.href = `/categoria/${s.categorySlug}?sub=${s.slug}`
                } else {
                  window.location.href = `/busca?q=${encodeURIComponent(s.label)}`
                }
              }}>
                <div className="sug-ico">{s.type === 'empresa' ? '🏪' : s.type === 'subcat' ? '📂' : '🏷️'}</div>
                <div>
                  <div className="sug-label">{s.label}</div>
                  {s.sub && <div className="sug-sub">{s.type === 'tag' ? `em ${s.sub}` : s.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </section>

      {/* BANNER FULL-WIDTH */}
      <div className="banner-outer">
        {currentBanner ? (
          <a href={currentBanner.link_url || '#'} style={{ display: 'block', textDecoration: 'none' }}>
            <div className="banner-inner-wrap">
              {getBannerImage(currentBanner)
                ? <img src={getBannerImage(currentBanner)!} alt={currentBanner.title} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} />
                : <div className="banner-deco">🏗️</div>
              }
              <div className="banner-content-wrap">
                <div className="banner-title-text">{currentBanner.title}</div>
                {currentBanner.subtitle    && <div className="banner-sub-text">{currentBanner.subtitle}</div>}
                {currentBanner.description && <div className="banner-desc-text">{currentBanner.description}</div>}
              </div>

              {/* SETA ESQUERDA */}
              {banners.length > 1 && (
                <button
                  className="banner-arrow banner-arrow-left"
                  onClick={e => { e.preventDefault(); prevBanner() }}
                  aria-label="Banner anterior"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
              )}

              {/* SETA DIREITA */}
              {banners.length > 1 && (
                <button
                  className="banner-arrow banner-arrow-right"
                  onClick={e => { e.preventDefault(); nextBanner() }}
                  aria-label="Próximo banner"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
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

        {/* DOTS — fora do banner, entre banner e categorias */}
        {banners.length > 1 && (
          <div className="banner-dots-outer">
            {banners.map((_, i) => (
              <span
                key={i}
                className={`banner-dot${i === activeBanner ? ' on' : ''}`}
                style={{ width: i === activeBanner ? 22 : 8 }}
                onClick={() => setActiveBanner(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* CONTEÚDO */}
      <div className="main-wrap">

        {/* CATEGORIAS */}
        <div className="cat-overlap">
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

        {/* EM DESTAQUE */}
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
                return (
                  <a key={hl.id} className="dest-card" href={`/empresa/${c.slug}`}>
                    <div className="dest-img">
                      <CoverPhoto photos={c.company_photos} name={c.name} />
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
        <div className="sec-hdr"><span className="sec-title">ANÚNCIOS RECENTES</span></div>
        <div className="listings-grid">
          <div className="listing-col">
            <div className="listing-col-hdr">
              <span>🏷️</span><span className="lch-title">Desapega</span>
              <a href="/desapega" style={{ marginLeft:'auto', fontSize:11, color:'#C9951A', fontWeight:500, textDecoration:'none' }}>ver todos</a>
            </div>
            {(recentListings['desapega'] || []).length === 0
              ? <div className="empty-state" style={{ padding:'16px 14px' }}>Nenhum anúncio ainda</div>
              : (recentListings['desapega'] || []).map(l => (
                  <a key={l.id} className="listing-item" href={`/anuncio/${l.id}`}>
                    <div className="li-title">{l.title}</div>
                    {l.price && <div className="li-price">R$ {l.price.toLocaleString('pt-BR')}</div>}
                  </a>
                ))
            }
          </div>
          <div className="listing-col">
            <div className="listing-col-hdr">
              <span>💼</span><span className="lch-title">Empregos</span>
              <a href="/empregos" style={{ marginLeft:'auto', fontSize:11, color:'#C9951A', fontWeight:500, textDecoration:'none' }}>ver todos</a>
            </div>
            {(recentListings['emprego'] || []).length === 0
              ? <div className="empty-state" style={{ padding:'16px 14px' }}>Nenhuma vaga ainda</div>
              : (recentListings['emprego'] || []).map(l => (
                  <a key={l.id} className="listing-item" href={`/anuncio/${l.id}`}>
                    <div className="li-title">{l.title}</div>
                    {l.company_name && <div className="li-meta">{l.company_name}</div>}
                  </a>
                ))
            }
          </div>
          <div className="listing-col">
            <div className="listing-col-hdr">
              <span>🏠</span><span className="lch-title">Imóveis</span>
              <a href="/imoveis" style={{ marginLeft:'auto', fontSize:11, color:'#C9951A', fontWeight:500, textDecoration:'none' }}>ver todos</a>
            </div>
            {(recentListings['imovel'] || []).length === 0
              ? <div className="empty-state" style={{ padding:'16px 14px' }}>Nenhum imóvel ainda</div>
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
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height:60, borderRadius:10 }} />)}
          </div>
        ) : newCompanies.length === 0 ? (
          <div className="empty-state">Nenhuma empresa cadastrada ainda.</div>
        ) : (
          <div className="rec-grid">
            {newCompanies.map(c => (
              <a key={c.id} className="rec-item" href={`/empresa/${c.slug}`}>
                <div className="rec-icon"><CoverPhoto photos={c.company_photos} name={c.name} /></div>
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