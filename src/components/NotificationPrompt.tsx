'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

async function registerPushToken() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    await navigator.serviceWorker.ready
    const { getFirebaseMessaging, getToken, VAPID_KEY } = await import('@/lib/firebase')
    const messaging = getFirebaseMessaging()
    if (!messaging) return false
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg })
    if (!token) return false
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
    return true
  } catch { return false }
}

export default function NotificationPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('trindade_cookie_consent')
    const notifPrompt = localStorage.getItem('trindade_notif_prompt')
    const notifGranted = localStorage.getItem('trindade_notif_granted')
    if (consent && !notifPrompt && !notifGranted && 'Notification' in window && Notification.permission === 'default') {
      setTimeout(() => setVisible(true), 3000)
    }
  }, [])

  async function ativar() {
    setVisible(false)
    localStorage.setItem('trindade_notif_prompt', '1')
    const ok = await registerPushToken()
    if (ok) localStorage.setItem('trindade_notif_granted', '1')
  }

  function dispensar() {
    setVisible(false)
    localStorage.setItem('trindade_notif_prompt', '1')
  }

  if (!visible) return null

  return (
    <div style={{position:'fixed',bottom:80,left:16,right:16,zIndex:998,maxWidth:560,margin:'0 auto'}}>
      <div style={{background:'#111',borderRadius:14,padding:'14px 16px',border:'1px solid rgba(201,149,26,0.4)',boxShadow:'0 8px 24px rgba(0,0,0,0.3)',display:'flex',alignItems:'center',gap:12}}>
        <div style={{width:38,height:38,borderRadius:'50%',background:'rgba(201,149,26,0.15)',border:'1px solid rgba(201,149,26,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>🔔</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:'#fff',marginBottom:2}}>Fique por dentro do bairro!</div>
          <div style={{fontSize:11,color:'#888',lineHeight:1.4}}>Ative as notificações e receba novidades, cupons e promoções da Trindade.</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
          <button onClick={ativar} style={{padding:'6px 14px',background:'#C9951A',color:'#111',border:'none',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',fontFamily:'Inter,sans-serif'}}>🔔 Ativar</button>
          <button onClick={dispensar} style={{padding:'5px 14px',background:'transparent',color:'#555',border:'none',borderRadius:8,fontSize:11,cursor:'pointer',whiteSpace:'nowrap',fontFamily:'Inter,sans-serif'}}>Agora não</button>
        </div>
      </div>
    </div>
  )
}