'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

async function registerPushToken() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    await navigator.serviceWorker.ready

    const { getFirebaseMessaging, getToken, VAPID_KEY } = await import('@/lib/firebase')
    const messaging = getFirebaseMessaging()
    if (!messaging) return

    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg })
    if (!token) return

    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id || null
    const { data: profile } = userId
      ? await supabase.from('profiles').select('user_type').eq('id', userId).single()
      : { data: null }
    const userType = profile?.user_type || 'user'

    await fetch('/api/push/save-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, user_id: userId, user_type: userType })
    })
  } catch (err) {
    console.error('Push registration error:', err)
  }
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('trindade_cookie_consent')
    if (!consent) setVisible(true)
  }, [])

  async function accept(type: 'all' | 'essential') {
    localStorage.setItem('trindade_cookie_consent', type)
    setVisible(false)
    if (type === 'all') {
      await registerPushToken()
    }
  }

  if (!visible) return null

  return (
    <div style={{
      position:'fixed', bottom:0, left:0, right:0, zIndex:9999,
      background:'#111', borderTop:'2px solid #C9951A',
      padding:'16px 24px', boxShadow:'0 -4px 24px rgba(0,0,0,.5)'
    }}>
      <div style={{
        maxWidth:1200, margin:'0 auto',
        display:'flex', alignItems:'center',
        justifyContent:'space-between', gap:20, flexWrap:'wrap'
      }}>
        <div style={{flex:1, minWidth:260}}>
          <div style={{
            fontFamily:"'Bebas Neue',sans-serif",
            fontSize:15, color:'#fff', letterSpacing:1, marginBottom:5
          }}>
            🍪 Cookies e Notificações
          </div>
          <div style={{fontSize:12, color:'#AAA', lineHeight:1.7}}>
            Usamos cookies essenciais e gostaríamos de enviar notificações sobre novidades do bairro. Ao aceitar todos, você também autoriza o recebimento de notificações. Veja nossa{' '}
            <Link href="/termos" style={{color:'#C9951A', fontWeight:700, textDecoration:'none'}}>
              Política de Privacidade
            </Link>{' '}
            e{' '}
            <Link href="/termos" style={{color:'#C9951A', fontWeight:700, textDecoration:'none'}}>
              Termos de Uso
            </Link>
            , em conformidade com a LGPD.
          </div>
        </div>
        <div style={{display:'flex', gap:10, flexShrink:0, alignItems:'center'}}>
          <button
            onClick={() => accept('essential')}
            style={{
              padding:'11px 20px',
              background:'#ffffff',
              color:'#111111',
              border:'none',
              borderRadius:9,
              fontSize:13,
              fontWeight:700,
              cursor:'pointer',
              fontFamily:'Inter,sans-serif',
              whiteSpace:'nowrap',
              lineHeight:1
            }}>
            Só essenciais
          </button>
          <button
            onClick={() => accept('all')}
            style={{
              padding:'11px 24px',
              background:'#C9951A',
              color:'#ffffff',
              border:'none',
              borderRadius:9,
              fontSize:13,
              fontWeight:700,
              cursor:'pointer',
              fontFamily:'Inter,sans-serif',
              whiteSpace:'nowrap',
              boxShadow:'0 2px 10px rgba(201,149,26,.5)',
              lineHeight:1
            }}>
            ✓ Aceitar tudo
          </button>
        </div>
      </div>
    </div>
  )
}
