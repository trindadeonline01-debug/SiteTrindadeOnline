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
          .top-nav-global { display: block; background: var(--paper); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 9000; }
          .top-nav-inner { max-width: 1200px; margin: 0 auto; padding: 0 32px; height: 58px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; }
          .top-nav-left { display: flex; align-items: center; gap: 16px; justify-self: start; min-width: 0; }
          .top-nav-logo { font-family: 'Anton', sans-serif; font-size: 21px; letter-spacing: .5px; color: var(--ink); text-decoration: none; flex-shrink: 0; text-transform: uppercase; }
          .top-nav-logo span { color: var(--sign-dark); }
          .top-nav-bairro { display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--muted); white-space: nowrap; flex-shrink: 0; font-family: 'Archivo', sans-serif; }
          .top-nav-bairro .pin { color: var(--sign-dark); font-size: 11px; }
          .top-nav-center { display: flex; align-items: center; gap: 16px; justify-self: center; min-width: 0; }
          .top-nav-links { display: flex; align-items: center; gap: 2px; }
          .top-nav-link { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: var(--muted); text-decoration: none; white-space: nowrap; position: relative; font-family: 'Archivo', sans-serif; background: none; border: none; cursor: pointer; }
          .top-nav-link:hover { background: var(--concrete-2); color: var(--ink); }
          .top-nav-link.active { color: var(--sign-dark); background: var(--concrete-2); }
          .top-nav-right { display: flex; align-items: center; gap: 8px; justify-self: end; }
          .top-nav-btn { background: var(--sign); color: var(--ink); border: none; border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; white-space: nowrap; font-family: 'Archivo', sans-serif; }
          .top-nav-btn:hover { background: var(--sign-dark); color: var(--paper); }
          .top-nav-sair { background: transparent; color: var(--muted); border: 1px solid var(--line); border-radius: 10px; padding: 7px 14px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'Archivo', sans-serif; text-decoration: none; display: inline-block; }
          .top-nav-dot { position: absolute; top: 6px; right: 8px; width: 7px; height: 7px; background: var(--alert); border-radius: 50%; border: 1.5px solid var(--paper); }
          .nd-dropdown { position: absolute; top: calc(100% + 8px); left: 0; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 14px 36px rgba(0,0,0,.15); min-width: 200px; z-index: 2000; overflow: hidden; padding: 6px 0; }
          .nd-item { display: flex; align-items: center; gap: 9px; padding: 9px 14px; text-decoration: none; color: var(--ink); font-size: 13.5px; font-weight: 600; font-family: 'Archivo', sans-serif; }
          .nd-item:hover { background: var(--concrete-2); }
          .nd-static { color: var(--muted); cursor: default; }
          .nd-static:hover { background: none; }
          .nd-divider { height: 1px; background: var(--line); margin: 6px 0; }
          .nd-label { font-size: 10.5px; font-weight: 700; color: var(--muted); letter-spacing: .06em; text-transform: uppercase; padding: 8px 14px 2px; }
        }
      `}</style>
      <div className="top-nav-global">
        <div className="top-nav-inner">
          <div className="top-nav-left">
            <a className="top-nav-logo" href="/">TRINDADE <span>ONLINE</span></a>
            <div className="top-nav-bairro"><span className="pin">◉</span> Trindade</div>
          </div>
          <div className="top-nav-center">
            {pathname !== '/' && <SearchBar compact />}
            <nav className="top-nav-links">
              <a className={`top-nav-link ${pathname==='/'?'active':''}`} href="/">🏠 Início</a>
              <NavDropdown label="Empresas" items={EMPRESAS_LINKS} />
              <a className={`top-nav-link ${pathname==='/ofertas'?'active':''}`} href="/ofertas" style={{position:'relative'}}>
                🏷️ Ofertas<span className="top-nav-dot"/>
              </a>
              <NavDropdown label="Comunidade" items={COMUNIDADE_LINKS} />
            </nav>
          </div>
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
      </div>
    </>
  )
}
