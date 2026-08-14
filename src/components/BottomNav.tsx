'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type IconKey = 'home' | 'ticket' | 'megaphone' | 'chart' | 'card' | 'settings' | 'heart' | 'logout' | 'edit' | 'store'

function NavIcon({ name }: { name: IconKey }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'home':
      return <svg {...common}><path d="M3 11l9-8 9 8" /><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" /></svg>
    case 'ticket':
      return <svg {...common}><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 0 0 3V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a1.5 1.5 0 0 0 0-3V9z" /><line x1="10" y1="7" x2="10" y2="17" strokeDasharray="1.6 2.4" /></svg>
    case 'megaphone':
      return <svg {...common}><path d="M3 11v2a2 2 0 0 0 2 2h1l3 5V4L6 9H5a2 2 0 0 0-2 2z" /><path d="M13 6a5 5 0 0 1 0 12" /><path d="M17 8a3 3 0 0 1 0 8" /></svg>
    case 'chart':
      return <svg {...common}><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="9" /><line x1="18" y1="20" x2="18" y2="4" /></svg>
    case 'card':
      return <svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    case 'heart':
      return <svg {...common}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z" /></svg>
    case 'logout':
      return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
    case 'edit':
      return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
    case 'store':
      return <svg {...common}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><path d="M9 21v-9h6v9" /></svg>
  }
}

function navItemStyle(active: boolean, danger?: boolean): React.CSSProperties {
  return {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '8px 0 10px', textDecoration: 'none',
    color: danger ? '#E24B4A' : active ? '#C9951A' : 'rgba(255,255,255,0.65)',
    fontSize: 10, fontWeight: active ? 600 : 500, fontFamily: 'Inter,sans-serif', position: 'relative',
  }
}

type SheetItem = { href: string; icon: string; label: string }
type SheetGroup = { title: string; items: SheetItem[] }

