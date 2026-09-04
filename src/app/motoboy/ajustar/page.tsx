'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface PendingFlag { key: string; label: string; reason: string }

const ICON: Record<string, string> = { cnh: '🪪', moto_frente: '🏍️', moto_tras: '🔢', documento_moto: '📄', selfie: '🤳' }

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function AjustarContent() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [nome, setNome] = useState('')
  const [flags, setFlags] = useState<PendingFlag[]>([])
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (!token) { setErro('Link inválido.'); setLoading(false); return }
    fetch(`/api/motoboy/reenviar?token=${encodeURIComponent(token)}`).then(r => r.json()).then(data => {
      if (data.error) { setErro(data.error); } else { setNome(data.name); setFlags(data.pending_flags || []) }
      setLoading(false)
    })
  }, [token])

  async function onPick(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotos(p => ({ ...p, [key]: '' }))
    const b64 = await readFileAsBase64(file)
    setPhotos(p => ({ ...p, [key]: b64 }))
  }

  const allSent = flags.length > 0 && flags.every(f => !!photos[f.key])

  async function enviar() {
    setErro(''); setEnviando(true)
    const res = await fetch('/api/motoboy/reenviar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, photos }),
    })
    const data = await res.json()
    setEnviando(false)
    if (data.error) { setErro(data.error); return }
    setOk(true)
  }

  return (
    <div className="aj-wrap">
      <style>{`
        .aj-wrap{max-width:480px;margin:0 auto;padding:28px 20px 60px;font-family:'Archivo',sans-serif;font-size:14px;color:var(--ink);background:var(--concrete);min-height:100vh;}
        .aj-logo{text-align:center;font-family:'Anton',sans-serif;font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:22px;}
        .aj-logo span{color:var(--sign-dark);}
        .aj-card{background:#fff;border:1px solid #E0DDD8;border-radius:16px;padding:22px;}
        .aj-title{font-family:'Anton',sans-serif;font-size:22px;text-align:center;letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;}
        .aj-sub{font-size:12.5px;color:#8A8478;text-align:center;line-height:1.6;margin-bottom:20px;}
        .aj-item{border:1.5px solid #E0DDD8;border-radius:12px;padding:14px;margin-bottom:12px;}
        .aj-item-hd{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;margin-bottom:4px;}
        .aj-item-reason{font-size:11.5px;color:#D6392B;margin-bottom:10px;}
        .aj-photo-btn{display:flex;align-items:center;justify-content:center;gap:8px;border-radius:10px;padding:14px;font-size:12.5px;font-weight:700;cursor:pointer;text-align:center;}
        .aj-photo-btn.empty{border:2px dashed var(--sign-dark);background:#FEF3E2;color:var(--sign-dark);}
        .aj-photo-btn.filled{border:2px solid #0F8A57;background:#E4F3EC;color:#0F8A57;}
        .aj-btn{width:100%;padding:14px;background:var(--sign);color:var(--ink);border:none;border-radius:12px;font-size:14.5px;font-weight:800;cursor:pointer;margin-top:6px;}
        .aj-btn:disabled{background:#E0DDD8;color:#8A8478;cursor:not-allowed;}
        .aj-error{color:#D6392B;font-size:12px;margin-top:10px;text-align:center;}
        .aj-success{text-align:center;padding:10px 0;}
      `}</style>
      <div className="aj-logo">TRINDADE <span>ONLINE</span></div>
      <div className="aj-card">
        {loading && <div style={{ textAlign: 'center', color: '#8A8478' }}>Carregando...</div>}
        {!loading && erro && !ok && <div className="aj-error">{erro}</div>}
        {!loading && !erro && !ok && (
          <>
            <div className="aj-title">Ajustar cadastro</div>
            <div className="aj-sub">Oi, {nome}! Só falta reenviar {flags.length > 1 ? 'essas fotos' : 'essa foto'}:</div>
            {flags.map(f => (
              <div key={f.key} className="aj-item">
                <div className="aj-item-hd"><span>{ICON[f.key] || '📷'}</span>{f.label}</div>
                <div className="aj-item-reason">Motivo: {f.reason}</div>
                <label className={`aj-photo-btn ${photos[f.key] ? 'filled' : 'empty'}`}>
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => onPick(f.key, e)} />
                  {photos[f.key] ? '✓ Foto pronta — trocar' : '📷 Tirar ou escolher foto'}
                </label>
              </div>
            ))}
            {erro && <div className="aj-error">{erro}</div>}
            <button className="aj-btn" disabled={!allSent || enviando} onClick={enviar}>{enviando ? 'Enviando...' : 'Reenviar pra Trindade Online'}</button>
          </>
        )}
        {ok && (
          <div className="aj-success">
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div className="aj-title" style={{ fontSize: 20 }}>Enviado!</div>
            <div className="aj-sub">Você recebe a resposta no seu WhatsApp. Pode fechar essa página.</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MotoboyAjustarPage() {
  return (
    <Suspense fallback={null}>
      <AjustarContent />
    </Suspense>
  )
}
