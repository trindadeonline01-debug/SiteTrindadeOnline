'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Status = 'aguardando_aprovacao' | 'aprovado' | 'pendencia' | 'standby' | 'recusado'

interface PendingFlag { key: string; label: string; reason: string }
interface TermsInfo {
  nome_digitado: string; accepted_at: string; ip_address: string; user_agent: string; terms_version: string; pdf_url: string | null
}
interface Motoboy {
  id: string; name: string; phone: string; address: string | null; cpf: string | null
  cnh_photo_url: string | null; moto_frente_photo_url: string | null; moto_tras_photo_url: string | null
  documento_moto_photo_url: string | null; selfie_photo_url: string | null
  pix_key: string | null; pix_key_type: string | null; status: Status
  active: boolean; available: boolean; created_at: string; terms: TermsInfo | null
  entregas_semana: number; a_receber: number; ja_recebido: number
}

const s: Record<string, any> = {
  card: { background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  cardTitle: { fontSize: 11, fontWeight: 700, color: 'var(--sign-dark)', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 18 },
  cardHeadRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' as const, gap: 10 },
  label: { fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6, marginTop: 12 },
  input: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  select: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  btnPrimary: { width: '100%', background: 'var(--sign)', color: 'var(--ink)', border: 'none', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 16 },
  btnCam: { display: 'flex', alignItems: 'center', gap: 10, background: '#f9f9f9', border: '1.5px dashed #d8d8d8', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#555', cursor: 'pointer', width: '100%' },
  row: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 0', borderBottom: '1px solid #F0EDE8', flexWrap: 'wrap' as const },
  name: { fontSize: 14, fontWeight: 700, color: '#111' },
  sub: { fontSize: 12, color: '#888', marginTop: 2 },
  pill: (on: boolean) => ({ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase' as const, padding: '4px 10px', borderRadius: 20, background: on ? '#E4F3EC' : '#F1EFEA', color: on ? '#157A52' : '#8A8681' }),
  badge: (bg: string, fg: string) => ({ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, padding: '3px 9px', borderRadius: 20, background: bg, color: fg }),
  photoRow: { display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' as const },
  photoThumb: { width: 48, height: 48, borderRadius: 8, background: '#fff', border: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer', overflow: 'hidden' },
  actionsCol: { display: 'flex', flexDirection: 'column' as const, gap: 6, alignItems: 'flex-end', flex: 'none' },
  btnApprove: { background: '#157A52', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnReject: { background: '#fff', color: '#C43D3D', border: '1.5px solid #FBEAEA', padding: '8px 14px', borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnGhostSm: { background: '#fff', color: '#111', border: '1.5px solid #E0DDD8', padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnDark: { background: 'var(--ink)', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  pendBox: { marginTop: 10, background: '#FBEAEA', border: '1px dashed #C43D3D', borderRadius: 10, padding: '10px 12px' },
  pendItem: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, padding: '4px 0' },
  statTiles: { display: 'flex', gap: 18, marginTop: 12 },
  statNum: { fontSize: 15, fontWeight: 800, color: '#111' },
  statLabel: { fontSize: 9.5, fontWeight: 700, color: '#999', textTransform: 'uppercase' as const, letterSpacing: 0.4, marginTop: 2 },
}

const EMPTY_FORM = { name: '', phone: '', address: '', cpf: '', pix_key: '', pix_key_type: 'celular', active: true }
const PHOTO_FIELDS: { key: string; label: string; icon: string }[] = [
  { key: 'cnh_photo_url', label: 'CNH', icon: '🪪' },
  { key: 'documento_moto_photo_url', label: 'Documento da moto', icon: '📄' },
  { key: 'moto_frente_photo_url', label: 'Moto — frente', icon: '🏍️' },
  { key: 'moto_tras_photo_url', label: 'Moto — trás (placa)', icon: '🔢' },
  { key: 'selfie_photo_url', label: 'Selfie', icon: '🤳' },
]

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function brl(n: number): string {
  return `R$ ${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default function MotoboysTab() {
  const [motoboys, setMotoboys] = useState<Motoboy[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [cnhPhoto, setCnhPhoto] = useState<string | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [lightbox, setLightbox] = useState<{ url: string | null; label: string } | null>(null)
  const [flagged, setFlagged] = useState<Record<string, Record<string, PendingFlag>>>({}) // motoboyId -> key -> flag
  const [flagging, setFlagging] = useState<{ motoboyId: string; key: string; label: string; reason: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [editCnhPhoto, setEditCnhPhoto] = useState<string | null>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [cadastroLink, setCadastroLink] = useState('https://www.trindadeonline.com.br/motoboy/cadastro')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    load()
    setCadastroLink(`${window.location.origin}/motoboy/cadastro`)
  }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { token: session?.access_token }
  }

  async function load() {
    setLoading(true)
    const { token } = await authHeader()
    const res = await fetch('/api/motoboys', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const data = await res.json()
    setMotoboys(data.motoboys || [])
    setLoading(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(cadastroLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  function shareLinkWhatsApp() {
    const msg = `🏍️ Quer ser motoboy parceiro da Trindade Online? Faz seu cadastro completo aqui: ${cadastroLink}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  async function onPickCnhPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCnhPhoto(await readFileAsBase64(file))
  }
  async function onPickEditCnhPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEditCnhPhoto(await readFileAsBase64(file))
  }

  async function cadastrar() {
    setError('')
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim() || !form.cpf.trim() || !cnhPhoto) {
      return setError('Nome, WhatsApp, endereço, CPF e foto da CNH são obrigatórios.')
    }
    setSaving(true)
    const { token } = await authHeader()
    const res = await fetch('/api/motoboys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', access_token: token, ...form, cnh_photo_base64: cnhPhoto }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) return setError(data.error)
    setForm(EMPTY_FORM)
    setCnhPhoto(null)
    setShowCreate(false)
    load()
  }

  function startEdit(m: Motoboy) {
    setEditingId(m.id)
    setEditError('')
    setEditCnhPhoto(null)
    setEditForm({
      name: m.name, phone: m.phone, address: m.address || '', cpf: m.cpf || '',
      pix_key: m.pix_key || '', pix_key_type: m.pix_key_type || 'celular', active: m.active,
    })
  }

  async function saveEdit(id: string) {
    setEditError('')
    if (!editForm.name.trim() || !editForm.phone.trim()) {
      return setEditError('Nome e WhatsApp são obrigatórios.')
    }
    setEditSaving(true)
    const { token } = await authHeader()
    const res = await fetch('/api/motoboys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', access_token: token, id, ...editForm, cnh_photo_base64: editCnhPhoto || undefined }),
    })
    const data = await res.json()
    setEditSaving(false)
    if (data.error) return setEditError(data.error)
    setEditingId(null)
    load()
  }

  function flagsFor(motoboyId: string): PendingFlag[] {
    return Object.values(flagged[motoboyId] || {})
  }

  function confirmFlag() {
    if (!flagging) return
    setFlagged(prev => ({
      ...prev,
      [flagging.motoboyId]: { ...(prev[flagging.motoboyId] || {}), [flagging.key]: { key: flagging.key, label: flagging.label, reason: flagging.reason || 'sem motivo informado' } },
    }))
    setFlagging(null)
    setLightbox(null)
  }
  function unflag(motoboyId: string, key: string) {
    setFlagged(prev => {
      const next = { ...(prev[motoboyId] || {}) }
      delete next[key]
      return { ...prev, [motoboyId]: next }
    })
  }

  async function approve(m: Motoboy) {
    setBusyId(m.id)
    const { token } = await authHeader()
    const flags = flagsFor(m.id)
    await fetch('/api/motoboys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', access_token: token, id: m.id, flagged: flags }),
    })
    setFlagged(prev => ({ ...prev, [m.id]: {} }))
    setBusyId(null)
    load()
  }
  async function sendPendencias(m: Motoboy) {
    const flags = flagsFor(m.id)
    if (!flags.length) return
    setBusyId(m.id)
    const { token } = await authHeader()
    await fetch('/api/motoboys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_pendencias', access_token: token, id: m.id, flagged: flags }),
    })
    setFlagged(prev => ({ ...prev, [m.id]: {} }))
    setBusyId(null)
    load()
  }
  async function reject(m: Motoboy) {
    if (!confirm(`Recusar o cadastro de ${m.name}?`)) return
    setBusyId(m.id)
    const { token } = await authHeader()
    await fetch('/api/motoboys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', access_token: token, id: m.id }),
    })
    setBusyId(null)
    load()
  }

  const aguardando = motoboys.filter(m => m.status === 'aguardando_aprovacao')
  const standby = motoboys.filter(m => m.status === 'standby')
  const aprovados = motoboys.filter(m => m.status === 'aprovado' || m.status === 'pendencia')

  function renderPhotoRow(m: Motoboy, editable: boolean) {
    const flags = flagged[m.id] || {}
    return (
      <div style={s.photoRow}>
        {PHOTO_FIELDS.map(pf => {
          const url = (m as any)[pf.key] as string | null
          const isFlagged = !!flags[pf.key]
          return (
            <div key={pf.key} title={pf.label}
              style={{ ...s.photoThumb, borderColor: isFlagged ? '#C43D3D' : '#eee', borderWidth: isFlagged ? 2 : 1, position: 'relative' }}
              onClick={() => {
                setLightbox({ url, label: pf.label })
                if (editable) setFlagging({ motoboyId: m.id, key: pf.key, label: pf.label, reason: flags[pf.key]?.reason || '' })
              }}>
              {url ? <img src={url} alt={pf.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : pf.icon}
              {isFlagged && <span style={{ position: 'absolute', top: -4, right: -4, background: '#C43D3D', color: '#fff', width: 15, height: 15, borderRadius: '50%', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🚩</span>}
            </div>
          )
        })}
      </div>
    )
  }

  function renderCreateOrEditFields(f: typeof EMPTY_FORM, setF: (fn: (f: typeof EMPTY_FORM) => typeof EMPTY_FORM) => void, photo: string | null, onPickPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void, inputRef: React.RefObject<HTMLInputElement | null>, showActiveToggle: boolean) {
    return (
      <>
        <label style={s.label}>Nome</label>
        <input style={s.input} value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} placeholder="Ex: Zezinho" />
        <label style={s.label}>WhatsApp</label>
        <input style={s.input} value={f.phone} onChange={e => setF(x => ({ ...x, phone: e.target.value }))} placeholder="21 99999-9999" />
        <label style={s.label}>Endereço</label>
        <input style={s.input} value={f.address} onChange={e => setF(x => ({ ...x, address: e.target.value }))} placeholder="Rua, número, bairro" />
        <label style={s.label}>CPF</label>
        <input style={s.input} value={f.cpf} onChange={e => setF(x => ({ ...x, cpf: e.target.value }))} placeholder="Só números" />

        <label style={s.label}>Foto da CNH {photo === null && '(deixe em branco pra manter a atual)'}</label>
        <input type="file" accept="image/*" capture="environment" ref={inputRef} style={{ display: 'none' }} onChange={onPickPhoto} />
        <button type="button" style={s.btnCam} onClick={() => inputRef.current?.click()}>
          📷 {photo ? 'Foto capturada — trocar' : 'Abrir câmera e tirar foto'}
        </button>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Foto da CNH" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 10, marginTop: 8, border: '1px solid #eee' }} />
        )}

        <label style={s.label}>Chave Pix</label>
        <input style={s.input} value={f.pix_key} onChange={e => setF(x => ({ ...x, pix_key: e.target.value }))} placeholder="CPF, celular, e-mail ou aleatória" />
        <label style={s.label}>Tipo da chave</label>
        <select style={s.select} value={f.pix_key_type} onChange={e => setF(x => ({ ...x, pix_key_type: e.target.value }))}>
          <option value="celular">Celular</option>
          <option value="cpf">CPF</option>
          <option value="email">E-mail</option>
          <option value="aleatoria">Chave aleatória</option>
        </select>

        {showActiveToggle && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 12.5, fontWeight: 600, color: '#555', cursor: 'pointer' }}>
            <input type="checkbox" checked={f.active} onChange={e => setF(x => ({ ...x, active: e.target.checked }))} />
            Motoboy ativo no sistema (desmarque pra bloquear novas chamadas mesmo se ele estiver disponível)
          </label>
        )}
      </>
    )
  }

  return (
    <div>
      <div style={s.card}>
        <div style={s.cardTitle}>🔗 Cadastro de motoboy</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <input readOnly style={{ ...s.input, flex: '1 1 260px', color: '#666' }} value={cadastroLink} onClick={e => (e.target as HTMLInputElement).select()} />
          <button style={s.btnGhostSm} onClick={copyLink}>{copied ? '✓ Copiado!' : '📋 Copiar link'}</button>
          <button style={{ ...s.btnDark, background: '#157A52' }} onClick={shareLinkWhatsApp}>📱 Enviar por WhatsApp</button>
        </div>
        <div style={{ fontSize: 11.5, color: '#999', marginTop: 10 }}>manda esse link pro motoboy — ele preenche os dados dele, você só aprova</div>
      </div>

      {aguardando.length > 0 && (
        <div style={s.card}>
          <div style={s.cardTitle}>⏳ Aguardando aprovação ({aguardando.length})</div>
          {aguardando.map(m => {
            const flags = flagsFor(m.id)
            return (
              <div key={m.id} style={s.row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.name}>{m.name} <span style={{ ...s.badge('#E4F3EC', '#157A52'), marginLeft: 6 }}>✓ WhatsApp verificado</span></div>
                  <div style={s.sub}>📱 {m.phone} · CPF {m.cpf} {m.pix_key && `· Pix: ${m.pix_key}`}</div>
                  {m.address && <div style={s.sub}>📍 {m.address}</div>}
                  {renderPhotoRow(m, true)}
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 6 }}>🔍 clica numa foto pra ver em tamanho real e, se precisar, marcar como pendência</div>
                  {flags.length > 0 && (
                    <div style={s.pendBox}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#C43D3D', textTransform: 'uppercase', marginBottom: 4 }}>🚩 Pendências marcadas</div>
                      {flags.map(f => (
                        <div key={f.key} style={s.pendItem}>
                          <span><b style={{ color: '#C43D3D' }}>{f.label}</b> — {f.reason}</span>
                          <button style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }} onClick={() => unflag(m.id, f.key)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.terms && (
                    <button style={{ ...s.btnGhostSm, marginTop: 8 }} onClick={() => setLightbox({ url: m.terms!.pdf_url, label: `Termo assinado — ${m.terms!.nome_digitado}` })}>📄 Ver termo assinado</button>
                  )}
                </div>
                <div style={s.actionsCol}>
                  <button style={s.btnApprove} disabled={busyId === m.id} onClick={() => approve(m)}>{flags.length ? `✅ Aprovar c/ pendência (${flags.length})` : '✅ Aprovar'}</button>
                  {flags.length > 0 && <button style={{ ...s.btnGhostSm, borderColor: '#C43D3D', color: '#C43D3D' }} disabled={busyId === m.id} onClick={() => sendPendencias(m)}>📲 Enviar pendências</button>}
                  <button style={s.btnReject} disabled={busyId === m.id} onClick={() => reject(m)}>✕ Recusar tudo</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {standby.length > 0 && (
        <div style={s.card}>
          <div style={s.cardTitle}>⏳ Em espera — aguardando o motoboy ajustar ({standby.length})</div>
          {standby.map(m => (
            <div key={m.id} style={s.row}>
              <div style={{ flex: 1 }}>
                <div style={s.name}>{m.name}</div>
                <div style={s.sub}>📱 {m.phone}</div>
                <div style={{ ...s.pendBox, marginTop: 8 }}>
                  {(m as any).pending_flags?.map((f: PendingFlag) => (
                    <div key={f.key} style={s.pendItem}><span><b style={{ color: '#C43D3D' }}>{f.label}</b> — {f.reason}</span></div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={s.card}>
        <div style={s.cardHeadRow}>
          <div style={{ ...s.cardTitle, marginBottom: 0 }}>🏍️ Motoboys aprovados ({aprovados.length})</div>
          <button style={s.btnDark} onClick={() => { setShowCreate(v => !v); setError('') }}>{showCreate ? '✕ Fechar' : '+ Cadastrar na mão'}</button>
        </div>

        {showCreate && (
          <div style={{ background: '#FAFAF8', border: '1px solid #F0EDE8', borderRadius: 12, padding: 18, marginBottom: 20 }}>
            {renderCreateOrEditFields(form, setForm, cnhPhoto, onPickCnhPhoto, fileInputRef, false)}
            {error && <div style={{ color: '#C43D3D', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
            <button style={s.btnPrimary} disabled={saving} onClick={cadastrar}>{saving ? 'Cadastrando...' : '+ Cadastrar motoboy'}</button>
          </div>
        )}

        {loading && <div style={{ color: '#888', fontSize: 13 }}>Carregando...</div>}
        {!loading && aprovados.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Nenhum motoboy aprovado ainda.</div>}
        {aprovados.map(m => (
          <div key={m.id}>
            <div style={s.row}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: '1 1 260px', minWidth: 0 }}>
                {m.cnh_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.cnh_photo_url} alt="CNH" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', border: '1px solid #eee', flex: 'none' }} />
                ) : (
                  <div style={{ width: 42, height: 42, borderRadius: 8, background: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flex: 'none' }}>🏍️</div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={s.name}>
                    {m.name}{' '}
                    <span style={s.pill(m.available)}>{m.available ? 'Disponível' : 'Ausente'}</span>
                    {m.status === 'pendencia' && <span style={{ ...s.badge('#FEF3E2', '#92600A'), marginLeft: 6 }}>pendência aberta</span>}
                    {!m.active && <span style={{ ...s.badge('#FBEAEA', '#C43D3D'), marginLeft: 6 }}>bloqueado</span>}
                  </div>
                  <div style={s.sub}>{m.phone} {m.pix_key && `· Pix: ${m.pix_key}`}</div>
                  {m.address && <div style={s.sub}>{m.address}</div>}
                  <div style={s.statTiles}>
                    <div><div style={s.statNum}>{m.entregas_semana}</div><div style={s.statLabel}>Entregas essa semana</div></div>
                    <div><div style={{ ...s.statNum, color: '#C97A0E' }}>{brl(m.a_receber)}</div><div style={s.statLabel}>A receber</div></div>
                    <div><div style={{ ...s.statNum, color: '#157A52' }}>{brl(m.ja_recebido)}</div><div style={s.statLabel}>Já recebido</div></div>
                  </div>
                </div>
              </div>
              <div style={s.actionsCol}>
                <button style={s.btnGhostSm} onClick={() => editingId === m.id ? setEditingId(null) : startEdit(m)}>{editingId === m.id ? '✕ Fechar' : '✎ Editar'}</button>
                {m.terms && <button style={s.btnGhostSm} onClick={() => setLightbox({ url: m.terms!.pdf_url, label: `Termo assinado — ${m.terms!.nome_digitado}` })}>📄 Termo assinado</button>}
              </div>
            </div>
            {editingId === m.id && (
              <div style={{ background: '#FAFAF8', border: '1px solid #F0EDE8', borderRadius: 12, padding: 18, marginBottom: 20 }}>
                {renderCreateOrEditFields(editForm, setEditForm, editCnhPhoto, onPickEditCnhPhoto, editFileInputRef, true)}
                {editError && <div style={{ color: '#C43D3D', fontSize: 12.5, marginTop: 10 }}>{editError}</div>}
                <button style={s.btnPrimary} disabled={editSaving} onClick={() => saveEdit(m.id)}>{editSaving ? 'Salvando...' : 'Salvar alterações'}</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {lightbox && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,18,16,.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setLightbox(null); setFlagging(null) } }}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 560, width: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #F0EDE8' }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{lightbox.label}</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {lightbox.url && !lightbox.label.startsWith('Termo assinado') && (
                  <a href={lightbox.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sign-dark)' }}>⛶ Ver em tamanho real</a>
                )}
                <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }} onClick={() => { setLightbox(null); setFlagging(null) }}>✕</button>
              </div>
            </div>
            <div style={{ aspectRatio: lightbox.url?.endsWith('.pdf') ? undefined : '4/3', background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
              {lightbox.url ? (
                lightbox.label.startsWith('Termo assinado')
                  ? <a href={lightbox.url} target="_blank" rel="noreferrer" style={{ padding: 20, fontSize: 13, fontWeight: 700, color: 'var(--sign-dark)' }}>⬇️ Abrir PDF do termo assinado</a>
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={lightbox.url} alt={lightbox.label} style={{ width: '100%', maxHeight: 480, objectFit: 'contain' }} />
              ) : <span style={{ padding: 30, color: '#999', fontSize: 12.5 }}>Sem arquivo</span>}
            </div>
            {flagging && (
              <div style={{ padding: 16 }}>
                <textarea placeholder="Por que essa foto não serve? Ex: Placa não está legível" value={flagging.reason}
                  onChange={e => setFlagging(f => f ? { ...f, reason: e.target.value } : f)}
                  style={{ width: '100%', minHeight: 56, border: '1.5px solid #E0DDD8', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: 12, marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...s.btnGhostSm, flex: 1 }} onClick={() => { setLightbox(null); setFlagging(null) }}>Fechar</button>
                  <button style={{ ...s.btnApprove, flex: 1 }} onClick={confirmFlag}>🚩 Marcar pendência</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
