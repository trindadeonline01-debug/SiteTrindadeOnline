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
    <div className="pf-wrap">
      <style>{`
        /* min-width:0 no .pf-wrap: essencial porque em várias telas (ex:
           Sala de Vendas) esse componente é usado como filho de outro flex
           container (junto do select "Todas as lojas"). Um item de flex
           sem min-width:0 se recusa a ficar menor que o próprio conteúdo —
           e o conteúdo mais largo aqui dentro (os 2 campos de data nativos
           do Android, mais largos que no iOS) empurrava a barra inteira
           pra fora da tela, cortando as pills de período (achado real do
           Ricardo, set/2026). */
        .pf-wrap{display:flex;flex-wrap:wrap;gap:10px;width:100%;min-width:0;box-sizing:border-box;align-items:center;}
        .pf-pillgroup{display:flex;gap:4px;background:#fafafa;border:1.5px solid #e0e0e0;border-radius:10px;padding:3px;flex-wrap:wrap;box-sizing:border-box;max-width:100%;min-width:0;}
        .pf-pill{border:1.5px solid #e0e0e0;background:#fff;font-size:12px;font-weight:700;color:#888;padding:7px 13px;border-radius:8px;cursor:pointer;}
        .pf-pill.on{background:var(--ink);border-color:var(--ink);color:var(--sign);}
        .pf-select{font-size:12.5px;font-weight:700;color:#888;background:#fff;border:1.5px solid #e0e0e0;border-radius:10px;padding:8px 10px;cursor:pointer;box-sizing:border-box;max-width:100%;min-width:0;}
        .pf-select.on{color:var(--sign);background:var(--ink);}
        /* flex-basis 0 (não auto) é o que faz os 2 campos de data
           conseguirem encolher de verdade dentro da caixa -- sem isso, o
           Android/Chrome desenha o campo de data nativo mais largo que o
           iOS/Safari e ele nunca cabe, empurrando a caixa inteira pra fora
           da tela (achado real do Ricardo, set/2026: "no iPhone ajusta, no
           Android nao"). */
        .pf-range{display:flex;align-items:center;gap:6px;border:1.5px solid #e0e0e0;border-radius:10px;padding:4px 8px;background:#fff;flex:1 1 240px;min-width:0;max-width:100%;box-sizing:border-box;}
        .pf-range.on{border-color:var(--sign-dark);background:#fdf6e8;}
        .pf-range-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#aaa;flex:none;}
        .pf-range.on .pf-range-label{color:var(--sign-dark);}
        .pf-range input{font-size:12.5px;font-weight:600;color:#333;border:none;background:transparent;padding:4px 2px;cursor:pointer;flex:1 1 0;min-width:0;box-sizing:border-box;}
        @media(max-width:560px){
          .pf-pillgroup, .pf-select, .pf-range { width:100%; }
        }
      `}</style>

      <div className="pf-pillgroup">
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
