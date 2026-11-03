'use client'
import { useEffect, useState } from 'react'

// Avisa o lojista quando saiu uma versão nova do site enquanto a aba estava aberta.
// Não recarrega sozinho (poderia interromper uma venda ou um pedido em andamento):
// mostra a faixa e deixa ele tocar em "Atualizar" na hora que quiser.
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || ''

export default function NovaVersaoAviso() {
  const [nova, setNova] = useState(false)
  const [dispensado, setDispensado] = useState(false)

  useEffect(() => {
    if (!BUILD) return
    let vivo = true
    const checar = async () => {
      try {
        const r = await fetch('/api/versao', { cache: 'no-store' })
        const d = await r.json()
        if (vivo && d?.id && d.id !== BUILD) setNova(true)
      } catch { /* sem rede: tenta na próxima */ }
    }
    const t = setInterval(checar, 5 * 60_000)
    const vis = () => { if (document.visibilityState === 'visible') void checar() }
    document.addEventListener('visibilitychange', vis)
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [])

  if (!nova || dispensado) return null
  return (
    <div role="status" style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 300, maxWidth: 520, margin: '0 auto', background: '#FFC531', color: '#151210', border: '2px solid #151210', borderRadius: 12, padding: '10px 12px 10px 16px', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Archivo,system-ui,sans-serif', boxShadow: '0 8px 30px rgba(0,0,0,.3)' }}>
      <span style={{ flex: 1, fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>Nova versão disponível. Atualize para usar as melhorias.</span>
      <button onClick={() => window.location.reload()} style={{ height: 42, padding: '0 16px', border: 0, borderRadius: 8, background: '#151210', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Atualizar</button>
      <button onClick={() => setDispensado(true)} aria-label="Dispensar" style={{ width: 36, height: 42, border: 0, background: 'transparent', fontSize: 16, cursor: 'pointer', color: '#151210' }}>✕</button>
    </div>
  )
}
