'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function TopNav() {
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

  const hideOn = ['/login', '/cadastro', '/admin', '/empresa/cadastrar']
  if (hideOn.some(p => pathname.startsWith(p))) return null


  async function handleSair() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <>
      <style>{`
        @media(min-width:768px){
          .topbar { display: none !important; }
          .site-header { display: none !important; }
        }
        .top-nav-global { display: none; }
        @media(min-width:768px){
          .top-nav-global { display: flex; align-items: center; background: #fff; border-bottom: 1px solid #E0DDD8; position: sticky; top: 0; z-index: 9000; padding: 0 32px; height: 58px; gap: 24px; }
          .top-nav-logo { font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 2px; color: #111; text-decoration: none; flex-shrink: 0; }
          .top-nav-logo span { color: #C9951A; }
          .top-nav-center { flex: 1; display: flex; align-items: center; justify-content: center; gap: 2px; }
          .top-nav-link { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: #555; text-decoration: none; white-space: nowrap; position: relative; font-family: Inter, sans-serif; }
          .top-nav-link:hover { background: #F5F2EC; color: #111; }
          .top-nav-link.active { color: #C9951A; background: #FEF3E2; }
          .top-nav-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
          .top-nav-btn { background: #C9951A; color: #fff; border: none; border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; white-space: nowrap; font-family: Inter, sans-serif; }
          .top-nav-sair { background: transparent; color: #666; border: 1px solid #ddd; border-radius: 10px; padding: 7px 14px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: Inter, sans-serif; }
          .top-nav-dot { position: absolute; top: 6px; right: 8px; width: 7px; height: 7px; background: #E24B4A; border-radius: 50%; border: 1.5px solid #fff; }
        }
      `}</style>
      <div className="top-nav-global">
        <a className="top-nav-logo" href="/">TRINDADE <span>ONLINE</span></a>
        <nav className="top-nav-center">
          {user && <>
            <a className={`top-nav-link ${pathname==='/'?'active':''}`} href="/">🏠 Início</a>
            <a className={`top-nav-link ${pathname==='/cupons'?'active':''}`} href="/cupons" style={{position:'relative'}}>
              🎟️ Cupons<span className="top-nav-dot"/>
            </a>
            <a className={`top-nav-link ${pathname==='/promocoes'?'active':''}`} href="/promocoes">🏷️ Promoções</a>
            {userType === 'user' && <a className={`top-nav-link ${pathname==='/favoritos'?'active':''}`} href="/favoritos">❤️ Favoritos</a>}
            {userType === 'company' && <a className={`top-nav-link ${pathname==='/painel'?'active':''}`} href="/painel">📊 Meu Painel</a>}
            {userType === 'company' && <a className={`top-nav-link ${pathname.includes('tab=plano')?'active':''}`} href="/painel?tab=plano">💳 Planos</a>}
            {userType === 'admin' && <a className="top-nav-link" href="/admin">⚙️ Admin</a>}
            <a className={`top-nav-link ${pathname==='/perfil'?'active':''}`} href="/perfil">👤 Perfil</a>
          </>}
        </nav>
        <div className="top-nav-right">
          {user ? (
            <>
              <a className="top-nav-btn" href="/empresa/cadastrar">Cadastrar empresa</a>
              <button className="top-nav-sair" onClick={handleSair}>Sair</button>
            </>
          ) : (
            <>
              <a className="top-nav-sair" href="/login" style={{textDecoration:'none',display:'inline-block'}}>Entrar</a>
              <a className="top-nav-sair" href="/cadastro" style={{textDecoration:'none',display:'inline-block'}}>Cadastrar morador</a>
              <a className="top-nav-btn" href="/empresa/cadastrar">Cadastrar empresa</a>
            </>
          )}
        </div>
      </div>
    </>
  )
}
