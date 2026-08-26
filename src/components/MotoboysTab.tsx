'use client'
import { useEffect, useRef, useState } from 'react'

interface Motoboy {
  id: string; name: string; phone: string; address: string | null; cpf: string | null
  cnh_photo_url: string | null; pix_key: string | null; pix_key_type: string | null
  active: boolean; created_at: string
}

const s: Record<string, any> = {
  card: { background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  cardTitle: { fontSize: 11, fontWeight: 700, color: 'var(--sign-dark)', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6, marginTop: 12 },
  input: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  select: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  btnPrimary: { width: '100%', background: 'var(--sign)', color: 'var(--ink)', border: 'none', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 16 },
  btnCam: { display: 'flex', alignItems: 'center', gap: 10, background: '#f9f9f9', border: '1.5px dashed #d8d8d8', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#555', cursor: 'pointer', width: '100%' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderBottom: '1px solid #F0EDE8' },
  name: { fontSize: 14, fontWeight: 700, color: '#111' },
  sub: { fontSize: 12, color: '#888', marginTop: 2 },
  pill: (on: boolean) => ({ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: 'none', background: on ? '#E4F3EC' : '#FBEAEA', color: on ? '#157A52' : '#C43D3D' }),
}

const EMPTY_FORM = { name: '', phone: '', address: '', cpf: '', pix_key: '', pix_key_type: 'celular' }

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function MotoboysTab() {
  const [motoboys, setMotoboys] = useState<Motoboy[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [cnhPhoto, setCnhPhoto] = useState<string | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/motoboys')
    const data = await res.json()
    setMotoboys(data.motoboys || [])
    setLoading(false)
  }

  async function onPickCnhPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCnhPhoto(await readFileAsBase64(file))
  }

  async function cadastrar() {
    setError('')
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim() || !form.cpf.trim() || !cnhPhoto) {
      return setError('Nome, WhatsApp, endereço, CPF e foto da CNH são obrigatórios.')
    }
    setSaving(true)
    const res = await fetch('/api/motoboys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', ...form, cnh_photo_base64: cnhPhoto }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) return setError(data.error)
    setForm(EMPTY_FORM)
    setCnhPhoto(null)
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
        <label style={s.label}>Endereço</label>
        <input style={s.input} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Rua, número, bairro" />
        <label style={s.label}>CPF</label>
        <input style={s.input} value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} placeholder="Só números" />

        <label style={s.label}>Foto da CNH</label>
        <input type="file" accept="image/*" capture="environment" ref={fileInputRef} style={{ display: 'none' }} onChange={onPickCnhPhoto} />
        <button type="button" style={s.btnCam} onClick={() => fileInputRef.current?.click()}>
          📷 {cnhPhoto ? 'Foto capturada — trocar' : 'Abrir câmera e tirar foto'}
        </button>
        {cnhPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cnhPhoto} alt="Foto da CNH" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 10, marginTop: 8, border: '1px solid #eee' }} />
        )}

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {m.cnh_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.cnh_photo_url} alt="CNH" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', border: '1px solid #eee' }} />
              ) : (
                <div style={{ width: 42, height: 42, borderRadius: 8, background: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏍️</div>
              )}
              <div>
                <div style={s.name}>{m.name}</div>
                <div style={s.sub}>{m.phone} {m.pix_key && `· Pix: ${m.pix_key}`}</div>
                {m.address && <div style={s.sub}>{m.address}</div>}
              </div>
            </div>
            <button style={s.pill(m.active)} onClick={() => toggle(m)}>{m.active ? 'Disponível' : 'Desativado'}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
