'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePainelShell } from '@/contexts/PainelShellContext'

type Signal = { id: string; contact_id: string | null; channel: string; source: string; confirmed: boolean; valor: number | null; produto: string | null; occurred_at: string }
type Contact = { id: string; name: string | null; phone: string }

type Segmento = 'campeao' | 'risco' | 'novo' | 'sumido' | 'nunca'
type ContatoAgregado = {
  contact: Contact
  signals: Signal[]
  orders: number
  lastAt: string | null
  recenciaDias: number
  receitaTrindade: number
  ticketMedio: number
  segmento: Segmento
  canalPredominante: string | null
  favorito: string | null
}

const SEG_LABEL: Record<Segmento, string> = { campeao: 'Campeão', risco: 'Fiel em risco', novo: 'Novo', sumido: 'Sumido', nunca: 'Nunca converteu' }
const SEG_COLOR: Record<Segmento, { fg: string; bg: string }> = {
  campeao: { fg: '#0F8A57', bg: '#E7F5EE' }, risco: { fg: '#A87200', bg: '#FDF3DC' }, novo: { fg: '#2A4E7A', bg: '#EAF0F8' },
  sumido: { fg: '#6F6C67', bg: '#EFEEEC' }, nunca: { fg: '#D6392B', bg: '#FBEAEA' },
}
const CHAN_LABEL: Record<string, string> = { trindade_online: 'Trindade Online', whatsapp_direto: 'WhatsApp direto', ifood: 'iFood', anota_ai: 'Anota Aí', outro_app: 'Outro app', desconhecido: 'Não identificado' }
const CHAN_COLOR: Record<string, string> = { trindade_online: '#151210', whatsapp_direto: '#0E7C86', ifood: '#C2542E', anota_ai: '#6B4FA0', outro_app: '#948E82', desconhecido: '#948E82' }

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function fmtPhone(phone: string) {
  const d = phone.replace(/\D/g, '').replace(/^55/, '')
  if (d.length !== 10 && d.length !== 11) return phone
  const ddd = d.slice(0, 2), rest = d.slice(2)
  return `(${ddd}) ${rest.length === 9 ? rest.slice(0, 5) + '-' + rest.slice(5) : rest.slice(0, 4) + '-' + rest.slice(4)}`
}
function displayName(c: Contact) { return /\p{L}{2,}/u.test((c.name || '').trim()) ? c.name!.trim() : fmtPhone(c.phone) }
function waLink(phone: string, texto: string) { return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}` }

function segmentar(orders: number, recenciaDias: number): Segmento {
  if (orders === 0) return 'nunca'
  if (recenciaDias > 30) return 'sumido'
  if (orders === 1) return 'novo'
  if (recenciaDias > 14) return 'risco'
  return 'campeao'
}

function mensagemSugerida(a: ContatoAgregado, nomeEmpresa: string): string {
  const primeiroNome = /\p{L}{2,}/u.test((a.contact.name || '')) ? a.contact.name!.trim().split(' ')[0] : null
  const saudacao = primeiroNome ? `Oi, ${primeiroNome}!` : 'Oi!'
  if (a.segmento === 'nunca') return `${saudacao} Vi que você chegou a conversar com a gente aqui na ${nomeEmpresa} — ainda tá interessado? Posso te ajudar a fechar o pedido.`
  if (a.favorito) return `${saudacao} Faz um tempinho que você não pede ${a.favorito} com a gente — separei uma condição especial pra hoje.`
  return `${saudacao} Sentimos sua falta por aqui na ${nomeEmpresa}! Separei uma condição especial pra você voltar a pedir hoje.`
}

export default function RecuperacaoPage() {
  const { company, loading: shellLoading } = usePainelShell()
  const [loading, setLoading] = useState(true)
  const [agregados, setAgregados] = useState<ContatoAgregado[]>([])
  const [filter, setFilter] = useState<'todos' | Segmento>('todos')
  const [sentIds, setSentIds] = useState<string[]>([])

  useEffect(() => {
    if (shellLoading) return
    if (!company || !company.crm_vendas_pilot) return
    const companyId = company.id
    ;(async () => {
      const [{ data: contacts }, { data: signals }] = await Promise.all([
        supabase.from('crm_contacts').select('id, name, phone').eq('company_id', companyId),
        supabase.from('crm_sales_signals').select('id, contact_id, channel, source, confirmed, valor, produto, occurred_at').eq('company_id', companyId),
      ])
      const byContact = new Map<string, Signal[]>()
      for (const s of (signals || []) as Signal[]) {
        if (!s.contact_id) continue
        if (!byContact.has(s.contact_id)) byContact.set(s.contact_id, [])
        byContact.get(s.contact_id)!.push(s)
      }
      const hoje = Date.now()
      const lista: ContatoAgregado[] = ((contacts || []) as Contact[]).map(contact => {
        const sList = (byContact.get(contact.id) || []).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
        const orders = sList.length
        const lastAt = sList.length ? sList[sList.length - 1].occurred_at : null
        const recenciaDias = lastAt ? Math.floor((hoje - new Date(lastAt).getTime()) / 86400000) : Infinity
        const trindadeSignals = sList.filter(s => s.channel === 'trindade_online')
        const receitaTrindade = trindadeSignals.reduce((sum, s) => sum + Number(s.valor || 0), 0)
        const ticketMedio = trindadeSignals.length ? receitaTrindade / trindadeSignals.length : 0
        const canalCount: Record<string, number> = {}
        sList.forEach(s => { canalCount[s.channel] = (canalCount[s.channel] || 0) + 1 })
        const canalPredominante = Object.keys(canalCount).sort((a, b) => canalCount[b] - canalCount[a])[0] || null
        const produtoCount: Record<string, number> = {}
        sList.forEach(s => { if (s.produto) produtoCount[s.produto] = (produtoCount[s.produto] || 0) + 1 })
        const favorito = Object.keys(produtoCount).sort((a, b) => produtoCount[b] - produtoCount[a])[0] || null
        return { contact, signals: sList, orders, lastAt, recenciaDias, receitaTrindade, ticketMedio, segmento: segmentar(orders, recenciaDias), canalPredominante, favorito }
      }).filter(a => a.segmento !== 'campeao' || a.orders > 0) // mantém todos; campeão também aparece na lista geral
      setAgregados(lista)
      setLoading(false)
    })()
  }, [shellLoading, company?.id, company?.crm_vendas_pilot])

  if (shellLoading || loading) return <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontFamily: 'Archivo,sans-serif', fontSize: 13 }}>Carregando...</div>
  if (!company?.crm_vendas_pilot) return <div style={{ padding: 40, fontFamily: 'Archivo,sans-serif', fontSize: 13.5, color: '#666' }}>O Radar de Clientes ainda está em teste com uma empresa só.</div>

  const filtrados = filter === 'todos' ? agregados : agregados.filter(a => a.segmento === filter)
  // Fiéis em risco primeiro (maior ticket médio) — mesmo critério do overview.
  const ordenados = [...filtrados].sort((a, b) => {
    const prioA = a.segmento === 'risco' ? 0 : a.segmento === 'sumido' ? 1 : a.segmento === 'novo' ? 2 : 3
    const prioB = b.segmento === 'risco' ? 0 : b.segmento === 'sumido' ? 1 : b.segmento === 'novo' ? 2 : 3
    if (prioA !== prioB) return prioA - prioB
    return b.ticketMedio - a.ticketMedio
  })

  const riscoTotal = filtrados.reduce((s, a) => s + a.ticketMedio, 0)
  const comTicket = filtrados.filter(a => a.ticketMedio > 0)
  const ticketMedioFiltro = comTicket.length ? comTicket.reduce((s, a) => s + a.ticketMedio, 0) / comTicket.length : 0

  const pills: { key: 'todos' | Segmento; label: string }[] = [
    { key: 'todos', label: 'Todos' }, { key: 'risco', label: 'Fiéis em risco' }, { key: 'sumido', label: 'Sumidos' },
    { key: 'nunca', label: 'Nunca converteu' }, { key: 'novo', label: 'Novos' }, { key: 'campeao', label: 'Campeões' },
  ]

  return (
    <div style={{ padding: '26px 28px 60px', fontFamily: 'Archivo,sans-serif', color: '#151210', maxWidth: 1100 }}>
      <style>{`
        .rc-pill{font-size:12.5px;font-weight:700;padding:7px 14px;border-radius:20px;border:1px solid #E3E0D9;background:#fff;color:#6F6C67;cursor:pointer;}
        .rc-pill.on{background:#151210;color:#fff;border-color:#151210;}
        .rc-card{background:#fff;border:1px solid #E3E0D9;border-radius:14px;}
        .rc-row{display:flex;gap:16px;padding:16px 18px;border-bottom:1px solid #E3E0D9;align-items:flex-start;}
        .rc-row:last-child{border-bottom:none;}
        .rc-send{display:inline-flex;align-items:center;gap:7px;background:#0F8A57;color:#fff;font-size:12.5px;font-weight:700;padding:9px 15px;border-radius:8px;border:none;white-space:nowrap;flex:none;text-decoration:none;}
        .rc-send.sent{background:#E7F5EE;color:#0F8A57;}
      `}</style>

      <a href="/painel/radar" style={{ fontSize: 12.5, fontWeight: 700, color: '#6F6C67', textDecoration: 'none' }}>← Radar de clientes</a>
      <h1 style={{ margin: '10px 0 4px', fontFamily: "'Anton',sans-serif", fontSize: 25 }}>Recuperação de clientes</h1>
      <div style={{ fontSize: 12.5, color: '#6F6C67', marginBottom: 18 }}>Fiéis em risco primeiro — manda direto pelo seu WhatsApp.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="rc-card" style={{ padding: '14px 16px' }}><div style={{ fontSize: 10.5, fontWeight: 800, color: '#6F6C67', textTransform: 'uppercase' }}>Clientes no filtro</div><div style={{ fontFamily: "'Anton',sans-serif", fontSize: 22 }}>{filtrados.length}</div></div>
        <div className="rc-card" style={{ padding: '14px 16px', borderColor: '#F2CFCB' }}><div style={{ fontSize: 10.5, fontWeight: 800, color: '#6F6C67', textTransform: 'uppercase' }}>Receita em risco (estimada)</div><div style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, color: '#D6392B' }}>{fmt(riscoTotal)}</div></div>
        <div className="rc-card" style={{ padding: '14px 16px' }}><div style={{ fontSize: 10.5, fontWeight: 800, color: '#6F6C67', textTransform: 'uppercase' }}>Ticket médio do filtro</div><div style={{ fontFamily: "'Anton',sans-serif", fontSize: 22 }}>{fmt(ticketMedioFiltro)}</div></div>
        <div className="rc-card" style={{ padding: '14px 16px' }}><div style={{ fontSize: 10.5, fontWeight: 800, color: '#6F6C67', textTransform: 'uppercase' }}>Já contatados agora</div><div style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, color: '#0F8A57' }}>{filtrados.filter(a => sentIds.includes(a.contact.id)).length}</div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {pills.map(p => <button key={p.key} className={`rc-pill ${filter === p.key ? 'on' : ''}`} onClick={() => setFilter(p.key)}>{p.label}</button>)}
      </div>

      <div className="rc-card" style={{ overflow: 'hidden' }}>
        {ordenados.length === 0 ? (
          <div style={{ padding: '24px 18px', fontSize: 12.5, color: '#999' }}>Ninguém nesse filtro ainda.</div>
        ) : ordenados.map(a => {
          const nome = displayName(a.contact)
          const msg = mensagemSugerida(a, company.name)
          const sent = sentIds.includes(a.contact.id)
          return (
            <div key={a.contact.id} className="rc-row">
              <div style={{ width: 38, height: 38, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, background: SEG_COLOR[a.segmento].bg, color: SEG_COLOR[a.segmento].fg }}>
                {nome.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{nome}</div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: SEG_COLOR[a.segmento].bg, color: SEG_COLOR[a.segmento].fg }}>{SEG_LABEL[a.segmento]}</span>
                  {a.canalPredominante && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6F6C67', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: CHAN_COLOR[a.canalPredominante] }} />
                      {CHAN_LABEL[a.canalPredominante] || a.canalPredominante}
                    </span>
                  )}
                  {a.recenciaDias !== Infinity && a.recenciaDias > 14 && (
                    <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: '#FBEAEA', color: '#D6392B' }}>{a.recenciaDias} dias sem comprar</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 11.5, color: '#6F6C67' }}>
                  <div>Pedidos identificados: <b style={{ color: '#151210' }}>{a.orders}</b></div>
                  {a.ticketMedio > 0 && <div>Ticket médio: <b style={{ color: '#151210' }}>{fmt(a.ticketMedio)}</b></div>}
                  {a.favorito && <div>Favorito: <b style={{ color: '#151210' }}>{a.favorito}</b></div>}
                </div>
                <div style={{ fontSize: 12, background: '#EFEEEC', borderRadius: 8, padding: '8px 11px' }}>&quot;{msg}&quot;</div>
              </div>
              <a
                href={waLink(a.contact.phone, msg)}
                target="_blank" rel="noopener noreferrer"
                className={`rc-send ${sent ? 'sent' : ''}`}
                onClick={() => setSentIds(prev => prev.includes(a.contact.id) ? prev : [...prev, a.contact.id])}
              >
                {sent ? 'Contatado' : 'Enviar no WhatsApp'}
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
