'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

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
  categories?: { name: string } | null
  company_photos?: { photo_url: string; is_primary: boolean }[]
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
    categories?: { name: string } | null
    company_photos?: { photo_url: string; is_primary: boolean }[]
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
  { slug: 'comercios',        label: 'Comércios',         icon: '🏪', color: '#fff3cd', iconColor: '#b8860b' },
  { slug: 'servicos',         label: 'Serviços',           icon: '🔧', color: '#dbeafe', iconColor: '#2563eb' },
  { slug: 'gastronomia',      label: 'Gastronomia',        icon: '🍕', color: '#fee2e2', iconColor: '#dc2626' },
  { slug: 'empregos',         label: 'Empregos',           icon: '💼', color: '#dcfce7', iconColor: '#16a34a' },
  { slug: 'imoveis',          label: 'Imóveis',            icon: '🏠', color: '#ede9fe', iconColor: '#7c3aed' },
  { slug: 'desapega',         label: 'Desapega',           icon: '🏷️', color: '#ffedd5', iconColor: '#ea580c' },
  { slug: 'achados-perdidos', label: 'Achados & Perdidos', icon: '📍', color: '#ccfbf1', iconColor: '#0d9488' },
  { slug: 'igrejas',          label: 'Igrejas',            icon: '⛪', color: '#fce7f3', iconColor: '#be185d' },
]

const LISTING_ROUTES: Record<string, string> = {
  desapega: '/desapega',
  emprego:  '/empregos',
  imovel:   '/imoveis',
  achado:   '/achados-perdidos',
}

/* ─── helpers ────────────────────────────────────────────── */
function isVisible(c: Company) {
  if (!c.is_active) return false
  if (c.plan_status === 'pago') return true
  if (c.trial_ends_at && new Date(c.trial_ends_at) > new Date()) return true
  return false
}

function Stars({ rating }: { rating: number }) {
  const r = Math.round(rating)
  return (
    <span style={{ color: '#C9951A', fontSize: 12 }}>
      {'★'.repeat(r)}{'☆'.repeat(5 - r)}
    </span>
  )
}

