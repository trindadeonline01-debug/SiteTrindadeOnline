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
      setLoading(false)
    })
  }, [])

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
            </div>
          </div>
          {filtered.length === 0 && (
            <div className="cl-empty">{contacts.length === 0 ? 'Nenhum cliente ainda — aparece aqui assim que alguém comprar pelo cardápio.' : 'Nenhum cliente encontrado.'}</div>
          )}
          <div className="cl-grid">
            {filtered.map(c => {
              const dias = diasAtras(lastActivity(c))
              const ativo = dias <= 30
              return (
                <div className="cl-card" key={c.id}>
                  <div className="cl-row1">
                    <div><div className="cl-name">{displayName(c)}</div><div className="cl-phone">{fmtPhone(c.phone)}</div></div>
                    <span className={`cl-badge ${ativo ? 'ativo' : 'inativo'}`}>{ativo ? 'Ativo' : dias === Infinity ? 'Sem atividade' : `${dias}d sumido`}</span>
                  </div>
                  <div className="cl-stats">
                    <span>{c.total_orders} {c.total_orders === 1 ? 'pedido' : 'pedidos'}</span>
                    <span>{fmt(Number(c.total_spent))} gasto</span>
                  </div>
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
