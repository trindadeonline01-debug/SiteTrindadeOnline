'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface PorEmpresa {
  company_id: string; company_name: string; diaria_paga: boolean; creditos: number
  cadastradas: number; realizadas: number; pendentes: number; canceladas: number; gasto: number
}
interface PorMotoboy {
  motoboy_id: string; motoboy_name: string; aceitas: number; recusadas: number; expiradas: number
  taxa_aceite: number | null; a_receber: number; ja_recebido: number
}
interface Kpis {
  entregasHoje: number; entregasSemana: number; taxaAceite: number | null
  receitaDiaria: number; receitaCredito: number; receitaCombo: number; aPagarMotoboys: number
}

const s: Record<string, any> = {
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 16 },
  kpi: { background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  kpiLabel: { fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase' as const, letterSpacing: 0.4, marginBottom: 8 },
  kpiValue: { fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' as const },
  kpiSub: { fontSize: 11, color: '#aaa', marginTop: 4 },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 16 },
  cardHd: { padding: '15px 20px', borderBottom: '1px solid #F0EDE8', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const },
  cardTitle: { fontSize: 12.5, fontWeight: 800, color: '#111' },
  cardHint: { fontSize: 11, color: '#999' },
  badgeMini: (ok: boolean) => ({ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: ok ? '#E4F3EC' : '#F1EFEA', color: ok ? '#157A52' : '#8A8681' }),
}

function brl(n: number): string { return `R$ ${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }

export default function RelatoriosTab() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [porEmpresa, setPorEmpresa] = useState<PorEmpresa[]>([])
  const [porMotoboy, setPorMotoboy] = useState<PorMotoboy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/entrega-relatorios', { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} })
      const data = await res.json()
      setKpis(data.kpis)
      setPorEmpresa(data.porEmpresa || [])
      setPorMotoboy(data.porMotoboy || [])
      setLoading(false)
    })()
  }, [])

  if (loading || !kpis) return <div style={{ color: '#888', fontSize: 13 }}>Carregando...</div>

  return (
    <div>
      <div style={s.grid3}>
        <div style={s.kpi}><div style={s.kpiLabel}>Entregas hoje</div><div style={s.kpiValue}>{kpis.entregasHoje}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Entregas essa semana</div><div style={s.kpiValue}>{kpis.entregasSemana}</div></div>
        <div style={s.kpi}>
          <div style={s.kpiLabel}>Taxa de aceite</div>
          <div style={{ ...s.kpiValue, color: '#157A52' }}>{kpis.taxaAceite === null ? '—' : `${kpis.taxaAceite}%`}</div>
          <div style={s.kpiSub}>ofertas aceitas na 1ª chamada, desde sempre</div>
        </div>
      </div>
      <div style={s.grid3}>
        <div style={s.kpi}><div style={s.kpiLabel}>Receita — diária</div><div style={s.kpiValue}>{brl(kpis.receitaDiaria)}</div><div style={s.kpiSub}>últimos 7 dias</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>Receita — crédito</div><div style={s.kpiValue}>{brl(kpis.receitaCredito)}</div><div style={s.kpiSub}>últimos 7 dias{kpis.receitaCombo > 0 ? ` · +${brl(kpis.receitaCombo)} em combos` : ''}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>A pagar pros motoboys</div><div style={{ ...s.kpiValue, color: '#C97A0E' }}>{brl(kpis.aPagarMotoboys)}</div></div>
      </div>

      <div style={s.card}>
        <div style={s.cardHd}><span style={s.cardTitle}>🏪 Por empresa</span><span style={s.cardHint}>saldo e uso do módulo de entrega</span></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Empresa</th><th>Diária hoje</th><th>Créditos</th><th>Cadastradas</th><th>Realizadas</th><th>Pendentes</th><th>Canceladas</th><th>Gasto total</th></tr></thead>
            <tbody>
              {porEmpresa.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#999', padding: 24 }}>Nenhuma entrega registrada ainda.</td></tr>}
              {porEmpresa.map(e => (
                <tr key={e.company_id}>
                  <td><b>{e.company_name}</b></td>
                  <td><span style={s.badgeMini(e.diaria_paga)}>{e.diaria_paga ? 'paga' : 'não paga'}</span></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{e.creditos}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{e.cadastradas}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{e.realizadas}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{e.pendentes}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{e.canceladas}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{brl(e.gasto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.cardHd}><span style={s.cardTitle}>🏍️ Por motoboy</span><span style={s.cardHint}>desempenho desde sempre</span></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Motoboy</th><th>Aceitas</th><th>Recusadas</th><th>Expiradas</th><th>Taxa aceite</th><th>A receber</th><th>Já recebido</th></tr></thead>
            <tbody>
              {porMotoboy.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 24 }}>Nenhum motoboy cadastrado ainda.</td></tr>}
              {porMotoboy.map(m => (
                <tr key={m.motoboy_id}>
                  <td><b>{m.motoboy_name}</b></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{m.aceitas}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{m.recusadas}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{m.expiradas}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: m.taxa_aceite !== null && m.taxa_aceite >= 80 ? '#157A52' : undefined }}>{m.taxa_aceite === null ? '—' : `${m.taxa_aceite}%`}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{brl(m.a_receber)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{brl(m.ja_recebido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