function CompanyPhoto({ photos, name }: { photos?: { photo_url: string; is_primary: boolean }[]; name: string }) {
  const primary = photos?.find(p => p.is_primary) || photos?.[0]
  if (primary) {
    return (
      <img
        src={primary.photo_url}
        alt={name}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#f5f0e8', fontSize: 32, color: '#ccc' }}>
      🏪
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════ */
export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<any>(null)
  const [userType, setUserType] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [banners, setBanners] = useState<Banner[]>([])
  const [activeBanner, setActiveBanner] = useState(0)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [newCompanies, setNewCompanies] = useState<Company[]>([])
  const [recentListings, setRecentListings] = useState<Record<string, Listing[]>>({})

  /* ── auth ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase
          .from('profiles')
          .select('user_type')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => setUserType(data?.user_type ?? null))
      }
    })
  }, [supabase])

  /* ── dados ── */
  const loadData = useCallback(async () => {
    // banners
    const { data: bannersData } = await supabase
      .from('banners')
      .select('*')
      .eq('active', true)
      .order('display_order')
    setBanners(bannersData || [])

    // destaques home
    const { data: hlData } = await supabase
      .from('highlights')
      .select(`
        id, company_id, scope,
        companies (
          name, slug, avg_rating, total_reviews,
          categories ( name ),
          company_photos ( photo_url, is_primary )
        )
      `)
      .eq('scope', 'home')
      .limit(8)
    setHighlights((hlData || []) as any)

    // recém cadastrados
    const { data: newData } = await supabase
      .from('companies')
      .select(`
        id, name, slug, description, category_id, is_active,
        trial_ends_at, plan_status, avg_rating, total_reviews,
        categories ( name ),
        company_photos ( photo_url, is_primary )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10)
    const visible = ((newData || []) as any as Company[]).filter(isVisible)
    setNewCompanies(visible.slice(0, 5))

    // anúncios recentes
    const types = ['desapega', 'emprego', 'imovel', 'achado']
    const listingsMap: Record<string, Listing[]> = {}
    for (const type of types) {
      const { data: ld } = await supabase
        .from('listings')
        .select('id, title, price, listing_type, company_name, created_at')
        .eq('listing_type', type)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(3)
      listingsMap[type] = (ld || []) as Listing[]
    }
    setRecentListings(listingsMap)
  }, [supabase])

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

  /* ── painel ── */
  function handlePainel() {
    if (userType === 'admin') router.push('/admin')
    else router.push('/painel')
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
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#f4f4f2', minHeight: '100vh' }}>

      {/* ── TOP NAV ─────────────────────────────────────────── */}
      <nav style={{
        background: '#fff',
        borderBottom: '1px solid #e8e8e8',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 52,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          {/* Fonte: Bebas Neue — importada via next/font ou Google Fonts no layout.tsx */}
          <span style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 20,
            letterSpacing: 1,
            color: '#111',
          }}>
            TRINDADE <span style={{ color: '#C9951A' }}>ONLINE</span>
          </span>
        </Link>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {user ? (
            <>
              {userType === 'user' && (
                <>
                  <Link href="/favoritos" style={{ color: '#555', fontSize: 13, textDecoration: 'none' }}>❤ Favoritos</Link>
                  <Link href="/perfil"    style={{ color: '#555', fontSize: 13, textDecoration: 'none' }}>👤 Perfil</Link>
                </>
              )}
              <button
                onClick={handlePainel}
                style={{ background: '#111', color: '#fff', fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer' }}
              >
                Meu painel →
              </button>
              <button
                onClick={handleSair}
                style={{ background: 'transparent', color: '#444', fontSize: 12, fontWeight: 500, padding: '7px 12px', borderRadius: 6, border: '1px solid #ddd', cursor: 'pointer' }}
              >
                Sair
              </button>
            </>
          ) : (
            <>
              <Link href="/login"   style={{ color: '#555', fontSize: 13, textDecoration: 'none' }}>Entrar</Link>
              <Link href="/cadastro" style={{ color: '#555', fontSize: 13, textDecoration: 'none' }}>Cadastrar</Link>
            </>
          )}
          <Link href="/empresa/cadastrar" style={{
            background: '#C9951A', color: '#111', fontSize: 12, fontWeight: 700,
            padding: '7px 14px', borderRadius: 6, textDecoration: 'none',
          }}>
            + Cadastrar empresa
          </Link>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────── */}
      {/*
        Fonte "TRINDADE ONLINE": Bebas Neue, 56px, peso 400
        Fonte subtítulo: Inter, 14px, peso 400, cor #777
        Campo de busca: pill (border-radius 50px), borda 1.5px dourada #C9951A
        Botão "Buscar": background #C9951A, cor texto #fff, border-radius 50px
      */}
      <section style={{
        background: 'linear-gradient(180deg, #fef9ec 0%, #f5e9c4 100%)',
        padding: '22px 32px 0',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontFamily: '"Bebas Neue", sans-serif', /* Bebas Neue */
          fontSize: 56,
          letterSpacing: 2,
          color: '#1a1a1a',
          lineHeight: 1,
          marginBottom: 8,
          fontWeight: 400,
        }}>
          TRINDADE <span style={{ color: '#C9951A' }}>ONLINE</span>
        </h1>

        <p style={{
          fontFamily: 'Inter, sans-serif', /* Inter regular */
          fontSize: 14,
          color: '#777',
          marginBottom: 18,
          fontWeight: 400,
        }}>
          Conectando moradores, comércios e serviços do bairro Trindade
        </p>

        {/* Campo de busca — manter exatamente este estilo */}
        <div style={{ position: 'relative', zIndex: 20, maxWidth: 580, margin: '0 auto', transform: 'translateY(50%)' }}>
          <form onSubmit={handleSearch}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#fff',
              border: '1.5px solid #C9951A', /* borda dourada */
              borderRadius: 50,              /* pill */
              overflow: 'hidden',
              boxShadow: '0 4px 18px rgba(0,0,0,0.10)',
              paddingLeft: 18,
            }}>
              <span style={{ color: '#C9951A', fontSize: 15, flexShrink: 0, marginRight: 4 }}>🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="O que você está procurando?"
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  padding: '13px 10px',
                  fontSize: 14,
                  color: '#555',
                  background: 'transparent',
                  fontFamily: 'Inter, sans-serif',
                }}
              />
              <button
                type="submit"
                style={{
                  background: '#C9951A',   /* dourado */
                  color: '#fff',           /* texto branco */
                  border: 'none',
                  padding: '13px 28px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: 50,        /* pill */
                  margin: 4,
                  fontFamily: 'Inter, sans-serif',
                  flexShrink: 0,
                }}
              >
                Buscar
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ── BANNER ROTATIVO ──────────────────────────────────── */}
      <section style={{ position: 'relative', width: '100%' }}>
        {currentBanner ? (
          <a
            href={currentBanner.link_url || '#'}
            style={{
              display: 'block',
              width: '100%',
              height: 260,
              background: 'linear-gradient(105deg, #1a0f00 0%, #3d2200 50%, #5c3300 100%)',
              textDecoration: 'none',
              position: 'relative',
              overflow: 'hidden',
              paddingTop: 30,
            }}
          >
            {/* Ícone decorativo de fundo */}
            <div style={{
              position: 'absolute', right: 60, top: '50%', transform: 'translateY(-50%)',
              fontSize: 140, opacity: 0.08, color: '#C9951A', pointerEvents: 'none',
            }}>
              🏗️
            </div>

            <div style={{ position: 'relative', zIndex: 2, padding: '0 48px' }}>
              <div style={{
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: 46, color: '#fff', lineHeight: 1, marginBottom: 6,
              }}>
                {currentBanner.title}
              </div>
              {currentBanner.subtitle && (
                <div style={{ color: '#ccc', fontSize: 14, marginBottom: 4 }}>
                  {currentBanner.subtitle}
                </div>
              )}
              {currentBanner.description && (
                <div style={{ color: '#999', fontSize: 12 }}>
                  {currentBanner.description}
                </div>
              )}
            </div>

            {/* Dots */}
            {banners.length > 1 && (
              <div style={{
                position: 'absolute', bottom: 14, right: 48,
                display: 'flex', gap: 6, zIndex: 3,
              }}>
                {banners.map((_, i) => (
                  <span
                    key={i}
                    onClick={e => { e.preventDefault(); setActiveBanner(i) }}
                    style={{
                      width: i === activeBanner ? 20 : 7,
                      height: 7,
                      borderRadius: 4,
                      background: i === activeBanner ? '#C9951A' : 'rgba(255,255,255,0.25)',
                      cursor: 'pointer',
                      transition: 'width 0.3s',
                    }}
                  />
                ))}
              </div>
            )}
          </a>
        ) : (
          /* Banner padrão quando não há anunciante */
          <div style={{
            width: '100%', height: 260,
            background: 'linear-gradient(105deg, #1a0f00 0%, #3d2200 50%, #5c3300 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            paddingTop: 30,
          }}>
            <div style={{ textAlign: 'center', color: '#555' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📢</div>
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, color: '#C9951A' }}>
                Espaço para anunciante
              </div>
              <div style={{ fontSize: 13, color: '#777', marginTop: 4 }}>
                Entre em contato para anunciar aqui
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── CATEGORIAS (sobrepostas ao banner) ───────────────── */}
      <div style={{ position: 'relative', zIndex: 10, marginTop: -40, padding: '0 32px' }}>
        <div style={{
          background: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: 12,
          padding: '18px 20px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: 4,
          }}>
            {CATEGORIES.map(cat => (
              <Link
                key={cat.slug}
                href={`/categoria/${cat.slug}`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 8, padding: '12px 6px', borderRadius: 8,
                  textDecoration: 'none', transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fdf6e3')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{
                  width: 46, height: 46, borderRadius: '50%',
                  background: cat.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {cat.icon}
                </div>
                <span style={{ fontSize: 11, color: '#555', textAlign: 'center', lineHeight: 1.3, fontWeight: 500 }}>
                  {cat.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── EMPRESAS EM DESTAQUE ──────────────────────────────── */}
      {highlights.length > 0 && (
        <section style={{ padding: '28px 32px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 20, color: '#111', fontWeight: 400, letterSpacing: 0.5 }}>
              ⭐ Empresas em Destaque
            </h2>
            <Link href="/busca" style={{ fontSize: 12, color: '#C9951A', textDecoration: 'none', fontWeight: 500 }}>
              Ver todas →
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {highlights.slice(0, 8).map(hl => {
              const c = hl.companies
              if (!c) return null
              return (
                <Link
                  key={hl.id}
                  href={`/empresa/${c.slug}`}
                  style={{
                    display: 'block', background: '#fff',
                    border: '2px solid #C9951A', borderRadius: 10,
                    overflow: 'hidden', textDecoration: 'none',
                    transition: 'transform 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  <div style={{ position: 'relative', height: 90 }}>
                    <CompanyPhoto photos={c.company_photos} name={c.name} />
                    <span style={{
                      position: 'absolute', top: 8, right: 8,
                      background: '#C9951A', color: '#111', fontSize: 9,
                      fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                    }}>DESTAQUE</span>
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{(c.categories as any)?.name || ''}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
                      <Stars rating={c.avg_rating} />
                      <span style={{ fontSize: 11, color: '#999' }}>{c.avg_rating > 0 ? `${c.avg_rating.toFixed(1)} (${c.total_reviews})` : 'Sem avaliações'}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── ANÚNCIOS RECENTES ────────────────────────────────── */}
      <section style={{ padding: '28px 32px 0' }}>
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 20, color: '#111', fontWeight: 400, letterSpacing: 0.5 }}>
            📋 Anúncios Recentes
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>

          {/* Desapega */}
          <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '11px 14px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🏷️</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Desapega</span>
              <Link href="/desapega" style={{ marginLeft: 'auto', fontSize: 11, color: '#C9951A', fontWeight: 500, textDecoration: 'none' }}>ver todos</Link>
            </div>
            {(recentListings['desapega'] || []).length === 0 ? (
              <div style={{ padding: '16px 14px', color: '#aaa', fontSize: 12 }}>Nenhum anúncio ainda</div>
            ) : (recentListings['desapega'] || []).map(l => (
              <Link key={l.id} href={`/anuncio/${l.id}`} style={{ display: 'block', padding: '9px 14px', borderBottom: '1px solid #f5f5f5', textDecoration: 'none' }}>
                <div style={{ fontSize: 12, color: '#333', marginBottom: 2 }}>{l.title}</div>
                {l.price && <div style={{ fontSize: 12, color: '#b8860b', fontWeight: 600 }}>R$ {l.price.toLocaleString('pt-BR')}</div>}
              </Link>
            ))}
          </div>

          {/* Empregos */}
          <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '11px 14px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>💼</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Empregos</span>
              <Link href="/empregos" style={{ marginLeft: 'auto', fontSize: 11, color: '#C9951A', fontWeight: 500, textDecoration: 'none' }}>ver todos</Link>
            </div>
            {(recentListings['emprego'] || []).length === 0 ? (
              <div style={{ padding: '16px 14px', color: '#aaa', fontSize: 12 }}>Nenhuma vaga ainda</div>
            ) : (recentListings['emprego'] || []).map(l => (
              <Link key={l.id} href={`/anuncio/${l.id}`} style={{ display: 'block', padding: '9px 14px', borderBottom: '1px solid #f5f5f5', textDecoration: 'none' }}>
                <div style={{ fontSize: 12, color: '#333', marginBottom: 2 }}>{l.title}</div>
                {l.company_name && <div style={{ fontSize: 11, color: '#999' }}>{l.company_name}</div>}
              </Link>
            ))}
          </div>

          {/* Imóveis */}
          <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '11px 14px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🏠</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Imóveis</span>
              <Link href="/imoveis" style={{ marginLeft: 'auto', fontSize: 11, color: '#C9951A', fontWeight: 500, textDecoration: 'none' }}>ver todos</Link>
            </div>
            {(recentListings['imovel'] || []).length === 0 ? (
              <div style={{ padding: '16px 14px', color: '#aaa', fontSize: 12 }}>Nenhum imóvel ainda</div>
            ) : (recentListings['imovel'] || []).map(l => (
              <Link key={l.id} href={`/anuncio/${l.id}`} style={{ display: 'block', padding: '9px 14px', borderBottom: '1px solid #f5f5f5', textDecoration: 'none' }}>
                <div style={{ fontSize: 12, color: '#333', marginBottom: 2 }}>{l.title}</div>
                {l.price && <div style={{ fontSize: 12, color: '#b8860b', fontWeight: 600 }}>R$ {l.price.toLocaleString('pt-BR')}/mês</div>}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── RECÉM CADASTRADOS ────────────────────────────────── */}
      {newCompanies.length > 0 && (
        <section style={{ padding: '28px 32px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 20, color: '#111', fontWeight: 400, letterSpacing: 0.5 }}>
              🆕 Recém Cadastrados
            </h2>
            <Link href="/busca" style={{ fontSize: 12, color: '#C9951A', textDecoration: 'none', fontWeight: 500 }}>
              Ver todos →
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {newCompanies.map(c => (
              <Link
                key={c.id}
                href={`/empresa/${c.slug}`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 7, padding: '14px 10px',
                  background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8,
                  textDecoration: 'none',
                }}
              >
                <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', background: '#f4f4f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CompanyPhoto photos={c.company_photos} name={c.name} />
                </div>
                <span style={{ fontSize: 11, color: '#333', textAlign: 'center', lineHeight: 1.3, fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: 9, background: '#dcfce7', color: '#16a34a', padding: '2px 7px', borderRadius: 10, fontWeight: 600 }}>Novo</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── CTA FINAL ────────────────────────────────────────── */}
      <div style={{
        margin: '28px 32px 32px',
        background: '#111', borderRadius: 12,
        padding: '26px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h3 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, color: '#F0EDE8', marginBottom: 4, fontWeight: 400 }}>
            Seu negócio ainda não está aqui?
          </h3>
          <p style={{ fontSize: 13, color: '#888' }}>
            Cadastre sua empresa e apareça para milhares de moradores da Trindade
          </p>
        </div>
        <Link href="/empresa/cadastrar" style={{
          background: '#C9951A', color: '#111', fontSize: 13, fontWeight: 700,
          padding: '11px 24px', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          Cadastrar empresa →
        </Link>
      </div>

    </div>
  )
}