'use client'
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import PeriodFilterBar from '@/components/admin/PeriodFilterBar'
import { PeriodSel, periodRange, periodLabel } from '@/lib/periodFilter'
import { formatPhoneDisplay } from '@/lib/phone'

// Monitor dos links de jogos enviados no WhatsApp (15/nov/2026): quem recebeu, abriu, jogou e quantos pontos fez.
// Dados de /api/admin/jogos-monitor.

type Linha = {
  tipo: 'diversao' | 'cashback'; loja: string; cliente: string | null; apelido: string | null; phone: string
  pedido: number | null; totalPedido: number | null; enviadoEm: string; acessos: number; abriuEm: string | null
  quiz: { rodadas: number; pontos: number; acertos: number } | null
  caca: { rodadas: number; pontos: number; nivel: number } | null
  cashback: { estado: string; valor: number | null } | null
}
type Dados = { resumo: { enviados: number; abriram: number; jogaram: number; cashbackPago: number }; porLoja: { loja: string; enviados: number; abriram: number; jogaram: number }[]; linhas: Linha[] }

const brl = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',')
const pctTxt = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0) + '%'
const dh = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const n = (x: number) => x.toLocaleString('pt-BR')

const card: React.CSSProperties = { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 16, overflow: 'hidden' }
const hd: React.CSSProperties = { padding: '15px 20px', borderBottom: '1px solid #F0EDE8', fontSize: 12.5, fontWeight: 800, color: '#111' }
const kpi: React.CSSProperties = { flex: '1 1 140px', background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }
const tag = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-block', background: bg, color: fg, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' })

