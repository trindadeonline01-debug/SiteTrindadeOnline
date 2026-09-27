'use client'
import { PeriodKind, PeriodSel, MESES } from '@/lib/periodFilter'

// Barra de filtro de período — padrão visual definido em Sala de Vendas
// (Ricardo, set/2026: "ficou top"), extraída daqui pra ser reaproveitada
// em qualquer página nova ou atualizada, em vez de cada tela inventar o
// próprio conjunto de botões. Pills de atalho + "Outro mês" + intervalo
// "De/até" pro personalizado.
const QUICK: [PeriodKind, string][] = [
  ['today', 'Hoje'], ['yesterday', 'Ontem'], ['week', 'Esta semana'],
  ['month', 'Este mês'], ['year', 'Este ano'], ['all', 'Tudo'],
]

export default function PeriodFilterBar({ value, onChange }: { value: PeriodSel; onChange: (p: PeriodSel) => void }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <style>{`
        .pf-pill{border:1.5px solid #e0e0e0;background:#fff;font-size:12px;font-weight:700;color:#888;padding:7px 13px;border-radius:8px;cursor:pointer;}
        .pf-pill.on{background:var(--ink);border-color:var(--ink);color:var(--sign);}
        .pf-select{font-size:12.5px;font-weight:700;color:#888;background:#fff;border:1.5px solid #e0e0e0;border-radius:10px;padding:8px 10px;cursor:pointer;}
        .pf-select.on{color:var(--sign);background:var(--ink);}
        .pf-range{display:flex;align-items:center;gap:6px;border:1.5px solid #e0e0e0;border-radius:10px;padding:4px 8px;background:#fff;}
        .pf-range.on{border-color:var(--sign-dark);background:#fdf6e8;}
        .pf-range-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#aaa;}
        .pf-range.on .pf-range-label{color:var(--sign-dark);}
        .pf-range input{font-size:12.5px;font-weight:600;color:#333;border:none;background:transparent;padding:4px 2px;cursor:pointer;}
      `}</style>

      <div style={{ display: 'flex', gap: 4, background: '#fafafa', border: '1.5px solid #e0e0e0', borderRadius: 10, padding: 3, flexWrap: 'wrap' }}>
        {QUICK.map(([kind, label]) => (
          <button key={kind} className={`pf-pill ${value.kind === kind ? 'on' : ''}`} onClick={() => onChange({ kind })}>{label}</button>
        ))}
      </div>

      <select
        value={value.kind === 'other_month' && value.monthIndex != null ? String(value.monthIndex) : ''}
        onChange={e => onChange({ kind: 'other_month', monthIndex: Number(e.target.value) })}
        className={`pf-select ${value.kind === 'other_month' ? 'on' : ''}`}
      >
        <option value="" disabled>Outro mês</option>
        {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
      </select>

      <div className={`pf-range ${value.kind === 'custom' ? 'on' : ''}`}>
        <span className="pf-range-label">De</span>
        <input
          type="date"
          value={value.kind === 'custom' ? value.customFrom || '' : ''}
          onChange={e => onChange({ kind: 'custom', customFrom: e.target.value, customTo: value.kind === 'custom' ? value.customTo : undefined })}
          title="Data de início"
        />
        <span className="pf-range-label">até</span>
        <input
          type="date"
          value={value.kind === 'custom' ? value.customTo || '' : ''}
          onChange={e => onChange({ kind: 'custom', customFrom: value.kind === 'custom' ? value.customFrom : undefined, customTo: e.target.value })}
          title="Data de término"
        />
      </div>
    </div>
  )
}
