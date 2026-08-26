'use client'
import { DAYS_OF_WEEK, HourRow } from '@/lib/businessHours'

// Editor de horário por dia individual, com suporte a mais de um intervalo
// no mesmo dia (ex: 10:00-14:00 e 18:00-22:00) — usado tanto no cadastro
// quanto no painel do lojista. Só pra empresas normais; Igrejas continuam
// usando a grade de culto própria (não passa por aqui).
// "flexible"/"setFlexible" ligam o modo pra quem não tem horário fixo
// (ambulante, sob consulta etc) — esconde a grade de dias inteira
export default function BusinessHoursEditor({ hours, setHours, flexible, setFlexible }: { hours: HourRow[]; setHours: (h: HourRow[]) => void; flexible: boolean; setFlexible: (v: boolean) => void }) {
  function rowsFor(day: number) {
    return hours.map((h, i) => ({ ...h, _idx: i })).filter(h => h.day_of_week === day)
  }

  function isDayClosed(day: number) {
    const rows = rowsFor(day)
    return rows.length > 0 && rows.every(h => h.closed)
  }

  function toggleClosed(day: number) {
    const others = hours.filter(h => h.day_of_week !== day)
    if (isDayClosed(day)) {
      setHours([...others, { day_of_week: day, open_time: '', close_time: '', closed: false }])
    } else {
      setHours([...others, { day_of_week: day, open_time: null, close_time: null, closed: true }])
    }
  }

  function addRange(day: number) {
    setHours([...hours, { day_of_week: day, open_time: '', close_time: '', closed: false }])
  }

  function removeRange(idx: number) {
    setHours(hours.filter((_, i) => i !== idx))
  }

  function updateRange(idx: number, field: 'open_time' | 'close_time', val: string) {
    setHours(hours.map((h, i) => i === idx ? { ...h, [field]: val } : h))
  }

  return (
    <div className="bh-editor">
      <style>{`
        .bh-editor { display: flex; flex-direction: column; gap: 8px; }
        .bh-flex-toggle { display: flex; align-items: center; justify-content: space-between; background: #fff; border: 0.5px solid #E0DDD8; border-radius: 10px; padding: 10px 14px; margin-bottom: 2px; }
        .bh-flex-toggle-txt { font-size: 13px; font-weight: 600; color: #111; font-family: 'Archivo', sans-serif; }
        .bh-flex-toggle-sub { font-size: 11px; color: #AAA; margin-top: 2px; font-family: 'Archivo', sans-serif; }
        .bh-flex-switch { width: 44px; height: 24px; border-radius: 12px; cursor: pointer; position: relative; transition: background .2s; flex-shrink: 0; }
        .bh-flex-switch-knob { position: absolute; top: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.2); transition: left .2s; }
        .bh-flex-note { font-size: 11px; color: #888; padding: 6px 10px; background: rgba(201,149,26,.1); border-radius: 8px; border-left: 3px solid var(--sign-dark); }
        .bh-day { background: #fff; border: 0.5px solid #E0DDD8; border-radius: 10px; padding: 10px 12px; }
        .bh-day-hdr { display: flex; align-items: center; justify-content: space-between; }
        .bh-day-label { font-size: 13px; font-weight: 700; color: #111; font-family: 'Archivo', sans-serif; }
        .bh-closed-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #888; cursor: pointer; user-select: none; }
        .bh-closed-toggle input { accent-color: var(--sign-dark); width: 15px; height: 15px; cursor: pointer; }
        .bh-ranges { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
        .bh-range { display: flex; align-items: center; gap: 6px; }
        .bh-range input[type="time"] { border: 1.5px solid #E0DDD8; border-radius: 8px; padding: 6px 8px; font-size: 12px; font-family: 'Archivo', sans-serif; outline: none; }
        .bh-range input[type="time"]:focus { border-color: var(--sign-dark); }
        .bh-range span { color: #AAA; font-size: 12px; }
        .bh-range-rm { background: #FEF0F0; color: #E24B4A; border: none; border-radius: 6px; width: 24px; height: 24px; cursor: pointer; font-size: 13px; flex-shrink: 0; }
        .bh-empty { font-size: 11px; color: #BBB; font-style: italic; }
        .bh-add { align-self: flex-start; background: none; border: none; color: var(--sign-dark); font-size: 11px; font-weight: 700; cursor: pointer; padding: 2px 0; font-family: 'Archivo', sans-serif; }
      `}</style>
      <div className="bh-flex-toggle">
        <div>
          <div className="bh-flex-toggle-txt">Não tenho horário fixo</div>
          <div className="bh-flex-toggle-sub">Ambulante, sob consulta, etc — dispensa a grade abaixo</div>
        </div>
        <div className="bh-flex-switch" style={{background: flexible ? '#0F8050' : '#E0DDD8'}} onClick={() => setFlexible(!flexible)}>
          <div className="bh-flex-switch-knob" style={{left: flexible ? 22 : 2}} />
        </div>
      </div>
      {flexible ? (
        <div className="bh-flex-note">Sua empresa vai aparecer como "Horário flexível" e sempre conta como aberta em "Aberto Agora".</div>
      ) : (
        DAYS_OF_WEEK.map(({ value: day, label }) => {
          const rows = rowsFor(day)
          const closed = isDayClosed(day)
          return (
            <div key={day} className="bh-day">
              <div className="bh-day-hdr">
                <span className="bh-day-label">{label}</span>
                <label className="bh-closed-toggle">
                  <input type="checkbox" checked={closed} onChange={() => toggleClosed(day)} />
                  Fechado
                </label>
              </div>
              {!closed && (
                <div className="bh-ranges">
                  {rows.length === 0 && <div className="bh-empty">Sem horário definido</div>}
                  {rows.map(r => (
                    <div key={r._idx} className="bh-range">
                      <input type="time" value={r.open_time || ''} onChange={e => updateRange(r._idx, 'open_time', e.target.value)} />
                      <span>até</span>
                      <input type="time" value={r.close_time || ''} onChange={e => updateRange(r._idx, 'close_time', e.target.value)} />
                      {rows.length > 1 && <button type="button" className="bh-range-rm" onClick={() => removeRange(r._idx)}>×</button>}
                    </div>
                  ))}
                  <button type="button" className="bh-add" onClick={() => addRange(day)}>+ adicionar outro horário nesse dia</button>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
