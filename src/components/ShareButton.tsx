'use client'
import { useState, useRef, useEffect } from 'react'

type Props = {
  title: string
  text?: string
  url?: string
  label?: string
  fullWidth?: boolean
}

export default function ShareButton({ title, text, url, label = 'Compartilhar', fullWidth = true }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function getUrl() {
    return url || (typeof window !== 'undefined' ? window.location.href : '')
  }

  async function handleClick() {
    const shareUrl = getUrl()
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }) : undefined
    if (nav?.share) {
      try {
        await nav.share({ title, text, url: shareUrl })
      } catch {
        // usuário cancelou o compartilhamento nativo — sem erro
      }
      return
    }
    setOpen(v => !v)
  }

  function copyLink() {
    navigator.clipboard.writeText(getUrl())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setOpen(false)
  }

  const waText = encodeURIComponent(`${text ? text + '\n' : ''}${getUrl()}`)

  return (
    <div ref={ref} style={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : 'auto' }}>
      <button onClick={handleClick} style={{
        width: fullWidth ? '100%' : 'auto', padding: fullWidth ? '9px' : '6px 10px', background: '#fff', color: '#888', border: '0.5px solid #E0DDD8',
        borderRadius: 10, fontSize: 13, fontFamily: "'Inter',sans-serif", cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
      }}>
        <span>📤</span>{label && <span>{label}</span>}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: '1px solid #E0DDD8',
          borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 100, minWidth: 200
        }}>
          <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#111', textDecoration: 'none', borderBottom: '1px solid #F0EDE8' }}>
            <span style={{ fontSize: 16 }}>💬</span> WhatsApp
          </a>
          <button onClick={copyLink} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#111', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
            <span style={{ fontSize: 16 }}>🔗</span> {copied ? 'Link copiado!' : 'Copiar link'}
          </button>
        </div>
      )}
    </div>
  )
}
