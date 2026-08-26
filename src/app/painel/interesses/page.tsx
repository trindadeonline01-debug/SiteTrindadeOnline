'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { moduleActive } from '@/lib/modules'
import EmpresaShell from '@/components/EmpresaShell'
import { fmt, type InteresseItem } from '@/lib/lojaPricing'

type StatusVenda = 'sem_resposta' | 'virou_venda' | 'nao_fechou'
type Interesse = {
  id: string; codigo: string; itens: InteresseItem[]; valor_total: number
  origem: string; cliente_id: string | null; status_venda: StatusVenda; created_at: string
}

const ORIGEM_LABEL: Record<string, string> = {
  whatsapp_link: 'Link WhatsApp', qr_balcao: 'QR do balcão', status: 'Status', portal: 'Portal',
}
const STATUS_LABEL: Record<StatusVenda, string> = { sem_resposta: 'Sem resposta', virou_venda: 'Virou venda', nao_fechou: 'Não fechou' }
const STATUS_COLOR: Record<StatusVenda, { bg: string; fg: string }> = {
  sem_resposta: { bg: '#FEF6DC', fg: '#8A6410' }, virou_venda: { bg: '#E4F3EC', fg: '#157A52' }, nao_fechou: { bg: '#F0EDE8', fg: '#6E6656' },
}
function fmtDateTime(iso: string) { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }

