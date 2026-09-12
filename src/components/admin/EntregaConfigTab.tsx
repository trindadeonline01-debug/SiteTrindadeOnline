'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BAIRROS_SAO_GONCALO, normalizeBairro } from '@/lib/bairrosSaoGoncalo'

interface Pricing { diaria: number; entrega_taxa_metodo: 'bairro' | 'distancia'; entrega_taxa_padrao: number }
interface BairroRow { name: string; price: string; disabled: boolean }
interface KmTier { kmUntil: string; price: string }
interface Pacote { id: string; categoria: 'diaria' | 'entrega'; nome: string; quantidade: number; preco: number; ativo: boolean }

const s: Record<string, any> = {
  topRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 260px', gap: 16, marginBottom: 16, alignItems: 'start' },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 16 },
  cardHd: { padding: '15px 20px', borderBottom: '1px solid #F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  cardTitle: { fontSize: 12.5, fontWeight: 800, color: '#111' },
  cardHint: { fontSize: 11, color: '#999' },
  cardBody: { padding: 18 },
  cardFoot: { padding: '13px 20px', borderTop: '1px solid #F0EDE8', display: 'flex', justifyContent: 'flex-end', gap: 8 },
  priceRow: { display: 'grid', gridTemplateColumns: '1fr 130px', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #F0EDE8' },
  priceLabel: { fontSize: 12.5, fontWeight: 700 },
  priceSub: { fontSize: 10.5, color: '#999' },
  priceInputWrap: { display: 'flex', alignItems: 'center', gap: 4, background: '#FAFAF8', border: '1.5px solid #E0DDD8', borderRadius: 9, padding: '7px 10px' },
  priceInput: { border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#111', width: 70, outline: 'none' },
  btnSave: { background: 'var(--sign)', color: 'var(--ink)', border: 'none', padding: '9px 18px', borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  btnGhost: { background: '#fff', color: '#111', border: '1.5px solid #E0DDD8', padding: '9px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  methodTabs: { display: 'flex', gap: 8, marginBottom: 14 },
  methodTab: { flex: 1, padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E0DDD8', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' as const },
  methodTabOn: { background: '#111', color: 'var(--sign)', borderColor: '#111' },
  bairroToolbar: { marginBottom: 10 },
  bairroGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, maxHeight: 380, overflowY: 'auto' as const, paddingRight: 4 },
  bairroCell: { border: '1.5px solid #E0DDD8', borderRadius: 9, padding: '8px 10px' },
  bairroCellOff: { background: '#FBEAEA', borderColor: '#E4A3A3' },
  bairroCellName: { fontSize: 11, fontWeight: 700, marginBottom: 5 },
  bairroRow: { display: 'flex', gap: 6, alignItems: 'center' },
  bairroInput: { flex: 1, minWidth: 0, border: '1.5px solid #E0DDD8', borderRadius: 7, padding: '5px 7px', fontFamily: 'inherit', fontSize: 12 },
  offBtn: { background: '#fff', border: '1.5px solid #E0DDD8', borderRadius: 7, width: 26, height: 26, cursor: 'pointer', fontSize: 12, flex: 'none' as const },
  offBtnOn: { background: '#C43D3D', color: '#fff', borderColor: '#C43D3D' },
  kmRow: { display: 'grid', gridTemplateColumns: '1fr 110px 30px', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F0EDE8' },
  kmLabel: { fontSize: 12, color: '#555' },
  kmNum: { width: 46, border: '1.5px solid #E0DDD8', borderRadius: 7, padding: '5px 6px', fontFamily: 'inherit', fontSize: 12, textAlign: 'center' as const },
  pacoteItem: { padding: '10px 0', borderBottom: '1px solid #F0EDE8' },
  pacoteTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  pacoteMeta: { display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#6E6656', marginBottom: 6 },
  pacoteActions: { display: 'flex', gap: 6, flexWrap: 'wrap' as const },
  btnGhostSm: { background: '#fff', color: '#111', border: '1.5px solid #E0DDD8', padding: '5px 9px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  pacoteFormInput: { width: '100%', border: '1.5px solid #E0DDD8', borderRadius: 7, padding: '6px 8px', fontFamily: 'inherit', fontSize: 12, marginBottom: 6, boxSizing: 'border-box' as const },
}

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function parsePt(v: string) { return parseFloat((v || '0').replace(',', '.')) || 0 }
function fmtPt(n: number | null | undefined) { return n == null ? '' : String(n).replace('.', ',') }

function defaultKmTiers(): KmTier[] { return [{ kmUntil: '3', price: '' }, { kmUntil: '6', price: '' }] }

export default function EntregaConfigTab() {
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [savingDiaria, setSavingDiaria] = useState(false)
  const [savingEntrega, setSavingEntrega] = useState(false)
  const [msg, setMsg] = useState('')

  const [metodo, setMetodo] = useState<'bairro' | 'distancia'>('bairro')
  const [padraoInput, setPadraoInput] = useState('')
  const [bairroSearch, setBairroSearch] = useState('')
  const [bairros, setBairros] = useState<BairroRow[]>(BAIRROS_SAO_GONCALO.map(name => ({ name, price: '', disabled: false })))
  const [kmTiers, setKmTiers] = useState<KmTier[]>(defaultKmTiers())
  const [kmLastPrice, setKmLastPrice] = useState('')
  const [kmLastBlocked, setKmLastBlocked] = useState(false)

  const [pacotes, setPacotes] = useState<Pacote[]>([])
  const [novoPacote, setNovoPacote] = useState<{ categoria: 'diaria' | 'entrega'; nome: string; quantidade: string; preco: string } | null>(null)
  const [editPacote, setEditPacote] = useState<Record<string, { nome: string; quantidade: string; preco: string }>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const [precoRes, bairroRes, kmRes, pacoteRes] = await Promise.all([
      fetch('/api/admin/entrega-pricing').then(r => r.json()),
      fetch('/api/admin/entrega-bairros').then(r => r.json()),
      fetch('/api/admin/entrega-km-tiers').then(r => r.json()),
      fetch('/api/admin/entrega-pacotes').then(r => r.json()),
    ])
    const p: Pricing = precoRes.pricing
    setPricing(p)
    setMetodo(p?.entrega_taxa_metodo === 'distancia' ? 'distancia' : 'bairro')
    setPadraoInput(fmtPt(p?.entrega_taxa_padrao))

    const bairroRows = bairroRes.bairros || []
    setBairros(BAIRROS_SAO_GONCALO.map(name => {
      const row = bairroRows.find((r: any) => normalizeBairro(r.bairro) === normalizeBairro(name))
      return { name, price: row?.price != null && !row.disabled ? fmtPt(Number(row.price)) : '', disabled: row?.disabled || false }
    }))

    const tierRows = kmRes.tiers || []
    const finitos = tierRows.filter((t: any) => t.km_until != null)
    const ultimo = tierRows.find((t: any) => t.km_until == null)
    if (finitos.length) setKmTiers(finitos.map((t: any) => ({ kmUntil: String(t.km_until), price: t.price != null ? fmtPt(Number(t.price)) : '' })))
    if (ultimo) { setKmLastBlocked(!!ultimo.blocked); setKmLastPrice(ultimo.price != null ? fmtPt(Number(ultimo.price)) : '') }

    setPacotes(pacoteRes.pacotes || [])
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function salvarDiaria() {
    if (!pricing) return
    setSavingDiaria(true); setMsg('')
    const access_token = await getToken()
    const res = await fetch('/api/admin/entrega-pricing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token, diaria: pricing.diaria }),
    })
    const data = await res.json()
    setSavingDiaria(false)
    if (data.error) { setMsg(data.error); return }
    setMsg('Salvo!'); setTimeout(() => setMsg(''), 2000)
  }

  async function salvarEntrega() {
    setSavingEntrega(true); setMsg('')
    const access_token = await getToken()

    await fetch('/api/admin/entrega-pricing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token, entrega_taxa_metodo: metodo, entrega_taxa_padrao: parsePt(padraoInput) }),
    })

    if (metodo === 'bairro') {
      const rows = bairros.filter(b => b.price !== '' || b.disabled).map(b => ({ bairro: b.name, price: b.disabled ? null : parsePt(b.price), disabled: b.disabled }))
      await fetch('/api/admin/entrega-bairros', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token, bairros: rows }),
      })
    } else {
      const rows = [
        ...kmTiers.map(t => ({ km_until: parsePt(t.kmUntil) || null, price: t.price !== '' ? parsePt(t.price) : null, blocked: false })),
        { km_until: null, price: kmLastBlocked ? null : (parsePt(kmLastPrice) || null), blocked: kmLastBlocked },
      ]
      await fetch('/api/admin/entrega-km-tiers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token, tiers: rows }),
      })
    }

    setSavingEntrega(false)
    setMsg('Salvo!'); setTimeout(() => setMsg(''), 2000)
    load()
  }

  function updateBairro(name: string, patch: Partial<BairroRow>) {
    setBairros(prev => prev.map(b => b.name === name ? { ...b, ...patch } : b))
  }
  function toggleBairroOff(name: string) {
    setBairros(prev => prev.map(b => b.name === name ? { ...b, disabled: !b.disabled } : b))
  }
  function updateKmTier(i: number, patch: Partial<KmTier>) {
    setKmTiers(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t))
  }
  function addKmRow() {
    const prevMax = kmTiers.length ? Number(kmTiers[kmTiers.length - 1].kmUntil) || 0 : 0
    setKmTiers(prev => [...prev, { kmUntil: String(prevMax + 3), price: '' }])
  }
  function removeKmRow(i: number) {
    if (kmTiers.length <= 1) return
    setKmTiers(prev => prev.filter((_, idx) => idx !== i))
  }

  const bairrosFiltrados = useMemo(() => {
    const q = normalizeBairro(bairroSearch)
    return q ? bairros.filter(b => normalizeBairro(b.name).includes(q)) : bairros
  }, [bairros, bairroSearch])
  const bairroConfiguredCount = useMemo(() => bairros.filter(b => b.price !== '' || b.disabled).length, [bairros])

  async function salvarNovoPacote() {
    if (!novoPacote) return
    const access_token = await getToken()
    const res = await fetch('/api/admin/entrega-pacotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token, categoria: novoPacote.categoria, nome: novoPacote.nome, quantidade: parsePt(novoPacote.quantidade), preco: parsePt(novoPacote.preco) }),
    })
    const data = await res.json()
    if (data.error) { setMsg(data.error); return }
    setNovoPacote(null)
    load()
  }

  async function salvarEdicaoPacote(id: string) {
    const edit = editPacote[id]
    if (!edit) return
    const access_token = await getToken()
    await fetch('/api/admin/entrega-pacotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token, id, nome: edit.nome, quantidade: parsePt(edit.quantidade), preco: parsePt(edit.preco) }),
    })
    setEditPacote(prev => { const n = { ...prev }; delete n[id]; return n })
    load()
  }

  async function toggleAtivo(p: Pacote) {
    const access_token = await getToken()
    await fetch('/api/admin/entrega-pacotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token, id: p.id, ativo: !p.ativo }),
    })
    load()
  }

  async function excluirPacote(id: string) {
    const access_token = await getToken()
    await fetch('/api/admin/entrega-pacotes', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token, id }),
    })
    load()
  }

  function PacotesList({ categoria, label }: { categoria: 'diaria' | 'entrega'; label: string }) {
    const lista = pacotes.filter(p => p.categoria === categoria)
    const unidade = categoria === 'diaria' ? 'dias' : 'R$ crédito'
    return (
      <div style={s.card}>
        <div style={s.cardHd}>
          <span style={s.cardTitle}>{categoria === 'diaria' ? '📦' : '🎁'} Pacotes de {label}</span>
          <button style={s.btnGhost} onClick={() => setNovoPacote({ categoria, nome: '', quantidade: '', preco: '' })}>+ Novo pacote</button>
        </div>
        <div style={s.cardBody}>
          {lista.length === 0 && !novoPacote && <div style={{ color: '#999', fontSize: 12.5 }}>Nenhum pacote de {label} cadastrado ainda.</div>}
          {lista.map(p => {
            const edit = editPacote[p.id]
            if (edit) {
              return (
                <div key={p.id} style={s.pacoteItem}>
                  <input style={s.pacoteFormInput} placeholder="Nome" value={edit.nome} onChange={e => setEditPacote(prev => ({ ...prev, [p.id]: { ...edit, nome: e.target.value } }))} />
                  <input style={s.pacoteFormInput} placeholder={`Qtd (${unidade})`} value={edit.quantidade} onChange={e => setEditPacote(prev => ({ ...prev, [p.id]: { ...edit, quantidade: e.target.value } }))} />
                  <input style={s.pacoteFormInput} placeholder="Preço" value={edit.preco} onChange={e => setEditPacote(prev => ({ ...prev, [p.id]: { ...edit, preco: e.target.value } }))} />
                  <div style={s.pacoteActions}>
                    <button style={s.btnGhostSm} onClick={() => salvarEdicaoPacote(p.id)}>Salvar</button>
                    <button style={s.btnGhostSm} onClick={() => setEditPacote(prev => { const n = { ...prev }; delete n[p.id]; return n })}>Cancelar</button>
                  </div>
                </div>
              )
            }
            return (
              <div key={p.id} style={{ ...s.pacoteItem, opacity: p.ativo ? 1 : 0.5 }}>
                <div style={s.pacoteTop}>
                  <span style={{ fontWeight: 700 }}>{p.nome}</span>
                  <span style={{ fontSize: 11 }}>{p.ativo ? '🟢 Ativo' : '⚪ Inativo'}</span>
                </div>
                <div style={s.pacoteMeta}>
                  <span>{p.quantidade} {unidade}</span>
                  <span>{fmt(Number(p.preco))}</span>
                </div>
                <div style={s.pacoteActions}>
                  <button style={s.btnGhostSm} onClick={() => setEditPacote(prev => ({ ...prev, [p.id]: { nome: p.nome, quantidade: fmtPt(p.quantidade), preco: fmtPt(p.preco) } }))}>Editar</button>
                  <button style={s.btnGhostSm} onClick={() => toggleAtivo(p)}>{p.ativo ? 'Desativar' : 'Ativar'}</button>
                  <button style={{ ...s.btnGhostSm, color: '#C43D3D' }} onClick={() => excluirPacote(p.id)}>Excluir</button>
                </div>
              </div>
            )
          })}
          {novoPacote?.categoria === categoria && (
            <div style={{ ...s.pacoteItem, borderTop: '2px dashed #E0DDD8', marginTop: 4, paddingTop: 10 }}>
              <input style={s.pacoteFormInput} placeholder="Nome (ex: 7 diárias)" value={novoPacote.nome} onChange={e => setNovoPacote({ ...novoPacote, nome: e.target.value })} />
              <input style={s.pacoteFormInput} placeholder={`Qtd (${unidade})`} value={novoPacote.quantidade} onChange={e => setNovoPacote({ ...novoPacote, quantidade: e.target.value })} />
              <input style={s.pacoteFormInput} placeholder="Preço" value={novoPacote.preco} onChange={e => setNovoPacote({ ...novoPacote, preco: e.target.value })} />
              <div style={s.pacoteActions}>
                <button style={s.btnGhostSm} onClick={salvarNovoPacote}>Criar</button>
                <button style={s.btnGhostSm} onClick={() => setNovoPacote(null)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!pricing) return <div style={{ color: '#888', fontSize: 13 }}>Carregando...</div>

  return (
    <div>
      {msg && <div style={{ marginBottom: 14, fontSize: 12.5, fontWeight: 700, color: msg === 'Salvo!' ? '#157A52' : '#C43D3D' }}>{msg}</div>}

      <div style={s.topRow}>
        <PacotesList categoria="diaria" label="diária" />
        <PacotesList categoria="entrega" label="crédito" />
        <div style={s.card}>
          <div style={s.cardHd}><span style={s.cardTitle}>💳 Preço da diária</span></div>
          <div style={s.cardBody}>
            <div style={s.priceSub}>Liberar o dia pra chamar motoboy — preço único, não muda por dia.</div>
            <div style={{ ...s.priceRow, borderBottom: 'none', gridTemplateColumns: '1fr 100px', marginTop: 8 }}>
              <span style={s.priceLabel}>Diária</span>
              <span style={s.priceInputWrap}><span>R$</span><input style={s.priceInput} type="number" step="0.01" value={pricing.diaria} onChange={e => setPricing({ ...pricing, diaria: Number(e.target.value) })} /></span>
            </div>
          </div>
          <div style={s.cardFoot}>
            <button style={s.btnSave} disabled={savingDiaria} onClick={salvarDiaria}>{savingDiaria ? 'Salvando...' : 'Salvar diária'}</button>
          </div>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.cardHd}><span style={s.cardTitle}>🏍️ Preço por entrega</span><span style={s.cardHint}>debitado do crédito no valor real de cada corrida</span></div>
        <div style={s.cardBody}>
          <div style={s.methodTabs}>
            <div style={{ ...s.methodTab, ...(metodo === 'bairro' ? s.methodTabOn : {}) }} onClick={() => setMetodo('bairro')}>📍 Por bairro</div>
            <div style={{ ...s.methodTab, ...(metodo === 'distancia' ? s.methodTabOn : {}) }} onClick={() => setMetodo('distancia')}>📏 Por distância (km)</div>
          </div>

          <div style={{ ...s.priceRow, gridTemplateColumns: '1fr 130px' }}>
            <span><div style={s.priceLabel}>Taxa padrão (fallback)</div><div style={s.priceSub}>usada quando não dá pra calcular bairro/km</div></span>
            <span style={s.priceInputWrap}><span>R$</span><input style={s.priceInput} value={padraoInput} onChange={e => setPadraoInput(e.target.value)} /></span>
          </div>

          {metodo === 'bairro' ? (
            <>
              <div style={{ ...s.bairroToolbar, marginTop: 12 }}>
                <input style={{ ...s.bairroInput, width: '100%' }} placeholder="🔎 Buscar bairro..." value={bairroSearch} onChange={e => setBairroSearch(e.target.value)} />
              </div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}><b>{bairroConfiguredCount}</b> de <b>{BAIRROS_SAO_GONCALO.length}</b> bairros configurados — o resto usa a taxa padrão acima.</div>
              <div style={s.bairroGrid}>
                {bairrosFiltrados.map(b => (
                  <div key={b.name} style={{ ...s.bairroCell, ...(b.disabled ? s.bairroCellOff : {}) }}>
                    <div style={s.bairroCellName}>{b.name}</div>
                    <div style={s.bairroRow}>
                      {b.disabled
                        ? <span style={{ fontSize: 11, color: '#C43D3D', flex: 1 }}>Sem entrega</span>
                        : <input style={s.bairroInput} placeholder="0,00" value={b.price} onChange={e => updateBairro(b.name, { price: e.target.value })} />}
                      <button style={{ ...s.offBtn, ...(b.disabled ? s.offBtnOn : {}) }} onClick={() => toggleBairroOff(b.name)} title={b.disabled ? 'Reativar' : 'Marcar sem entrega'}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ marginTop: 12 }}>
              {kmTiers.map((t, i) => (
                <div key={i} style={s.kmRow}>
                  <div style={s.kmLabel}>
                    {i === 0 ? 'Até' : <>De <input style={s.kmNum} value={kmTiers[i - 1].kmUntil} disabled /> até</>}{' '}
                    <input style={s.kmNum} value={t.kmUntil} onChange={e => updateKmTier(i, { kmUntil: e.target.value })} /> km
                  </div>
                  <input style={s.priceInputWrap} placeholder="0,00" value={t.price} onChange={e => updateKmTier(i, { price: e.target.value })} />
                  <button style={s.offBtn} onClick={() => removeKmRow(i)} title="Remover faixa">×</button>
                </div>
              ))}
              <div style={s.kmRow}>
                <div style={s.kmLabel}>Acima de {kmTiers[kmTiers.length - 1]?.kmUntil || '0'} km</div>
                {kmLastBlocked
                  ? <span style={{ fontSize: 11, color: '#C43D3D' }}>Não entrego</span>
                  : <input style={s.priceInputWrap} placeholder="0,00" value={kmLastPrice} onChange={e => setKmLastPrice(e.target.value)} />}
                <button style={{ ...s.offBtn, ...(kmLastBlocked ? s.offBtnOn : {}) }} onClick={() => setKmLastBlocked(v => !v)} title={kmLastBlocked ? 'Permitir cobrando taxa' : 'Marcar como não entrego'}>✕</button>
              </div>
              <button style={{ ...s.btnGhost, marginTop: 10 }} onClick={addKmRow}>+ Adicionar faixa</button>
            </div>
          )}
        </div>
        <div style={s.cardFoot}>
          <button style={s.btnSave} disabled={savingEntrega} onClick={salvarEntrega}>{savingEntrega ? 'Salvando...' : 'Salvar entrega'}</button>
        </div>
      </div>

    </div>
  )
}
