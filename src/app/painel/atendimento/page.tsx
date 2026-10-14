'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePainelShell } from '@/contexts/PainelShellContext'
import PeriodFilterBar from '@/components/admin/PeriodFilterBar'
import { PeriodSel, periodRange, periodLabel } from '@/lib/periodFilter'

type DiarioRow = {
  date: string
  novos_clientes: number
  respondidos: number
  vendas_primeira_vez: number
  vendas_recompra: number
  evadiram_sem_resposta: number
  reclamacoes_demora: number
  vendas_perdidas_demora: number
  tempo_resposta_min: number | null
  sem_primeiro_atendimento: number
  aguardando_mais_1h: number
  sem_resposta_agora: number
}

type Resumo = {
  tipo_evento: 'infantil' | 'casamento' | 'debutante' | 'corporativo' | 'outro' | null
  interesse: 'so_espaco' | 'espaco_buffet' | null
  fechou: boolean
  fechou_em: string | null
  recompra: boolean
  reclamou_demora: boolean
  reclamou_em: string | null
  perdeu_por_demora: boolean
  perdeu_em: string | null
  nota: string
}
type ContatoEstado = { contact_id: string; resumo: Resumo; contact: { name: string | null; phone: string } | null }

// Linhas das funções de drill-down (crm_atendimento_agora_detalhe /
// crm_atendimento_periodo_detalhe) — pedido do Ricardo, out/2026: clicar
// num card/calendário e ver os contatos de verdade por trás do número, com
// link direto pra conversa em Mensagens.
type AgoraRow = { contact_id: string; name: string | null; phone: string; last_in: string; last_out: string | null; sem_primeiro: boolean; aguardando_1h: boolean }
type PeriodoRow = { contact_id: string; name: string | null; phone: string; primeiro_contato: string; first_out: string | null; last_in: string; respondeu: boolean; evadiu: boolean; tempo_resposta_min: number | null }
type DrawerRow = { id: string; title: string; sub: string }
type Drawer = { title: string; note?: string; loading: boolean; rows: DrawerRow[] }

function displayName(name: string | null | undefined, phone: string | undefined | null): string {
  return name && name !== '.' ? name : (phone || '—')
}
function fmtDataHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const TIPO_EVENTO_LABEL: Record<string, string> = { infantil: 'Festa infantil', casamento: 'Casamento', debutante: 'Debutante / 15 anos', corporativo: 'Corporativo', outro: 'Outro' }
const INTERESSE_LABEL: Record<string, string> = { so_espaco: 'Só o espaço', espaco_buffet: 'Espaço + buffet completo' }
const WEEKDAY = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTH_NAME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function fmtPct(n: number) { return (n * 100).toFixed(0) + '%' }
function fmtMin(n: number) { return n >= 120 ? (n / 60).toFixed(1) + 'h' : Math.round(n) + ' min' }
function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }

