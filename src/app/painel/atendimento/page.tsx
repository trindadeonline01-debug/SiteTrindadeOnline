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
  recompra: boolean
  perdeu_por_demora: boolean
  perdeu_em: string | null
  nota: string
}
type ContatoEstado = { contact_id: string; resumo: Resumo; contact: { name: string | null; phone: string } | null }

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
      `}</style>

      <div className="pa-banner">
        🧪 <span><b>Painel em piloto</b> — os números vêm da classificação automática das conversas do WhatsApp, atualizada algumas vezes por dia. Se algo parecer estranho, me avisa.</span>
      </div>

      <div style={{ marginBottom: 18 }}>
        <PeriodFilterBar value={period} onChange={setPeriod} />
      </div>

      <p className="pa-section-title">Agora</p>
      <div className="pa-kpis">
        <div className="pa-kpi warn">
          <div className="pa-kpi-lbl">Sem primeiro atendimento</div>
          <div className="pa-kpi-val">{hojeRow?.sem_primeiro_atendimento ?? 0}</div>
        </div>
        <div className="pa-kpi alert">
          <div className="pa-kpi-lbl">Aguardando +1h</div>
          <div className="pa-kpi-val">{hojeRow?.aguardando_mais_1h ?? 0}</div>
        </div>
        <div className="pa-kpi alert">
          <div className="pa-kpi-lbl">Sem resposta agora</div>
          <div className="pa-kpi-val">{hojeRow?.sem_resposta_agora ?? 0}</div>
        </div>
      </div>

      <p className="pa-section-title">No período · {periodLabel(period)}</p>
      <div className="pa-kpis">
        <div className="pa-kpi">
          <div className="pa-kpi-lbl">Novos clientes</div>
          <div className="pa-kpi-val">{kpis.novos}</div>
        </div>
        <div className="pa-kpi">
          <div className="pa-kpi-lbl">Taxa de resposta</div>
          <div className="pa-kpi-val">{kpis.novos ? fmtPct(kpis.respondidos / kpis.novos) : '—'}</div>
          <div className="pa-kpi-sub">{kpis.respondidos} de {kpis.novos}</div>
        </div>
        <div className="pa-kpi">
          <div className="pa-kpi-lbl">Tempo médio de resposta</div>
          <div className="pa-kpi-val">{kpis.tempoMedio != null ? fmtMin(kpis.tempoMedio) : '—'}</div>
        </div>
        <div className="pa-kpi">
          <div className="pa-kpi-lbl">Vendas fechadas</div>
          <div className="pa-kpi-val">{kpis.fechadas}</div>
          <div className="pa-kpi-sub">{kpis.primeiraVez} primeira vez · {kpis.recompra} recompra</div>
        </div>
        <div className="pa-kpi alert">
          <div className="pa-kpi-lbl">Evadiram sem resposta</div>
          <div className="pa-kpi-val">{kpis.evadiram}</div>
          <div className="pa-kpi-sub">{kpis.novos ? fmtPct(kpis.evadiram / kpis.novos) + ' dos novos' : '—'}</div>
        </div>
        <div className="pa-kpi warn">
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
            <CalendarioGrid mes={calMes} linhasPorData={linhasPorData} maxNovos={maxNovosDia} fromDate={fromDate} toDate={toDate} hoje={todayISO()} />
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
            <div className="pa-bar-row" key={b.label}>
              <div className="pa-bar-top"><span>{b.label}</span><span>{b.qtd} · {fmtPct(b.pct)}</span></div>
              <div className="pa-bar-track"><div className="pa-bar-fill" style={{ width: fmtPct(b.pct) }} /></div>
            </div>
          ))}
        </div>
        <div className="pa-card">
          <div className="pa-card-title">Interesse</div>
          {perfilInteresse.length === 0 ? <div className="pa-empty">Ainda sem dado suficiente.</div> : perfilInteresse.map(b => (
            <div className="pa-bar-row" key={b.label}>
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
                <tr key={e.contact_id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.resumo.perdeu_em ? new Date(e.resumo.perdeu_em + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.contact?.name && e.contact.name !== '.' ? e.contact.name : e.contact?.phone}<span className="pa-tag">perdida</span></td>
                  <td>{e.resumo.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function CalendarioGrid({ mes, linhasPorData, maxNovos, fromDate, toDate, hoje }: {
  mes: { y: number; m: number }
  linhasPorData: Map<string, DiarioRow>
  maxNovos: number
  fromDate: string | null
  toDate: string
  hoje: string
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
        className="pa-cal-cell"
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
