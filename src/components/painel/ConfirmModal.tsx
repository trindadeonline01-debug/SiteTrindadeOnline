'use client'
import { useEffect, useRef } from 'react'

// Confirmação em popup no centro da tela, com fundo escurecido — no lugar do
// window.confirm do navegador. Enter confirma, Esc cancela, clicar fora cancela.
export default function ConfirmModal({ titulo, mensagem, confirmar = 'Confirmar', cancelar = 'Cancelar', perigo, ocupado, onConfirm, onCancel }: {
  titulo: string; mensagem?: string; confirmar?: string; cancelar?: string; perigo?: boolean; ocupado?: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  const ok = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    ok.current?.focus()
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])
  return (
    <div className="cfm-ov" onClick={() => { if (!ocupado) onCancel() }}>
      <style>{CSS}</style>
      <div className="cfm" role="alertdialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}>
        <h3>{titulo}</h3>
        {mensagem && <p>{mensagem}</p>}
        <div className="ac">
          <button className="cn" disabled={ocupado} onClick={onCancel}>{cancelar}</button>
          <button ref={ok} className={`ok ${perigo ? 'perigo' : ''}`} disabled={ocupado} onClick={onConfirm}>{ocupado ? 'Aguarde…' : confirmar}</button>
        </div>
      </div>
    </div>
  )
}

const CSS = `
.cfm-ov{position:fixed;inset:0;z-index:200;background:rgba(21,18,16,.62);display:flex;align-items:center;justify-content:center;padding:16px;font-family:'Archivo',system-ui,sans-serif}
.cfm,.cfm *{box-sizing:border-box}
.cfm{width:min(420px,100%);background:#fff;border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:10px;box-shadow:0 20px 60px rgba(0,0,0,.4);color:#151210}
.cfm h3{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:26px;line-height:1.05;text-transform:uppercase;letter-spacing:.02em}
.cfm p{margin:0;font-size:15px;line-height:1.45;color:#4f4c47}
.cfm .ac{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:8px;margin-top:10px}
.cfm .ac button{height:52px;border-radius:10px;font-family:inherit;font-weight:700;font-size:15px;cursor:pointer}
.cfm .cn{border:1px solid #b9bab2;background:#fff;color:#151210}
.cfm .ok{border:0;background:#151210;color:#fff}.cfm .ok.perigo{background:#B3261A}
.cfm .ac button:disabled{opacity:.55;cursor:not-allowed}
.cfm .ok:focus-visible,.cfm .cn:focus-visible{outline:3px solid #FFC531;outline-offset:2px}
`
