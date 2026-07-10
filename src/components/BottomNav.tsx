'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function BottomNav() {
  const [userType, setUserType] = useState<string|null>(null)
  const [loaded, setLoaded] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setLoaded(true); return }
      const { data } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      setUserType(data?.user_type || null)
      setLoaded(true)
    })
  }, [])

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
  ]

  return (
    <>
      <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'0.5px solid #E0DDD8',display:'flex',zIndex:9999,paddingBottom:'env(safe-area-inset-bottom)'}}>
        {items.map((item: any) => {
          const active = pathname === item.href
          return (
            <a key={item.href} href={item.href} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 0 10px',textDecoration:'none',color:active?'#C9951A':'#888',fontSize:10,fontWeight:active?600:500,fontFamily:'Inter,sans-serif',position:'relative'}}>
              {item.badge && <span style={{position:'absolute',top:6,right:'calc(50% - 14px)',width:7,height:7,background:'#E24B4A',borderRadius:'50%',border:'1.5px solid #fff'}}/>}
              <span style={{fontSize:22,lineHeight:1,marginBottom:2}}>{item.icon}</span>
              {item.label}
            </a>
          )
        })}
      </nav>
      <div style={{height:64}}/>
    </>
  )
}
