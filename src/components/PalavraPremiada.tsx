'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface PremioState {
  won?: boolean
  needsLogin?: boolean
  alreadyWon?: boolean
  soldOut?: boolean
  position?: number
  prize_description?: string
  code?: string | null
  name?: string | null
  admin_whatsapp?: string
}

// ID anônimo persistido no navegador — permite contar pessoas únicas nas
// tentativas/visitas da Palavra Premiada mesmo antes de fazer login
export function getVisitorId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = localStorage.getItem('tro_vid')
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem('tro_vid', id)
    }
    return id
  } catch { return '' }
}

// Confere uma pesquisa contra a rodada ativa (geral, se companyId for
// omitido, ou da loja específica) e monta o link de WhatsApp pro resgate —
// usado tanto na busca geral quanto na página da empresa
export function usePalavraPremiada() {
  const [premio, setPremio] = useState<PremioState | null>(null)
  const [wonTerm, setWonTerm] = useState('')

  async function checarPalavraPremiada(term: string, companyId?: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/palavra-premiada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', query: term, access_token: session?.access_token, company_id: companyId || null, visitor_id: getVisitorId() })
      })
      const data = await res.json()
      if (data.match) {
        setWonTerm(term)
        setPremio(data)
      }
      return data
    } catch {
      return null
    }
  }

  function waResgateUrl() {
    if (!premio?.admin_whatsapp) return '#'
    const msg = `Oi! 🎉 Acertei a Palavra Premiada do Trindade Online!\n\nNome: ${premio.name || '—'}\nPalavra: ${wonTerm}\nPrêmio: ${premio.prize_description || '—'}\nPosição: ${premio.position ? `${premio.position}º` : '—'}\nCódigo: ${premio.code || '—'}`
    return `https://wa.me/${premio.admin_whatsapp}?text=${encodeURIComponent(msg)}`
  }

  return { premio, setPremio, checarPalavraPremiada, waResgateUrl }
}

// Popup de resultado — mesmo visual usado na busca e na loja
export function PalavraPremiadaModal({ premio, onClose, waResgateUrl, loginRedirect }: {
  premio: PremioState
  onClose: () => void
  waResgateUrl: () => string
  loginRedirect: string
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '36px 28px', maxWidth: 380, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        {premio.won && (
          <>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#111', letterSpacing: 1, marginBottom: 8 }}>PARABÉNS!</div>
            <div style={{ fontSize: 15, color: '#444', lineHeight: 1.6, marginBottom: 20 }}>
              Você é o <strong>{premio.position}º</strong> a acertar a Palavra Premiada!<br />Prêmio: <strong>{premio.prize_description}</strong>
            </div>
            <a href={waResgateUrl()} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 20px', background: '#25D366', color: '#fff', borderRadius: 12, textDecoration: 'none', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              📲 Clique aqui pra resgatar no WhatsApp
            </a>
            <div style={{ fontSize: 12, color: '#AAA' }}>Código: {premio.code}</div>
          </>
        )}
        {premio.needsLogin && (
          <>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🏆</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#111', letterSpacing: 1, marginBottom: 8 }}>VOCÊ ACHOU A PALAVRA PREMIADA!</div>
            <div style={{ fontSize: 15, color: '#444', lineHeight: 1.6, marginBottom: 20 }}>Faça login (é rápido) pra resgatar seu prêmio.</div>
            <a href={`/login?redirect=${encodeURIComponent(loginRedirect)}`} style={{ display: 'inline-block', padding: '12px 28px', background: '#C9951A', color: '#fff', borderRadius: 12, textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>Entrar e resgatar</a>
          </>
        )}
        {premio.alreadyWon && (
          <>
            <div style={{ fontSize: 44, marginBottom: 12 }}>😉</div>
            <div style={{ fontSize: 15, color: '#444', lineHeight: 1.6, marginBottom: premio.admin_whatsapp ? 20 : 0 }}>Você já garantiu sua vaga na Palavra Premiada dessa rodada!</div>
            {premio.admin_whatsapp && (
              <a href={waResgateUrl()} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 20px', background: '#25D366', color: '#fff', borderRadius: 12, textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
                📲 Falar no WhatsApp
              </a>
            )}
          </>
        )}
        {premio.soldOut && (
          <>
            <div style={{ fontSize: 44, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 15, color: '#444', lineHeight: 1.6 }}>Essa rodada da Palavra Premiada já esgotou. Fique de olho na próxima!</div>
          </>
        )}
        <button onClick={onClose} style={{ marginTop: 20, background: 'none', border: 'none', color: '#999', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Fechar</button>
      </div>
    </div>
  )
}
