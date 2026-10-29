'use client'
import { DAYS_OF_WEEK, HourRow } from '@/lib/businessHours'
import { useState } from 'react'

const FERIADOS_DAY = 7
const WEEKDAYS = DAYS_OF_WEEK.filter(d => d.value !== FERIADOS_DAY)

type Range = { open_time: string; close_time: string }
type Group = { days: number[]; ranges: Range[] }

// Editor de horário por GRUPO (linha), não por dia — reescrito out/2026 (2),
// a partir de achado do próprio Ricardo: o modelo anterior (um "grupo
// comum" + exceções por dia) deixava confuso criar um segundo horário
// diferente pra mais de um dia ao mesmo tempo (ex: sábado E domingo com
// horários diferentes entre si). Agora é o inverso: primeiro escolhe o
// horário (uma linha, "+ Criar novo horário"), depois toca nos dias que
// usam ele. Um dia só pode estar numa linha por vez — nas outras linhas
// ele aparece com a pill cinza-claro, visível mas bloqueada, pra deixar
// claro que já tem horário marcado em outro lugar. Dia que não entra em
// nenhuma linha vira fechado sozinho (sem precisar de checkbox "Fechado"
// por dia) — é só avisado num texto discreto embaixo das linhas.
// Continua sem conceito de "grupo" guardado no banco: a cada render, as
// linhas são recalculadas a partir de company_hours agrupando dias com
// open_time/close_time idênticos; salvar grava uma linha por dia, como
// sempre (dia fora de qualquer grupo grava como closed:true, pros outros
// lugares do sistema que já esperam isso — preview do admin, IA do CRM —
// continuarem funcionando sem mudança nenhuma).
//
// "flexible"/"setFlexible" ligam o modo pra quem não tem horário fixo
// (ambulante, sob consulta etc) — esconde a grade de dias inteira.
// "showFlexToggle=false" deixa esse toggle por conta do componente PAI
// (ex: o Perfil do painel, que o posiciona ao lado do título do card) —
// Admin/Anunciar não passam essa prop e continuam vendo o toggle interno
// de sempre. "extraTile" é um card extra (ex: "Entrega própria") que
// entra na mesma coluna lateral estreita onde fica Feriados.
export default function BusinessHoursEditor({ hours, setHours, flexible, setFlexible, showFlexToggle = true, extraTile }: { hours: HourRow[]; setHours: (h: HourRow[]) => void; flexible: boolean; setFlexible: (v: boolean) => void; showFlexToggle?: boolean; extraTile?: React.ReactNode }) {
  const [draftGroup, setDraftGroup] = useState<Group | null>(null)

  function rowsFor(day: number) {
    return hours.map((h, i) => ({ ...h, _idx: i })).filter(h => h.day_of_week === day)
  }

  function isDayClosed(day: number) {
    const rows = rowsFor(day)
    return rows.length > 0 && rows.every(h => h.closed)
  }

  // "assinatura" do horário de um dia — dois dias com a mesma assinatura
  // (mesmos intervalos, em qualquer ordem) caem na mesma linha/grupo.
  function daySignature(day: number): string | null {
    const rows = rowsFor(day)
    if (rows.length === 0) return null
    if (rows.every(h => h.closed)) return 'CLOSED'
    return rows.filter(h => !h.closed).map(h => `${h.open_time || ''}-${h.close_time || ''}`).sort().join('|')
  }

  // Monta as linhas (grupos) a partir do estado atual — uma por assinatura
  // de horário distinta, na ordem em que cada assinatura apareceu
  // percorrendo os dias da semana (tende a deixar Segunda-a-Sexta antes de
  // Sábado/Domingo, igual o exemplo real que motivou esse redesenho).
  const seen = new Map<string, number[]>()
  WEEKDAYS.forEach(d => {
    const sig = daySignature(d.value)
    if (sig && sig !== 'CLOSED') {
      if (!seen.has(sig)) seen.set(sig, [])
      seen.get(sig)!.push(d.value)
    }
  })
  const groups: Group[] = Array.from(seen.values()).map(days => ({
    days,
    ranges: rowsFor(days[0]).filter(h => !h.closed).map(h => ({ open_time: h.open_time || '', close_time: h.close_time || '' })),
  }))
  const assignedDays = new Set(groups.flatMap(g => g.days))
  const closedDays = WEEKDAYS.filter(d => !assignedDays.has(d.value))
  const canAddGroup = !draftGroup && closedDays.length > 0

  // Escreve o mesmo conjunto de intervalos pra uma lista de dias — usado
  // tanto pra editar o horário de um grupo inteiro de uma vez quanto pra
  // adicionar um dia novo a um grupo já existente (copiando o horário dele).
  function writeGroupRows(days: number[], ranges: Range[]) {
    const others = hours.filter(h => !days.includes(h.day_of_week ?? -1))
    const newRows: HourRow[] = days.flatMap(day => ranges.map(r => ({ day_of_week: day, open_time: r.open_time, close_time: r.close_time, closed: false })))
    setHours([...others, ...newRows])
  }

  // Marca um dia como fechado explicitamente (sai de qualquer grupo).
  function closeDay(day: number) {
    const others = hours.filter(h => h.day_of_week !== day)
    setHours([...others, { day_of_week: day, open_time: null, close_time: null, closed: true }])
  }

  // Toque numa pill dentro de uma linha: se o dia já é dessa linha, tira
  // (fecha); se o dia tá livre (fechado), entra copiando o horário da
  // linha; se o dia já é de OUTRA linha, a pill vem desabilitada e não
  // chama essa função (ver render).
  function toggleDayInGroup(group: Group, day: number) {
    if (group.days.includes(day)) {
      closeDay(day)
    } else if (!assignedDays.has(day)) {
      writeGroupRows([day], group.ranges)
    }
  }

  function updateGroupRange(group: Group, idx: number, field: 'open_time' | 'close_time', val: string) {
    writeGroupRows(group.days, group.ranges.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  }
  function addGroupRange(group: Group) {
    writeGroupRows(group.days, [...group.ranges, { open_time: '', close_time: '' }])
  }
  function removeGroupRange(group: Group, idx: number) {
    writeGroupRows(group.days, group.ranges.filter((_, i) => i !== idx))
  }
  function removeGroup(group: Group) {
    const others = hours.filter(h => !group.days.includes(h.day_of_week ?? -1))
    const closedRows: HourRow[] = group.days.map(day => ({ day_of_week: day, open_time: null, close_time: null, closed: true }))
    setHours([...others, ...closedRows])
  }

  // Rascunho de uma linha nova — só existe aqui, localmente, até o
  // primeiro dia ser tocado (quando aí sim vira grupo de verdade, escrito
  // em "hours"). Dá pra digitar o horário antes ou depois de escolher o
  // dia, tanto faz.
  function updateDraftRange(idx: number, field: 'open_time' | 'close_time', val: string) {
    if (!draftGroup) return
    setDraftGroup({ ...draftGroup, ranges: draftGroup.ranges.map((r, i) => i === idx ? { ...r, [field]: val } : r) })
  }
  function addDraftRange() {
    if (!draftGroup) return
    setDraftGroup({ ...draftGroup, ranges: [...draftGroup.ranges, { open_time: '', close_time: '' }] })
  }
  function removeDraftRange(idx: number) {
    if (!draftGroup) return
    setDraftGroup({ ...draftGroup, ranges: draftGroup.ranges.filter((_, i) => i !== idx) })
  }
  function pickDraftDay(day: number) {
    if (!draftGroup || assignedDays.has(day)) return
    writeGroupRows([day], draftGroup.ranges)
    setDraftGroup(null)
  }

  function RangeFields({ ranges, onUpdate, onAdd, onRemove }: { ranges: Range[]; onUpdate: (i: number, f: 'open_time' | 'close_time', v: string) => void; onAdd: () => void; onRemove: (i: number) => void }) {
    return (
      <>
        {ranges.map((r, i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:6}}>
            <input type="time" className="bh-time-input" value={r.open_time} onChange={e => onUpdate(i, 'open_time', e.target.value)} />
            <span className="bh-sep">até</span>
            <input type="time" className="bh-time-input" value={r.close_time} onChange={e => onUpdate(i, 'close_time', e.target.value)} />
            {ranges.length > 1 && <button type="button" className="bh-range-rm" onClick={() => onRemove(i)}>×</button>}
            {i === ranges.length - 1 && <button type="button" className="bh-add" onClick={onAdd}>+ outro intervalo</button>}
          </div>
        ))}
      </>
    )
  }

  function GroupRow({ group }: { group: Group }) {
    return (
      <div className="bh-sched-row">
        <div className="bh-sched-top">
          <RangeFields ranges={group.ranges} onUpdate={(i, f, v) => updateGroupRange(group, i, f, v)} onAdd={() => addGroupRange(group)} onRemove={i => removeGroupRange(group, i)} />
          <button type="button" className="bh-sched-rm" onClick={() => removeGroup(group)} title="Remover esse horário">🗑</button>
        </div>
        <div className="bh-pills">
          {WEEKDAYS.map(d => {
            const inThis = group.days.includes(d.value)
            const inOther = !inThis && assignedDays.has(d.value)
            return (
              <button key={d.value} type="button" disabled={inOther}
                className={`bh-pill ${inThis ? 'bh-pill-on' : inOther ? 'bh-pill-disabled' : 'bh-pill-off'}`}
                onClick={() => toggleDayInGroup(group, d.value)}>
                {d.label.slice(0, 3)}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function FeriadosTile() {
    const rows = rowsFor(FERIADOS_DAY)
    const closed = isDayClosed(FERIADOS_DAY)
    return (
      <div className="bh-mini">
        <div className="bh-mini-top">
          <span className="bh-mini-label">Feriados</span>
          <input type="checkbox" checked={closed} onChange={() => closed ? setHours([...hours.filter(h=>h.day_of_week!==FERIADOS_DAY), { day_of_week: FERIADOS_DAY, open_time: '', close_time: '', closed: false }]) : closeDay(FERIADOS_DAY)} />
        </div>
        {closed ? (
          <span className="bh-mini-sub">Fechado</span>
        ) : (
          <div className="bh-ranges">
            {rows.length === 0 && <div className="bh-empty">Sem horário</div>}
            {rows.map(r => (
              <div key={r._idx} style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                <input type="time" className="bh-time-input" value={r.open_time || ''} onChange={e => setHours(hours.map((h,i)=> i===r._idx ? {...h, open_time:e.target.value} : h))} />
                <span className="bh-sep">às</span>
                <input type="time" className="bh-time-input" value={r.close_time || ''} onChange={e => setHours(hours.map((h,i)=> i===r._idx ? {...h, close_time:e.target.value} : h))} />
              </div>
            ))}
            {rows.length === 0 && <button type="button" className="bh-add" onClick={() => setHours([...hours, { day_of_week: FERIADOS_DAY, open_time: '', close_time: '', closed: false }])}>+ horário</button>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bh-editor">
      <style>{`
        .bh-editor { display: flex; flex-direction: column; gap: 10px; }
        .bh-flex-toggle { display: flex; align-items: center; justify-content: space-between; background: #fff; border: 1px solid #DDD5C4; border-radius: 10px; padding: 10px 14px; }
        .bh-flex-toggle-txt { font-size: 13px; font-weight: 600; color: #111; font-family: 'Archivo', sans-serif; }
        .bh-flex-toggle-sub { font-size: 11px; color: #8A8477; margin-top: 2px; font-family: 'Archivo', sans-serif; }
        .bh-flex-switch { width: 44px; height: 24px; border-radius: 12px; cursor: pointer; position: relative; transition: background .2s; flex-shrink: 0; }
        .bh-flex-switch-knob { position: absolute; top: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.2); transition: left .2s; }
        .bh-flex-note { font-size: 11px; color: #888; padding: 6px 10px; background: rgba(201,149,26,.1); border-radius: 8px; border-left: 3px solid var(--sign-dark); }

        .bh-layout { display: flex; gap: 12px; align-items: flex-start; }
        .bh-groups-col { flex: 1; min-width: 0; }
        .bh-side-col { display: flex; flex-direction: column; gap: 8px; width: 148px; flex-shrink: 0; }
        @media (max-width: 640px) { .bh-layout { flex-direction: column; } .bh-side-col { width: 100%; flex-direction: row; } .bh-side-col > * { flex: 1; min-width: 0; } }

        .bh-sched-row { background: #F7F5EF; border: 1px solid #EFEAE0; border-radius: 10px; padding: 11px 12px; margin-bottom: 8px; }
        .bh-sched-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 9px; }
        .bh-sched-rm { margin-left: auto; background: none; border: none; color: #C97A0E; font-size: 13px; cursor: pointer; padding: 2px 4px; line-height: 1; }
        .bh-sched-add { width: 100%; padding: 9px; border: 1.5px dashed #B9AE97; border-radius: 9px; background: #fff; color: var(--sign-dark); font-size: 11.5px; font-weight: 700; text-align: center; cursor: pointer; font-family: 'Archivo', sans-serif; }
        .bh-closed-note { font-size: 11px; color: #8A8477; margin-top: 8px; line-height: 1.5; }

        .bh-pills { display: flex; gap: 5px; flex-wrap: wrap; }
        .bh-pill { min-width: 46px; height: 32px; padding: 0 7px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 700; font-family: 'Archivo', sans-serif; cursor: pointer; border: none; line-height: 1; }
        .bh-pill-on { background: #151210; color: #FFC531; }
        .bh-pill-off { background: #fff; border: 1.5px solid #C7BCA3; color: #6F6C67; }
        .bh-pill-disabled { background: #ECE9E2; color: #C7BFAE; cursor: not-allowed; }

        .bh-time-input { border: 1.5px solid #B9AE97; border-radius: 8px; padding: 7px 9px; font-size: 12px; font-family: 'Archivo', sans-serif; outline: none; background: #fff; color: #222; line-height: 1; }
        .bh-time-input:focus { border-color: var(--sign-dark); }
        .bh-sep { color: #8A8477; font-size: 12px; line-height: 1; }
        .bh-range-rm { background: #FEF0F0; color: #E24B4A; border: none; border-radius: 6px; width: 22px; height: 22px; cursor: pointer; font-size: 13px; flex-shrink: 0; line-height: 1; }
        .bh-add { background: none; border: none; color: var(--sign-dark); font-size: 11px; font-weight: 700; cursor: pointer; padding: 2px 0; font-family: 'Archivo', sans-serif; line-height: 1; white-space: nowrap; }
        .bh-sched-hint { font-size: 10.5px; color: #AEA68F; font-style: italic; margin-top: 2px; }

        .bh-mini { background: #fff; border: 1px solid #DDD5C4; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
        .bh-mini-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
        .bh-mini-label { font-size: 12px; font-weight: 700; color: #111; font-family: 'Archivo', sans-serif; white-space: nowrap; }
        .bh-mini-top input[type="checkbox"] { accent-color: var(--sign-dark); width: 15px; height: 15px; cursor: pointer; }
        .bh-mini-sub { font-size: 10px; color: #8A8477; }
        .bh-ranges { display: flex; flex-direction: column; gap: 6px; }
        .bh-empty { font-size: 11px; color: #AEA68F; font-style: italic; }
      `}</style>

      {showFlexToggle && (
        <div className="bh-flex-toggle">
          <div>
            <div className="bh-flex-toggle-txt">Não tenho horário fixo</div>
            <div className="bh-flex-toggle-sub">Ambulante, sob consulta, etc — dispensa a grade abaixo</div>
          </div>
          <div className="bh-flex-switch" style={{background: flexible ? '#0F8050' : '#D7CFBE'}} onClick={() => setFlexible(!flexible)}>
            <div className="bh-flex-switch-knob" style={{left: flexible ? 22 : 2}} />
          </div>
        </div>
      )}

      {flexible ? (
        <div className="bh-flex-note">Sua empresa vai aparecer como "Horário flexível" e sempre conta como aberta em "Aberto Agora".</div>
      ) : (
        <div className="bh-layout">
          <div className="bh-groups-col">
            {groups.map((g, gi) => <GroupRow key={gi} group={g} />)}

            {draftGroup && (
              <div className="bh-sched-row">
                <div className="bh-sched-top">
                  <RangeFields ranges={draftGroup.ranges} onUpdate={updateDraftRange} onAdd={addDraftRange} onRemove={removeDraftRange} />
                  <button type="button" className="bh-sched-rm" onClick={() => setDraftGroup(null)} title="Cancelar">🗑</button>
                </div>
                <div className="bh-pills">
                  {WEEKDAYS.map(d => {
                    const inOther = assignedDays.has(d.value)
                    return (
                      <button key={d.value} type="button" disabled={inOther}
                        className={`bh-pill ${inOther ? 'bh-pill-disabled' : 'bh-pill-off'}`}
                        onClick={() => pickDraftDay(d.value)}>
                        {d.label.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
                <div className="bh-sched-hint">Toque num dia pra usar esse horário</div>
              </div>
            )}

            {canAddGroup && <button type="button" className="bh-sched-add" onClick={() => setDraftGroup({ days: [], ranges: [{ open_time: '', close_time: '' }] })}>+ Criar novo horário</button>}

            {closedDays.length > 0 && (
              <div className="bh-closed-note">🔒 Sem horário em nenhuma linha = fechado automaticamente: <strong style={{color:'#6F6C67'}}>{closedDays.map(d => d.label).join(', ')}</strong></div>
            )}
          </div>

          <div className="bh-side-col">
            <FeriadosTile />
            {extraTile}
          </div>
        </div>
      )}
    </div>
  )
}
