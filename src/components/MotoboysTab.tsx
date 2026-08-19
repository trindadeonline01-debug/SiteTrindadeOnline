'use client'
import { useEffect, useState } from 'react'

interface Motoboy {
  id: string; name: string; phone: string; pix_key: string | null; pix_key_type: string | null
  active: boolean; created_at: string
}

const s: Record<string, any> = {
  card: { background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  cardTitle: { fontSize: 11, fontWeight: 700, color: '#C9951A', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6, marginTop: 12 },
  input: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  select: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  btnPrimary: { width: '100%', background: '#C9951A', color: '#111', border: 'none', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 16 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderBottom: '1px solid #F0EDE8' },
  name: { fontSize: 14, fontWeight: 700, color: '#111' },
  sub: { fontSize: 12, color: '#888', marginTop: 2 },
  pill: (on: boolean) => ({ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: 'none', background: on ? '#E4F3EC' : '#FBEAEA', color: on ? '#157A52' : '#C43D3D' }),
}

export default function MotoboysTab() {
  const [motoboys, setMotoboys] = useState<Motoboy[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', pix_key: '', pix_key_type: 'celular' })
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/motoboys')
    const data = await res.json()
    setMotoboys(data.motoboys || [])
    setLoading(false)
  }

  async function cadastrar() {
    setError('')
    if (!form.name.trim() || !form.phone.trim()) return setError('Preenche nome e telefone.')
    setSaving(true)
    const res = await fetch('/api/motoboys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', ...form }) })
    const data = await res.json()
    setSaving(false)
    if (data.error) return setError(data.error)
    setForm({ name: '', phone: '', pix_key: '', pix_key_type: 'celular' })
    load()
  }

  async function toggle(m: Motoboy) {
    setMotoboys(prev => prev.map(x => x.id === m.id ? { ...x, active: !x.active } : x))
    await fetch('/api/motoboys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle', id: m.id, active: !m.active }) })
  }

  return (
    <div>
      <div style={s.card}>
        <div style={s.cardTitle}>Cadastrar motoboy</div>
        <label style={s.label}>Nome</label>
        <input style={s.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Zezinho" />
        <label style={s.label}>WhatsApp</label>
        <input style={s.input} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="21 99999-9999" />
        <label style={s.label}>Chave Pix</label>
        <input style={s.input} value={form.pix_key} onChange={e => setForm(f => ({ ...f, pix_key: e.target.value }))} placeholder="CPF, celular, e-mail ou aleatória" />
        <label style={s.label}>Tipo da chave</label>
        <select style={s.select} value={form.pix_key_type} onChange={e => setForm(f => ({ ...f, pix_key_type: e.target.value }))}>
          <option value="celular">Celular</option>
          <option value="cpf">CPF</option>
          <option value="email">E-mail</option>
          <option value="aleatoria">Chave aleatória</option>
        </select>
        {error && <div style={{ color: '#C43D3D', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        <button style={s.btnPrimary} disabled={saving} onClick={cadastrar}>{saving ? 'Cadastrando...' : '+ Cadastrar motoboy'}</button>
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Motoboys ({motoboys.length})</div>
        {loading && <div style={{ color: '#888', fontSize: 13 }}>Carregando...</div>}
        {!loading && motoboys.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Nenhum motoboy cadastrado ainda.</div>}
        {motoboys.map(m => (
          <div key={m.id} style={s.row}>
            <div>
              <div style={s.name}>{m.name}</div>
              <div style={s.sub}>{m.phone} {m.pix_key && `· Pix: ${m.pix_key}`}</div>
            </div>
            <button style={s.pill(m.active)} onClick={() => toggle(m)}>{m.active ? 'Disponível' : 'Desativado'}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