function MoreSheet({ empresarial, pessoal, open, onClose }: { empresarial: SheetGroup[]; pessoal: SheetGroup[]; open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'empresarial' | 'pessoal'>('empresarial')
  const groups = tab === 'empresarial' ? empresarial : pessoal

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9997,
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .2s ease',
      }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, background: '#1A1610',
        borderRadius: '22px 22px 0 0', padding: '16px 14px calc(78px + env(safe-area-inset-bottom))',
        zIndex: 9998, maxHeight: '75vh', overflowY: 'auto',
        transform: open ? 'translateY(0)' : 'translateY(100%)', transition: 'transform .25s cubic-bezier(.2,.8,.3,1)',
      }}>
        <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,.25)', borderRadius: 3, margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', gap: 8, margin: '0 2px 16px' }}>
          {(['empresarial', 'pessoal'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontFamily: 'Inter,sans-serif', fontSize: 12.5, fontWeight: 700,
              background: tab === t ? '#C9951A' : '#232019', color: tab === t ? '#1A1610' : '#fff',
            }}>
              {t === 'empresarial' ? '🏢 Empresarial' : '👤 Pessoal'}
            </button>
          ))}
        </div>
        {groups.map(g => (
          <div key={g.title}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', margin: '16px 4px 9px' }}>{g.title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
              {g.items.map(it => (
                <a key={it.href} href={it.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, background: '#232019', borderRadius: 14, padding: '12px 4px 10px', textDecoration: 'none', color: '#fff', textAlign: 'center' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(201,149,26,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{it.icon}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.25 }}>{it.label}</div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export default function BottomNav() {
  const [userType, setUserType] = useState<string|null>(null)
  const [lojaDigital, setLojaDigital] = useState(false)
  const [companySlug, setCompanySlug] = useState<string|null>(null)
  const [loaded, setLoaded] = useState(false)
  const [show, setShow] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (window.innerWidth >= 768) return
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setLoaded(true); return }
      const { data } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      setUserType(data?.user_type || null)
      if (data?.user_type === 'company') {
        const { data: comp } = await supabase.from('companies').select('slug, loja_digital_enabled').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
        setLojaDigital(!!comp?.loja_digital_enabled)
        setCompanySlug(comp?.slug || null)
      }
      setLoaded(true)
      setShow(true)
    })
  }, [])

  useEffect(() => { setSheetOpen(false) }, [pathname])

  const hideOn = ['/login', '/cadastro', '/empresa/cadastrar', '/admin', '/agenda']
  if (!show || !loaded || !userType || hideOn.some(p => pathname.startsWith(p))) return null

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (userType === 'company') {
    const empresarialGroups: SheetGroup[] = [
      {
        title: 'Minha loja', items: [
          { href: '/painel', icon: '📊', label: 'Dashboard' },
          { href: '/painel?tab=perfil', icon: '✏️', label: 'Editar loja' },
          { href: '/painel?tab=fotos', icon: '📷', label: 'Fotos' },
          { href: '/painel?tab=avaliacoes', icon: '💬', label: 'Avaliações' },
        ]
      },
      ...(lojaDigital ? [{
        title: 'Cardápio digital', items: [
          { href: '/painel/crm/catalogo', icon: '📋', label: 'Catálogo' },
          { href: '/painel/crm/pedidos', icon: '🧾', label: 'Pedidos' },
          { href: '/painel/crm/cozinha', icon: '🍳', label: 'Cozinha' },
        ]
      }] : []),
      {
        title: 'Cupons & promoções', items: [
          { href: '/painel?tab=cupons', icon: '🎫', label: 'Meus cupons' },
          { href: '/painel?tab=promocoes', icon: '🏷️', label: 'Minhas promoções' },
        ]
      },
    ]

    const pessoalGroups: SheetGroup[] = [
      {
        title: 'Conta', items: [
          { href: '/favoritos', icon: '❤️', label: 'Favoritos' },
        ]
      },
      {
        title: 'Bairro', items: [
          { href: '/cupons', icon: '🎟️', label: 'Cupons da Trindade' },
          { href: '/promocoes', icon: '📣', label: 'Promoções da Trindade' },
        ]
      },
    ]

    const minhaLojaHref = companySlug ? `/empresa/${companySlug}` : '/painel'

    return (
      <>
        <MoreSheet empresarial={empresarialGroups} pessoal={pessoalGroups} open={sheetOpen} onClose={() => setSheetOpen(false)} />
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#111', display: 'flex', alignItems: 'center', zIndex: 9999, padding: '0 4px env(safe-area-inset-bottom)' }}>
          <a href="/" style={navItemStyle(pathname === '/')}>
            <span style={{ lineHeight: 1, marginBottom: 3, display: 'flex' }}><NavIcon name="home" /></span>
            Home
          </a>
          <a href={minhaLojaHref} style={navItemStyle(pathname === minhaLojaHref)}>
            <span style={{ lineHeight: 1, marginBottom: 3, display: 'flex' }}><NavIcon name="store" /></span>
            Minha loja
          </a>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', position: 'relative' }}>
            <div onClick={() => setSheetOpen(o => !o)} style={{
              width: 52, height: 52, borderRadius: '50%', background: '#C9951A', color: '#1A1610',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800,
              position: 'absolute', bottom: 14, boxShadow: '0 6px 14px -4px rgba(201,149,26,.6)', cursor: 'pointer',
              transition: 'transform .18s ease', border: '4px solid #111', transform: sheetOpen ? 'rotate(45deg)' : 'none',
            }}>+</div>
          </div>
          <a href="/painel?tab=plano" style={navItemStyle(false)}>
            <span style={{ lineHeight: 1, marginBottom: 3, display: 'flex' }}><NavIcon name="card" /></span>
            Planos
          </a>
          <a href="#" onClick={async(e)=>{e.preventDefault();await signOut()}} style={navItemStyle(false, true)}>
            <span style={{ lineHeight: 1, marginBottom: 3, display: 'flex' }}><NavIcon name="logout" /></span>
            Sair
          </a>
        </nav>
        <div style={{ height: 64, background: 'transparent' }} />
      </>
    )
  }

  const items: { href: string; icon: IconKey; label: string; badge?: boolean; sair?: boolean }[] = [
    { href: '/', icon: 'home', label: 'Início' },
    { href: '/cupons', icon: 'ticket', label: 'Cupons', badge: true },
    { href: '/promocoes', icon: 'megaphone', label: 'Promoções' },
    ...(userType === 'admin' ? [{ href: '/admin', icon: 'settings' as IconKey, label: 'Admin' }] : []),
    { href: '/favoritos', icon: 'heart', label: 'Favoritos' },
    { href: '/sair', icon: 'logout', label: 'Sair', sair: true },
  ]

  return (
    <>
      <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#111',borderTop:'none',display:'flex',zIndex:9999,paddingBottom:'env(safe-area-inset-bottom)'}}>
        {items.map((item) => {
          const active = pathname === item.href
          return (
            <a key={item.href} href={item.sair ? '#' : item.href}
              onClick={item.sair ? async(e)=>{e.preventDefault();await signOut()} : undefined}
              style={navItemStyle(active, item.sair)}>
              {item.badge && <span style={{position:'absolute',top:6,right:'calc(50% - 14px)',width:7,height:7,background:'#E24B4A',borderRadius:'50%',border:'1.5px solid #111'}}/>}
              <span style={{lineHeight:1,marginBottom:3,display:'flex'}}><NavIcon name={item.icon} /></span>
              {item.label}
            </a>
          )
        })}
      </nav>
      <div style={{height:64,background:'transparent'}}/>
    </>
  )
}
