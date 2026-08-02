'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type IconKey = 'home' | 'ticket' | 'megaphone' | 'chart' | 'card' | 'settings' | 'heart' | 'logout'

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
  }
}

export default function BottomNav() {
  const [userType, setUserType] = useState<string|null>(null)
  const [loaded, setLoaded] = useState(false)
  const [show, setShow] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (window.innerWidth >= 768) return
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setLoaded(true); return }
      const { data } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      setUserType(data?.user_type || null)
      setLoaded(true)
      setShow(true)
    })
  }, [])

  const hideOn = ['/login', '/cadastro', '/empresa/cadastrar', '/admin']
  if (!show || !loaded || !userType || hideOn.some(p => pathname.startsWith(p))) return null

  const items: { href: string; icon: IconKey; label: string; badge?: boolean; sair?: boolean }[] = [
    { href: '/', icon: 'home', label: 'Início' },
    { href: '/cupons', icon: 'ticket', label: 'Cupons', badge: true },
    { href: '/promocoes', icon: 'megaphone', label: 'Promoções' },
    ...(userType === 'admin'
      ? [{ href: '/admin', icon: 'settings' as IconKey, label: 'Admin' }]
      : userType === 'company'
        ? [{ href: '/painel', icon: 'chart' as IconKey, label: 'Painel' }, { href: '/painel?tab=plano', icon: 'card' as IconKey, label: 'Planos' }]
        : []
    ),
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
              onClick={item.sair ? async(e)=>{e.preventDefault();const {supabase:sb}=await import('@/lib/supabase');await sb.auth.signOut();window.location.href='/'} : undefined}
              style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 0 10px',textDecoration:'none',color:item.sair?'#E24B4A':active?'#C9951A':'rgba(255,255,255,0.65)',fontSize:10,fontWeight:active?600:500,fontFamily:'Inter,sans-serif',position:'relative'}}>
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
