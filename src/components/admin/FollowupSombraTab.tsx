'use client'
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

// Tela do MODO SOMBRA do follow-up (docs/DESENHO_FOLLOWUP.md, fase 2): mostra o
// que o motor teria mandado, SEM ter mandado nada. O Ricardo dá 👍/👎 (+ motivo,
// + "erro grave") em cada caso. Critério pra liberar envio real: ≥ 30 revisados,
// ≥ 90% 👍 e nenhum erro grave.

type Loja = { id: string; name: string; followup_modo: 'off' | 'sombra' | 'real' }
type Msg = { direction: 'in' | 'out'; body: string | null; sent_at: string; origem: string | null }
type Item = {
  id: string; passo: number; texto_gerado: string | null; motivo: string | null; processado_em: string
  revisao: 'ok' | 'ruim' | null; revisao_motivo: string | null; revisao_grave: boolean
  companies: { name: string } | null; crm_contacts: { name: string | null; phone: string } | null
  conversa: Msg[]
}
type Dados = {
  lojas: Loja[]; itens: Item[]
  resumo: { simulados: number; revisados: number; ok: number; graves: number; porMotivo: Record<string, number> }
}

const s: Record<string, any> = {
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 16, overflow: 'hidden' },
  hd: { padding: '15px 20px', borderBottom: '1px solid #F0EDE8', fontSize: 12.5, fontWeight: 800, color: '#111' },
  body: { padding: 18 },
  btn: { background: '#fff', color: '#111', border: '1.5px solid #E0DDD8', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  btnOn: { background: '#111', color: '#fff', border: '1.5px solid #111', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  btnRed: { background: '#fff', color: '#C43D3D', border: '1.5px solid #C43D3D', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  input: { border: '1.5px solid #E0DDD8', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
}

const MOTIVO_TXT: Record<string, string> = {
  'ignorado:ancora_nao_espera_resposta': 'a mensagem da loja não esperava resposta',
  'ignorado:mensagem_nao_entregue': 'mensagem não chegou ao cliente',
  'ignorado:atendimento_humano': 'conversa com atendimento humano',
  'ignorado:cliente_inativo_24h': 'cliente não falava há mais de 24 h',
  'ignorado:ancora_nao_e_conversa_ia': 'última mensagem não era da IA',
  'ignorado:conversa_sensivel': 'conversa com reclamação/problema',
  'ignorado:possivel_pedido_para_parar': 'cliente parece ter pedido pra parar',
  'ignorado:passo1_nao_enviado': '2º lembrete sem o 1º',
  'ignorado:ciclo_anterior_sem_resposta_7d': 'já recebeu lembrete há menos de 7 dias',
  'ignorado:limite_diario_da_loja': 'limite diário da loja',
  'ignorado:whatsapp_desconectado': 'WhatsApp da loja desconectado',
  'ignorado:optout': 'contato pediu pra não receber',
  'ignorado:contato_silenciado_ou_arquivado': 'contato silenciado/arquivado',
  'cancelado:conversa_andou': 'a conversa continuou sozinha',
  'cancelado:cliente_respondeu': 'cliente respondeu a tempo',
  'cancelado:humano_assumiu': 'o dono assumiu a conversa',
  'cancelado:nova_mensagem_ia': 'a IA mandou outra mensagem',
  'cancelado:pedido_depois_da_ancora': 'cliente já fez pedido',
  'cancelado:pix_em_andamento': 'Pix em andamento',
  'cancelado:loja_fechada': 'loja fechada',
  'cancelado:loja_pausada': 'loja pausada',
  'cancelado:perto_de_fechar': 'faltavam menos de 10 min pra fechar',
  'cancelado:fora_da_janela_9_18': 'fora do horário das 9h às 18h',
  'cancelado:loja_desligada': 'follow-up desligado na loja',
  'expirado:atrasado_mais_de_3h': 'venceu há mais de 3 h',
  'simulado:ok': 'teria mandado (texto da IA)',
  'simulado:texto_reserva': 'teria mandado (texto de reserva)',
}

function hora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function FollowupSombraTab() {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [ruimId, setRuimId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [grave, setGrave] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await adminFetch('/api/admin/followup-sombra')
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Erro ao carregar'); return }
      setErro(''); setD(j)
    } catch { setErro('Erro de conexão') }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function post(body: any) {
    setBusy(true)
    try { await adminFetch('/api/admin/followup-sombra', { method: 'POST', body: JSON.stringify(body) }) } finally { setBusy(false) }
    await carregar()
  }

  if (erro) return <div style={{ color: '#C43D3D', fontWeight: 700 }}>{erro}</div>
  if (!d) return <div style={{ color: '#999' }}>Carregando…</div>

  const { resumo } = d
  const pct = resumo.revisados ? Math.round((resumo.ok / resumo.revisados) * 100) : 0
  const liberado = resumo.revisados >= 30 && pct >= 90 && resumo.graves === 0
  const ignorados = Object.entries(resumo.porMotivo).filter(([k]) => !k.startsWith('simulado:') && !k.startsWith('pendente')).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <div style={s.card}>
        <div style={s.hd}>🧪 Follow-up em modo sombra — nada é enviado ao cliente</div>
        <div style={s.body}>
          <div style={{ fontSize: 12.5, color: '#555', marginBottom: 12, lineHeight: 1.5 }}>
            O motor decide e escreve o lembrete, mas só registra aqui. Revise cada caso com 👍 ou 👎.
            Para liberar o envio real: <b>30 casos revisados, 90% de 👍 e nenhum erro grave</b>.
          </div>
          {d.lojas.map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #F0EDE8' }}>
              <span style={{ flex: 1, minWidth: 140, fontWeight: 700, fontSize: 13 }}>{l.name}</span>
              <button disabled={busy} style={l.followup_modo === 'off' ? s.btnOn : s.btn} onClick={() => post({ acao: 'modo', company_id: l.id, modo: 'off' })}>Desligado</button>
              <button disabled={busy} style={l.followup_modo === 'sombra' ? s.btnOn : s.btn} onClick={() => post({ acao: 'modo', company_id: l.id, modo: 'sombra' })}>Modo sombra</button>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <button disabled={busy} style={s.btnRed} onClick={() => { if (confirm('Desligar o follow-up de TODAS as lojas e cancelar a fila?')) post({ acao: 'desligar_tudo' }) }}>
              🛑 Desligar tudo (emergência)
            </button>
          </div>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.hd}>📊 Placar (últimos 14 dias)</div>
        <div style={{ ...s.body, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 24, fontWeight: 800 }}>{resumo.simulados}</div><div style={{ fontSize: 11, color: '#999' }}>teria mandado</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 800 }}>{resumo.revisados}</div><div style={{ fontSize: 11, color: '#999' }}>revisados (meta 30)</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 800 }}>{resumo.revisados ? `${pct}%` : '–'}</div><div style={{ fontSize: 11, color: '#999' }}>👍 (meta 90%)</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 800, color: resumo.graves ? '#C43D3D' : '#111' }}>{resumo.graves}</div><div style={{ fontSize: 11, color: '#999' }}>erros graves (meta 0)</div></div>
          <div style={{ alignSelf: 'center', fontWeight: 800, color: liberado ? '#0F8050' : '#999' }}>{liberado ? '✅ Critério atingido' : 'Ainda não atingiu o critério'}</div>
        </div>
      </div>

      {ignorados.length > 0 && (
        <div style={s.card}>
          <div style={s.hd}>🙈 O que o motor NÃO mandou, e por quê</div>
          <div style={s.body}>
            {ignorados.map(([k, n]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
                <span>{MOTIVO_TXT[k] || k}</span><b>{n}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={s.card}>
        <div style={s.hd}>💬 O que eu teria mandado ({d.itens.length})</div>
        <div style={s.body}>
          {d.itens.length === 0 && <div style={{ color: '#999', fontSize: 13 }}>Nada ainda. Ligue o modo sombra numa loja e aguarde as conversas acontecerem.</div>}
          {d.itens.map(i => (
            <div key={i.id} style={{ border: '1.5px solid #EDE8E0', borderRadius: 12, padding: 14, marginBottom: 12, background: i.revisao === 'ok' ? '#F3FBF6' : i.revisao === 'ruim' ? '#FFF5F4' : '#fff' }}>
              <div style={{ fontSize: 11.5, color: '#888', marginBottom: 8 }}>
                <b style={{ color: '#111' }}>{i.companies?.name}</b> · {i.crm_contacts?.name || i.crm_contacts?.phone} · {i.passo}º lembrete · {hora(i.processado_em)}
                {i.motivo === 'texto_reserva' && ' · texto de reserva'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                {i.conversa.map((m, idx) => (
                  <div key={idx} style={{ alignSelf: m.direction === 'in' ? 'flex-start' : 'flex-end', maxWidth: '85%', background: m.direction === 'in' ? '#F2F0EB' : '#E3F3E8', borderRadius: 10, padding: '6px 10px', fontSize: 12.5, whiteSpace: 'pre-wrap' }}>
                    {m.body}
                  </div>
                ))}
                <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: '#FFF4D6', border: '1.5px dashed #C9951A', borderRadius: 10, padding: '6px 10px', fontSize: 12.5, whiteSpace: 'pre-wrap' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#A87200', marginBottom: 2 }}>🤖 LEMBRETE (não enviado)</div>
                  {i.texto_gerado}
                </div>
              </div>
              {i.revisao ? (
                <div style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b>{i.revisao === 'ok' ? '👍 Aprovado' : `👎 Reprovado${i.revisao_grave ? ' (ERRO GRAVE)' : ''}`}</b>
                  {i.revisao_motivo && <span style={{ color: '#666' }}>— {i.revisao_motivo}</span>}
                </div>
              ) : ruimId === i.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input style={s.input} placeholder="O que estava errado?" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
                  <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={grave} onChange={e => setGrave(e.target.checked)} />
                    Erro grave (mandaria pra quem já pediu, pediu pra parar ou estava reclamando)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={busy} style={s.btnOn} onClick={async () => { await post({ acao: 'revisar', id: i.id, revisao: 'ruim', motivo, grave }); setRuimId(null); setMotivo(''); setGrave(false) }}>Salvar 👎</button>
                    <button style={s.btn} onClick={() => setRuimId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={busy} style={s.btn} onClick={() => post({ acao: 'revisar', id: i.id, revisao: 'ok' })}>👍 Boa</button>
                  <button disabled={busy} style={s.btn} onClick={() => { setRuimId(i.id); setMotivo(''); setGrave(false) }}>👎 Ruim</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