export default function InteressesPage() {
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [crmEnabled, setCrmEnabled] = useState(false)
  const [entregaEnabled, setEntregaEnabled] = useState(false)
  const [interesses, setInteresses] = useState<Interesse[]>([])
  const [filter, setFilter] = useState<'todos' | 'sem_resposta' | 'virou_venda'>('todos')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/interesses'; return }
      const { data: comp } = await supabase.from('companies').select('id, name, loja_digital_enabled, crm_whatsapp_enabled, entrega_enabled, trial_modules_until').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !moduleActive(comp.loja_digital_enabled, comp.trial_modules_until)) { window.location.href = '/painel/compartilhar'; return }
      setCompanyName(comp.name)
      setCrmEnabled(moduleActive(comp.crm_whatsapp_enabled, comp.trial_modules_until))
      setEntregaEnabled(moduleActive(comp.entrega_enabled, comp.trial_modules_until))
      const { data } = await supabase.from('interesses').select('*').eq('company_id', comp.id).order('created_at', { ascending: false }).limit(200)
      setInteresses((data || []) as Interesse[])
      setLoading(false)
    })
  }, [])

  async function setStatus(id: string, status: StatusVenda) {
    setInteresses(prev => prev.map(i => i.id === id ? { ...i, status_venda: status } : i))
    await supabase.from('interesses').update({ status_venda: status }).eq('id', id)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#AAA' }}>Carregando...</div>

  const filtered = interesses.filter(i => filter === 'todos' || i.status_venda === filter)
  const totalValor = interesses.reduce((s, i) => s + Number(i.valor_total), 0)
  const virouVendaCount = interesses.filter(i => i.status_venda === 'virou_venda').length
  const respondidos = interesses.filter(i => i.status_venda !== 'sem_resposta').length
  const taxaConversao = respondidos > 0 ? Math.round((virouVendaCount / respondidos) * 100) : 0
  const ticketMedio = interesses.length > 0 ? totalValor / interesses.length : 0

  return (
    <EmpresaShell active="interesses" companyName={companyName} lojaDigitalEnabled crmEnabled={crmEnabled} entregaEnabled={entregaEnabled}>
      <div className="it-wrap">
        <style>{`
          .it-wrap{ width:100%;max-width:480px;margin:0 auto;min-height:100vh;background:#F7F5F0;font-family:'Inter',sans-serif;font-size:13px;color:#1A1610;padding-bottom:30px;min-width:0;overflow-x:hidden; }
          .it-head{ padding:22px 16px 6px; }
          .it-head h1{ font-size:18px;margin:0 0 3px;font-weight:800; }
          .it-sub{ font-size:11.5px;color:#A79E8B; }
          .it-body{ padding:0 16px; }
          .it-kpis{ display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0; }
          .it-kpi{ background:#fff;border:1px solid #EDE8E0;border-radius:12px;padding:12px; }
          .it-kpi-num{ font-size:19px;font-weight:800; }
          .it-kpi-lbl{ font-size:10.5px;color:#A79E8B;margin-top:2px; }
          .it-tabs{ display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap; }
          .it-tab{ flex:1;min-width:100px;padding:8px 6px;border-radius:9px;border:1px solid #E6E0D2;background:#fff;font-weight:700;font-size:11px;color:#6E6656;cursor:pointer;white-space:nowrap; }
          .it-tab.active{ background:#1A1610;color:#C9951A;border-color:#1A1610; }
          .it-empty{ text-align:center;color:#A79E8B;padding:40px 0;font-size:12.5px; }
          .it-card{ background:#fff;border:1px solid #EDE8E0;border-radius:12px;padding:12px;margin-bottom:10px; }
          .it-row1{ display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:8px; }
          .it-when{ font-size:11px;color:#A79E8B; }
          .it-origem{ font-size:10.5px;color:#8A6410;background:#FBF1DC;padding:2px 8px;border-radius:7px;font-weight:700;display:inline-block;margin-top:3px; }
          .it-badge{ font-size:10px;font-weight:800;padding:3px 8px;border-radius:7px;flex:none;white-space:nowrap; }
          .it-itens{ font-size:12px;color:#333;margin:6px 0; }
          .it-total{ font-weight:800;font-size:14px;margin-top:4px; }
          .it-codigo{ font-size:10.5px;color:#A79E8B;margin-top:2px; }
          .it-noid{ font-size:11px;color:#B5690C;font-weight:600;margin-top:6px;background:#FEF0E0;padding:6px 9px;border-radius:8px; }
          .it-actions{ display:flex;gap:6px;margin-top:10px; }
          .it-abtn{ flex:1;padding:8px;border-radius:8px;border:1px solid #E6E0D2;background:#fff;font-size:11px;font-weight:700;cursor:pointer;color:#6E6656; }
          .it-abtn.on{ background:#157A52;color:#fff;border-color:#157A52; }
          .it-abtn.off{ background:#C43D3D;color:#fff;border-color:#C43D3D; }
          @media(min-width:768px){
            .it-wrap{ max-width:none;margin:0;padding-bottom:40px; }
            .it-head{ padding:28px 32px 6px; }
            .it-body{ padding:0 32px; }
            .it-kpis{ grid-template-columns:repeat(4,1fr); }
            .it-grid{ display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px; }
          }
        `}</style>
        <div className="it-head">
          <h1>Interesses</h1>
          <div className="it-sub">Carrinho com valor que o cliente enviou — não é venda até você confirmar</div>
        </div>
        <div className="it-body">
          <div className="it-kpis">
            <div className="it-kpi"><div className="it-kpi-num">{fmt(totalValor)}</div><div className="it-kpi-lbl">Interesse recebido</div></div>
            <div className="it-kpi"><div className="it-kpi-num">{interesses.length}</div><div className="it-kpi-lbl">Carrinhos enviados</div></div>
            <div className="it-kpi"><div className="it-kpi-num">{taxaConversao}%</div><div className="it-kpi-lbl">Virou venda</div></div>
            <div className="it-kpi"><div className="it-kpi-num">{fmt(ticketMedio)}</div><div className="it-kpi-lbl">Ticket médio</div></div>
          </div>
          <div className="it-tabs">
            <button className={`it-tab ${filter === 'todos' ? 'active' : ''}`} onClick={() => setFilter('todos')}>Todos ({interesses.length})</button>
            <button className={`it-tab ${filter === 'sem_resposta' ? 'active' : ''}`} onClick={() => setFilter('sem_resposta')}>Sem resposta ({interesses.filter(i => i.status_venda === 'sem_resposta').length})</button>
            <button className={`it-tab ${filter === 'virou_venda' ? 'active' : ''}`} onClick={() => setFilter('virou_venda')}>Virou venda ({virouVendaCount})</button>
          </div>
          {filtered.length === 0 && (
            <div className="it-empty">{interesses.length === 0 ? 'Nenhum interesse ainda — aparece aqui quando um cliente monta carrinho e manda no WhatsApp.' : 'Nenhum interesse nesse filtro.'}</div>
          )}
          <div className="it-grid">
            {filtered.map(i => {
              const c = STATUS_COLOR[i.status_venda]
              return (
                <div className="it-card" key={i.id}>
                  <div className="it-row1">
                    <div>
                      <div className="it-when">{fmtDateTime(i.created_at)}</div>
                      <span className="it-origem">{ORIGEM_LABEL[i.origem] || i.origem}</span>
                    </div>
                    <span className="it-badge" style={{ background: c.bg, color: c.fg }}>{STATUS_LABEL[i.status_venda]}</span>
                  </div>
                  <div className="it-itens">{i.itens.map(it => `${it.qtd}x ${it.nome}`).join(' · ')}</div>
                  <div className="it-total">{fmt(Number(i.valor_total))}</div>
                  <div className="it-codigo">Código {i.codigo}</div>
                  {!i.cliente_id && (
                    <div className="it-noid">👤 Não identificado — conecte o CRM WhatsApp pra saber quem foi</div>
                  )}
                  <div className="it-actions">
                    <button className={`it-abtn ${i.status_venda === 'virou_venda' ? 'on' : ''}`} onClick={() => setStatus(i.id, 'virou_venda')}>✓ Virou venda</button>
                    <button className={`it-abtn ${i.status_venda === 'nao_fechou' ? 'off' : ''}`} onClick={() => setStatus(i.id, 'nao_fechou')}>✕ Não fechou</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </EmpresaShell>
  )
}
