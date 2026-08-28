'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// 3 famílias de navegação (ESPECIFICACAO.md §4.1) — troca a lista
// achatada de 8 categorias por Empresas / Ofertas / Comunidade.
const EMPRESAS_LINKS = [
  { href: '/categoria/comercios',   icon: '🏪', label: 'Comércios' },
  { href: '/categoria/gastronomia', icon: '🍕', label: 'Gastronomia' },
  { href: '/categoria/servicos',    icon: '🔧', label: 'Serviços' },
  { href: '/categoria/igrejas',     icon: '⛪', label: 'Igrejas' },
]

const COMUNIDADE_LINKS = [
  { href: '/empregos',         icon: '💼', label: 'Empregos' },
  { href: '/imoveis',          icon: '🏡', label: 'Imóveis' },
  { href: '/desapega',         icon: '🏷️', label: 'Desapega' },
  { href: '/achados-perdidos', icon: '🔍', label: 'Achados & Perdidos' },
]

type Business = { id: string; name: string; slug: string }

export default function MobileMenu() {
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [userType, setUserType] = useState<string|null>(null)
  const [isProdTeam, setIsProdTeam] = useState(false)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [hasListings, setHasListings] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      setUser(session.user)
      const { data } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      setUserType(data?.user_type || null)
      const { data: team } = await supabase.from('production_team').select('id').eq('user_id', session.user.id).eq('status', 'ativo').maybeSingle()
      setIsProdTeam(!!team)
      const { data: mem } = await supabase.from('membership').select('business:companies(id,name,slug)').eq('person_id', session.user.id)
      setBusinesses(((mem || []) as any[]).map(m => m.business).filter(Boolean))
      const { count } = await supabase.from('listings').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id)
      setHasListings(!!count)
    })
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => { setOpen(false) }, [pathname])

  const hideOn = ['/login', '/cadastro', '/admin', '/empresa/cadastrar', '/anunciar', '/producao', '/painel/compartilhar', '/atendimento']
  if (hideOn.some(p => pathname.startsWith(p))) return null

  async function handleSair() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <>
      <style>{`
        .mm-bar{display:none;}
        @media(max-width:767px){
          .mm-bar{display:flex;align-items:center;justify-content:space-between;background:var(--paper);border-bottom:1px solid var(--line);padding:0 14px;height:54px;box-sizing:border-box;position:sticky;top:0;z-index:9500;}
        }
        .mm-brand{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;}
        .mm-bairro{display:flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;color:var(--muted);white-space:nowrap;flex-shrink:0;font-family:'Archivo',sans-serif;background:var(--concrete-2);border-radius:20px;padding:3px 8px;}
        .mm-bairro .pin{color:var(--sign-dark);font-size:9px;}
        .mm-hamburger{background:none;border:none;cursor:pointer;padding:6px;display:flex;flex-direction:column;gap:4px;width:34px;flex-shrink:0;}
        .mm-hamburger span{display:block;height:2px;background:var(--ink);border-radius:2px;}
        .mm-logo{font-family:'Anton', sans-serif;font-size:15px;letter-spacing:.2px;color:var(--ink);text-decoration:none;text-transform:uppercase;white-space:nowrap;flex-shrink:0;}
        .mm-logo span{color:var(--sign-dark);}
        .mm-entrar{background:var(--paper);color:var(--sign-dark);border:1.5px solid var(--sign-dark);border-radius:20px;padding:7px 16px;font-size:12px;font-weight:700;text-decoration:none;font-family:'Archivo',sans-serif;flex-shrink:0;}
        .mm-profile-btn{background:none;border:none;color:var(--ink);cursor:pointer;text-decoration:none;display:flex;flex-shrink:0;}
        .mm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9998;}
        .mm-drawer{position:fixed;top:0;left:0;bottom:0;width:82%;max-width:320px;background:var(--paper);z-index:10000;overflow-y:auto;box-shadow:2px 0 24px rgba(0,0,0,0.2);padding-bottom:calc(80px + env(safe-area-inset-bottom));}
        .mm-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid var(--line);}
        .mm-close{background:var(--concrete-2);border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center;}
        .mm-section-label{font-size:11px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;padding:14px 16px 6px;}
        .mm-link{display:flex;align-items:center;gap:12px;padding:12px 16px;text-decoration:none;color:var(--ink-2);font-size:14px;font-weight:600;font-family:'Archivo',sans-serif;}
        .mm-link:active{background:var(--concrete-2);}
        .mm-link.active{color:var(--sign-dark);background:var(--concrete-2);}
        .mm-link-icon{font-size:18px;width:22px;text-align:center;flex-shrink:0;}
        .mm-divider{height:1px;background:var(--line);margin:8px 0;}
        .mm-sair{color:var(--alert);}
        .mm-switcher{padding:6px 16px 2px;display:flex;flex-direction:column;gap:6px;}
        .mm-idcard{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;border:1.5px solid var(--line);font-size:13px;font-weight:700;color:var(--ink-2);text-decoration:none;}
        .mm-idcard.active{border-color:var(--sign-dark);background:rgba(168,114,0,.08);}
        .mm-idico{width:24px;height:24px;border-radius:6px;background:var(--concrete-2);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;}
        .mm-idcard.active .mm-idico{background:var(--sign);}
        .mm-idtag{margin-left:auto;font-size:10px;color:var(--sign-dark);font-weight:800;}
        .mm-idarrow{margin-left:auto;color:var(--muted);font-size:13px;}
        .mm-idadd{font-size:11.5px;font-weight:700;color:var(--sign-dark);padding:6px 16px 2px;text-decoration:none;display:block;}
      `}</style>

      <div className="mm-bar">
        <button className="mm-hamburger" aria-label="Abrir menu" onClick={() => setOpen(true)}>
          <span/><span/><span/>
        </button>
        <div className="mm-brand">
          <a className="mm-logo" href="/">TRINDADE <span>ONLINE</span></a>
          <span className="mm-bairro"><span className="pin">◉</span> Trindade</span>
        </div>
        {user ? (
          <a className="mm-profile-btn" href="/perfil" aria-label="Meu perfil">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          </a>
        ) : (
          <a className="mm-entrar" href="/login">Entrar</a>
        )}
      </div>

      {open && (
        <>
          <div className="mm-overlay" onClick={() => setOpen(false)} />
          <nav className="mm-drawer">
            <div className="mm-drawer-head">
              <a className="mm-logo" href="/">TRINDADE <span>ONLINE</span></a>
              <button className="mm-close" onClick={() => setOpen(false)} aria-label="Fechar menu">✕</button>
            </div>

            <a className={`mm-link ${pathname === '/' ? 'active' : ''}`} href="/">
              <span className="mm-link-icon">🏠</span> Início
            </a>

            <div className="mm-section-label">Empresas</div>
            {EMPRESAS_LINKS.map(p => (
              <a key={p.href} className={`mm-link ${pathname === p.href ? 'active' : ''}`} href={p.href}>
                <span className="mm-link-icon">{p.icon}</span> {p.label}
              </a>
            ))}

            <div className="mm-divider" />
            <a className={`mm-link ${pathname === '/ofertas' ? 'active' : ''}`} href="/ofertas">
              <span className="mm-link-icon">🏷️</span> Ofertas
            </a>

            <div className="mm-divider" />
            <div className="mm-section-label">Comunidade</div>
            {COMUNIDADE_LINKS.map(p => (
              <a key={p.href} className={`mm-link ${pathname === p.href ? 'active' : ''}`} href={p.href}>
                <span className="mm-link-icon">{p.icon}</span> {p.label}
              </a>
            ))}

            {user ? (
              <>
                <div className="mm-divider" />
                <div className="mm-section-label">Sua conta</div>
                <div className="mm-switcher">
                  <div className="mm-idcard active">
                    <span className="mm-idico">👤</span> Pessoal <span className="mm-idtag">● aqui</span>
                  </div>
                  {businesses.map(b => (
                    <a key={b.id} className="mm-idcard" href="/painel">
                      <span className="mm-idico">📊</span> {b.name} <span className="mm-idarrow">→</span>
                    </a>
                  ))}
                </div>
                <a className="mm-idadd" href="/anunciar">➕ {businesses.length === 0 ? 'Anunciar meu negócio' : 'Cadastrar outro negócio'}</a>

                <div className="mm-divider" />
                <a className="mm-link" href="/perfil?tab=favoritos">
                  <span className="mm-link-icon">❤️</span> Favoritos
                </a>
                <a className={`mm-link ${pathname === '/perfil' ? 'active' : ''}`} href="/perfil">
                  <span className="mm-link-icon">👤</span> Meu Perfil
                </a>
                <a className="mm-link" href="/perfil?tab=avaliacoes">
                  <span className="mm-link-icon">⭐</span> Minhas avaliações
                </a>
                <a className="mm-link" href="/perfil?tab=pedidos">
                  <span className="mm-link-icon">🧾</span> Meus pedidos
                </a>

                {hasListings && (
                  <>
                    <div className="mm-divider" />
                    <div className="mm-section-label">Meus anúncios</div>
                    <a className="mm-link" href="/perfil?tab=anuncios">
                      <span className="mm-link-icon">📋</span> Desapega, vagas, imóveis
                    </a>
                  </>
                )}

                {userType === 'admin' && (
                  <a className="mm-link" href="/admin">
                    <span className="mm-link-icon">⚙️</span> Admin
                  </a>
                )}
                {isProdTeam && (
                  <a className="mm-link" href="/producao">
                    <span className="mm-link-icon">🎬</span> Produção
                  </a>
                )}
                <div className="mm-divider" />
                <button className="mm-link mm-sair" onClick={handleSair} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <span className="mm-link-icon">🚪</span> Sair
                </button>
              </>
            ) : (
              <>
                <div className="mm-divider" />
                <div className="mm-section-label">Cadastre-se</div>
                <a className="mm-link" href="/anunciar">
                  <span className="mm-link-icon">➕</span> Anunciar meu negócio
                </a>
                <a className="mm-link" href="/cadastro">
                  <span className="mm-link-icon">👤</span> Cadastrar morador
                </a>
              </>
            )}
          </nav>
        </>
      )}
    </>
  )
}