export default function JogosMonitorTab() {
  const [period, setPeriod] = useState<PeriodSel>({ kind: 'week' })
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'abriram' | 'jogaram' | 'nao'>('todos')

  const carregar = useCallback(async () => {
    const { from, to } = periodRange(period)
    const r = await adminFetch('/api/admin/jogos-monitor', { method: 'POST', body: JSON.stringify({ from: from || (period.kind === 'all' ? '2026-01-01T00:00:00Z' : null), to }) })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setDados(d); setErro('') } else setErro(d?.error || 'Não consegui carregar.')
  }, [period])
  useEffect(() => {
    const t = setTimeout(carregar, 0)
    const iv = setInterval(carregar, 30000)
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [carregar])

  const linhas = (dados?.linhas || []).filter(l => filtro === 'todos' ? true : filtro === 'abriram' ? l.acessos > 0 : filtro === 'jogaram' ? !!(l.quiz || l.caca) : l.acessos === 0)
  const r = dados?.resumo

  return (
    <div>
      <div style={{ marginBottom: 14 }}><PeriodFilterBar value={period} onChange={setPeriod} /></div>
      {erro && <div style={{ background: '#FFF4D6', borderRadius: 8, padding: 10, marginBottom: 12 }}>{erro}</div>}
      {!dados && !erro && <p style={{ color: '#888' }}>Carregando…</p>}
      {r && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={kpi}><div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Links enviados</div><div style={{ fontSize: 28, fontWeight: 800 }}>{n(r.enviados)}</div><div style={{ fontSize: 12, color: '#888' }}>{periodLabel(period)}</div></div>
            <div style={kpi}><div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Abriram</div><div style={{ fontSize: 28, fontWeight: 800 }}>{n(r.abriram)}</div><div style={{ fontSize: 12, color: '#888' }}>{pctTxt(r.abriram, r.enviados)} dos enviados</div></div>
            <div style={kpi}><div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Jogaram</div><div style={{ fontSize: 28, fontWeight: 800 }}>{n(r.jogaram)}</div><div style={{ fontSize: 12, color: '#888' }}>{pctTxt(r.jogaram, r.abriram)} de quem abriu</div></div>
            <div style={kpi}><div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Cashback pago no jogo</div><div style={{ fontSize: 28, fontWeight: 800 }}>{brl(r.cashbackPago)}</div><div style={{ fontSize: 12, color: '#888' }}>link do delivery</div></div>
          </div>

          {dados.porLoja.length > 0 && (
            <div style={card}>
              <div style={hd}>Por loja</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#888', fontSize: 11, textTransform: 'uppercase' }}><th style={{ padding: '8px 20px' }}>Loja</th><th style={{ padding: 8, textAlign: 'right' }}>Enviados</th><th style={{ padding: 8, textAlign: 'right' }}>Abriram</th><th style={{ padding: '8px 20px', textAlign: 'right' }}>Jogaram</th></tr></thead>
                  <tbody>{dados.porLoja.map(l => (
                    <tr key={l.loja} style={{ borderTop: '1px solid #F0EDE8' }}><td style={{ padding: '8px 20px', fontWeight: 600 }}>{l.loja}</td><td style={{ padding: 8, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.enviados}</td><td style={{ padding: 8, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.abriram} <span style={{ color: '#888' }}>({pctTxt(l.abriram, l.enviados)})</span></td><td style={{ padding: '8px 20px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.jogaram}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          <div style={card}>
            <div style={{ ...hd, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ marginRight: 'auto' }}>Clientes</span>
              {(['todos', 'abriram', 'jogaram', 'nao'] as const).map(f => (
                <button key={f} onClick={() => setFiltro(f)} style={{ border: '1.5px solid ' + (filtro === f ? '#111' : '#E0DDD8'), background: filtro === f ? '#111' : '#fff', color: filtro === f ? '#fff' : '#111', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {f === 'todos' ? 'Todos' : f === 'abriram' ? 'Abriram' : f === 'jogaram' ? 'Jogaram' : 'Não abriram'}
                </button>
              ))}
            </div>
            {linhas.length === 0 && <p style={{ padding: 20, color: '#888', margin: 0 }}>Nenhum link neste período.</p>}
            {linhas.map((l, i) => (
              <div key={i} style={{ padding: '12px 20px', borderTop: i ? '1px solid #F0EDE8' : undefined, display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b>{l.cliente || l.apelido || 'Sem nome'}</b>
                  <span style={{ color: '#888', fontSize: 12 }}>{formatPhoneDisplay(l.phone)}</span>
                  <span style={tag(l.tipo === 'cashback' ? '#FFF4D6' : '#EEF2FF', l.tipo === 'cashback' ? '#8A6410' : '#3730A3')}>{l.tipo === 'cashback' ? 'Link com cashback' : 'Enquanto espera'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>{l.loja}{l.pedido ? ` · pedido nº ${l.pedido}` : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5, alignItems: 'center' }}>
                  <span style={{ color: '#666' }}>Enviado {dh(l.enviadoEm)}</span>
                  {l.acessos > 0
                    ? <span style={tag('#DCFCE7', '#166534')}>Abriu {dh(l.abriuEm || l.enviadoEm)}{l.acessos > 1 ? ` · ${l.acessos}x` : ''}</span>
                    : <span style={tag('#F3F4F6', '#6B7280')}>Não abriu</span>}
                  {l.quiz && <span style={tag('#E0F2FE', '#075985')}>Quiz: {l.quiz.rodadas} {l.quiz.rodadas === 1 ? 'rodada' : 'rodadas'} · melhor {n(l.quiz.pontos)} pts, {l.quiz.acertos} acertos</span>}
                  {l.caca && <span style={tag('#F3E8FF', '#6B21A8')}>Caça: {l.caca.rodadas} {l.caca.rodadas === 1 ? 'rodada' : 'rodadas'} · melhor {n(l.caca.pontos)} pts, nível {l.caca.nivel}</span>}
                  {l.acessos > 0 && !l.quiz && !l.caca && <span style={tag('#FEF3C7', '#92400E')}>Abriu e não jogou</span>}
                  {l.cashback && <span style={tag(l.cashback.estado === 'premiada' ? '#DCFCE7' : '#F3F4F6', l.cashback.estado === 'premiada' ? '#166534' : '#6B7280')}>{l.cashback.estado === 'premiada' ? `Ganhou ${brl(l.cashback.valor || 0)}` : l.cashback.estado === 'cancelada' ? 'Pedido cancelado' : 'Sem prêmio ainda'}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
