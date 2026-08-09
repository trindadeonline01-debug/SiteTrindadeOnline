'use client'
import { useState } from 'react'

const DIMENSION_OPTIONS = ['Device', 'Source', 'Browser', 'OS', 'Country/Region', 'Medium', 'Campaign', 'Channel', 'URL']

const s: Record<string, any> = {
  card: { background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  cardTitle: { fontSize: 11, fontWeight: 700, color: '#C9951A', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6, marginTop: 12 },
  select: { background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '9px 12px', fontSize: 13, outline: 'none' },
  btnPrimary: { background: '#C9951A', color: '#111', border: 'none', padding: '12px 22px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  chip: (on: boolean) => ({ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border: on ? '1.5px solid #C9951A' : '1.5px solid #e5e5e5', background: on ? '#FEF3E2' : '#fff', color: on ? '#92600A' : '#666', cursor: 'pointer' }),
}

export default function ClarityTab() {
  const [numOfDays, setNumOfDays] = useState(3)
  const [dims, setDims] = useState<string[]>(['Device', 'Source'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<any[] | null>(null)

  function toggleDim(d: string) {
    setDims(prev => prev.includes(d) ? prev.filter(x => x !== d) : prev.length < 3 ? [...prev, d] : prev)
  }

  async function carregar() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/clarity?numOfDays=${numOfDays}&dims=${dims.join(',')}`)
      const json = await res.json()
      if (json.error) { setError(json.error); setData(null) }
      else setData(Array.isArray(json.data) ? json.data : [json.data])
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar')
    }
    setLoading(false)
  }

  return (
    <div>
      <div style={s.card}>
        <div style={s.cardTitle}>📈 Microsoft Clarity</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
          A API oficial da Clarity só permite ver até 3 dias pra trás e tem limite de 10 consultas por dia — por isso o carregamento é manual, não automático.
        </div>

        <label style={s.label}>Período</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {[1, 2, 3].map(n => (
            <button key={n} style={s.chip(numOfDays === n)} onClick={() => setNumOfDays(n)}>{n} dia{n > 1 ? 's' : ''}</button>
          ))}
        </div>

        <label style={s.label}>Quebrar por (até 3)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {DIMENSION_OPTIONS.map(d => (
            <button key={d} style={s.chip(dims.includes(d))} onClick={() => toggleDim(d)}>{d}</button>
          ))}
        </div>

        <button style={s.btnPrimary} disabled={loading} onClick={carregar}>{loading ? 'Carregando...' : '↻ Carregar relatório'}</button>

        {error && (
          <div style={{ marginTop: 16, background: '#FEF0F0', border: '1px solid #F5BCBC', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#C0392B' }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {data && data.length > 0 && data.map((block: any, i: number) => (
        <div key={i} style={s.card}>
          <div style={s.cardTitle}>{block?.metricName || `Métrica ${i + 1}`}</div>
          {Array.isArray(block?.information) && block.information.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {Object.keys(block.information[0]).map(k => (
                      <th key={k} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #eee', color: '#888', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.information.map((row: any, ri: number) => (
                    <tr key={ri}>
                      {Object.keys(block.information[0]).map(k => (
                        <td key={k} style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#333' }}>{String(row[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre style={{ fontSize: 12, color: '#666', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{JSON.stringify(block, null, 2)}</pre>
          )}
        </div>
      ))}

      {data && data.length === 0 && (
        <div style={{ fontSize: 13, color: '#999', textAlign: 'center', padding: 24 }}>Nenhum dado retornado pra esse período.</div>
      )}
    </div>
  )
}
