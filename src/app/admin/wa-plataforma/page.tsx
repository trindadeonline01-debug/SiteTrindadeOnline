'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

// Número da plataforma no WAHA (só admin). Passo a passo: criar sessão → ler o QR → testar → virar a chave na Vercel.
type Estado = { chaveNoWaha: boolean; sessao: string; existe: boolean; status: string | null; phone: string | null; qr: string | null }

const ROTULO: Record<string, string> = { WORKING: 'Conectado', SCAN_QR_CODE: 'Esperando leitura do QR', STARTING: 'Iniciando…', STOPPED: 'Parado', FAILED: 'Falhou' }

export default function WaPlataformaPage() {
  const [e, setE] = useState<Estado | null>(null)
  const [msg, setMsg] = useState('')
  const [fone, setFone] = useState('')
  const [busy, setBusy] = useState(false)

  const chamar = useCallback(async (acao: string, extra: Record<string, unknown> = {}) => {
    const r = await adminFetch('/api/admin/wa-plataforma', { method: 'POST', body: JSON.stringify({ acao, ...extra }) })
    const d = await r.json().catch(() => ({}))
    return { ok: r.ok, d }
  }, [])

  const atualizar = useCallback(async () => {
    const { ok, d } = await chamar('status')
    if (ok) setE(d); else setMsg(d?.error || 'Não consegui consultar (você está logado como admin?)')
  }, [chamar])

  useEffect(() => {
    atualizar()
    const iv = setInterval(atualizar, 4000)
    return () => clearInterval(iv)
  }, [atualizar])

  async function agir(acao: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setMsg('')
    const { ok, d } = await chamar(acao, extra)
    setMsg(ok ? (acao === 'testar' ? 'Mensagem de teste enviada.' : 'Feito.') : (d?.error || 'Falhou'))
    setBusy(false)
    atualizar()
  }

  const btn = { background: '#151210', color: '#FFC531', border: 0, borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' } as const
  return (
    <div style={{ minHeight: '100vh', background: '#E9EAE5', color: '#151210', fontFamily: 'Archivo, system-ui, sans-serif' }}>
      <div style={{ background: '#151210', color: '#fff', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <a href="/admin" style={{ color: '#FFC531', textDecoration: 'none', fontWeight: 700 }}>← Admin</a>
        <strong style={{ fontSize: 18 }}>Número da plataforma no WAHA</strong>
        <a href="/admin/wa-conexoes" style={{ marginLeft: 'auto', color: '#FFC531', fontSize: 14 }}>Todas as conexões</a>
      </div>
      <div style={{ maxWidth: 560, margin: '24px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, color: '#6F6C67' }}>Sessão: {e?.sessao || '…'}</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0' }}>{e ? (e.existe ? (ROTULO[e.status || ''] || e.status) : 'Ainda não criada') : 'Carregando…'}</div>
          {e?.phone && <div>Número: +{e.phone}</div>}
          <div style={{ marginTop: 8, fontSize: 14 }}>
            Chave na Vercel (<code>WA_PLATFORM_PROVIDER</code>): <b>{e?.chaveNoWaha ? 'WAHA (já virou)' : 'Evolution (ainda não virou)'}</b>
          </div>
        </div>

        {(!e?.existe || e.status === 'STOPPED' || e.status === 'FAILED') && (
          <button style={btn} disabled={busy} onClick={() => agir('criar')}>1. Criar sessão e gerar o QR</button>
        )}

        {e?.qr && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <img src={e.qr} alt="QR code" style={{ width: 260, height: 260 }} />
            <div style={{ fontSize: 14, marginTop: 8 }}>No celular do número da plataforma: WhatsApp → Aparelhos conectados → Conectar aparelho. O QR renova sozinho.</div>
          </div>
        )}

        {e?.status === 'WORKING' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, display: 'grid', gap: 8 }}>
            <b>2. Testar o envio</b>
            <input value={fone} onChange={ev => setFone(ev.target.value)} placeholder="Telefone com DDD, ex.: 21999999999" style={{ padding: 10, borderRadius: 8, border: '1px solid #DCDDD6' }} />
            <button style={btn} disabled={busy || !fone} onClick={() => agir('testar', { phone: fone })}>Enviar mensagem de teste</button>
            <div style={{ fontSize: 14, color: '#6F6C67' }}>Depois do teste, avise o Claude para virar a chave na Vercel (3. <code>WA_PLATFORM_PROVIDER=waha</code>).</div>
          </div>
        )}

        {e?.existe && (
          <button style={{ ...btn, background: '#fff', color: '#D6392B', border: '1px solid #D6392B' }} disabled={busy}
            onClick={() => { if (confirm('Desconectar e apagar a sessão da plataforma no WAHA?')) agir('apagar') }}>
            Desconectar e apagar a sessão
          </button>
        )}
        {msg && <div style={{ background: '#FFF4D6', borderRadius: 8, padding: 10 }}>{msg}</div>}
      </div>
    </div>
  )
}
