'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Round {
  id: string
  word: string
  prize_description: string
  max_winners: number
  winners_count: number
  status: 'active' | 'completed' | 'inactive'
  created_at: string
  completed_at: string | null
  company_id: string | null
  company?: { name: string } | null
}

interface Winner {
  id: string
  prize_word_id: string
  user_id: string
  name: string | null
  phone: string | null
  position: number
  redeemed: boolean
  redeemed_at: string | null
  won_at: string
}

interface CompanyOption { id: string; name: string }

const s: Record<string, any> = {
  card: { background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  cardTitle: { fontSize: 11, fontWeight: 700, color: '#C9951A', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6, marginTop: 12 },
  input: { width: '100%', background: '#f9f9f9', border: '1.5px solid #e5e5e5', borderRadius: 10, color: '#111', padding: '11px 14px', fontSize: 13, outline: 'none' },
  btnPrimary: { width: '100%', background: '#C9951A', color: '#111', border: 'none', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 16 },
  btnGhost: { background: '#fff', color: '#E24B4A', border: '1.5px solid #E24B4A', padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  scopeBtn: (on: boolean) => ({ flex: 1, padding: '10px 12px', borderRadius: 10, border: on ? '1.5px solid #C9951A' : '1.5px solid #e5e5e5', background: on ? '#FEF3E2' : '#fff', color: on ? '#92600A' : '#666', fontSize: 13, fontWeight: 700, cursor: 'pointer' }),
}

export default function PalavraPremiadaTab() {
  const [rounds, setRounds] = useState<Round[]>([])
  const [winners, setWinners] = useState<Winner[]>([])
  const [loading, setLoading] = useState(false)
  const [word, setWord] = useState('')
  const [prize, setPrize] = useState('')
  const [maxWinners, setMaxWinners] = useState(3)

  const [scope, setScope] = useState<'geral' | 'loja'>('geral')
  const [companySearch, setCompanySearch] = useState('')
  const [companyResults, setCompanyResults] = useState<CompanyOption[]>([])
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption | null>(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (scope !== 'loja' || !companySearch.trim() || companySearch.length < 2) { setCompanyResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('companies').select('id, name').ilike('name', `%${companySearch.trim()}%`).limit(8)
      setCompanyResults((data || []) as CompanyOption[])
    }, 250)
    return () => clearTimeout(t)
  }, [companySearch, scope])

  async function load() {
    const res = await fetch('/api/palavra-premiada')
    const data = await res.json()
    setRounds(data.rounds || [])
    setWinners(data.winners || [])
  }

  async function criar() {
    if (!word.trim() || !prize.trim()) return alert('Preencha a palavra e o prêmio')
    if (scope === 'loja' && !selectedCompany) return alert('Escolha a loja')

    setLoading(true)
    const res = await fetch('/api/palavra-premiada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', word, prize_description: prize, max_winners: maxWinners, company_id: scope === 'loja' ? selectedCompany?.id : null })
    })
    const data = await res.json()
    setLoading(false)
    if (data.error) return alert(data.error)
    setWord(''); setPrize(''); setMaxWinners(3); setSelectedCompany(null); setCompanySearch(''); setScope('geral')
    load()
  }

  async function encerrar(id: string) {
    if (!confirm('Encerrar essa rodada agora?')) return
    await fetch('/api/palavra-premiada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', id })
    })
    load()
  }

  async function marcarEntregue(winnerId: string) {
    await fetch('/api/palavra-premiada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', winner_id: winnerId })
    })
    load()
  }

  const ativasFiltradas = rounds.filter(r => r.status === 'active')
  const winnersOf = (roundId: string) => winners.filter(w => w.prize_word_id === roundId).sort((a, b) => a.position - b.position)
  const scopeLabel = (r: Round) => r.company_id ? `🏪 ${r.company?.name || 'loja'}` : '🌐 Geral (busca do site)'

  return (
    <div>
      <div style={s.card}>
        <div style={s.cardTitle}>🎁 Rodadas Ativas</div>
        {ativasFiltradas.length === 0 && <div style={{ fontSize: 13, color: '#999' }}>Nenhuma rodada ativa no momento.</div>}
        {ativasFiltradas.map(r => (
          <div key={r.id} style={{ borderTop: '1px solid #eee', paddingTop: 14, marginTop: r.id === ativasFiltradas[0].id ? 0 : 14, borderTopWidth: r.id === ativasFiltradas[0].id ? 0 : 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 4 }}>{scopeLabel(r)}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 4 }}>"{r.word}"</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>Prêmio: {r.prize_description}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#C9951A', marginBottom: 14 }}>{r.winners_count}/{r.max_winners} ganhadores</div>
            {winnersOf(r.id).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {winnersOf(r.id).map(w => (
                  <div key={w.id} style={{ fontSize: 13, color: '#444', padding: '4px 0' }}>
                    {w.position}º — {w.name || 'sem nome'} · {w.phone || 'sem WhatsApp'}
                  </div>
                ))}
              </div>
            )}
            <button style={s.btnGhost} onClick={() => encerrar(r.id)}>Encerrar rodada agora</button>
          </div>
        ))}
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>🚀 Nova Rodada</div>
        <label style={s.label}>Escopo</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.scopeBtn(scope === 'geral')} onClick={() => setScope('geral')}>🌐 Geral (busca do site)</button>
          <button style={s.scopeBtn(scope === 'loja')} onClick={() => setScope('loja')}>🏪 Loja específica</button>
        </div>
        <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>Você pode ativar mais de uma rodada pra mesma loja — cada uma com uma palavra e um prêmio diferente. O morador digita no mesmo campo de busca do perfil da loja.</div>

        {scope === 'loja' && (
          <div style={{ marginTop: 12 }}>
            {selectedCompany ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FEF3E2', border: '1.5px solid #C9951A', borderRadius: 10, padding: '10px 14px' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#92600A' }}>🏪 {selectedCompany.name}</span>
                <button onClick={() => { setSelectedCompany(null); setCompanySearch('') }} style={{ background: 'none', border: 'none', color: '#92600A', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            ) : (
              <>
                <input style={s.input} value={companySearch} onChange={e => setCompanySearch(e.target.value)} placeholder="Buscar loja pelo nome..." />
                {companyResults.length > 0 && (
                  <div style={{ marginTop: 6, border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
                    {companyResults.map(c => (
                      <div key={c.id} onClick={() => { setSelectedCompany(c); setCompanyResults([]) }} style={{ padding: '10px 14px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>{c.name}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <label style={s.label}>Palavra premiada</label>
        <input style={s.input} value={word} onChange={e => setWord(e.target.value)} placeholder="Ex: trindade50" />
        <label style={s.label}>Descrição do prêmio</label>
        <input style={s.input} value={prize} onChange={e => setPrize(e.target.value)} placeholder="Ex: R$50 de desconto na Padaria X" />
        <label style={s.label}>Quantidade de ganhadores</label>
        <input style={s.input} type="number" min={1} value={maxWinners} onChange={e => setMaxWinners(Number(e.target.value))} />
        <button style={s.btnPrimary} disabled={loading} onClick={criar}>{loading ? 'Criando...' : 'Ativar rodada'}</button>
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>📜 Histórico de Rodadas</div>
        {rounds.filter(r => r.status !== 'active').length === 0 && <div style={{ fontSize: 13, color: '#999' }}>Nenhuma rodada anterior.</div>}
        {rounds.filter(r => r.status !== 'active').map(r => (
          <div key={r.id} style={{ borderTop: '1px solid #eee', paddingTop: 14, marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 4 }}>{scopeLabel(r)}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>"{r.word}" <span style={{ fontSize: 11, fontWeight: 600, color: r.status === 'completed' ? '#0F6E56' : '#999', marginLeft: 6 }}>{r.status === 'completed' ? 'ESGOTADA' : 'ENCERRADA'}</span></div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{r.prize_description} · {r.winners_count}/{r.max_winners} ganhadores</div>
            {winnersOf(r.id).map(w => (
              <div key={w.id} style={{ fontSize: 13, color: '#444', padding: '5px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>{w.position}º — {w.name || 'sem nome'} · {w.phone || 'sem WhatsApp'}</span>
                {w.redeemed
                  ? <span style={{ fontSize: 11, color: '#0F6E56', fontWeight: 600 }}>✓ Entregue</span>
                  : <button onClick={() => marcarEntregue(w.id)} style={{ fontSize: 11, fontWeight: 600, color: '#C9951A', background: 'none', border: '1px solid #C9951A', borderRadius: 8, padding: '3px 10px', cursor: 'pointer' }}>Marcar entregue</button>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
