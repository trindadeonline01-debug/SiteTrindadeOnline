'use client'
/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do Supabase lidas campo a campo */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/adminFetch'
import EditarPedidoPanel from '@/components/painel/EditarPedidoPanel'

// Vendas do dia (6/nov/2026, pedido do Ricardo): todas as vendas de mesa e de
// balcão (PDV) de um dia, separadas por mesa, com editar e cancelar — inclusive
// venda já fechada. Mesa: "Editar" reabre a conta (PIN da supervisão) e ela volta
// para a tela normal da comanda (acrescentar/tirar item, trocar forma de
// pagamento, fechar de novo). Balcão: abre a edição de pedido. Cancelar pede o
// PIN e desfaz a venda toda (rodadas, cashback usado/ganho).

type Comanda = {
  id: string; mesa_id: string | null; tipo: string | null; rotulo: string | null; numero: number; status: 'aberta' | 'fechada' | 'cancelada'
  garcom_nome: string | null; customer_name: string | null; customer_phone: string | null
  subtotal: number; taxa_valor: number; desconto: number; total: number; aberta_em: string; fechada_em: string | null
}
type Item = { id: string; product_name: string; unit_price: number; qty: number; peso_kg: number | null; selected_options: { name: string; price: number }[] }
type Pedido = { id: string; comanda_id: string | null; order_number: number | null; status: string; total: number; payment_method: string | null; customer_name: string; created_at: string; itens: Item[] } & Record<string, any>
type Pagto = { comanda_id: string; forma: string; cartao_tipo: string | null; valor: number }

const fmt = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
const hora = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'
const hojeBr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const NOME_FORMA: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', cashback: 'Cashback', cartao: 'Cartão', cartao_credito: 'Crédito', cartao_debito: 'Débito', misto: 'Misto' }
const formaDe = (p: { forma: string; cartao_tipo?: string | null }) => p.forma === 'cartao' ? (p.cartao_tipo === 'debito' ? 'Débito' : 'Crédito') : (NOME_FORMA[p.forma] || p.forma)
const resumoItens = (itens: Item[]) => itens.map(i => i.peso_kg != null ? `${String(i.peso_kg).replace('.', ',')}kg ${i.product_name}` : `${i.qty}× ${i.product_name}`).join(' · ')

function faixaDoDia(dia: string) {
  const ini = new Date(`${dia}T00:00:00-03:00`)
  return { ini: ini.toISOString(), fim: new Date(ini.getTime() + 86_400_000).toISOString() }
}

