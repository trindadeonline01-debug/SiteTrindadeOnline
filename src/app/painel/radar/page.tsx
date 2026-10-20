'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePainelShell } from '@/contexts/PainelShellContext'

type Signal = { id: string; contact_id: string | null; channel: string; source: string; confirmed: boolean; valor: number | null; occurred_at: string }
type Contact = { id: string; name: string | null; phone: string }

type Segmento = 'campeao' | 'risco' | 'novo' | 'sumido' | 'nunca'
type ContatoAgregado = {
  contact: Contact
  signals: Signal[]
  orders: number
  lastAt: string | null
  recenciaDias: number
  receitaTrindade: number
  segmento: Segmento
  canalPredominante: string | null
}

const SEG_LABEL: Record<Segmento, string> = { campeao: 'Campeão', risco: 'Fiel em risco', novo: 'Novo', sumido: 'Sumido', nunca: 'Nunca converteu' }
const SEG_COLOR: Record<Segmento, { fg: string; bg: string; border: string }> = {
  campeao: { fg: '#0F8A57', bg: '#E7F5EE', border: '#CDE9DB' },
  risco: { fg: '#A87200', bg: '#FDF3DC', border: '#F3DFAE' },
  novo: { fg: '#2A4E7A', bg: '#EAF0F8', border: '#CBDBEC' },
  sumido: { fg: '#6F6C67', bg: '#EFEEEC', border: '#DBD8D1' },
  nunca: { fg: '#D6392B', bg: '#FBEAEA', border: '#F2CFCB' },
}
const CHAN_LABEL: Record<string, string> = { trindade_online: 'Trindade Online', whatsapp_direto: 'WhatsApp direto', ifood: 'iFood', anota_ai: 'Anota Aí', outro_app: 'Outro app', desconhecido: 'Não identificado' }
const CHAN_COLOR: Record<string, string> = { trindade_online: '#151210', whatsapp_direto: '#0E7C86', ifood: '#C2542E', anota_ai: '#6B4FA0', outro_app: '#948E82', desconhecido: '#948E82' }

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }

function segmentar(orders: number, recenciaDias: number): Segmento {
  if (orders === 0) return 'nunca'
  if (recenciaDias > 30) return 'sumido'
  if (orders === 1) return 'novo'
  if (recenciaDias > 14) return 'risco'
  return 'campeao'
}

