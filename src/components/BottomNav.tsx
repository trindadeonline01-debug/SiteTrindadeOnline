'use client'
import { useState, useEffect } from 'react'
const HIDE_STYLE = `@media(min-width:768px){.bottom-nav-mobile{display:none!important}}`
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function BottomNav() {
  const [userType, setUserType] = useState<string|null>(null)
  const [loaded, setLoaded] = useState(false)
  const pathname = usePathname()
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setLoaded(true); return }
      const { data } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      setUserType(data?.user_type || null)
      setLoaded(true)
    })
  }, [])

  if (isDesktop) return null
  const hideOn = ['/login', '/cadastro', '/admin', '/painel', '/empresa/cadastrar']
  if (!loaded || !userType || userType === 'admin' || hideOn.some(p => pathname.startsWith(p))) return null

  const items = [
    { href: '/', icon: '🏠', label: 'Início' },
    { href: '/cupons', icon: '🎟️', label: 'Cupons', badge: true },
    { href: '/feed', icon: '📰', label: 'Feed' },
    ...(userType === 'company'
      ? [{ href: '/painel', icon: '📊', label: 'Painel' }]
      : [{ href: '/favoritos', icon: '❤️', label: 'Favoritos' }]
    ),
    { href: '/perfil', icon: '👤', label: 'Perfil' },
    { href: '/sair', icon: '🚪', label: 'Sair', sair: true },
  ]

  return (
    <>
      <style>{HIDE_STYLE}</style>
      <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#111',borderTop:'none',display:'flex',zIndex:9999,paddingBottom:'env(safe-area-inset-bottom)'}} className="bottom-nav-mobile">
        {items.map((item: any) => {
          const active = pathname === item.href
          return (
            <a key={item.href} href={item.sair ? '#' : item.href} onClick={item.sair ? async(e)=>{e.preventDefault();const {supabase:sb}=await import('@/lib/supabase');await sb.auth.signOut();window.location.href='/'} : undefined} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 0 10px',textDecoration:'none',color:item.sair?'#E24B4A':active?'#fff':'rgba(255,255,255,0.65)',fontSize:10,fontWeight:active?600:500,fontFamily:'Inter,sans-serif',position:'relative'}}>
              {item.badge && <span style={{position:'absolute',top:6,right:'calc(50% - 14px)',width:7,height:7,background:'#E24B4A',borderRadius:'50%',border:'1.5px solid #C9951A'}}/>}
              <span style={{fontSize:22,lineHeight:1,marginBottom:2}}>{item.icon}</span>
              {item.label}
            </a>
          )
        })}
      </nav>
      <div style={{height:64}} className="bottom-nav-spacer"/>
    </>
  )
}