export default function VendasDiaPanel({ companyId, onClose, onAbrirComanda, onMudou }: {
  companyId: string
  onClose: () => void
  onAbrirComanda: (comandaId: string) => Promise<void>
  onMudou: () => Promise<void>
}) {
  const [dia, setDia] = useState(hojeBr())
  const [carregando, setCarregando] = useState(true)
  const [comandas, setComandas] = useState<Comanda[]>([])
  const [mesaNum, setMesaNum] = useState<Record<string, number>>({})
  const [pagtos, setPagtos] = useState<Pagto[]>([])
  const [rodadas, setRodadas] = useState<Pedido[]>([])
  const [pdv, setPdv] = useState<Pedido[]>([])
  const [aviso, setAviso] = useState('')
  const [pin, setPin] = useState<{ titulo: string; texto: string; perigo?: boolean; run: (pin: string) => Promise<string | null> } | null>(null)
  const [pinVal, setPinVal] = useState('')
  const [pinErro, setPinErro] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [editPdv, setEditPdv] = useState<Pedido | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { ini, fim } = faixaDoDia(dia)
    const [a, b, c, mesas, pv] = await Promise.all([
      supabase.from('loja_comandas').select('*').eq('company_id', companyId).gte('aberta_em', ini).lt('aberta_em', fim),
      supabase.from('loja_comandas').select('*').eq('company_id', companyId).gte('fechada_em', ini).lt('fechada_em', fim),
      dia === hojeBr() ? supabase.from('loja_comandas').select('*').eq('company_id', companyId).eq('status', 'aberta') : Promise.resolve({ data: [] as any[] }),
      supabase.from('loja_mesas').select('id, numero').eq('company_id', companyId),
      supabase.from('loja_pedidos').select('*, itens:loja_pedido_itens(*)').eq('company_id', companyId).eq('origin', 'pdv').gte('created_at', ini).lt('created_at', fim).order('created_at', { ascending: false }),
    ])
    const unicas = new Map<string, Comanda>()
    for (const r of [...(a.data || []), ...(b.data || []), ...(c.data || [])] as Comanda[]) unicas.set(r.id, r)
    const lista = [...unicas.values()].sort((x, y) => x.aberta_em.localeCompare(y.aberta_em))
    const ids = lista.map(x => x.id)
    const [pg, rd] = ids.length
      ? await Promise.all([
          supabase.from('loja_comanda_pagamentos').select('comanda_id, forma, cartao_tipo, valor').in('comanda_id', ids),
          supabase.from('loja_pedidos').select('*, itens:loja_pedido_itens(*)').in('comanda_id', ids).order('created_at'),
        ])
      : [{ data: [] }, { data: [] }]
    setMesaNum(Object.fromEntries((mesas.data || []).map((m: any) => [m.id, m.numero])))
    setComandas(lista); setPagtos((pg.data || []) as Pagto[]); setRodadas((rd.data || []) as Pedido[]); setPdv((pv.data || []) as Pedido[])
    setCarregando(false)
  }, [companyId, dia])

  useEffect(() => { carregar() }, [carregar])

  async function api(acao: string, extra: Record<string, unknown>): Promise<{ ok: boolean; erro?: string }> {
    try {
      const res = await adminFetch('/api/mesas', { method: 'POST', body: JSON.stringify({ companyId, acao, ...extra }) })
      const data = await res.json().catch(() => ({}))
      return res.ok ? { ok: true } : { ok: false, erro: data.error || 'Não consegui concluir.' }
    } catch { return { ok: false, erro: 'Sem conexão. Tente de novo.' } }
  }

  function pedirPin(titulo: string, texto: string, run: (pin: string) => Promise<string | null>, perigo = false) {
    setPinVal(''); setPinErro(''); setPin({ titulo, texto, perigo, run })
  }
  async function confirmarPin() {
    if (!pin || !pinVal) return
    setPinBusy(true); setPinErro('')
    const msg = await pin.run(pinVal)
    setPinBusy(false)
    if (msg) { setPinErro(msg); return }
    setPin(null); setPinVal('')
  }

  const nomeVenda = (c: Comanda) => c.tipo === 'retirada' ? `Retirada${c.rotulo ? ' ' + c.rotulo : ''}` : `Mesa ${c.mesa_id ? (mesaNum[c.mesa_id] ?? '?') : '?'}`

  function editarMesa(c: Comanda) {
    if (c.status === 'aberta') { onAbrirComanda(c.id); return }
    pedirPin('Reabrir venda para editar', `${nomeVenda(c)} · conta #${c.numero} (${fmt(c.total)}). Ela volta a ficar aberta: dá para acrescentar ou tirar produto, trocar a forma de pagamento e fechar de novo.`, async p => {
      const r = await api('venda_reabrir', { comandaId: c.id, pin: p })
      if (!r.ok) return r.erro || 'Não consegui reabrir.'
      await onMudou(); await onAbrirComanda(c.id)
      return null
    })
  }
  function cancelarMesa(c: Comanda) {
    pedirPin('Cancelar venda', `${nomeVenda(c)} · conta #${c.numero} (${fmt(c.total)}). Todas as rodadas são canceladas${c.status === 'fechada' ? ' e a venda sai do total do dia' : ''}. Cashback usado volta para o cliente e o cashback ganho nesta conta sai.`, async p => {
      const r = await api('venda_cancelar', { comandaId: c.id, pin: p })
      if (!r.ok) return r.erro || 'Não consegui cancelar.'
      await onMudou(); await carregar()
      return null
    }, true)
  }
  function editarPdv(v: Pedido) {
    pedirPin('Editar venda do balcão', `Venda #${v.order_number ?? ''} (${fmt(v.total)}).`, async p => {
      const r = await api('pin_conferir', { pin: p })
      if (!r.ok) return r.erro || 'PIN incorreto.'
      setEditPdv(v)
      return null
    })
  }
  function cancelarPdv(v: Pedido) {
    pedirPin('Cancelar venda do balcão', `Venda #${v.order_number ?? ''} (${fmt(v.total)}) será cancelada e sai do total do dia.`, async p => {
      const r = await api('pin_conferir', { pin: p })
      if (!r.ok) return r.erro || 'PIN incorreto.'
      const res = await adminFetch('/api/loja/cancelar-pedido', { method: 'POST', body: JSON.stringify({ pedidoId: v.id, por: 'loja' }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return d.error || 'Não consegui cancelar.'
      await carregar()
      return null
    }, true)
  }

  // Mesas agrupadas: cada mesa com as vendas (contas) do dia.
  const grupos = useMemo(() => {
    const m = new Map<string, { titulo: string; ordem: number; vendas: Comanda[] }>()
    for (const c of comandas) {
      const ret = c.tipo === 'retirada' || !c.mesa_id
      const n = c.mesa_id ? mesaNum[c.mesa_id] : undefined
      const chave = ret ? 'ret' : String(n ?? c.mesa_id)
      if (!m.has(chave)) m.set(chave, { titulo: ret ? 'Retiradas' : `Mesa ${n ?? '?'}`, ordem: ret ? 9999 : (n ?? 9000), vendas: [] })
      m.get(chave)!.vendas.push(c)
    }
    return [...m.values()].sort((x, y) => x.ordem - y.ordem)
  }, [comandas, mesaNum])

  const fechadas = comandas.filter(c => c.status === 'fechada')
  const totMesas = fechadas.reduce((s, c) => s + Number(c.total), 0)
  const abertas = comandas.filter(c => c.status === 'aberta').length
  const pdvOk = pdv.filter(v => v.status !== 'cancelado')
  const totPdv = pdvOk.reduce((s, v) => s + Number(v.total), 0)
  const canceladas = comandas.filter(c => c.status === 'cancelada').length + pdv.filter(v => v.status === 'cancelado').length

  return (
    <div className="vd-ov">
      <style>{CSS}</style>
      <div className="vd-top">
        <button className="vd-back" onClick={onClose}>← Mesas</button>
        <h1>Vendas do dia</h1>
        <input type="date" className="vd-date" value={dia} max={hojeBr()} onChange={e => e.target.value && setDia(e.target.value)} aria-label="Dia" />
        <button className="vd-back" onClick={carregar} disabled={carregando}>{carregando ? 'Atualizando…' : 'Atualizar'}</button>
      </div>

      <div className="vd-body">
        <div className="vd-kpis">
          <div><em>Mesas (contas fechadas)</em><b>{fmt(totMesas)}</b><small>{fechadas.length} {fechadas.length === 1 ? 'venda' : 'vendas'}{abertas > 0 ? ` · ${abertas} aberta${abertas > 1 ? 's' : ''} agora` : ''}</small></div>
          <div><em>Balcão (PDV)</em><b>{fmt(totPdv)}</b><small>{pdvOk.length} {pdvOk.length === 1 ? 'venda' : 'vendas'}</small></div>
          <div><em>Total do dia</em><b>{fmt(totMesas + totPdv)}</b><small>{canceladas} cancelada{canceladas === 1 ? '' : 's'}</small></div>
        </div>
        {aviso && <div className="vd-aviso">{aviso}</div>}

        {carregando && <div className="vd-vazio">Carregando…</div>}
        {!carregando && grupos.length === 0 && pdv.length === 0 && <div className="vd-vazio">Nenhuma venda neste dia.</div>}

        {grupos.map(g => {
          const validas = g.vendas.filter(v => v.status !== 'cancelada')
          return (
            <section key={g.titulo} className="vd-grupo">
              <header><b>{g.titulo}</b><span>{validas.length} {validas.length === 1 ? 'venda' : 'vendas'} · {fmt(validas.reduce((s, v) => s + Number(v.total), 0))}</span></header>
              {g.vendas.map(c => {
                const meus = rodadas.filter(r => r.comanda_id === c.id && r.status !== 'cancelado')
                const itens = meus.flatMap(r => r.itens)
                const pgs = pagtos.filter(p => p.comanda_id === c.id)
                return (
                  <div key={c.id} className={`vd-linha ${c.status === 'cancelada' ? 'off' : ''}`}>
                    <div className="vd-info">
                      <div className="vd-l1">
                        <b>Conta #{c.numero}</b>
                        <span>{hora(c.aberta_em)}{c.fechada_em && c.status !== 'aberta' ? ` → ${hora(c.fechada_em)}` : ''}</span>
                        {c.garcom_nome && <span>· {c.garcom_nome}</span>}
                        <em className={`vd-st ${c.status}`}>{c.status === 'aberta' ? 'Aberta' : c.status === 'fechada' ? 'Fechada' : 'Cancelada'}</em>
                      </div>
                      <div className="vd-itens">{itens.length ? resumoItens(itens) : 'Sem itens'}</div>
                      {pgs.length > 0 && <div className="vd-pg">{pgs.map(p => `${formaDe(p)} ${fmt(p.valor)}`).join(' + ')}</div>}
                    </div>
                    <div className="vd-total">{fmt(c.total)}</div>
                    <div className="vd-acoes">
                      {c.status !== 'cancelada' && <button className="vd-edit" onClick={() => editarMesa(c)}>Editar</button>}
                      {c.status !== 'cancelada' && <button className="vd-del" onClick={() => cancelarMesa(c)}>Cancelar</button>}
                    </div>
                  </div>
                )
              })}
            </section>
          )
        })}

        {pdv.length > 0 && (
          <section className="vd-grupo">
            <header><b>Balcão (PDV)</b><span>{pdvOk.length} {pdvOk.length === 1 ? 'venda' : 'vendas'} · {fmt(totPdv)}</span></header>
            {pdv.map(v => {
              const off = v.status === 'cancelado'
              return (
                <div key={v.id} className={`vd-linha ${off ? 'off' : ''}`}>
                  <div className="vd-info">
                    <div className="vd-l1">
                      <b>Venda #{v.order_number ?? ''}</b><span>{hora(v.created_at)}</span>
                      {v.customer_name && v.customer_name !== 'Cliente balcão' && <span>· {v.customer_name}</span>}
                      <em className={`vd-st ${off ? 'cancelada' : 'fechada'}`}>{off ? 'Cancelada' : 'Paga'}</em>
                    </div>
                    <div className="vd-itens">{v.itens.length ? resumoItens(v.itens) : 'Sem itens'}</div>
                    {v.payment_method && <div className="vd-pg">{NOME_FORMA[v.payment_method] || v.payment_method}</div>}
                  </div>
                  <div className="vd-total">{fmt(v.total)}</div>
                  <div className="vd-acoes">
                    {!off && <button className="vd-edit" onClick={() => editarPdv(v)}>Editar</button>}
                    {!off && <button className="vd-del" onClick={() => cancelarPdv(v)}>Cancelar</button>}
                  </div>
                </div>
              )
            })}
          </section>
        )}
        <p className="vd-nota">Mudou o valor de uma venda de mesa? Edite pela comanda: acrescente ou tire produto, troque a forma de pagamento e feche de novo. O cashback já creditado não muda sozinho.</p>
      </div>

      {pin && (
        <div className="vd-pinov" onClick={() => !pinBusy && setPin(null)}>
          <div className="vd-pinbox" onClick={e => e.stopPropagation()}>
            <h2>{pin.titulo}</h2>
            <p>{pin.texto}</p>
            <label>PIN da supervisão</label>
            <input className="vd-pin" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus autoComplete="off" autoCorrect="off" spellCheck={false}
              name={'sup' + Math.random().toString(36).slice(2, 8)} data-lpignore="true" data-1p-ignore="true" data-form-type="other"
              value={pinVal} onChange={e => setPinVal(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter') confirmarPin() }} />
            {pinErro && <div className="vd-pinerr">{pinErro}</div>}
            <div className="vd-pinbt">
              <button onClick={() => setPin(null)} disabled={pinBusy}>Voltar</button>
              <button className={pin.perigo ? 'perigo' : 'ok'} onClick={confirmarPin} disabled={pinBusy || !pinVal}>{pinBusy ? 'Aguarde…' : pin.perigo ? 'Cancelar venda' : 'Continuar'}</button>
            </div>
          </div>
        </div>
      )}

      {editPdv && (
        <EditarPedidoPanel
          pedido={editPdv as any}
          companyId={companyId}
          onClose={() => setEditPdv(null)}
          onSaved={() => { setEditPdv(null); setAviso('Venda do balcão atualizada.'); carregar() }}
        />
      )}
    </div>
  )
}

const CSS = `
.vd-ov{position:fixed;inset:0;z-index:70;background:#E9EAE5;color:#151210;font-family:'Archivo',system-ui,sans-serif;font-size:14px;display:flex;flex-direction:column}
.vd-ov *{box-sizing:border-box}
.vd-top{display:flex;align-items:center;gap:12px;padding:10px 18px;background:#151210;color:#fff;flex-wrap:wrap}
.vd-top h1{margin:0;flex:1;font-family:'Anton',sans-serif;font-weight:400;font-size:26px;text-transform:uppercase;letter-spacing:.02em}
.vd-back{background:transparent;color:#fff;border:1px solid #4a423a;border-radius:8px;height:44px;padding:0 16px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer}
.vd-back:disabled{opacity:.6}
.vd-date{height:44px;border-radius:8px;border:1px solid #4a423a;background:#fff;color:#151210;padding:0 10px;font-family:inherit;font-size:15px}
.vd-body{flex:1;overflow-y:auto;padding:16px 18px 40px;display:flex;flex-direction:column;gap:14px;max-width:1100px;width:100%;margin:0 auto}
.vd-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.vd-kpis>div{background:#fff;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:2px;border:1px solid #DCDDD6}
.vd-kpis em{font-style:normal;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:#4f4c47;font-weight:700}
.vd-kpis b{font-family:'Anton',sans-serif;font-weight:400;font-size:30px;line-height:1.1;font-variant-numeric:tabular-nums}
.vd-kpis small{color:#4f4c47;font-size:12.5px}
.vd-aviso{background:#DDF1E7;color:#0B5B38;border-radius:8px;padding:10px 14px;font-weight:600}
.vd-vazio{text-align:center;color:#4f4c47;padding:40px 0}
.vd-grupo{background:#fff;border:1px solid #DCDDD6;border-radius:10px;overflow:hidden}
.vd-grupo>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;background:#F5F6F2;border-bottom:1px solid #DCDDD6}
.vd-grupo>header b{font-family:'Anton',sans-serif;font-weight:400;font-size:20px;text-transform:uppercase}
.vd-grupo>header span{color:#4f4c47;font-size:13px;font-weight:600}
.vd-linha{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:14px;align-items:center;padding:12px 16px;border-top:1px solid #ECEDE8}
.vd-grupo>header+.vd-linha{border-top:0}
.vd-linha.off{opacity:.55}
.vd-info{min-width:0;display:flex;flex-direction:column;gap:3px}
.vd-l1{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.vd-l1 span{color:#4f4c47;font-size:13px}
.vd-st{font-style:normal;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;border-radius:4px;padding:3px 8px}
.vd-st.aberta{background:#FFF3C9;color:#5C3F00}.vd-st.fechada{background:#DDF1E7;color:#0B5B38}.vd-st.cancelada{background:#F6DAD6;color:#8C2418}
.vd-itens{font-size:13px;color:#151210;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.vd-pg{font-size:12.5px;color:#4f4c47;font-weight:600}
.vd-total{font-family:'Anton',sans-serif;font-size:22px;font-variant-numeric:tabular-nums;white-space:nowrap}
.vd-acoes{display:flex;gap:8px}
.vd-acoes button{height:44px;padding:0 16px;border-radius:8px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;border:1px solid #151210}
.vd-edit{background:#FFC531;color:#151210}
.vd-del{background:#fff;color:#B3261E;border-color:#B3261E!important}
.vd-nota{color:#4f4c47;font-size:12.5px;margin:0}
.vd-pinov{position:fixed;inset:0;z-index:95;background:rgba(21,18,16,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.vd-pinbox{background:#fff;border-radius:12px;padding:20px;max-width:420px;width:100%;display:flex;flex-direction:column;gap:8px}
.vd-pinbox h2{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:24px;text-transform:uppercase}
.vd-pinbox p{margin:0;color:#4f4c47;font-size:13.5px;line-height:1.4}
.vd-pinbox label{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f4c47;margin-top:6px}
.vd-pin{height:56px;border:2px solid #151210;border-radius:8px;padding:0 14px;font-size:28px;letter-spacing:.3em;text-align:center;-webkit-text-security:disc;font-family:inherit}
.vd-pinerr{background:#F6DAD6;color:#8C2418;border-radius:6px;padding:8px 10px;font-weight:600;font-size:13px}
.vd-pinbt{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:8px}
.vd-pinbt button{height:50px;border-radius:8px;border:1px solid #151210;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer;background:#fff;color:#151210}
.vd-pinbt button.ok{background:#FFC531}.vd-pinbt button.perigo{background:#B3261E;color:#fff;border-color:#B3261E}
.vd-pinbt button:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:700px){
  .vd-kpis{grid-template-columns:1fr}.vd-kpis b{font-size:26px}
  .vd-linha{grid-template-columns:minmax(0,1fr) auto}
  .vd-acoes{grid-column:1/-1}.vd-acoes button{flex:1}
}
`
