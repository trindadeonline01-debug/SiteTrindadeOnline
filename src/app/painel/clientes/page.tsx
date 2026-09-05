'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { moduleActive } from '@/lib/modules'
import EmpresaShell from '@/components/EmpresaShell'

type Contact = {
  id: string; phone: string; name: string | null; address: string | null
  last_purchase_at: string | null; last_message_at: string | null; created_at: string
  total_orders: number; total_spent: number
}
type Tag = { id: string; name: string; color: string }
type ContactTagRef = { tag_id: string; auto: boolean }

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function diasAtras(iso: string | null) {
  if (!iso) return Infinity
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
// "Sumidos 30d+" media pela última COMPRA — quem só conversou (nunca
// comprou, maioria dos contatos de WhatsApp) caía sempre em "sumido"
// mesmo tendo mandado mensagem ontem, o que fazia o filtro não filtrar
// nada de útil (dívida #7). Última atividade de verdade é a mais recente
// entre mensagem e compra — com fallback pro cadastro do contato.
function lastActivity(c: Contact): string | null {
  return [c.last_message_at, c.last_purchase_at, c.created_at].filter(Boolean).sort().pop() || null
}
function waLink(phone: string) { return `https://wa.me/${phone.replace(/\D/g, '')}` }
function fmtPhone(phone: string) {
  const d = phone.replace(/\D/g, '').replace(/^55/, '')
  if (d.length !== 10 && d.length !== 11) return phone
  const ddd = d.slice(0, 2)
  const rest = d.slice(2)
  return `(${ddd}) ${rest.length === 9 ? rest.slice(0, 5) + '-' + rest.slice(5) : rest.slice(0, 4) + '-' + rest.slice(4)}`
}
// Nome real ou telefone formatado — "Sem nome", ".", "---" e emoji já
// apareceram cadastrados como nome (o cliente digita isso na conversa do
// WhatsApp, a gente só espelha). Sem pelo menos 2 letras de verdade, não é nome.
function displayName(c: { name: string | null; phone: string }) {
  const name = (c.name || '').trim()
  return /\p{L}{2,}/u.test(name) ? name : fmtPhone(c.phone)
}

export default function ClientesPage() {
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [crmEnabled, setCrmEnabled] = useState(false)
  const [entregaEnabled, setEntregaEnabled] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [filter, setFilter] = useState<'todos' | 'compraram' | 'conversaram' | 'sumidos'>('todos')
  const [search, setSearch] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [contactTagsMap, setContactTagsMap] = useState<Record<string, ContactTagRef[]>>({})
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([])
  const [tagFilterOpen, setTagFilterOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/clientes'; return }
      const { data: comp } = await supabase.from('companies').select('id, name, loja_digital_enabled, crm_whatsapp_enabled, entrega_enabled, trial_modules_until').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !moduleActive(comp.loja_digital_enabled, comp.trial_modules_until)) { window.location.href = '/painel/compartilhar'; return }
      setCompanyName(comp.name)
      setCrmEnabled(moduleActive(comp.crm_whatsapp_enabled, comp.trial_modules_until))
      setEntregaEnabled(moduleActive(comp.entrega_enabled, comp.trial_modules_until))
      const { data } = await supabase.from('crm_contacts').select('*').eq('company_id', comp.id).order('last_purchase_at', { ascending: false })
      setContacts((data || []) as Contact[])
      const { data: tagRows } = await supabase.from('crm_tags').select('id, name, color').eq('company_id', comp.id).order('created_at')
      setTags((tagRows || []) as Tag[])
      const { data: ctRows } = await supabase
        .from('crm_contact_tags').select('contact_id, tag_id, auto, crm_contacts!inner(company_id)')
        .is('removed_at', null).eq('crm_contacts.company_id', comp.id)
      const map: Record<string, ContactTagRef[]> = {}
      for (const row of (ctRows || []) as any[]) {
        if (!map[row.contact_id]) map[row.contact_id] = []
        map[row.contact_id].push({ tag_id: row.tag_id, auto: row.auto })
      }
      setContactTagsMap(map)
      setLoading(false)
    })
  }, [])

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function bulkApplyTag(tagId: string) {
    if (!tagId || selectedIds.length === 0) return
    setContactTagsMap(prev => {
      const next = { ...prev }
      for (const id of selectedIds) {
        const list = next[id] || []
        if (!list.some(t => t.tag_id === tagId)) next[id] = [...list, { tag_id: tagId, auto: false }]
      }
      return next
    })
    await Promise.all(selectedIds.map(id => supabase.from('crm_contact_tags')
      .upsert({ contact_id: id, tag_id: tagId, auto: false, removed_at: null }, { onConflict: 'contact_id,tag_id' })))
  }

  async function bulkRemoveTag(tagId: string) {
    if (!tagId || selectedIds.length === 0) return
    setContactTagsMap(prev => {
      const next = { ...prev }
      for (const id of selectedIds) next[id] = (next[id] || []).filter(t => t.tag_id !== tagId)
      return next
    })
    await Promise.all(selectedIds.map(id => supabase.from('crm_contact_tags')
      .update({ removed_at: new Date().toISOString() }).eq('contact_id', id).eq('tag_id', tagId)))
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#AAA' }}>Carregando...</div>

  const searchTerm = search.trim().toLowerCase()
  const isSumido = (c: Contact) => diasAtras(lastActivity(c)) > 30
  const isConversou = (c: Contact) => c.total_orders === 0 && !!c.last_message_at
  const filtered = contacts
    .filter(c => {
      if (filter === 'compraram') return c.total_orders > 0
      if (filter === 'conversaram') return isConversou(c)
      if (filter === 'sumidos') return isSumido(c)
      return true
    })
    .filter(c => !searchTerm || (c.name || '').toLowerCase().includes(searchTerm) || c.phone.includes(searchTerm))
    .filter(c => tagFilterIds.length === 0 || (contactTagsMap[c.id] || []).some(ct => tagFilterIds.includes(ct.tag_id)))

  const compraramCount = contacts.filter(c => c.total_orders > 0).length
  const conversaramCount = contacts.filter(isConversou).length
  const sumidosCount = contacts.filter(isSumido).length

  return (
    <EmpresaShell active="clientes" companyName={companyName} lojaDigitalEnabled crmEnabled={crmEnabled} entregaEnabled={entregaEnabled}>
      <div className="cl-wrap">
        <style>{`
          .cl-wrap{ width:100%;max-width:480px;margin:0 auto;min-height:100vh;background:var(--concrete);font-family:'Archivo',sans-serif;font-size:13px;color:var(--ink);padding-bottom:30px;min-width:0;overflow-x:hidden; }
          .cl-head{ padding:22px 16px 14px;display:flex;align-items:center;gap:10px;position:sticky;top:0;background:#F7F5F0;z-index:5; }
          .cl-head h1{ font-size:18px;margin:0;flex:1;font-weight:800; }
          .cl-back{ width:32px;height:32px;border-radius:50%;border:1px solid #E6E0D2;background:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;text-decoration:none;color:#1A1610; }
          .cl-body{ padding:0 16px; }
          .cl-search{ width:100%;padding:9px 12px;border-radius:9px;border:1px solid #E6E0D2;background:#fff;font-size:12.5px;font-family:inherit;margin-bottom:12px; }
          .cl-tabs{ display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap; }
          .cl-tab{ flex:1;min-width:120px;padding:8px 6px;border-radius:9px;border:1px solid #E6E0D2;background:#fff;font-weight:700;font-size:11px;color:#6E6656;cursor:pointer;white-space:nowrap; }
          .cl-tab.active{ background:var(--ink);color:var(--sign);border-color:var(--ink); }
          .cl-empty{ text-align:center;color:#A79E8B;padding:40px 0;font-size:12.5px; }
          .cl-card{ background:#fff;border:1px solid #EDE8E0;border-radius:12px;padding:12px;margin-bottom:10px; }
          .cl-row1{ display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px; }
          .cl-name{ font-weight:800;font-size:13.5px; }
          .cl-phone{ font-size:11px;color:#A79E8B; }
          .cl-badge{ font-size:10px;font-weight:800;padding:3px 8px;border-radius:7px;flex:none; }
          .cl-badge.ativo{ background:#E4F3EC;color:#157A52; }
          .cl-badge.inativo{ background:#F0EDE8;color:#A79E8B; }
          .cl-stats{ display:flex;gap:14px;font-size:11.5px;color:#6E6656;margin-top:6px; }
          .cl-wa{ display:inline-block;margin-top:8px;font-size:11px;font-weight:700;color:#157A52;text-decoration:none; }
          .cl-tags{ display:flex;gap:5px;flex-wrap:wrap;margin-top:8px; }
          .cl-tagpill{ display:inline-flex;align-items:center;gap:4px;padding:2.5px 8px;border-radius:20px;font-size:10px;font-weight:700;color:#1A1610; }
          .cl-select-row{ display:flex;align-items:flex-start;gap:8px; }
          .cl-select-row input{ margin-top:3px;accent-color:var(--ink);width:15px;height:15px;flex:none; }
          .cl-tagfilter-wrap{ position:relative; }
          .cl-tagfilter-pop{ position:absolute;top:34px;left:0;min-width:220px;background:#fff;border:1px solid #E6E0D2;border-radius:12px;box-shadow:0 10px 26px rgba(0,0,0,.15);z-index:30;padding:6px; }
          .cl-tagfilter-row{ display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;cursor:pointer;font-size:12px;color:#1A1610; }
          .cl-tagfilter-row:hover{ background:#F7F5F0; }
          .cl-tagfilter-row input{ accent-color:var(--ink);width:14px;height:14px; }
          .cl-tagdot{ width:9px;height:9px;border-radius:50%;flex:none;display:inline-block; }
          .cl-bulkbar{ display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#FEF3E2;border:1px solid #F0DDAE;border-radius:10px;padding:9px 12px;margin-bottom:12px;font-size:12px;color:#6E6656; }
          .cl-bulkbar select{ border:1px solid #E6E0D2;border-radius:8px;padding:6px 8px;font-size:11.5px;font-family:inherit;background:#fff;color:#1A1610; }
          @media(min-width:768px){
            .cl-wrap{ max-width:none;margin:0;padding-bottom:40px; }
            .cl-head{ padding:28px 32px 16px; }
            .cl-body{ padding:0 32px; }
            .cl-toolbar{ display:flex;gap:12px;align-items:center; }
            .cl-search{ max-width:280px;margin-bottom:0; }
            .cl-tabs{ margin-bottom:0; }
            .cl-grid{ display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:16px; }
          }
        `}</style>
        <div className="cl-head">
          <h1>Clientes</h1>
        </div>
        <div className="cl-body">
          <div className="cl-toolbar">
            <input className="cl-search" placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="cl-tabs">
              <button className={`cl-tab ${filter === 'todos' ? 'active' : ''}`} onClick={() => setFilter('todos')}>Todos ({contacts.length})</button>
              <button className={`cl-tab ${filter === 'compraram' ? 'active' : ''}`} onClick={() => setFilter('compraram')}>Compraram ({compraramCount})</button>
              <button className={`cl-tab ${filter === 'conversaram' ? 'active' : ''}`} onClick={() => setFilter('conversaram')}>Só conversaram ({conversaramCount})</button>
              <button className={`cl-tab ${filter === 'sumidos' ? 'active' : ''}`} onClick={() => setFilter('sumidos')}>Sumidos 30d+ ({sumidosCount})</button>
              <div className="cl-tagfilter-wrap">
                <button className={`cl-tab ${tagFilterIds.length ? 'active' : ''}`} onClick={() => setTagFilterOpen(v => !v)}>🏷️ Etiquetas{tagFilterIds.length > 0 ? ` (${tagFilterIds.length})` : ''}</button>
                {tagFilterOpen && (
                  <div className="cl-tagfilter-pop">
                    {tags.length === 0 && <div style={{ padding: '8px 9px', fontSize: 12, color: '#A79E8B' }}>Nenhuma etiqueta criada ainda — crie em Mensagens.</div>}
                    {tags.map(t => {
                      const on = tagFilterIds.includes(t.id)
                      return (
                        <label key={t.id} className="cl-tagfilter-row">
                          <input type="checkbox" checked={on} onChange={() => setTagFilterIds(prev => on ? prev.filter(x => x !== t.id) : [...prev, t.id])} />
                          <span className="cl-tagdot" style={{ background: t.color }} />
                          {t.name}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              <button className={`cl-tab ${selecting ? 'active' : ''}`} onClick={() => { setSelecting(v => !v); setSelectedIds([]) }}>{selecting ? '✕ Cancelar seleção' : '☑ Selecionar'}</button>
            </div>
          </div>
          {selecting && selectedIds.length > 0 && (
            <div className="cl-bulkbar">
              <b style={{ color: '#1A1610' }}>{selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}</b>
              <select value="" onChange={e => e.target.value && bulkApplyTag(e.target.value)}>
                <option value="">+ Aplicar etiqueta ▾</option>
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value="" onChange={e => e.target.value && bulkRemoveTag(e.target.value)}>
                <option value="">− Remover etiqueta ▾</option>
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {filtered.length === 0 && (
            <div className="cl-empty">{contacts.length === 0 ? 'Nenhum cliente ainda — aparece aqui assim que alguém comprar pelo cardápio.' : 'Nenhum cliente encontrado.'}</div>
          )}
          <div className="cl-grid">
            {filtered.map(c => {
              const dias = diasAtras(lastActivity(c))
              const ativo = dias <= 30
              const cTags = contactTagsMap[c.id] || []
              return (
                <div className="cl-card" key={c.id}>
                  <div className="cl-row1">
                    <div className="cl-select-row">
                      {selecting && <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelect(c.id)} />}
                      <div><div className="cl-name">{displayName(c)}</div><div className="cl-phone">{fmtPhone(c.phone)}</div></div>
                    </div>
                    <span className={`cl-badge ${ativo ? 'ativo' : 'inativo'}`}>{ativo ? 'Ativo' : dias === Infinity ? 'Sem atividade' : `${dias}d sumido`}</span>
                  </div>
                  <div className="cl-stats">
                    <span>{c.total_orders} {c.total_orders === 1 ? 'pedido' : 'pedidos'}</span>
                    <span>{fmt(Number(c.total_spent))} gasto</span>
                  </div>
                  {cTags.length > 0 && (
                    <div className="cl-tags">
                      {cTags.map(ct => {
                        const t = tags.find(x => x.id === ct.tag_id)
                        if (!t) return null
                        return <span key={t.id} className="cl-tagpill" style={{ background: t.color }}>{t.name}{ct.auto && ' 🤖'}</span>
                      })}
                    </div>
                  )}
                  <a className="cl-wa" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer">💬 Chamar no WhatsApp</a>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </EmpresaShell>
  )
}
