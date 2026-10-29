'use client'
import { DAYS_OF_WEEK, HourRow } from '@/lib/businessHours'

const FERIADOS_DAY = 7
const WEEKDAYS = DAYS_OF_WEEK.filter(d => d.value !== FERIADOS_DAY)

type Range = { open_time: string | null; close_time: string | null }

// Editor de horário por dia, com suporte a mais de um intervalo no mesmo dia
// (ex: 10:00-14:00 e 18:00-22:00) — usado tanto no cadastro quanto no painel
// do lojista. Só pra empresas normais; Igrejas continuam usando a grade de
// culto própria (não passa por aqui).
// "flexible"/"setFlexible" ligam o modo pra quem não tem horário fixo
// (ambulante, sob consulta etc) — esconde a grade de dias inteira.
//
// out/2026 — reescrito: a maioria das empresas abre igual de segunda a
// sábado (achado do Ricardo, revendo os prints do próprio painel), então em
// vez de um card cheio por dia (7-8 cards empilhados, a maior causa de
// altura excessiva na tela de Perfil), os dias viram "pills" horizontais —
// um grupo comum (os dias que compartilham o mesmo horário) edita um único
// campo de horário pra todos de uma vez; só quem tem horário DIFERENTE do
// grupo comum (ou está fechado) ganha uma linha própria, compacta, abaixo.
// Não existe conceito de "grupo" guardado no banco — é só como o editor
// AGRUPA visualmente dias com open_time/close_time idênticos a cada render;
// salvar continua gravando uma linha por dia em company_hours, like sempre.
export default function BusinessHoursEditor({ hours, setHours, flexible, setFlexible }: { hours: HourRow[]; setHours: (h: HourRow[]) => void; flexible: boolean; setFlexible: (v: boolean) => void }) {
  function rowsFor(day: number) {
    return hours.map((h, i) => ({ ...h, _idx: i })).filter(h => h.day_of_week === day)
  }

  function isDayClosed(day: number) {
    const rows = rowsFor(day)
    return rows.length > 0 && rows.every(h => h.closed)
  }

  // "assinatura" do horário de um dia — dois dias com a mesma assinatura
  // (mesmos intervalos, em qualquer ordem) caem no mesmo grupo visual.
  function daySignature(day: number): string | null {
    const rows = rowsFor(day)
    if (rows.length === 0) return null
    if (rows.every(h => h.closed)) return 'CLOSED'
    return rows.filter(h => !h.closed).map(h => `${h.open_time || ''}-${h.close_time || ''}`).sort().join('|')
  }

  // Grupo comum = a assinatura (não-fechada) compartilhada pelo MAIOR número
  // de dias da semana. Em caso de zero dias com horário em comum ainda
  // (empresa nova, cadastro do zero), fica vazio — o lojista clica nas pills
  // pra começar a montar.
  const sigCounts = new Map<string, number>()
  WEEKDAYS.forEach(d => {
    const sig = daySignature(d.value)
    if (sig && sig !== 'CLOSED') sigCounts.set(sig, (sigCounts.get(sig) || 0) + 1)
  })
  let commonSig: string | null = null
  let commonCount = 0
  sigCounts.forEach((count, sig) => { if (count > commonCount) { commonCount = count; commonSig = sig } })
  const commonDays = commonSig ? WEEKDAYS.filter(d => daySignature(d.value) === commonSig).map(d => d.value) : []
  // Só vira linha de exceção quem tem dado explícito (fechado marcado ou
  // horário próprio diferente) — dia nunca tocado (empresa nova, sem
  // nenhuma linha ainda) fica só com a pill apagada, sem card nenhum, pra
  // não repetir o problema original (7-8 cards vazios) logo no cadastro.
  const exceptionDays = WEEKDAYS.filter(d => !commonDays.includes(d.value) && daySignature(d.value) !== null).map(d => d.value)
  const commonRanges: Range[] = commonDays.length > 0
    ? rowsFor(commonDays[0]).filter(h => !h.closed).map(h => ({ open_time: h.open_time, close_time: h.close_time }))
    : []

  function writeCommonRows(days: number[], ranges: Range[]) {
    const others = hours.filter(h => !days.includes(h.day_of_week ?? -1))
    const newRows: HourRow[] = days.flatMap(day => ranges.map(r => ({ day_of_week: day, open_time: r.open_time, close_time: r.close_time, closed: false })))
    setHours([...others, ...newRows])
  }

  // Clique numa pill: tira do grupo comum (vira exceção, fechada por
  // padrão — é o caso real mais comum, tipo domingo — mas com o checkbox
  // "Fechado" ali do lado pra desmarcar e dar um horário próprio se não
  // for esse o caso) ou entra no grupo comum (copia o horário comum).
  function togglePill(day: number) {
    if (commonDays.includes(day)) {
      const others = hours.filter(h => h.day_of_week !== day)
      setHours([...others, { day_of_week: day, open_time: null, close_time: null, closed: true }])
    } else {
      const base = commonRanges.length > 0 ? commonRanges : [{ open_time: '', close_time: '' }]
      writeCommonRows([day], base)
    }
  }

  function updateCommonRange(idx: number, field: 'open_time' | 'close_time', val: string) {
    const ranges = commonRanges.map((r, i) => i === idx ? { ...r, [field]: val } : r)
    writeCommonRows(commonDays, ranges)
  }
  function addCommonRange() {
    writeCommonRows(commonDays, [...commonRanges, { open_time: '', close_time: '' }])
  }
  function removeCommonRange(idx: number) {
    writeCommonRows(commonDays, commonRanges.filter((_, i) => i !== idx))
  }

  // Abaixo: funções da linha de exceção (e de Feriados) — um dia por vez,
  // igual o editor antigo, só que agora só aparece pra quem precisa mesmo.
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

  function DayRow({ day, label }: { day: number; label: string }) {
    const rows = rowsFor(day)
    const closed = isDayClosed(day)
    return (
      <div className="bh-exc">
        <div className="bh-exc-hdr">
          <span className="bh-exc-label">{label}</span>
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
            <button type="button" className="bh-add" onClick={() => addRange(day)}>+ outro horário nesse dia</button>
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

        .bh-common { background: #fff; border: 1px solid #DDD5C4; border-radius: 12px; padding: 14px; }
        .bh-common-title { font-size: 11px; font-weight: 700; color: #2A261F; margin-bottom: 10px; font-family: 'Archivo', sans-serif; }
        .bh-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .bh-pill { min-width: 54px; height: 34px; padding: 0 8px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; font-family: 'Archivo', sans-serif; cursor: pointer; border: none; }
        .bh-pill-on { background: #151210; color: #FFC531; }
        .bh-pill-off { background: #fff; border: 1.5px solid #D7CFBE; color: #AEA68F; }
        .bh-range { display: flex; align-items: center; gap: 6px; }
        .bh-range input[type="time"] { border: 1.5px solid #B9AE97; border-radius: 8px; padding: 7px 9px; font-size: 12px; font-family: 'Archivo', sans-serif; outline: none; background: #F4F1E9; color: #222; }
        .bh-range input[type="time"]:focus { border-color: var(--sign-dark); }
        .bh-range span { color: #8A8477; font-size: 12px; }
        .bh-range-rm { background: #FEF0F0; color: #E24B4A; border: none; border-radius: 6px; width: 24px; height: 24px; cursor: pointer; font-size: 13px; flex-shrink: 0; }
        .bh-ranges { display: flex; flex-direction: column; gap: 6px; }
        .bh-add { align-self: flex-start; background: none; border: none; color: var(--sign-dark); font-size: 11px; font-weight: 700; cursor: pointer; padding: 2px 0; font-family: 'Archivo', sans-serif; }
        .bh-common-hint { font-size: 11.5px; color: #8A8477; font-style: italic; }

        .bh-exc { background: #fff; border: 1px solid #DDD5C4; border-radius: 10px; padding: 10px 12px; }
        .bh-exc-hdr { display: flex; align-items: center; justify-content: space-between; }
        .bh-exc-label { font-size: 13px; font-weight: 700; color: #111; font-family: 'Archivo', sans-serif; }
        .bh-closed-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #8A8477; cursor: pointer; user-select: none; }
        .bh-closed-toggle input { accent-color: var(--sign-dark); width: 15px; height: 15px; cursor: pointer; }
        .bh-empty { font-size: 11px; color: #AEA68F; font-style: italic; }
      `}</style>

      <div className="bh-flex-toggle">
        <div>
          <div className="bh-flex-toggle-txt">Não tenho horário fixo</div>
          <div className="bh-flex-toggle-sub">Ambulante, sob consulta, etc — dispensa a grade abaixo</div>
        </div>
        <div className="bh-flex-switch" style={{background: flexible ? '#0F8050' : '#D7CFBE'}} onClick={() => setFlexible(!flexible)}>
          <div className="bh-flex-switch-knob" style={{left: flexible ? 22 : 2}} />
        </div>
      </div>

      {flexible ? (
        <div className="bh-flex-note">Sua empresa vai aparecer como "Horário flexível" e sempre conta como aberta em "Aberto Agora".</div>
      ) : (
        <>
          <div className="bh-common">
            <div className="bh-common-title">Toque nos dias que têm o mesmo horário</div>
            <div className="bh-pills">
              {WEEKDAYS.map(d => (
                <button key={d.value} type="button" className={`bh-pill ${commonDays.includes(d.value) ? 'bh-pill-on' : 'bh-pill-off'}`} onClick={() => togglePill(d.value)}>
                  {d.label.slice(0, 3)}
                </button>
              ))}
            </div>
            {commonDays.length > 0 ? (
              <div className="bh-ranges">
                {commonRanges.map((r, i) => (
                  <div key={i} className="bh-range">
                    <input type="time" value={r.open_time || ''} onChange={e => updateCommonRange(i, 'open_time', e.target.value)} />
                    <span>até</span>
                    <input type="time" value={r.close_time || ''} onChange={e => updateCommonRange(i, 'close_time', e.target.value)} />
                    {commonRanges.length > 1 && <button type="button" className="bh-range-rm" onClick={() => removeCommonRange(i)}>×</button>}
                  </div>
                ))}
                <button type="button" className="bh-add" onClick={addCommonRange}>+ outro intervalo (ex: almoço e janta)</button>
              </div>
            ) : (
              <div className="bh-common-hint">Nenhum dia selecionado ainda — toque em um dia acima pra começar.</div>
            )}
          </div>

          {exceptionDays.map(day => (
            <DayRow key={day} day={day} label={DAYS_OF_WEEK.find(d => d.value === day)?.label || ''} />
          ))}

          <DayRow day={FERIADOS_DAY} label="Feriados" />
        </>
      )}
    </div>
  )
}