export default function PainelAtendimentoPage() {
  const { company, loading: shellLoading } = usePainelShell()
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodSel>({ kind: 'month' })
  const [todasLinhas, setTodasLinhas] = useState<DiarioRow[]>([])
  const [estados, setEstados] = useState<ContatoEstado[]>([])
  const [calMes, setCalMes] = useState<{ y: number; m: number } | null>(null)
  const [drawer, setDrawer] = useState<Drawer | null>(null)

  // Link pra conversa real em Mensagens — preserva ?empresa= quando quem
  // clica é o admin em modo impersonação (mesmo padrão do resto do painel).
  function linkMensagens(contactId: string): string {
    const empresa = new URLSearchParams(window.location.search).get('empresa')
    return `/painel/mensagens?contato=${contactId}` + (empresa ? `&empresa=${empresa}` : '')
  }

  useEffect(() => {
    if (shellLoading) return
    if (!company || !company.crm_atendimento_pilot) { window.location.href = '/painel'; return }
  }, [shellLoading, company?.id, company?.crm_atendimento_pilot])

  useEffect(() => {
    if (!company?.id) return
    setLoading(true)
    Promise.all([
      supabase.from('crm_atendimento_diario').select('date,novos_clientes,respondidos,vendas_primeira_vez,vendas_recompra,evadiram_sem_resposta,reclamacoes_demora,vendas_perdidas_demora,tempo_resposta_min,sem_primeiro_atendimento,aguardando_mais_1h,sem_resposta_agora').eq('company_id', company.id).order('date', { ascending: true }),
      supabase.from('crm_atendimento_contato_estado').select('contact_id,resumo,contact:crm_contacts(name,phone)').eq('company_id', company.id),
    ]).then(([diarioRes, estadoRes]) => {
      setTodasLinhas((diarioRes.data || []) as any)
      setEstados((estadoRes.data || []) as any)
      setLoading(false)
    })
  }, [company?.id])

  // Mês mostrado no calendário: segue o fim do período escolhido, mas só
  // quando o usuário troca o filtro — navegar com as setas não pode ser
  // desfeito a cada re-render (mesmo problema resolvido no protótipo).
  const { from, to } = periodRange(period)
  const fromDate = from ? from.slice(0, 10) : null
  const toDate = to ? new Date(new Date(to).getTime() - 86400000).toISOString().slice(0, 10) : todayISO()
  useEffect(() => {
    const d = new Date(toDate + 'T00:00:00')
    setCalMes({ y: d.getFullYear(), m: d.getMonth() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.kind, period.monthIndex, period.customFrom, period.customTo])

  const linhasPeriodo = useMemo(
    () => todasLinhas.filter(r => (!fromDate || r.date >= fromDate) && r.date <= toDate),
    [todasLinhas, fromDate, toDate]
  )

  const hojeRow = todasLinhas.length ? todasLinhas[todasLinhas.length - 1] : null

  const kpis = useMemo(() => {
    const sum = (k: keyof DiarioRow) => linhasPeriodo.reduce((s, r) => s + (Number(r[k]) || 0), 0)
    const novos = sum('novos_clientes')
    const respondidos = sum('respondidos')
    const primeiraVez = sum('vendas_primeira_vez')
    const recompra = sum('vendas_recompra')
    const evadiram = sum('evadiram_sem_resposta')
    const reclamacoes = sum('reclamacoes_demora')
    const perdidas = sum('vendas_perdidas_demora')
    const tempoNum = linhasPeriodo.reduce((s, r) => s + (r.tempo_resposta_min != null ? r.tempo_resposta_min * r.respondidos : 0), 0)
    const tempoDen = linhasPeriodo.reduce((s, r) => s + (r.tempo_resposta_min != null ? r.respondidos : 0), 0)
    return {
      novos, respondidos, fechadas: primeiraVez + recompra, primeiraVez, recompra,
      evadiram, reclamacoes, perdidas,
      tempoMedio: tempoDen > 0 ? tempoNum / tempoDen : null,
    }
  }, [linhasPeriodo])

  const perfilEvento = useMemo(() => {
    const m = new Map<string, number>()
    estados.forEach(e => { const t = e.resumo?.tipo_evento; if (t) m.set(t, (m.get(t) || 0) + 1) })
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0)
    return Array.from(m.entries()).map(([k, v]) => ({ label: TIPO_EVENTO_LABEL[k] || k, qtd: v, pct: total ? v / total : 0 })).sort((a, b) => b.qtd - a.qtd)
  }, [estados])

  const perfilInteresse = useMemo(() => {
    const m = new Map<string, number>()
    estados.forEach(e => { const t = e.resumo?.interesse; if (t) m.set(t, (m.get(t) || 0) + 1) })
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0)
    return Array.from(m.entries()).map(([k, v]) => ({ label: INTERESSE_LABEL[k] || k, qtd: v, pct: total ? v / total : 0 })).sort((a, b) => b.qtd - a.qtd)
  }, [estados])

  const perdidasLista = useMemo(
    () => estados.filter(e => e.resumo?.perdeu_por_demora).sort((a, b) => (b.resumo.perdeu_em || '').localeCompare(a.resumo.perdeu_em || '')),
    [estados]
  )

  // "Vendas fechadas" e "Reclamações por demora" já vêm de dado carregado
  // (estados), filtrado pelo mesmo período escolhido nos filtros — sem
  // precisar de outra consulta, igual o resto do rollup.
  const vendasFechadasLista = useMemo(
    () => estados.filter(e => e.resumo?.fechou && e.resumo.fechou_em && e.resumo.fechou_em >= (fromDate || '0000-01-01') && e.resumo.fechou_em <= toDate)
      .sort((a, b) => (b.resumo.fechou_em || '').localeCompare(a.resumo.fechou_em || '')),
    [estados, fromDate, toDate]
  )
  const reclamacoesLista = useMemo(
    () => estados.filter(e => e.resumo?.reclamou_demora && e.resumo.reclamou_em && e.resumo.reclamou_em >= (fromDate || '0000-01-01') && e.resumo.reclamou_em <= toDate)
      .sort((a, b) => (b.resumo.reclamou_em || '').localeCompare(a.resumo.reclamou_em || '')),
    [estados, fromDate, toDate]
  )

  function abrirDeEstados(title: string, lista: ContatoEstado[], subFn: (e: ContatoEstado) => string) {
    setDrawer({
      title, loading: false,
      rows: lista.map(e => ({ id: e.contact_id, title: displayName(e.contact?.name, e.contact?.phone), sub: subFn(e) })),
    })
  }

  async function abrirAgora(tipo: 'sem_primeiro' | 'aguardando_1h' | 'todos', title: string) {
    if (!company?.id) return
    setDrawer({ title, loading: true, rows: [] })
    const { data, error } = await supabase.rpc('crm_atendimento_agora_detalhe', { p_company_id: company.id })
    const rows = ((data || []) as AgoraRow[]).filter(r => tipo === 'todos' || (tipo === 'sem_primeiro' ? r.sem_primeiro : r.aguardando_1h))
    setDrawer({
      title, loading: false,
      note: error ? 'Não consegui carregar a lista agora — tenta de novo.' : undefined,
      rows: rows.map(r => ({ id: r.contact_id, title: displayName(r.name, r.phone), sub: r.sem_primeiro ? `Esperando desde ${fmtDataHora(r.last_in)} · nunca respondido` : `Cliente escreveu de novo às ${fmtDataHora(r.last_in)}` })),
    })
  }

  async function abrirPeriodo(tipo: 'todos' | 'evadiram' | 'respondidos', title: string) {
    if (!company?.id) return
    setDrawer({ title, loading: true, rows: [] })
    const { data, error } = await supabase.rpc('crm_atendimento_periodo_detalhe', { p_company_id: company.id, p_from: fromDate || '2000-01-01', p_to: toDate })
    const rows = ((data || []) as PeriodoRow[]).filter(r => tipo === 'todos' ? true : tipo === 'evadiram' ? r.evadiu : r.respondeu)
    setDrawer({
      title, loading: false,
      note: error ? 'Não consegui carregar a lista agora — tenta de novo.' : undefined,
      rows: rows.map(r => ({
        id: r.contact_id, title: displayName(r.name, r.phone),
        sub: `1º contato ${fmtDataHora(r.primeiro_contato + 'T00:00:00')}` + (r.respondeu ? ` · respondido em ${r.tempo_resposta_min != null ? fmtMin(r.tempo_resposta_min) : '—'}` : r.evadiu ? ' · evadiu sem resposta' : ' · ainda sem resposta'),
      })),
    })
  }

  async function abrirDia(dateStr: string) {
    if (!company?.id) return
    const d = new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR')
    setDrawer({ title: `Novos clientes em ${d}`, loading: true, rows: [] })
    const { data, error } = await supabase.rpc('crm_atendimento_periodo_detalhe', { p_company_id: company.id, p_from: dateStr, p_to: dateStr })
    setDrawer({
      title: `Novos clientes em ${d}`, loading: false,
      note: error ? 'Não consegui carregar a lista agora — tenta de novo.' : undefined,
      rows: ((data || []) as PeriodoRow[]).map(r => ({
        id: r.contact_id, title: displayName(r.name, r.phone),
        sub: r.respondeu ? `Respondido em ${r.tempo_resposta_min != null ? fmtMin(r.tempo_resposta_min) : '—'}` : r.evadiu ? 'Evadiu sem resposta' : 'Ainda sem resposta',
      })),
    })
  }

  const maxNovosDia = useMemo(() => Math.max(1, ...todasLinhas.map(r => r.novos_clientes)), [todasLinhas])
  const linhasPorData = useMemo(() => new Map(todasLinhas.map(r => [r.date, r])), [todasLinhas])

  const diasDisponiveis = useMemo(() => {
    if (todasLinhas.length === 0) return null
    const min = new Date(todasLinhas[0].date + 'T00:00:00')
    const max = new Date(todasLinhas[todasLinhas.length - 1].date + 'T00:00:00')
    return { minIdx: min.getFullYear() * 12 + min.getMonth(), maxIdx: max.getFullYear() * 12 + max.getMonth() }
  }, [todasLinhas])

  function shiftMes(delta: number) {
    if (!calMes || !diasDisponiveis) return
    let idx = calMes.y * 12 + calMes.m + delta
    idx = Math.max(diasDisponiveis.minIdx, Math.min(diasDisponiveis.maxIdx, idx))
    setCalMes({ y: Math.floor(idx / 12), m: idx % 12 })
  }

  if (shellLoading || loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#AAA' }}>Carregando...</div>
  if (!company?.crm_atendimento_pilot) return null

  const calIdx = calMes ? calMes.y * 12 + calMes.m : 0

  return (
    <div className="pa-wrap">
      <style>{`
        .pa-wrap{ padding:20px 16px 48px; }
        @media(min-width:768px){ .pa-wrap{ padding:28px 32px 48px; } }
        .pa-banner{ display:flex;gap:8px;align-items:flex-start;background:#FDF6E8;border:1px solid #EAD9AE;border-radius:10px;padding:10px 14px;font-size:12px;color:var(--muted);margin-bottom:18px;line-height:1.5; }
        .pa-section-title{ font-size:11.5px;font-weight:800;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin:0 0 10px; }
        .pa-kpis{ display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:22px; }
        @media(min-width:768px){ .pa-kpis{ grid-template-columns:repeat(3,1fr); } }
        .pa-kpi{ background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px; }
        .pa-kpi.warn{ border-left:3px solid #B5690C; }
        .pa-kpi.alert{ border-left:3px solid #C43D3D; }
        .pa-kpi-lbl{ font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:6px; }
        .pa-kpi-val{ font-family:'Anton',sans-serif;font-size:24px;color:var(--ink); }
        .pa-kpi-sub{ font-size:11.5px;color:var(--muted);margin-top:4px; }
        .pa-grid2{ display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:22px; }
        @media(min-width:900px){ .pa-grid2{ grid-template-columns:1fr 1fr; } }
        .pa-grid3{ display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:22px; }
        @media(min-width:900px){ .pa-grid3{ grid-template-columns:1fr 1fr 1fr; } }
        .pa-card{ background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px; }
        .pa-card-title{ font-size:11.5px;font-weight:800;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:14px; }
        .pa-empty{ text-align:center;color:var(--muted);font-size:12.5px;padding:24px 0; }

        .pa-bar-row + .pa-bar-row{ margin-top:12px; }
        .pa-bar-top{ display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px; }
        .pa-bar-track{ height:7px;border-radius:999px;background:var(--concrete-2);overflow:hidden; }
        .pa-bar-fill{ height:100%;border-radius:999px;background:#A87200; }

        .pa-cal-head{ display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:10px; }
        .pa-cal-month{ font-family:'Anton',sans-serif;font-size:14px;color:var(--ink);text-transform:capitalize;min-width:9rem;text-align:center; }
        .pa-cal-nav{ width:26px;height:26px;border-radius:50%;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:15px;line-height:1; }
        .pa-cal-nav:disabled{ opacity:.3;cursor:default; }
        .pa-cal-weekdays{ display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:10px;font-weight:800;color:var(--muted);margin-bottom:4px; }
        .pa-cal-grid{ display:grid;grid-template-columns:repeat(7,1fr);gap:4px; }
        .pa-cal-cell{ position:relative;aspect-ratio:1;border-radius:8px;display:flex;align-items:center;justify-content:center; }
        .pa-cal-cell.blank{ visibility:hidden; }
        .pa-cal-daynum{ position:absolute;top:2px;right:4px;font-size:9px;font-weight:600;color:var(--muted); }
        .pa-cal-count{ font-family:'Anton',sans-serif;font-size:14px;color:var(--ink); }
        .pa-cal-dot{ position:absolute;bottom:3px;width:5px;height:5px;border-radius:50%;background:#C43D3D; }
        .pa-cal-legend{ display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:12px;font-size:10.5px;color:var(--muted); }
        .pa-cal-swatch{ width:11px;height:11px;border-radius:3px;display:inline-block;margin-right:2px; }
        .pa-cal-dotlegend{ width:7px;height:7px;border-radius:50%;background:#C43D3D;display:inline-block;margin-right:5px; }

        .pa-table{ width:100%;border-collapse:collapse;font-size:12.5px; }
        .pa-table th{ text-align:left;font-size:10.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding:0 8px 8px;border-bottom:1px solid var(--line); }
        .pa-table td{ padding:9px 8px;border-bottom:1px solid #F5F2EC;vertical-align:top; }
        .pa-table tr:last-child td{ border-bottom:none; }
        .pa-tag{ display:inline-block;font-size:10px;font-weight:700;color:#C43D3D;background:#FBE8E6;padding:1px 7px;border-radius:999px;margin-left:6px;white-space:nowrap; }

        .pa-clickable{ cursor:pointer;transition:box-shadow .12s ease,transform .12s ease; }
        .pa-clickable:hover{ box-shadow:0 2px 10px rgba(0,0,0,.08);transform:translateY(-1px); }
        .pa-cal-cell.pa-clickable:hover{ outline:1.5px solid #A87200; }
        .pa-row-clickable{ cursor:pointer; }
        .pa-row-clickable:hover{ background:#FBF8F2; }

        .pa-drawer-backdrop{ position:fixed;inset:0;background:rgba(20,15,5,.35);z-index:60; }
        .pa-drawer{ position:fixed;right:0;top:0;bottom:0;width:100%;max-width:420px;background:#fff;z-index:61;display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(0,0,0,.2); }
        .pa-drawer-hd{ display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:16px;border-bottom:1px solid var(--line); }
        .pa-drawer-title{ font-family:'Anton',sans-serif;font-size:16px;color:var(--ink); }
        .pa-drawer-count{ font-size:11.5px;color:var(--muted);margin-top:3px; }
        .pa-drawer-close{ border:none;background:var(--concrete-2);width:28px;height:28px;border-radius:50%;font-size:14px;cursor:pointer;flex:none; }
        .pa-drawer-body{ flex:1;overflow-y:auto; }
        .pa-drawer-row{ display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 16px;border-bottom:1px solid #F5F2EC;text-decoration:none;color:inherit; }
        .pa-drawer-row:hover{ background:#FBF8F2; }
        .pa-drawer-row-name{ font-size:13px;font-weight:700;color:var(--ink); }
        .pa-drawer-row-sub{ font-size:11.5px;color:var(--muted);margin-top:2px; }
        .pa-drawer-row-arrow{ color:#C9C4B5;font-size:15px;flex:none; }
      `}</style>

      <div className="pa-banner">
        🧪 <span><b>Painel em piloto</b> — os números vêm da classificação automática das conversas do WhatsApp, atualizada algumas vezes por dia. Se algo parecer estranho, me avisa.</span>
      </div>

      <div style={{ marginBottom: 18 }}>
        <PeriodFilterBar value={period} onChange={setPeriod} />
      </div>

      <p className="pa-section-title">Agora</p>
      <div className="pa-kpis">
        <div className="pa-kpi warn pa-clickable" onClick={() => abrirAgora('sem_primeiro', 'Sem primeiro atendimento')}>
          <div className="pa-kpi-lbl">Sem primeiro atendimento</div>
          <div className="pa-kpi-val">{hojeRow?.sem_primeiro_atendimento ?? 0}</div>
        </div>
        <div className="pa-kpi alert pa-clickable" onClick={() => abrirAgora('aguardando_1h', 'Aguardando +1h')}>
          <div className="pa-kpi-lbl">Aguardando +1h</div>
          <div className="pa-kpi-val">{hojeRow?.aguardando_mais_1h ?? 0}</div>
        </div>
        <div className="pa-kpi alert pa-clickable" onClick={() => abrirAgora('todos', 'Sem resposta agora')}>
          <div className="pa-kpi-lbl">Sem resposta agora</div>
          <div className="pa-kpi-val">{hojeRow?.sem_resposta_agora ?? 0}</div>
        </div>
      </div>

      <p className="pa-section-title">No período · {periodLabel(period)}</p>
      <div className="pa-kpis">
        <div className="pa-kpi pa-clickable" onClick={() => abrirPeriodo('todos', 'Novos clientes')}>
          <div className="pa-kpi-lbl">Novos clientes</div>
          <div className="pa-kpi-val">{kpis.novos}</div>
        </div>
        <div className="pa-kpi pa-clickable" onClick={() => abrirPeriodo('respondidos', 'Taxa de resposta')}>
          <div className="pa-kpi-lbl">Taxa de resposta</div>
          <div className="pa-kpi-val">{kpis.novos ? fmtPct(kpis.respondidos / kpis.novos) : '—'}</div>
          <div className="pa-kpi-sub">{kpis.respondidos} de {kpis.novos}</div>
        </div>
        <div className="pa-kpi pa-clickable" onClick={() => abrirPeriodo('respondidos', 'Tempo de resposta')}>
          <div className="pa-kpi-lbl">Tempo médio de resposta</div>
          <div className="pa-kpi-val">{kpis.tempoMedio != null ? fmtMin(kpis.tempoMedio) : '—'}</div>
        </div>
        <div className="pa-kpi pa-clickable" onClick={() => abrirDeEstados('Vendas fechadas', vendasFechadasLista, e => `Fechou em ${e.resumo.fechou_em ? new Date(e.resumo.fechou_em + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}${e.resumo.recompra ? ' · recompra' : ' · primeira vez'}`)}>
          <div className="pa-kpi-lbl">Vendas fechadas</div>
          <div className="pa-kpi-val">{kpis.fechadas}</div>
          <div className="pa-kpi-sub">{kpis.primeiraVez} primeira vez · {kpis.recompra} recompra</div>
        </div>
        <div className="pa-kpi alert pa-clickable" onClick={() => abrirPeriodo('evadiram', 'Evadiram sem resposta')}>
          <div className="pa-kpi-lbl">Evadiram sem resposta</div>
          <div className="pa-kpi-val">{kpis.evadiram}</div>
          <div className="pa-kpi-sub">{kpis.novos ? fmtPct(kpis.evadiram / kpis.novos) + ' dos novos' : '—'}</div>
        </div>
        <div className="pa-kpi warn pa-clickable" onClick={() => abrirDeEstados('Reclamações por demora', reclamacoesLista, e => `Reclamou em ${e.resumo.reclamou_em ? new Date(e.resumo.reclamou_em + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}`)}>
          <div className="pa-kpi-lbl">Reclamações por demora</div>
          <div className="pa-kpi-val">{kpis.reclamacoes}</div>
        </div>
      </div>

      <p className="pa-section-title">Novos clientes por dia</p>
      <div className="pa-card" style={{ marginBottom: 22 }}>
        {!calMes || !diasDisponiveis ? (
          <div className="pa-empty">Ainda não há dias classificados.</div>
        ) : (
          <>
            <div className="pa-cal-head">
              <button className="pa-cal-nav" disabled={calIdx <= diasDisponiveis.minIdx} onClick={() => shiftMes(-1)}>‹</button>
              <div className="pa-cal-month">{MONTH_NAME[calMes.m]} de {calMes.y}</div>
              <button className="pa-cal-nav" disabled={calIdx >= diasDisponiveis.maxIdx} onClick={() => shiftMes(1)}>›</button>
            </div>
            <div className="pa-cal-weekdays">{WEEKDAY.map((w, i) => <span key={i}>{w}</span>)}</div>
            <CalendarioGrid mes={calMes} linhasPorData={linhasPorData} maxNovos={maxNovosDia} fromDate={fromDate} toDate={toDate} hoje={todayISO()} onDayClick={abrirDia} />
            <div className="pa-cal-legend">
              <span>menos</span>
              {[8, 30, 55, 80, 100].map(p => <span key={p} className="pa-cal-swatch" style={{ background: `color-mix(in srgb, #A87200 ${p}%, #fff)` }} />)}
              <span>mais</span>
              <span style={{ marginLeft: 10 }}><span className="pa-cal-dotlegend" />venda fechada</span>
              <span style={{ marginLeft: 10, opacity: .6 }}>apagado = fora do período escolhido</span>
            </div>
          </>
        )}
      </div>

      <p className="pa-section-title">Perfil do lead <span style={{ fontWeight: 400, textTransform: 'none' }}>· histórico completo</span></p>
      <div className="pa-grid2">
        <div className="pa-card">
          <div className="pa-card-title">Tipo de evento</div>
          {perfilEvento.length === 0 ? <div className="pa-empty">Ainda sem dado suficiente.</div> : perfilEvento.map(b => (
            <div className="pa-bar-row pa-clickable" key={b.label} onClick={() => abrirDeEstados(b.label, estados.filter(e => TIPO_EVENTO_LABEL[e.resumo?.tipo_evento || ''] === b.label), e => e.resumo.nota)}>
              <div className="pa-bar-top"><span>{b.label}</span><span>{b.qtd} · {fmtPct(b.pct)}</span></div>
              <div className="pa-bar-track"><div className="pa-bar-fill" style={{ width: fmtPct(b.pct) }} /></div>
            </div>
          ))}
        </div>
        <div className="pa-card">
          <div className="pa-card-title">Interesse</div>
          {perfilInteresse.length === 0 ? <div className="pa-empty">Ainda sem dado suficiente.</div> : perfilInteresse.map(b => (
            <div className="pa-bar-row pa-clickable" key={b.label} onClick={() => abrirDeEstados(b.label, estados.filter(e => INTERESSE_LABEL[e.resumo?.interesse || ''] === b.label), e => e.resumo.nota)}>
              <div className="pa-bar-top"><span>{b.label}</span><span>{b.qtd} · {fmtPct(b.pct)}</span></div>
              <div className="pa-bar-track"><div className="pa-bar-fill" style={{ width: fmtPct(b.pct), background: '#157A52' }} /></div>
            </div>
          ))}
        </div>
      </div>

      <p className="pa-section-title">Vendas perdidas por demora <span style={{ fontWeight: 400, textTransform: 'none' }}>· histórico completo</span></p>
      <div className="pa-card">
        {perdidasLista.length === 0 ? (
          <div className="pa-empty">Nenhum caso confirmado até agora — ótimo sinal.</div>
        ) : (
          <table className="pa-table">
            <thead><tr><th>Data</th><th>Cliente</th><th>Anotação da IA</th></tr></thead>
            <tbody>
              {perdidasLista.map(e => (
                <tr key={e.contact_id} className="pa-row-clickable" onClick={() => window.location.href = linkMensagens(e.contact_id)}>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.resumo.perdeu_em ? new Date(e.resumo.perdeu_em + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{displayName(e.contact?.name, e.contact?.phone)}<span className="pa-tag">perdida</span></td>
                  <td>{e.resumo.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawer && (
        <>
          <div className="pa-drawer-backdrop" onClick={() => setDrawer(null)} />
          <div className="pa-drawer">
            <div className="pa-drawer-hd">
              <div>
                <div className="pa-drawer-title">{drawer.title}</div>
                <div className="pa-drawer-count">{drawer.loading ? 'Carregando...' : `${drawer.rows.length} contato(s)`}</div>
              </div>
              <button className="pa-drawer-close" onClick={() => setDrawer(null)}>✕</button>
            </div>
            <div className="pa-drawer-body">
              {drawer.note && <div className="pa-empty" style={{ padding: 16 }}>{drawer.note}</div>}
              {!drawer.loading && drawer.rows.length === 0 && !drawer.note && <div className="pa-empty" style={{ padding: 24 }}>Nenhum contato aqui.</div>}
              {drawer.rows.map(r => (
                <a key={r.id} className="pa-drawer-row" href={linkMensagens(r.id)}>
                  <div>
                    <div className="pa-drawer-row-name">{r.title}</div>
                    <div className="pa-drawer-row-sub">{r.sub}</div>
                  </div>
                  <span className="pa-drawer-row-arrow">›</span>
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CalendarioGrid({ mes, linhasPorData, maxNovos, fromDate, toDate, hoje, onDayClick }: {
  mes: { y: number; m: number }
  linhasPorData: Map<string, DiarioRow>
  maxNovos: number
  fromDate: string | null
  toDate: string
  hoje: string
  onDayClick: (dateStr: string) => void
}) {
  const firstWeekday = new Date(mes.y, mes.m, 1).getDay()
  const daysInMonth = new Date(mes.y, mes.m + 1, 0).getDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstWeekday + 1
    if (dayNum < 1 || dayNum > daysInMonth) { cells.push(<div key={i} className="pa-cal-cell blank" />); continue }
    const dateStr = mes.y + '-' + String(mes.m + 1).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0')
    const row = linhasPorData.get(dateStr)
    if (!row) { cells.push(<div key={i} className="pa-cal-cell"><span className="pa-cal-daynum">{dayNum}</span></div>); continue }
    const inRange = (!fromDate || dateStr >= fromDate) && dateStr <= toDate
    const pct = Math.round(8 + (row.novos_clientes / maxNovos) * 85)
    const isToday = dateStr === hoje
    cells.push(
      <div
        key={i}
        className="pa-cal-cell pa-clickable"
        onClick={() => onDayClick(dateStr)}
        style={{
          background: `color-mix(in srgb, #A87200 ${pct}%, #fff)`,
          opacity: inRange ? 1 : .3,
          boxShadow: isToday ? 'inset 0 0 0 1.5px #8C3A4A' : 'none',
        }}
        title={`${dayNum}/${mes.m + 1}: ${row.novos_clientes} novo(s) cliente(s)${row.vendas_primeira_vez + row.vendas_recompra > 0 ? `, ${row.vendas_primeira_vez + row.vendas_recompra} venda(s) fechada(s)` : ''}`}
      >
        <span className="pa-cal-daynum">{dayNum}</span>
        <span className="pa-cal-count">{row.novos_clientes}</span>
        {(row.vendas_primeira_vez + row.vendas_recompra) > 0 && <span className="pa-cal-dot" />}
      </div>
    )
  }
  return <div className="pa-cal-grid">{cells}</div>
}
