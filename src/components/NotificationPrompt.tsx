'use client'
import { useState, useEffect } from 'react'

// Pedido "próprio" ANTES do prompt de verdade do navegador — mesma ideia do
// Mercado Livre/iFood: o navegador só deixa perguntar "Permitir notificações?"
// UMA vez de verdade. Se a pessoa bloquear ali, nenhum código de site
// consegue reabrir esse diálogo nunca mais (só ela mudar na mão nas
// configurações do navegador). Por isso só chamamos o pedido de verdade
// (Notifications.requestPermission) depois que a pessoa já disse "sim" aqui
// no nosso modal — se ela disser "agora não", não gastamos a única chance,
// e dá pra perguntar de novo em outra visita (COOLDOWN_DAYS abaixo).
const DISMISS_KEY = 'trindade_notif_prompt_dismissed_at'
const COOLDOWN_DAYS = 7

export default function NotificationPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return
    const consent = localStorage.getItem('trindade_cookie_consent')
    if (!consent) return
    // Já decidiu no navegador (permitiu ou bloqueou) — nada a perguntar,
    // pedir de novo não muda esse estado e só incomoda à toa.
    if (Notification.permission !== 'default') return
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (dismissedAt && Date.now() - dismissedAt < COOLDOWN_DAYS * 86400000) return
    const t = setTimeout(() => setVisible(true), 4000)
    return () => clearTimeout(t)
  }, [])

  async function ativar() {
    setVisible(false)
    try {
      if (window.OneSignalReact) {
        await new Promise(resolve => { const check = setInterval(() => { if (window.OneSignalReact?.Notifications) { clearInterval(check); window.OneSignalReact?.Notifications.requestPermission().then(resolve) } }, 200) })
        await window.OneSignalReact?.User.addTag('user_type', localStorage.getItem('trindade_user_type') || 'user')
      }
    } catch (err) {
      console.error('OneSignal error:', err)
    }
    // Não grava nada aqui de propósito — Notification.permission já vira
    // 'granted' ou 'denied' sozinho, e o efeito acima não mostra mais o
    // modal nesse caso. Só o "agora não" grava cooldown (ver dispensar()).
  }

  function dispensar() {
    setVisible(false)
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={dispensar}
      style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(21,18,16,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, padding: '32px 26px 26px', maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,.35)' }}
      >
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--concrete-2,#F5F6F2)', border: '2px solid var(--sign)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 18px' }}>
          🔔
        </div>
        <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 21, color: 'var(--ink,#151210)', letterSpacing: .3, lineHeight: 1.2, marginBottom: 10, textTransform: 'uppercase' }}>
          Fique por dentro do bairro
        </div>
        <div style={{ fontSize: 13, color: '#6E6656', lineHeight: 1.6, marginBottom: 22 }}>
          Ative as notificações e receba cupons, promoções e novidades da Trindade na hora — sem precisar ficar checando o site.
        </div>
        <button
          onClick={ativar}
          style={{ width: '100%', padding: '14px', background: 'var(--sign)', color: 'var(--ink,#151210)', border: 'none', borderRadius: 12, fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'Archivo,sans-serif', marginBottom: 12 }}
        >
          🔔 Permitir notificações
        </button>
        <button
          onClick={dispensar}
          style={{ background: 'none', border: 'none', color: '#8A8577', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Archivo,sans-serif', padding: 6 }}
        >
          Agora não
        </button>
      </div>
    </div>
  )
}
