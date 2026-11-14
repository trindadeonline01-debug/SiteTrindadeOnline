'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { usePainelShell } from '@/contexts/PainelShellContext'

// Jogos da loja: o link público da página de jogos (/jogos/<slug>) e o QR para imprimir.
// Regra: jogo aberto por esse link vale SÓ para o ranking; cashback só pelo QR da mesa, e só é
// creditado quando a conta é paga (o servidor decide).

export default function JogosPage() {
  const { company, loading } = usePainelShell()
  const [qr, setQr] = useState('')
  const [copiado, setCopiado] = useState(false)
  const link = company?.slug ? `https://www.trindadeonline.com.br/jogos/${company.slug}` : ''

  useEffect(() => {
    if (!link) return
    QRCode.toDataURL(link, { width: 360, margin: 1, color: { dark: '#1A1610', light: '#FFFFFF' } }).then(setQr).catch(() => {})
  }, [link])

  function copiar() {
    navigator.clipboard.writeText(link).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) }).catch(() => {})
  }

  function imprimir() {
    if (!qr || !company) return
    const w = window.open('', '_blank', 'width=600,height=800')
    if (!w) return
    const nome = company.name.replace(/[<>&]/g, '')
    w.document.write(`<!doctype html><title>QR dos jogos</title><body style="font-family:Arial,sans-serif;text-align:center;padding:40px"><h1 style="margin:0 0 6px">${nome}</h1><h2 style="margin:0 0 18px">🎮 Jogue e suba no ranking!</h2><img src="${qr}" width="360" height="360" alt=""><p style="font-size:14px;color:#555">Aponte a câmera do celular</p></body>`)
    w.document.close()
    setTimeout(() => w.print(), 400)
  }

  if (loading) return <p style={{ padding: 24 }}>Carregando…</p>
  if (!company) return null
  if (!company.mesas_enabled) return <div style={{ padding: 24, maxWidth: 560 }}><h1 style={{ margin: 0 }}>Jogos</h1><p>Os jogos fazem parte do módulo de mesas, que ainda não está ligado nesta loja.</p></div>

  return (
    <div style={{ padding: 'clamp(16px,3vw,28px)', maxWidth: 720, display: 'grid', gap: 16, color: '#151210' }}>
      <header>
        <span style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6F6C67', fontWeight: 700 }}>{company.name}</span>
        <h1 style={{ margin: '2px 0 0', fontSize: 30 }}>🎮 Jogos</h1>
      </header>

      <section style={{ background: '#fff', border: '1px solid #DCDDD6', borderRadius: 14, padding: 16, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Link dos jogos da loja</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#4a4742', lineHeight: 1.45 }}>
          Quem abre este link joga o <b>Quiz Pesca Premiada</b> e entra no ranking da loja. Pode postar no Instagram, no WhatsApp ou imprimir o QR.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input readOnly value={link} onFocus={e => e.currentTarget.select()} aria-label="Link dos jogos" style={{ flex: '1 1 260px', minHeight: 44, border: '1.5px solid #DCDDD6', borderRadius: 10, padding: '0 12px', fontSize: 14, background: '#F5F6F2' }} />
          <button type="button" onClick={copiar} style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, border: 0, background: '#FFC531', fontWeight: 700, cursor: 'pointer' }}>{copiado ? 'Copiado ✓' : 'Copiar'}</button>
          <a href={link} target="_blank" rel="noopener noreferrer" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: 10, border: '2px solid #151210', fontWeight: 700, textDecoration: 'none', color: '#151210' }}>Abrir</a>
        </div>
        {qr && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado no navegador (data URL) */}
            <img src={qr} alt="QR code dos jogos" width={160} height={160} style={{ borderRadius: 8, border: '1px solid #DCDDD6' }} />
            <button type="button" onClick={imprimir} style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, border: '2px solid #151210', background: 'transparent', fontWeight: 700, cursor: 'pointer' }}>🖨️ Imprimir QR</button>
          </div>
        )}
      </section>

      <section style={{ background: '#FFF8E1', border: '1px solid #F0D68A', borderRadius: 14, padding: 16, display: 'grid', gap: 6 }}>
        <b>Como funciona o cashback dos jogos</b>
        <span style={{ fontSize: 14, lineHeight: 1.45 }}>
          Por este link o jogo vale <b>só para o ranking</b>. O cliente só ganha cashback jogando pelo <b>QR da mesa</b>, no restaurante, e o prêmio é creditado quando a conta é paga.
        </span>
      </section>
    </div>
  )
}
