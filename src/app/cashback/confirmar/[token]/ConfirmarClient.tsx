'use client'
import { useState } from 'react'

const brl = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',')

export default function ConfirmarClient({ token }: { token: string }) {
  const [estado, setEstado] = useState<'inicio' | 'enviando' | 'ok' | 'erro'>('inicio')
  const [msg, setMsg] = useState('')
  const [info, setInfo] = useState<{ valor: number; saldo: number; loja: string; jaConfirmado?: boolean } | null>(null)

  async function confirmar() {
    setEstado('enviando')
    try {
      const r = await fetch('/api/cashback/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const j = await r.json()
      if (!r.ok) { setMsg(j.error || 'Não consegui confirmar.'); setEstado('erro'); return }
      setInfo(j); setEstado('ok')
    } catch { setMsg('Sem conexão. Tente de novo.'); setEstado('erro') }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#111111', color: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 16, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🎁</div>
        <h1 style={{ fontFamily: '"Bebas Neue", Inter, sans-serif', fontSize: 34, letterSpacing: '.02em', color: '#C9951A', margin: '8px 0' }}>Liberar cashback</h1>
        {estado === 'ok' && info ? (
          <>
            <p style={{ fontSize: 17, lineHeight: 1.5 }}>{info.jaConfirmado ? 'Este cashback já estava liberado.' : <>Pronto! <b>{brl(info.valor)}</b> entrou no seu saldo{info.loja ? <> da <b>{info.loja}</b></> : null}.</>}</p>
            <p style={{ opacity: .8 }}>Saldo atual: <b>{brl(info.saldo)}</b></p>
            <a href="/meu-cashback" style={{ display: 'inline-block', marginTop: 12, color: '#C9951A' }}>Ver meus saldos</a>
          </>
        ) : (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.5, opacity: .9 }}>Toque no botão para confirmar que a conta foi sua e liberar o cashback no seu WhatsApp.</p>
            <button onClick={confirmar} disabled={estado === 'enviando'} style={{ marginTop: 12, width: '100%', padding: '14px 16px', borderRadius: 12, border: 0, background: '#C9951A', color: '#111', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
              {estado === 'enviando' ? 'Confirmando…' : 'Confirmar e liberar'}
            </button>
            {estado === 'erro' && <p role="alert" style={{ color: '#F87171', marginTop: 12 }}>{msg}</p>}
          </>
        )}
      </div>
    </main>
  )
}
