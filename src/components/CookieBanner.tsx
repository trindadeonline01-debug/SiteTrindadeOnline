'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const MOBILE_BREAKPOINT = 768
const MOBILE_DELAY_MS = 10000

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Achado real via gravações do Clarity, out/2026: a faixa fixa no rodapé
  // ocupava espaço demais no mobile e era confundida com parte do site —
  // cliente navegando o site inteiro sem perceber que tinha algo pra fechar
  // ali. No mobile vira popup central (some da tela depois de decidir, em
  // vez de ficar ocupando rodapé o tempo todo) e só aparece 10s depois de
  // entrar, não no primeiro instante — dá tempo da pessoa já estar olhando
  // o conteúdo antes de interromper. Desktop mantém a faixa de sempre.
  useEffect(() => {
    const consent = localStorage.getItem('trindade_cookie_consent')
    if (consent) return
    const mobile = window.innerWidth < MOBILE_BREAKPOINT
    setIsMobile(mobile)
    if (!mobile) { setVisible(true); return }
    const timer = setTimeout(() => setVisible(true), MOBILE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  function accept(type: 'all' | 'essential') {
    localStorage.setItem('trindade_cookie_consent', type)
    setVisible(false)
    // Avisa o NotificationPrompt (montado uma vez só no layout, sem recarregar
    // a página entre navegações do site) que já pode tentar mostrar o convite
    // de notificação — sem isso, quem acabava de aceitar cookies só veria o
    // convite na PRÓXIMA visita, já que o efeito dele só roda 1x na montagem.
    window.dispatchEvent(new Event('trindade:cookie-consent'))
  }

  if (!visible) return null

  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(21,18,16,.65)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      >
        <div style={{ background:'var(--ink)', border:'2px solid var(--sign)', borderRadius:16, padding:'24px 20px', maxWidth:340, width:'100%', boxShadow:'0 24px 60px rgba(0,0,0,.45)' }}>
          <div style={{ fontFamily:"'Anton',sans-serif", fontSize:16, color:'#fff', letterSpacing:1, marginBottom:8 }}>
            🍪 Cookies e Notificações
          </div>
          <div style={{ fontSize:12.5, color:'#AAA', lineHeight:1.7, marginBottom:18 }}>
            Usamos cookies essenciais e gostaríamos de enviar notificações sobre novidades do bairro. Veja nossa{' '}
            <Link href="/termos" style={{color:'var(--sign)', fontWeight:700, textDecoration:'none'}}>
              Política de Privacidade
            </Link>{' '}
            e{' '}
            <Link href="/termos" style={{color:'var(--sign)', fontWeight:700, textDecoration:'none'}}>
              Termos de Uso
            </Link>
            , em conformidade com a LGPD.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            <button
              onClick={() => accept('all')}
              style={{ padding:'13px', background:'var(--sign)', color:'var(--ink)', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:'Archivo,sans-serif' }}>
              ✓ Aceitar tudo
            </button>
            <button
              onClick={() => accept('essential')}
              style={{ padding:'13px', background:'#ffffff', color:'#111111', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:'Archivo,sans-serif' }}>
              Só essenciais
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position:'fixed', bottom:0, left:0, right:0, zIndex:9999,
      background:'var(--ink)', borderTop:'2px solid var(--sign)',
      padding:'16px 24px',
      boxShadow:'0 -4px 24px rgba(0,0,0,.5)'
    }}>
      <div style={{
        maxWidth:1200, margin:'0 auto',
        display:'flex', alignItems:'center',
        justifyContent:'space-between', gap:20, flexWrap:'wrap'
      }}>
        <div style={{flex:1, minWidth:260}}>
          <div style={{
            fontFamily:"'Anton',sans-serif",
            fontSize:15, color:'#fff', letterSpacing:1, marginBottom:5
          }}>
            🍪 Cookies e Notificações
          </div>
          <div style={{fontSize:12, color:'#AAA', lineHeight:1.7}}>
            Usamos cookies essenciais e gostaríamos de enviar notificações sobre novidades do bairro. Veja nossa{' '}
            <Link href="/termos" style={{color:'var(--sign)', fontWeight:700, textDecoration:'none'}}>
              Política de Privacidade
            </Link>{' '}
            e{' '}
            <Link href="/termos" style={{color:'var(--sign)', fontWeight:700, textDecoration:'none'}}>
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
              fontFamily:'Archivo,sans-serif',
              whiteSpace:'nowrap',
              lineHeight:1
            }}>
            Só essenciais
          </button>
          <button
            onClick={() => accept('all')}
            style={{
              padding:'11px 24px',
              background:'var(--sign)',
              color:'var(--ink)',
              border:'none',
              borderRadius:9,
              fontSize:13,
              fontWeight:700,
              cursor:'pointer',
              fontFamily:'Archivo,sans-serif',
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