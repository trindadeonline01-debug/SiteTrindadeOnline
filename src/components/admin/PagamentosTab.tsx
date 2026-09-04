'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Motoboy { id: string; name: string; phone: string; pix_key: string | null; pix_key_type: string | null }
interface Payout {
  id: string; motoboy_id: string; motoboy_name: string; pix_key: string | null; pix_key_type: string | null
  period_start: string; period_end: string; entregas_count: number; valor: number
  status: 'pendente' | 'pago'; comprovante_path: string | null; comprovante_url: string | null; paid_at: string | null
}
interface Pronto { motoboy_id: string; motoboy_name: string; count: number; valor: number }

const s: Record<string, any> = {
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 16 },
  kpi: { background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  kpiLabel: { fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' as const, letterSpacing: 0.4, marginBottom: 8 },
  kpiValue: { fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' as const },
  alert: { background: '#FBEAEA', border: '1.5px solid #F1C7C7', borderRadius: 14, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 16 },
  cardHd: { padding: '15px 20px', borderBottom: '1px solid #F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const },
  cardTitle: { fontSize: 12.5, fontWeight: 800, color: '#111' },
  filters: { display: 'flex', gap: 8, padding: '14px 20px 0', flexWrap: 'wrap' as const },
  select: { border: '1.5px solid #E0DDD8', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', background: '#FAFAF8' },
  btnLink: { background: 'none', border: 'none', color: 'var(--sign-dark)', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  btnSave: { background: '#157A52', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnGhostSm: { background: '#fff', color: '#111', border: '1.5px solid #E0DDD8', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  pixCell: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 },
  pixCopy: { background: '#F0EDE8', border: 'none', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer', color: '#555' },
  badge: (bg: string, fg: string) => ({ fontSize: 10.5, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: bg, color: fg, whiteSpace: 'nowrap' as const }),
}

function brl(n: number): string { return `R$ ${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }
function fmtDate(d: string): string { return d.split('-').reverse().join('/') }
function isAtrasado(p: Payout): boolean {
  if (p.status === 'pago') return false
  const prazo = new Date(p.period_end); prazo.setDate(prazo.getDate() + 2)
  return prazo < new Date()
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function PagamentosTab() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [motoboys, setMotoboys] = useState<Motoboy[]>([])
  const [prontos, setProntos] = useState<Pronto[]>([])
  const [kpis, setKpis] = useState({ pagoMes: 0, pendente: 0, atrasado: 0 })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [fMotoboy, setFMotoboy] = useState('todos')
  const [fPeriodo, setFPeriodo] = useState('tudo')
  const [fStatus, setFStatus] = useState('todos')

  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null)

  useEffect(() => { load() }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { token: session?.access_token }
  }

  async function load() {
    setLoading(true)
    const { token } = await authHeader()
    const res = await fetch('/api/admin/motoboy-payouts', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const data = await res.json()
    setPayouts(data.payouts || [])
    setMotoboys(data.motoboys || [])
    setProntos(data.prontos || [])
    setKpis(data.kpis || { pagoMes: 0, pendente: 0, atrasado: 0 })
    setLoading(false)
  }

  async function gerarRepasse(motoboyId: string) {
    setBusyId(motoboyId)
    const { token } = await authHeader()
    await fetch('/api/admin/motoboy-payouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', access_token: token, motoboy_id: motoboyId }),
    })
    setBusyId(null)
    load()
  }

  async function marcarPago(id: string) {
    setBusyId(id)
    const { token } = await authHeader()
    await fetch('/api/admin/motoboy-payouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_paid', access_token: token, id }),
    })
    setBusyId(null)
    load()
  }

  async function anexarComprovante(id: string, file: File) {
    setBusyId(id)
    const base64 = await readFileAsBase64(file)
    const { token } = await authHeader()
    await fetch('/api/admin/motoboy-payouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'attach_comprovante', access_token: token, id, comprovante_base64: base64 }),
    })
    setBusyId(null)
    load()
  }

  function copyPix(p: Payout) {
    if (!p.pix_key) return
    navigator.clipboard.writeText(p.pix_key).then(() => {
      setCopiedId(p.id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  function exportarCsv() {
    const linhas = [['Motoboy', 'Período início', 'Período fim', 'Entregas', 'Valor', 'Chave Pix', 'Status', 'Pago em']]
    for (const p of filtrados) {
      linhas.push([p.motoboy_name, p.period_start, p.period_end, String(p.entregas_count), p.valor.toFixed(2), p.pix_key || '', isAtrasado(p) ? 'atrasado' : p.status, p.paid_at ? p.paid_at.slice(0, 10) : ''])
    }
    const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `repasses-motoboys-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const periodoLimite = (() => {
    if (fPeriodo === 'semana') { const d = new Date(); d.setDate(d.getDate() - 7); return d }
    if (fPeriodo === 'mes') { const d = new Date(); d.setDate(d.getDate() - 30); return d }
    return null
  })()

  const filtrados = payouts.filter(p => {
    if (fMotoboy !== 'todos' && p.motoboy_id !== fMotoboy) return false
    if (periodoLimite && new Date(p.period_end) < periodoLimite) return false
    if (fStatus === 'pendente' && (p.status !== 'pendente' || isAtrasado(p))) return false
    if (fStatus === 'atrasado' && !isAtrasado(p)) return false
    if (fStatus === 'pago' && p.status !== 'pago') return false
    return true
  })

  const atrasados = payouts.filter(isAtrasado)

  if (loading) return <div style={{ color: '#888', fontSize: 13 }}>Carregando...</div>

  return (
    <div>
      {atrasados.length > 0 && (
        <div style={s.alert}>
          <span style={{ fontSize: 20 }}>⏰</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#C43D3D', marginBottom: 4 }}>{atrasados.length} pagamento{atrasados.length > 1 ? 's' : ''} atrasado{atrasados.length > 1 ? 's' : ''}</div>
            {atrasados.map(p => (
              <div key={p.id} style={{ fontSize: 12, color: '#8A4444' }}>
                <b>{p.motoboy_name}</b> — repasse de {fmtDate(p.period_start)} a {fmtDate(p.period_end)} ({brl(p.valor)}), já passou do prazo.
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={s.grid3}>
        <div style={s.kpi}><div style={s.kpiLabel}>Pago esse mês</div><div style={{ ...s.kpiValue, color: '#157A52' }}>{brl(kpis.pagoMes)}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Pendente de pagamento</div><div style={{ ...s.kpiValue, color: '#C97A0E' }}>{brl(kpis.pendente)}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Atrasados</div><div style={{ ...s.kpiValue, color: '#C43D3D' }}>{brl(kpis.atrasado)}</div></div>
      </div>

      {prontos.length > 0 && (
        <div style={s.card}>
          <div style={s.cardHd}><span style={s.cardTitle}>🆕 Prontas pra virar repasse</span></div>
          <div style={{ padding: '10px 20px 16px' }}>
            {prontos.map(pr => (
              <div key={pr.motoboy_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F0EDE8', gap: 10 }}>
                <div style={{ fontSize: 13 }}><b>{pr.motoboy_name}</b> — {pr.count} entrega{pr.count > 1 ? 's' : ''} · {brl(pr.valor)}</div>
                <button style={s.btnSave} disabled={busyId === pr.motoboy_id} onClick={() => gerarRepasse(pr.motoboy_id)}>{busyId === pr.motoboy_id ? 'Gerando...' : '+ Gerar repasse'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={s.card}>
        <div style={s.cardHd}>
          <span style={s.cardTitle}>💸 Repasses aos motoboys</span>
          <button style={s.btnLink} onClick={exportarCsv}>⬇️ Exportar CSV</button>
        </div>
        <div style={s.filters}>
          <select style={s.select} value={fMotoboy} onChange={e => setFMotoboy(e.target.value)}>
            <option value="todos">Todos os motoboys</option>
            {motoboys.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select style={s.select} value={fPeriodo} onChange={e => setFPeriodo(e.target.value)}>
            <option value="tudo">Tudo</option>
            <option value="semana">Essa semana</option>
            <option value="mes">Esse mês</option>
          </select>
          <select style={s.select} value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="atrasado">Atrasado</option>
            <option value="pago">Pago</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table className="data-table">
            <thead><tr><th>Motoboy</th><th>Período</th><th>Entregas</th><th>Valor</th><th>Chave Pix</th><th>Status</th><th>Comprovante</th><th></th></tr></thead>
            <tbody>
              {filtrados.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#999', padding: 24 }}>Nenhum repasse encontrado.</td></tr>}
              {filtrados.map(p => {
                const atrasado = isAtrasado(p)
                return (
                  <tr key={p.id}>
                    <td><b>{p.motoboy_name}</b></td>
                    <td>{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.entregas_count}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{brl(p.valor)}</td>
                    <td>
                      {p.pix_key ? (
                        <div style={s.pixCell}>{p.pix_key}<button style={s.pixCopy} onClick={() => copyPix(p)}>{copiedId === p.id ? '✓' : 'copiar'}</button></div>
                      ) : <span style={{ color: '#999' }}>—</span>}
                    </td>
                    <td>
                      {p.status === 'pago'
                        ? <span style={s.badge('#E4F3EC', '#157A52')}>Pago em {p.paid_at ? fmtDate(p.paid_at.slice(0, 10)) : ''}</span>
                        : atrasado ? <span style={s.badge('#FBEAEA', '#C43D3D')}>Atrasado</span> : <span style={s.badge('#FEF3E2', '#92600A')}>Pendente</span>}
                    </td>
                    <td>
                      {p.comprovante_url ? (
                        <span style={{ cursor: 'pointer', fontSize: 18 }} title="Ver comprovante" onClick={() => setLightbox({ url: p.comprovante_url!, title: `Comprovante — ${p.motoboy_name}, ${fmtDate(p.period_start)} a ${fmtDate(p.period_end)}` })}>🧾</span>
                      ) : (
                        <label style={{ ...s.btnGhostSm, display: 'inline-block' }}>
                          📎 Anexar
                          <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) anexarComprovante(p.id, f) }} />
                        </label>
                      )}
                    </td>
                    <td>
                      {p.status === 'pago'
                        ? <span style={{ color: '#999', fontSize: 11 }}>só você vê</span>
                        : <button style={s.btnSave} disabled={busyId === p.id} onClick={() => marcarPago(p.id)}>{busyId === p.id ? '...' : 'Marcar pago'}</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {lightbox && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,18,16,.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setLightbox(null) }}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 480, width: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #F0EDE8' }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{lightbox.title}</span>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }} onClick={() => setLightbox(null)}>✕</button>
            </div>
            <div style={{ background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              {lightbox.url.split('?')[0].endsWith('.pdf')
                ? <a href={lightbox.url} target="_blank" rel="noreferrer" style={{ padding: 20, fontSize: 13, fontWeight: 700, color: 'var(--sign-dark)' }}>⬇️ Abrir comprovante (PDF)</a>
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={lightbox.url} alt="Comprovante" style={{ width: '100%', maxHeight: 480, objectFit: 'contain' }} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
