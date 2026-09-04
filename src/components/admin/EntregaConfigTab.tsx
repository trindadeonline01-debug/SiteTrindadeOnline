'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Pricing {
  diaria_util: number; diaria_fds: number; diaria_feriado: number
  entrega_util: number; entrega_fds: number; entrega_feriado: number
  pacote_dias: number; pacote_desconto: number
}
interface Feriado { id: string; data: string; nome: string }

const s: Record<string, any> = {
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardHd: { padding: '15px 20px', borderBottom: '1px solid #F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { fontSize: 12.5, fontWeight: 800, color: '#111' },
  cardHint: { fontSize: 11, color: '#999' },
  cardBody: { padding: 18 },
  cardFoot: { padding: '13px 20px', borderTop: '1px solid #F0EDE8', display: 'flex', justifyContent: 'flex-end', gap: 8 },
  priceRow: { display: 'grid', gridTemplateColumns: '26px 1fr 130px', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #F0EDE8' },
  priceLabel: { fontSize: 12.5, fontWeight: 700 },
  priceSub: { fontSize: 10.5, color: '#999' },
  priceInputWrap: { display: 'flex', alignItems: 'center', gap: 4, background: '#FAFAF8', border: '1.5px solid #E0DDD8', borderRadius: 9, padding: '7px 10px' },
  priceInput: { border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#111', width: 70, outline: 'none' },
  btnSave: { background: 'var(--sign)', color: 'var(--ink)', border: 'none', padding: '9px 18px', borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  btnGhost: { background: '#fff', color: '#111', border: '1.5px solid #E0DDD8', padding: '9px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  holRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #F0EDE8', fontSize: 12.5 },
  holDate: { fontWeight: 800, width: 56, flex: 'none', color: 'var(--sign-dark)' },
  holName: { flex: 1 },
  holDel: { background: 'none', border: 'none', color: '#C43D3D', fontSize: 15, cursor: 'pointer', padding: '2px 6px' },
}

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }

export default function EntregaConfigTab() {
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [savingDiaria, setSavingDiaria] = useState(false)
  const [savingEntrega, setSavingEntrega] = useState(false)
  const [savingPacote, setSavingPacote] = useState(false)
  const [msg, setMsg] = useState('')
  const [novaData, setNovaData] = useState('')
  const [novoNome, setNovoNome] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [precoRes, ferRes] = await Promise.all([
      fetch('/api/admin/entrega-pricing').then(r => r.json()),
      fetch('/api/admin/entrega-feriados').then(r => r.json()),
    ])
    setPricing(precoRes.pricing)
    setFeriados(ferRes.feriados || [])
  }

  async function salvar(fields: Partial<Pricing>, setSaving: (b: boolean) => void) {
    setSaving(true); setMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/entrega-pricing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, ...fields }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) { setMsg(data.error); return }
    setMsg('Salvo!')
    setTimeout(() => setMsg(''), 2000)
    load()
  }

  async function addFeriado() {
    if (!novaData || !novoNome.trim()) return
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/admin/entrega-feriados', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, data: novaData, nome: novoNome.trim() }),
    })
    setNovaData(''); setNovoNome('')
    load()
  }

  async function delFeriado(id: string) {
    const { data: { session } } = await supabase.auth.getSession()
    setFeriados(prev => prev.filter(f => f.id !== id))
    await fetch('/api/admin/entrega-feriados', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, id }),
    })
  }

  if (!pricing) return <div style={{ color: '#888', fontSize: 13 }}>Carregando...</div>

  const p = pricing
  const set = (patch: Partial<Pricing>) => setPricing({ ...p, ...patch })

  return (
    <div>
      {msg && <div style={{ marginBottom: 14, fontSize: 12.5, fontWeight: 700, color: msg === 'Salvo!' ? '#157A52' : '#C43D3D' }}>{msg}</div>}

      <div style={s.grid2}>
        <div style={s.card}>
          <div style={s.cardHd}><span style={s.cardTitle}>💳 Preço da diária</span><span style={s.cardHint}>liberar o dia pra chamar motoboy</span></div>
          <div style={s.cardBody}>
            <div style={s.priceRow}>
              <span /><span><div style={s.priceLabel}>Dias úteis</div><div style={s.priceSub}>segunda a sexta</div></span>
              <span style={s.priceInputWrap}><span>R$</span><input style={s.priceInput} type="number" step="0.01" value={p.diaria_util} onChange={e => set({ diaria_util: Number(e.target.value) })} /></span>
            </div>
            <div style={s.priceRow}>
              <span /><span><div style={s.priceLabel}>Fim de semana</div><div style={s.priceSub}>sábado e domingo</div></span>
              <span style={s.priceInputWrap}><span>R$</span><input style={s.priceInput} type="number" step="0.01" value={p.diaria_fds} onChange={e => set({ diaria_fds: Number(e.target.value) })} /></span>
            </div>
            <div style={{ ...s.priceRow, borderBottom: 'none' }}>
              <span /><span><div style={s.priceLabel}>Feriados</div><div style={s.priceSub}>ver lista ao lado →</div></span>
              <span style={s.priceInputWrap}><span>R$</span><input style={s.priceInput} type="number" step="0.01" value={p.diaria_feriado} onChange={e => set({ diaria_feriado: Number(e.target.value) })} /></span>
            </div>
          </div>
          <div style={s.cardFoot}>
            <button style={s.btnSave} disabled={savingDiaria} onClick={() => salvar({ diaria_util: p.diaria_util, diaria_fds: p.diaria_fds, diaria_feriado: p.diaria_feriado }, setSavingDiaria)}>
              {savingDiaria ? 'Salvando...' : 'Salvar diária'}
            </button>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardHd}><span style={s.cardTitle}>🏍️ Preço por entrega</span><span style={s.cardHint}>consumido a cada corrida concluída</span></div>
          <div style={s.cardBody}>
            <div style={s.priceRow}>
              <span /><span><div style={s.priceLabel}>Dias úteis</div><div style={s.priceSub}>segunda a sexta</div></span>
              <span style={s.priceInputWrap}><span>R$</span><input style={s.priceInput} type="number" step="0.01" value={p.entrega_util} onChange={e => set({ entrega_util: Number(e.target.value) })} /></span>
            </div>
            <div style={s.priceRow}>
              <span /><span><div style={s.priceLabel}>Fim de semana</div><div style={s.priceSub}>sábado e domingo</div></span>
              <span style={s.priceInputWrap}><span>R$</span><input style={s.priceInput} type="number" step="0.01" value={p.entrega_fds} onChange={e => set({ entrega_fds: Number(e.target.value) })} /></span>
            </div>
            <div style={{ ...s.priceRow, borderBottom: 'none' }}>
              <span /><span><div style={s.priceLabel}>Feriados</div><div style={s.priceSub}>ver lista ao lado →</div></span>
              <span style={s.priceInputWrap}><span>R$</span><input style={s.priceInput} type="number" step="0.01" value={p.entrega_feriado} onChange={e => set({ entrega_feriado: Number(e.target.value) })} /></span>
            </div>
          </div>
          <div style={s.cardFoot}>
            <button style={s.btnSave} disabled={savingEntrega} onClick={() => salvar({ entrega_util: p.entrega_util, entrega_fds: p.entrega_fds, entrega_feriado: p.entrega_feriado }, setSavingEntrega)}>
              {savingEntrega ? 'Salvando...' : 'Salvar entrega'}
            </button>
          </div>
        </div>
      </div>

      <div style={s.grid2}>
        <div style={s.card}>
          <div style={s.cardHd}><span style={s.cardTitle}>📦 Pacote semanal com desconto</span><span style={s.cardHint}>contratar vários dias de diária de uma vez</span></div>
          <div style={s.cardBody}>
            <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 5 }}>Dias no pacote</div>
                <span style={s.priceInputWrap}><input style={{ ...s.priceInput, width: 40 }} type="number" value={p.pacote_dias} onChange={e => set({ pacote_dias: Number(e.target.value) })} /></span>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 5 }}>Desconto (R$ fixo)</div>
                <span style={s.priceInputWrap}><span>R$</span><input style={s.priceInput} type="number" step="0.01" value={p.pacote_desconto} onChange={e => set({ pacote_desconto: Number(e.target.value) })} /></span>
              </div>
            </div>
            <div style={{ background: '#E4F3EC', border: '1px dashed #157A52', borderRadius: 10, padding: '12px 14px', fontSize: 12, lineHeight: 1.6 }}>
              Empresa contrata <b>{p.pacote_dias} diárias</b> de uma vez → <span style={{ textDecoration: 'line-through', color: '#999' }}>{fmt(p.diaria_util * p.pacote_dias)}</span> <b style={{ color: '#157A52' }}>{fmt(Math.max(0, p.diaria_util * p.pacote_dias - p.pacote_desconto))}</b>
              <br />({p.pacote_dias} × {fmt(p.diaria_util)} de dia útil − {fmt(p.pacote_desconto)} de desconto)
            </div>
          </div>
          <div style={s.cardFoot}>
            <button style={s.btnSave} disabled={savingPacote} onClick={() => salvar({ pacote_dias: p.pacote_dias, pacote_desconto: p.pacote_desconto }, setSavingPacote)}>
              {savingPacote ? 'Salvando...' : 'Salvar pacote'}
            </button>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardHd}><span style={s.cardTitle}>📅 Feriados cadastrados</span><span style={s.cardHint}>pra saber quando cobrar o preço de feriado</span></div>
          <div style={s.cardBody}>
            {feriados.length === 0 && <div style={{ color: '#999', fontSize: 12.5 }}>Nenhum feriado cadastrado ainda.</div>}
            {feriados.map(f => (
              <div key={f.id} style={s.holRow}>
                <span style={s.holDate}>{f.data.split('-').reverse().slice(0, 2).join('/')}</span>
                <span style={s.holName}>{f.nome}</span>
                <button style={s.holDel} onClick={() => delFeriado(f.id)}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input type="date" style={{ ...s.priceInputWrap, flex: 'none', width: 140 } as any} value={novaData} onChange={e => setNovaData(e.target.value)} />
              <input placeholder="Nome do feriado" style={{ flex: 1, minWidth: 0, border: '1.5px solid #E0DDD8', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 12 }} value={novoNome} onChange={e => setNovoNome(e.target.value)} />
              <button style={s.btnGhost} onClick={addFeriado}>+ Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
