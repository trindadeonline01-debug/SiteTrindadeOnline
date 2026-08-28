'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type IconKey = 'home' | 'store' | 'users' | 'ticket' | 'person' | 'menu'

function NavIcon({ name }: { name: IconKey }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'home':
      return <svg {...common}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><path d="M9 21v-6h6v6" /></svg>
    case 'store':
      return <svg {...common}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><path d="M9 21v-9h6v9" /></svg>
    case 'users':
      return <svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    case 'ticket':
      return <svg {...common}><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 0 0 3V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a1.5 1.5 0 0 0 0-3V9z" /><line x1="10" y1="7" x2="10" y2="17" strokeDasharray="1.6 2.4" /></svg>
    case 'person':
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
    case 'menu':
      return <svg {...common}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
  }
}

function navItemStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '8px 0 10px', textDecoration: 'none', background: 'none', border: 'none',
    color: active ? 'var(--sign)' : 'rgba(255,255,255,0.65)',
    fontSize: 10, fontWeight: active ? 600 : 500, fontFamily: 'Archivo,sans-serif', position: 'relative', cursor: 'pointer',
  }
}

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

const PESSOAL_LINKS = [
  { href: '/perfil',                icon: '👤', label: 'Meu perfil' },
  { href: '/perfil?tab=favoritos',  icon: '❤️', label: 'Favoritos' },
  { href: '/perfil?tab=avaliacoes', icon: '⭐', label: 'Minhas avaliações' },
  { href: '/perfil?tab=pedidos',    icon: '🧾', label: 'Meus pedidos' },
  { href: '/perfil?tab=anuncios',   icon: '📋', label: 'Meus anúncios' },
  { href: '/perfil?tab=cupons',     icon: '🎟️', label: 'Meus cupons' },
]

// Bottom tab bar do portal (ESPECIFICACAO.md §4.2) — 5 destinos fixos,
// visível pra todo mundo (não só logado): Buscar · Empresas · Ofertas ·
// Comunidade · Perfil. Empresas/Comunidade abrem uma folha compacta com
// os links da família, em vez de navegar — não existe hoje uma página
// "todas as empresas" nem "toda a comunidade" pra linkar direto.
export default function BottomNav() {
  const [user, setUser] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [sheet, setSheet] = useState<'empresas' | 'comunidade' | 'mais' | null>(null)
  const pathname = usePathname()
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.innerWidth >= 768) return
    setShow(true)
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user || null))
  }, [])

  useEffect(() => { setSheet(null) }, [pathname])

  useEffect(() => {
    function onClick(e: MouseEvent) { if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) setSheet(null) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const hideOn = ['/login', '/cadastro', '/empresa/cadastrar', '/anunciar', '/admin', '/producao', '/painel', '/atendimento']
  if (!show || hideOn.some(p => pathname.startsWith(p))) return null

  const empresasActive = EMPRESAS_LINKS.some(l => pathname === l.href)
  const comunidadeActive = COMUNIDADE_LINKS.some(l => pathname === l.href)

  return (
    <>
      {sheet && (
        <div ref={sheetRef} style={{position:'fixed',left:0,right:0,bottom:64,background:'var(--paper)',borderTop:'1px solid var(--line)',borderRadius:'16px 16px 0 0',boxShadow:'0 -8px 24px rgba(0,0,0,.12)',zIndex:9998,padding:'10px 8px calc(10px + env(safe-area-inset-bottom))'}}>
          {sheet === 'mais' && !user ? (
            <a href="/login" style={{display:'flex',alignItems:'center',gap:10,padding:'11px 12px',textDecoration:'none',color:'var(--ink)',fontSize:14,fontWeight:600,fontFamily:'Archivo,sans-serif'}}>
              <span>👤</span> Entrar
            </a>
          ) : (
            (sheet === 'empresas' ? EMPRESAS_LINKS : sheet === 'comunidade' ? COMUNIDADE_LINKS : PESSOAL_LINKS).map(l => (
              <a key={l.href} href={l.href} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 12px',textDecoration:'none',color:'var(--ink)',fontSize:14,fontWeight:600,fontFamily:'Archivo,sans-serif'}}>
                <span>{l.icon}</span> {l.label}
              </a>
            ))
          )}
        </div>
      )}
      <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'var(--ink)',borderTop:'none',display:'flex',zIndex:9999,paddingBottom:'env(safe-area-inset-bottom)'}}>
        <a href="/" style={navItemStyle(pathname === '/')}>
          <span style={{lineHeight:1,marginBottom:3,display:'flex'}}><NavIcon name="home" /></span>
          Início
        </a>
        <button onClick={() => setSheet(s => s === 'empresas' ? null : 'empresas')} style={navItemStyle(empresasActive || sheet === 'empresas')}>
          <span style={{lineHeight:1,marginBottom:3,display:'flex'}}><NavIcon name="store" /></span>
          Empresas
        </button>
        <a href="/ofertas" style={navItemStyle(pathname === '/ofertas')}>
          <span style={{position:'absolute',top:6,right:'calc(50% - 14px)',width:7,height:7,background:'var(--alert)',borderRadius:'50%',border:'1.5px solid var(--ink)'}}/>
          <span style={{lineHeight:1,marginBottom:3,display:'flex'}}><NavIcon name="ticket" /></span>
          Ofertas
        </a>
        <button onClick={() => setSheet(s => s === 'comunidade' ? null : 'comunidade')} style={navItemStyle(comunidadeActive || sheet === 'comunidade')}>
          <span style={{lineHeight:1,marginBottom:3,display:'flex'}}><NavIcon name="users" /></span>
          Comunidade
        </button>
        <button onClick={() => setSheet(s => s === 'mais' ? null : 'mais')} style={navItemStyle(pathname === '/perfil' || sheet === 'mais')}>
          <span style={{lineHeight:1,marginBottom:3,display:'flex'}}><NavIcon name="menu" /></span>
          Mais
        </button>
      </nav>
      <div style={{height:64,background:'transparent'}}/>
    </>
  )
}