export default function RadarPage() {
  const { company, loading: shellLoading } = usePainelShell()
  const [loading, setLoading] = useState(true)
  const [agregados, setAgregados] = useState<ContatoAgregado[]>([])

  useEffect(() => {
    if (shellLoading) return
    if (!company || !company.crm_vendas_pilot) return
    const companyId = company.id
    ;(async () => {
      const [{ data: contacts }, { data: signals }] = await Promise.all([
        supabase.from('crm_contacts').select('id, name, phone').eq('company_id', companyId),
        supabase.from('crm_sales_signals').select('id, contact_id, channel, source, confirmed, valor, occurred_at').eq('company_id', companyId),
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
        const receitaTrindade = sList.filter(s => s.channel === 'trindade_online').reduce((sum, s) => sum + Number(s.valor || 0), 0)
        const canalCount: Record<string, number> = {}
        sList.forEach(s => { canalCount[s.channel] = (canalCount[s.channel] || 0) + 1 })
        const canalPredominante = Object.keys(canalCount).sort((a, b) => canalCount[b] - canalCount[a])[0] || null
        return { contact, signals: sList, orders, lastAt, recenciaDias, receitaTrindade, segmento: segmentar(orders, recenciaDias), canalPredominante }
      })
      setAgregados(lista)
      setLoading(false)
    })()
  }, [shellLoading, company?.id, company?.crm_vendas_pilot])

  if (shellLoading || loading) return <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontFamily: 'Archivo,sans-serif', fontSize: 13 }}>Carregando...</div>
  if (!company?.crm_vendas_pilot) return <div style={{ padding: 40, fontFamily: 'Archivo,sans-serif', fontSize: 13.5, color: '#666' }}>O Radar de Clientes ainda está em teste com uma empresa só. Fala com o suporte se quiser entrar no piloto.</div>

  const segGroups: Record<Segmento, ContatoAgregado[]> = { campeao: [], risco: [], novo: [], sumido: [], nunca: [] }
  agregados.forEach(a => segGroups[a.segmento].push(a))

  const receitaBase = agregados.reduce((s, a) => s + a.receitaTrindade, 0)
  const receitaRisco = segGroups.risco.reduce((s, a) => s + (a.canalPredominante === 'trindade_online' ? a.receitaTrindade / Math.max(1, a.orders) : 0), 0)
  const comCompra = agregados.filter(a => a.orders > 0)
  const recompraram = comCompra.filter(a => a.orders >= 2)
  const taxaRecompra = comCompra.length ? Math.round((recompraram.length / comCompra.length) * 100) : 0
  const vendasTrindade = agregados.flatMap(a => a.signals.filter(s => s.channel === 'trindade_online'))
  const ticketMedio = vendasTrindade.length ? vendasTrindade.reduce((s, v) => s + Number(v.valor || 0), 0) / vendasTrindade.length : 0

  const canalCount: Record<string, number> = {}
  let totalSinais = 0
  agregados.forEach(a => a.signals.forEach(s => { canalCount[s.channel] = (canalCount[s.channel] || 0) + 1; totalSinais++ }))
  const canais = Object.keys(canalCount).map(ch => ({ channel: ch, label: CHAN_LABEL[ch] || ch, color: CHAN_COLOR[ch] || '#948E82', pct: totalSinais ? Math.round((canalCount[ch] / totalSinais) * 100) : 0 })).sort((a, b) => b.pct - a.pct)

  const prioridade = [...segGroups.risco, ...segGroups.sumido]
    .sort((a, b) => (b.receitaTrindade / Math.max(1, b.orders)) - (a.receitaTrindade / Math.max(1, a.orders)))
    .slice(0, 6)

  return (
    <div style={{ padding: '26px 28px 60px', fontFamily: 'Archivo,sans-serif', color: '#151210', maxWidth: 1100 }}>
      <style>{`
        .rd-card{background:#fff;border:1px solid #E3E0D9;border-radius:14px;}
        .rd-kpi{padding:16px 18px;display:flex;flex-direction:column;gap:5px;}
        .rd-kpi-label{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#6F6C67;}
        .rd-kpi-value{font-family:'Anton',sans-serif;font-size:25px;line-height:1;}
        .rd-seg-card{border-radius:14px;padding:14px 15px;border:1px solid;display:flex;flex-direction:column;gap:6px;}
      `}</style>

      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: '#A87200', textTransform: 'uppercase', marginBottom: 6 }}>{company.name} · Clientes · Piloto</div>
      <h1 style={{ margin: '0 0 20px', fontFamily: "'Anton',sans-serif", fontSize: 27 }}>Radar de clientes</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div className="rd-card rd-kpi"><div className="rd-kpi-label">Receita (Trindade Online)</div><div className="rd-kpi-value">{fmt(receitaBase)}</div></div>
        <div className="rd-card rd-kpi" style={{ borderColor: '#F2CFCB' }}><div className="rd-kpi-label">Receita em risco (estimada)</div><div className="rd-kpi-value" style={{ color: '#D6392B' }}>{fmt(receitaRisco)}</div></div>
        <div className="rd-card rd-kpi"><div className="rd-kpi-label">Taxa de recompra</div><div className="rd-kpi-value">{taxaRecompra}%</div></div>
        <div className="rd-card rd-kpi"><div className="rd-kpi-label">Ticket médio (Trindade Online)</div><div className="rd-kpi-value">{fmt(ticketMedio)}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 18 }}>
        {(Object.keys(SEG_LABEL) as Segmento[]).map(seg => (
          <div key={seg} className="rd-seg-card" style={{ background: SEG_COLOR[seg].bg, borderColor: SEG_COLOR[seg].border }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: SEG_COLOR[seg].fg }}>{SEG_LABEL[seg]}</div>
            <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 26, color: SEG_COLOR[seg].fg }}>{segGroups[seg].length}</div>
          </div>
        ))}
      </div>

      {canais.length > 0 && (
        <div className="rd-card" style={{ padding: '18px 20px', marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Mix de canais de venda</div>
          <div style={{ fontSize: 11.5, color: '#6F6C67', marginTop: 2 }}>A IA lê a conversa e identifica por onde cada venda foi fechada.</div>
          <div style={{ display: 'flex', width: '100%', height: 24, borderRadius: 7, overflow: 'hidden', marginTop: 14 }}>
            {canais.map(c => <div key={c.channel} style={{ width: c.pct + '%', background: c.color }} title={c.label} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px 16px', marginTop: 12 }}>
            {canais.map(c => (
              <div key={c.channel} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: c.color, flex: 'none' }} />
                <div style={{ fontSize: 12, fontWeight: 700 }}>{c.label}</div>
                <div style={{ fontSize: 12, color: '#6F6C67', marginLeft: 'auto' }}>{c.pct}%</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, background: '#EFEEEC', borderRadius: 10, padding: '10px 13px', fontSize: 11.5, lineHeight: 1.5 }}>
            Só a fatia Trindade Online entra na receita acima — as outras mantêm o cliente fora da lista de sumidos, mas não contam como conversão nossa.
          </div>
        </div>
      )}

      <div className="rd-card" style={{ padding: '18px 20px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Prioridade de recuperação</div>
            <div style={{ fontSize: 11.5, color: '#6F6C67' }}>Fiéis em risco primeiro — ordenado por ticket médio.</div>
          </div>
          <a href="/painel/radar/recuperacao" style={{ fontSize: 12.5, fontWeight: 700, background: '#151210', color: '#fff', padding: '9px 16px', borderRadius: 9, textDecoration: 'none' }}>Ver lista completa →</a>
        </div>
        {prioridade.length === 0 ? (
          <div style={{ padding: '14px 0 20px', fontSize: 12.5, color: '#999' }}>Ninguém em risco ou sumido ainda — base pequena no piloto.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr>
                {['Cliente', 'Segmento', 'Pedidos', 'Dias sem comprar'].map(h => <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#6F6C67', padding: '0 12px 9px', borderBottom: '1px solid #E3E0D9' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {prioridade.map(a => (
                  <tr key={a.contact.id}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E3E0D9', fontWeight: 700 }}>{a.contact.name || a.contact.phone}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E3E0D9' }}><span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: SEG_COLOR[a.segmento].bg, color: SEG_COLOR[a.segmento].fg }}>{SEG_LABEL[a.segmento]}</span></td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E3E0D9' }}>{a.orders}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E3E0D9', fontWeight: 700, color: '#D6392B' }}>{a.recenciaDias === Infinity ? '—' : a.recenciaDias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
