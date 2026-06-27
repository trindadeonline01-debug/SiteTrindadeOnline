'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('trindade_cookie_consent')
    if (!consent) setVisible(true)
  }, [])

  function accept(type: 'all' | 'essential') {
    localStorage.setItem('trindade_cookie_consent', type)
    setVisible(false)
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
            🍪 Cookies e Privacidade
          </div>
          <div style={{fontSize:12, color:'#AAA', lineHeight:1.7}}>
            Usamos cookies essenciais para o funcionamento do site. Ao continuar navegando, você concorda com nossa{' '}
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
            ✓ Aceitar todos
          </button>
        </div>
      </div>
    </div>
  )
}