'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PAGES = [
  { href: '/categoria/comercios',   icon: '🏪', label: 'Comércios' },
  { href: '/categoria/servicos',    icon: '🔧', label: 'Serviços' },
  { href: '/categoria/gastronomia', icon: '🍕', label: 'Gastronomia' },
  { href: '/empregos',              icon: '💼', label: 'Empregos' },
  { href: '/imoveis',               icon: '🏡', label: 'Imóveis' },
  { href: '/desapega',              icon: '🏷️', label: 'Desapega' },
  { href: '/achados-perdidos',      icon: '🔍', label: 'Achados & Perdidos' },
  { href: '/categoria/igrejas',     icon: '⛪', label: 'Igrejas' },
  { href: '/cupons',                icon: '🎟️', label: 'Cupons Relâmpago' },
  { href: '/promocoes',             icon: '📣', label: 'Promoções da Semana' },
]

export default function MobileMenu() {
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [userType, setUserType] = useState<string|null>(null)
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      setUser(session.user)
      const { data } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      setUserType(data?.user_type || null)
    })
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => { setOpen(false) }, [pathname])

  const hideOn = ['/login', '/cadastro', '/admin', '/empresa/cadastrar']
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
          .mm-bar{display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #E0DDD8;padding:0 14px;height:54px;box-sizing:border-box;position:sticky;top:0;z-index:9500;}
        }
        .mm-hamburger{background:none;border:none;cursor:pointer;padding:6px;display:flex;flex-direction:column;gap:4px;width:34px;flex-shrink:0;}
        .mm-hamburger span{display:block;height:2px;background:#111;border-radius:2px;}
        .mm-logo{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1.5px;color:#111;text-decoration:none;}
        .mm-logo span{color:#C9951A;}
        .mm-entrar{background:#fff;color:#C9951A;border:1.5px solid #C9951A;border-radius:20px;padding:7px 16px;font-size:12px;font-weight:700;text-decoration:none;font-family:'Inter',sans-serif;flex-shrink:0;}
        .mm-profile-btn{background:none;border:none;color:#111;cursor:pointer;text-decoration:none;display:flex;flex-shrink:0;}
        .mm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9998;}
        .mm-drawer{position:fixed;top:0;left:0;bottom:0;width:82%;max-width:320px;background:#fff;z-index:9999;overflow-y:auto;box-shadow:2px 0 24px rgba(0,0,0,0.2);}
        .mm-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #F0EDE8;}
        .mm-close{background:#F5F2EC;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer;color:#666;display:flex;align-items:center;justify-content:center;}
        .mm-section-label{font-size:11px;font-weight:700;color:#AAA;letter-spacing:1px;text-transform:uppercase;padding:14px 16px 6px;}
        .mm-link{display:flex;align-items:center;gap:12px;padding:12px 16px;text-decoration:none;color:#333;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;}
        .mm-link:active{background:#F5F2EC;}
        .mm-link.active{color:#C9951A;background:#FEF3E2;}
        .mm-link-icon{font-size:18px;width:22px;text-align:center;flex-shrink:0;}
        .mm-divider{height:1px;background:#F0EDE8;margin:8px 0;}
        .mm-sair{color:#E24B4A;}
      `}</style>

      <div className="mm-bar">
        <button className="mm-hamburger" aria-label="Abrir menu" onClick={() => setOpen(true)}>
          <span/><span/><span/>
        </button>
        <a className="mm-logo" href="/">TRINDADE <span>ONLINE</span></a>
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

            <div className="mm-section-label">Explorar</div>
            {PAGES.map(p => (
              <a key={p.href} className={`mm-link ${pathname === p.href ? 'active' : ''}`} href={p.href}>
                <span className="mm-link-icon">{p.icon}</span> {p.label}
              </a>
            ))}

            {user ? (
              <>
                <div className="mm-divider" />
                <div className="mm-section-label">Minha conta</div>
                <a className={`mm-link ${pathname === '/favoritos' ? 'active' : ''}`} href="/favoritos">
                  <span className="mm-link-icon">❤️</span> Favoritos
                </a>
                <a className={`mm-link ${pathname === '/perfil' ? 'active' : ''}`} href="/perfil">
                  <span className="mm-link-icon">👤</span> Meu Perfil
                </a>
                {userType === 'company' && (
                  <>
                    <a className={`mm-link ${pathname === '/painel' ? 'active' : ''}`} href="/painel">
                      <span className="mm-link-icon">📊</span> Meu Painel
                    </a>
                    <a className="mm-link" href="/painel?tab=plano">
                      <span className="mm-link-icon">💳</span> Planos
                    </a>
                  </>
                )}
                {userType === 'admin' && (
                  <a className="mm-link" href="/admin">
                    <span className="mm-link-icon">⚙️</span> Admin
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
                <a className="mm-link" href="/empresa/cadastrar">
                  <span className="mm-link-icon">➕</span> Cadastrar empresa
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
