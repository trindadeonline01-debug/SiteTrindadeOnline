'use client'

import { useEffect, useRef, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

// Simulador do atendente de IA (só admin). Nada sai por WhatsApp e nada é gravado no CRM.
const CALCADA_DO_PEIXE = 'd3373bd7-fa9b-490f-a077-c8f2980028c1'

type Msg = { direction: 'in' | 'out'; body: string }

export default function IaTestePage() {
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([])
  const [companyId, setCompanyId] = useState(CALCADA_DO_PEIXE)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    adminFetch('/api/admin/ia-teste', { method: 'POST', body: JSON.stringify({ acao: 'lojas' }) })
      .then(r => r.json())
      .then(d => { if (d?.lojas) setLojas(d.lojas); else if (d?.error) setErro(d.error) })
      .catch(() => setErro('Não foi possível carregar as lojas (você está logado como admin?)'))
  }, [])

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, carregando])

  async function enviar() {
    const t = texto.trim()
    if (!t || carregando) return
    setErro('')
    const novo: Msg[] = [...msgs, { direction: 'in', body: t }]
    setMsgs(novo)
    setTexto('')
    setCarregando(true)
    try {
      const r = await adminFetch('/api/admin/ia-teste', { method: 'POST', body: JSON.stringify({ companyId, historico: novo }) })
      const d = await r.json()
      if (!r.ok) setErro(d?.error || 'Erro ao gerar a resposta')
      else if (d?.texto) setMsgs([...novo, { direction: 'out', body: d.texto }])
      else setErro(d?.aviso || 'A IA não respondeu')
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCarregando(false)
    }
  }

  const nomeLoja = lojas.find(l => l.id === companyId)?.name || 'Calçada do Peixe'

  return (
    <div style={{ minHeight: '100vh', background: '#E9EAE5', fontFamily: 'Archivo, system-ui, sans-serif', color: '#151210', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#151210', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <a href="/admin" style={{ color: '#FFC531', textDecoration: 'none', fontWeight: 700 }}>← Admin</a>
        <strong style={{ fontSize: 18 }}>Teste da IA de atendimento</strong>
        <select value={companyId} onChange={e => { setCompanyId(e.target.value); setMsgs([]); setErro('') }}
          style={{ marginLeft: 'auto', padding: '8px 10px', borderRadius: 8, border: 0, minWidth: 200 }}>
          {lojas.length === 0 && <option value={CALCADA_DO_PEIXE}>Calçada do Peixe</option>}
          {lojas.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button onClick={() => { setMsgs([]); setErro('') }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '2px solid #4a423a', background: 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Nova conversa</button>
      </div>

      <div style={{ background: '#FFF3CC', color: '#6b4e00', padding: '8px 16px', fontSize: 13 }}>
        Você escreve como o cliente de <b>{nomeLoja}</b> e vê a resposta que a IA daria, com o cardápio, o horário e as regras reais da loja. Nada é enviado por WhatsApp nem gravado.
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720, width: '100%', margin: '0 auto' }}>
        {msgs.length === 0 && <div style={{ color: '#6F6C67', textAlign: 'center', marginTop: 40 }}>Comece a conversa. Exemplos: &quot;Boa noite, vocês entregam no Mutuá?&quot; · &quot;Qual o horário hoje?&quot; · &quot;Quanto está o camarão?&quot;</div>}
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.direction === 'in' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.direction === 'in' ? '#FFC531' : '#fff', padding: '8px 12px', borderRadius: 12, whiteSpace: 'pre-wrap', lineHeight: 1.4, boxShadow: '0 1px 2px rgba(0,0,0,.12)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: .6, marginBottom: 2 }}>{m.direction === 'in' ? 'Cliente' : 'IA'}</div>
            {m.body}
          </div>
        ))}
        {carregando && <div style={{ alignSelf: 'flex-start', color: '#6F6C67' }}>IA digitando…</div>}
        {erro && <div style={{ color: '#D6392B', fontWeight: 600 }}>{erro}</div>}
        <div ref={fimRef} />
      </div>

      <form onSubmit={e => { e.preventDefault(); enviar() }} style={{ display: 'flex', gap: 8, padding: 12, background: '#fff', borderTop: '1px solid #DCDDD6', position: 'sticky', bottom: 0 }}>
        <input id="msg" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Mensagem do cliente…" autoFocus
          style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '2px solid #151210', fontSize: 16 }} />
        <button type="submit" disabled={carregando || !texto.trim()}
          style={{ padding: '0 20px', borderRadius: 10, border: 0, background: '#151210', color: '#fff', fontWeight: 700, opacity: carregando || !texto.trim() ? .5 : 1, cursor: 'pointer' }}>Enviar</button>
      </form>
    </div>
  )
}
