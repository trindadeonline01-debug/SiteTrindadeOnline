'use client'
import { useState, useEffect } from 'react'

export default function NotificationPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('trindade_cookie_consent')
    const notifPrompt = localStorage.getItem('trindade_notif_prompt')
    if (consent && !notifPrompt) {
      setTimeout(() => setVisible(true), 3000)
    }
  }, [])

  async function ativar() {
    setVisible(false)
    localStorage.setItem('trindade_notif_prompt', '1')
    try {
      if (window.OneSignal) {
        await new Promise(resolve => { const check = setInterval(() => { if (window.OneSignal?.Notifications) { clearInterval(check); window.OneSignal.Notifications.requestPermission().then(resolve) } }, 200) })
        await window.OneSignal.User.addTag('user_type', localStorage.getItem('trindade_user_type') || 'user')
      }
    } catch (err) {
      console.error('OneSignal error:', err)
    }
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