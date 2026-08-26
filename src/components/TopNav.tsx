'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SearchBar from './SearchBar'
import UserMenu from './UserMenu'

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

// Dropdown das famílias de navegação (ESPECIFICACAO.md §4.1) — Empresas
// e Comunidade agrupam o que hoje é uma lista achatada de 8 categorias
// misturando negócios cadastrados com anúncios de comunidade.
function NavDropdown({ label, items }: { label: string; items: { href: string; icon: string; label: string }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const active = items.some(i => pathname.startsWith(i.href))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={`top-nav-link nd-trigger ${active ? 'active' : ''}`} onClick={() => setOpen(o => !o)}>
        {label} <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div className="nd-dropdown">
          {items.map(i => (
            <a key={i.href} className="nd-item" href={i.href} onClick={() => setOpen(false)}>
              <span>{i.icon}</span> {i.label}
            </a>
          ))}
          {label === 'Empresas' && (
            <>
              <div className="nd-divider" />
              <div className="nd-label">Bairro</div>
              <div className="nd-item nd-static"><span>◉</span> Trindade</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function TopNav() {
  const [user, setUser] = useState<any>(null)
  const [userType, setUserType] = useState<string|null>(null)
  const [isProdTeam, setIsProdTeam] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      setUser(session.user)
      const { data } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      setUserType(data?.user_type || null)
      const { data: team } = await supabase.from('production_team').select('id').eq('user_id', session.user.id).eq('status', 'ativo').maybeSingle()
      setIsProdTeam(!!team)
    })
  }, [])

  const hideOn = ['/login', '/cadastro', '/admin', '/empresa/cadastrar', '/anunciar', '/producao', '/painel', '/atendimento']
  if (hideOn.some(p => pathname.startsWith(p))) return null


  return (
    <>
      <style>{`
        @media(min-width:768px){
          .topbar { display: none !important; }
          .site-header { display: none !important; }
        }
        .top-nav-global { display: none; }
        @media(min-width:768px){
          .top-nav-global { display: flex; align-items: center; background: #fff; border-bottom: 1px solid #E0DDD8; position: sticky; top: 0; z-index: 9000; padding: 0 32px; height: 58px; gap: 16px; }
          .top-nav-logo { font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 2px; color: #111; text-decoration: none; flex-shrink: 0; }
          .top-nav-logo span { color: #C9951A; }
          .top-nav-bairro { display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: #555; white-space: nowrap; flex-shrink: 0; }
          .top-nav-bairro .pin { color: #C9951A; font-size: 11px; }
          .top-nav-center { flex: 0 1 auto; display: flex; align-items: center; justify-content: center; gap: 2px; }
          .top-nav-link { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: #555; text-decoration: none; white-space: nowrap; position: relative; font-family: Inter, sans-serif; background: none; border: none; cursor: pointer; }
          .top-nav-link:hover { background: #F5F2EC; color: #111; }
          .top-nav-link.active { color: #C9951A; background: #FEF3E2; }
          .top-nav-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
          .top-nav-btn { background: #C9951A; color: #fff; border: none; border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; white-space: nowrap; font-family: Inter, sans-serif; }
          .top-nav-sair { background: transparent; color: #666; border: 1px solid #ddd; border-radius: 10px; padding: 7px 14px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: Inter, sans-serif; text-decoration: none; display: inline-block; }
          .top-nav-dot { position: absolute; top: 6px; right: 8px; width: 7px; height: 7px; background: #E24B4A; border-radius: 50%; border: 1.5px solid #fff; }
          .nd-dropdown { position: absolute; top: calc(100% + 8px); left: 0; background: #fff; border: 1px solid #E0DDD8; border-radius: 12px; box-shadow: 0 14px 36px rgba(0,0,0,.15); min-width: 200px; z-index: 2000; overflow: hidden; padding: 6px 0; }
          .nd-item { display: flex; align-items: center; gap: 9px; padding: 9px 14px; text-decoration: none; color: #222; font-size: 13.5px; font-weight: 600; font-family: 'Inter', sans-serif; }
          .nd-item:hover { background: #F5F2EC; }
          .nd-static { color: #888; cursor: default; }
          .nd-static:hover { background: none; }
          .nd-divider { height: 1px; background: #F0EDE8; margin: 6px 0; }
          .nd-label { font-size: 10.5px; font-weight: 700; color: #AAA; letter-spacing: .06em; text-transform: uppercase; padding: 8px 14px 2px; }
        }
      `}</style>
      <div className="top-nav-global">
        <a className="top-nav-logo" href="/">TRINDADE <span>ONLINE</span></a>
        <div className="top-nav-bairro"><span className="pin">◉</span> Trindade</div>
        <SearchBar compact />
        <nav className="top-nav-center">
          <a className={`top-nav-link ${pathname==='/'?'active':''}`} href="/">🏠 Início</a>
          <NavDropdown label="Empresas" items={EMPRESAS_LINKS} />
          <a className={`top-nav-link ${pathname==='/ofertas'?'active':''}`} href="/ofertas" style={{position:'relative'}}>
            🏷️ Ofertas<span className="top-nav-dot"/>
          </a>
          <NavDropdown label="Comunidade" items={COMUNIDADE_LINKS} />
        </nav>
        <div className="top-nav-right">
          {user ? (
            <>
              {userType !== 'company' && <a className="top-nav-btn" href="/anunciar">Cadastrar empresa</a>}
              <UserMenu user={user} userType={userType} isProdTeam={isProdTeam} />
            </>
          ) : (
            <>
              <a className="top-nav-sair" href="/login">Entrar</a>
              <a className="top-nav-btn" href="/anunciar">Anunciar meu negócio</a>
            </>
          )}
        </div>
      </div>
    </>
  )
}
