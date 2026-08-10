'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// A sessão do site fica salva no localStorage do navegador (não em
// cookie), então quem está logado só dá pra saber aqui no cliente —
// por isso essa barra é resolvida à parte, depois que a home (que já
// veio pronta do servidor) apareceu na tela.
export default function HomeBottomNav() {
  const [user, setUser] = useState<any>(null)
  const [userType, setUserType] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
          .then(({ data }) => { setUserType(data?.user_type ?? null) })
      }
    })
  }, [])

  if (!user || userType === 'admin') return null

  const items = [
    { href: '/', icon: '🏠', label: 'Início' },
    { href: '/cupons', icon: '🎟️', label: 'Cupons', badge: true },
    { href: '/feed', icon: '📰', label: 'Feed' },
    ...(userType === 'company'
      ? [{ href: '/painel', icon: '📊', label: 'Painel' }]
      : [{ href: '/favoritos', icon: '❤️', label: 'Favoritos' }]
    ),
    { href: '/perfil', icon: '👤', label: 'Perfil' },
  ] as any[]

  return (
    <>
      <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'0.5px solid #E0DDD8',display:'flex',zIndex:100,paddingBottom:'env(safe-area-inset-bottom)'}}>
        {items.map((item) => (
          <a key={item.href} href={item.href} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 0 10px',textDecoration:'none',color:'#888',fontSize:10,fontWeight:500,fontFamily:'Inter,sans-serif',position:'relative'}}>
            {item.badge && <span style={{position:'absolute',top:6,right:'calc(50% - 14px)',width:7,height:7,background:'#E24B4A',borderRadius:'50%',border:'1.5px solid #fff'}}/>}
            <span style={{fontSize:22,lineHeight:1,marginBottom:2}}>{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
      <div style={{height:64}}/>
    </>
  )
}
