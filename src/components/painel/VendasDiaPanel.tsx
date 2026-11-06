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
type Filtro = 'todas' | 'mesas' | 'balcao' | 'canceladas'
const MOTIVOS = ['Lançada errado', 'Cliente desistiu', 'Venda duplicada', 'Outro']

const fmt = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
const num = (n: number) => Number(n || 0).toFixed(2).replace('.', ',')
const qtdItens = (itens: Item[]) => itens.reduce((s, i) => s + (i.peso_kg != null ? 1 : Number(i.qty) || 0), 0)
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
  const [motivos, setMotivos] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [pin, setPin] = useState<{ titulo: string; texto: string; run: (pin: string) => Promise<string | null> } | null>(null)
  const [pinVal, setPinVal] = useState('')
  const [pinErro, setPinErro] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [editPdv, setEditPdv] = useState<Pedido | null>(null)
  // Janela de cancelar venda (motivo + resumo do que acontece + PIN).
  const [canc, setCanc] = useState<{ titulo: string; sub: string; resumo: string; total: number; formas: { forma: string; valor: number }[]; cashback: boolean; run: (pin: string, motivo: string, obs: string) => Promise<string | null> } | null>(null)
  const [cMotivo, setCMotivo] = useState('')
  const [cObs, setCObs] = useState('')

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
    const canceladasIds = lista.filter(x => x.status === 'cancelada').map(x => x.id)
    const [pg, rd, ev] = ids.length
      ? await Promise.all([
          supabase.from('loja_comanda_pagamentos').select('comanda_id, forma, cartao_tipo, valor').in('comanda_id', ids),
          supabase.from('loja_pedidos').select('*, itens:loja_pedido_itens(*)').in('comanda_id', ids).order('created_at'),
          canceladasIds.length ? supabase.from('loja_comanda_eventos').select('comanda_id, detalhe, criado_em').eq('tipo', 'venda_cancelada').in('comanda_id', canceladasIds).order('criado_em') : Promise.resolve({ data: [] as any[] }),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }]
    const mot: Record<string, string> = {}
    for (const e of (ev.data || []) as any[]) if (e.detalhe?.motivo) mot[e.comanda_id] = String(e.detalhe.motivo)
    setMotivos(mot)
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

  function pedirPin(titulo: string, texto: string, run: (pin: string) => Promise<string | null>) {
    setPinVal(''); setPinErro(''); setPin({ titulo, texto, run })
  }
  async function confirmarPin() {
    if (!pin || !pinVal) return
    setPinBusy(true); setPinErro('')
    const msg = await pin.run(pinVal)
    setPinBusy(false)
    if (msg) { setPinErro(msg); return }
    setPin(null); setPinVal('')
  }
  function abrirCancelamento(c: NonNullable<typeof canc>) {
    setPinVal(''); setPinErro(''); setCMotivo(''); setCObs(''); setCanc(c)
  }
  async function confirmarCancelamento() {
    if (!canc || !pinVal || !cMotivo) return
    setPinBusy(true); setPinErro('')
    const msg = await canc.run(pinVal, cMotivo, cObs.trim())
    setPinBusy(false)
    if (msg) { setPinErro(msg); return }
    setCanc(null); setPinVal('')
  }

  const nomeVenda = (c: Comanda) => c.tipo === 'retirada' ? `Retirada${c.rotulo ? ' ' + c.rotulo : ''}` : `Mesa ${c.mesa_id ? (mesaNum[c.mesa_id] ?? '?') : '?'}`
  const formasDe = (id: string) => {
    const m = new Map<string, number>()
    for (const p of pagtos.filter(x => x.comanda_id === id)) m.set(formaDe(p), (m.get(formaDe(p)) || 0) + Number(p.valor))
    return [...m.entries()].map(([forma, valor]) => ({ forma, valor }))
  }

  function editarMesa(c: Comanda) {
    if (c.status === 'aberta') { onAbrirComanda(c.id); return }
    pedirPin('Reabrir venda para editar', `${nomeVenda(c)} · conta #${c.numero} (${fmt(c.total)}). Ela volta a ficar aberta: dá para acrescentar ou tirar produto, trocar a forma de pagamento e fechar de novo.`, async p => {
      const r = await api('venda_reabrir', { comandaId: c.id, pin: p })
      if (!r.ok) return r.erro || 'Não consegui reabrir.'
      await onMudou(); await onAbrirComanda(c.id)
      return null
    })
  }
  function cancelarMesa(c: Comanda, ordem: number, de: number) {
    const itens = rodadas.filter(r => r.comanda_id === c.id && r.status !== 'cancelado').flatMap(r => r.itens)
    abrirCancelamento({
      titulo: 'Cancelar venda',
      sub: `${nomeVenda(c)} · Venda ${ordem} de ${de} · #${c.numero}`,
      resumo: `${hora(c.aberta_em)}${c.fechada_em ? ' → ' + hora(c.fechada_em) : ''}${c.garcom_nome ? ' · ' + c.garcom_nome : ''} · ${qtdItens(itens)} itens`,
      total: Number(c.total), formas: formasDe(c.id), cashback: !!c.customer_phone,
      run: async (p, motivo, obs) => {
        const r = await api('venda_cancelar', { comandaId: c.id, pin: p, motivo, observacao: obs })
        if (!r.ok) return r.erro || 'Não consegui cancelar.'
        await onMudou(); await carregar()
        return null
      },
    })
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
    abrirCancelamento({
      titulo: 'Cancelar venda',
      sub: `Balcão · #${v.order_number ?? ''}`,
      resumo: `${hora(v.created_at)} · ${qtdItens(v.itens)} itens`,
      total: Number(v.total), formas: v.payment_method ? [{ forma: NOME_FORMA[v.payment_method] || v.payment_method, valor: Number(v.total) }] : [], cashback: false,
      run: async (p, motivo, obs) => {
        const r = await api('pin_conferir', { pin: p })
        if (!r.ok) return r.erro || 'PIN incorreto.'
        const res = await adminFetch('/api/loja/cancelar-pedido', { method: 'POST', body: JSON.stringify({ pedidoId: v.id, por: 'loja' }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) return d.error || 'Não consegui cancelar.'
        // Guarda o motivo nas observações do pedido (aparece na linha riscada do relatório).
        const nota = `Cancelada: ${motivo}${obs ? ' — ' + obs : ''}`
        await supabase.from('loja_pedidos').update({ notes: v.notes ? `${v.notes} · ${nota}` : nota }).eq('id', v.id)
        await carregar()
        return null
      },
    })
  }

  // ---- números do dia ----
  const fechadas = comandas.filter(c => c.status === 'fechada')
  const abertasL = comandas.filter(c => c.status === 'aberta')
  const canceladasC = comandas.filter(c => c.status === 'cancelada')
  const pdvOk = pdv.filter(v => v.status !== 'cancelado')
  const pdvCanc = pdv.filter(v => v.status === 'cancelado')
  const totMesas = fechadas.reduce((s, c) => s + Number(c.total), 0)
  const totPdv = pdvOk.reduce((s, v) => s + Number(v.total), 0)
  const totDia = totMesas + totPdv
  const nVendas = fechadas.length + pdvOk.length
  const ticket = nVendas ? totDia / nVendas : 0
  const nCanc = canceladasC.length + pdvCanc.length
  const valCanc = canceladasC.reduce((s, c) => s + Number(c.total), 0) + pdvCanc.reduce((s, v) => s + Number(v.total), 0)
  const porForma = useMemo(() => {
    const m: Record<string, number> = { Pix: 0, Crédito: 0, Dinheiro: 0, Débito: 0, Cashback: 0 }
    const ok = new Set(fechadas.map(c => c.id))
    for (const p of pagtos) if (ok.has(p.comanda_id)) { const f = formaDe(p); m[f] = (m[f] || 0) + Number(p.valor) }
    for (const v of pdvOk) { const f = NOME_FORMA[v.payment_method || ''] || ''; if (f) m[f] = (m[f] || 0) + Number(v.total) }
    return m
  }, [pagtos, fechadas, pdvOk])

  const q = busca.trim().toLowerCase().replace('#', '')
  const casaBusca = (txt: string) => !q || txt.toLowerCase().includes(q)

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

  const mostraMesas = filtro === 'todas' || filtro === 'mesas' || filtro === 'canceladas'
  const mostraBalcao = filtro === 'todas' || filtro === 'balcao' || filtro === 'canceladas'
  const soCanc = filtro === 'canceladas'
  const notaAbertas = abertasL.length ? `Mesa aberta agora não entra no total: ${abertasL.map(c => `${nomeVenda(c).replace('Retirada', 'Retirada')} · ${fmt(c.total)}`).join(' · ')}` : ''

  const gruposVis = grupos.map(g => {
    const vendas = g.vendas
      .map((c, idx) => ({ c, ordem: idx + 1 }))
      .filter(({ c }) => !soCanc || c.status === 'cancelada')
      .filter(({ c }) => casaBusca(`${g.titulo} ${c.numero} ${c.garcom_nome || ''}`))
    return { ...g, total: g.vendas.length, vendasVis: vendas }
  }).filter(g => g.vendasVis.length > 0)
  const pdvVis = pdv.filter(v => (!soCanc || v.status === 'cancelado') && casaBusca(`balcão ${v.order_number ?? ''} ${v.customer_name || ''}`))

  const subGrupo = (g: { vendas: Comanda[] }) => {
    const val = g.vendas.filter(v => v.status !== 'cancelada')
    const canc = g.vendas.length - val.length
    if (g.vendas.length === 1 && g.vendas[0].status === 'aberta') return 'em atendimento'
    if (g.vendas.length === 1) return canc ? '1 cancelada' : '1 venda'
    return `abriu e fechou ${g.vendas.length} vezes${canc ? ` · ${canc} cancelada${canc > 1 ? 's' : ''}` : ''}`
  }

  const motivoPdv = (v: Pedido) => (/Cancelada: ([^—·]+)/.exec(v.notes || '')?.[1] || '').trim()
  const dataTxt = new Date(`${dia}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).replace('.', '')
  const estaHoje = dia === hojeBr()

  const painelMesas = mostraMesas && (
    <section className="vd-col">
      <div className="vd-colh"><b>Mesas</b><span>{fmt(totMesas)}</span></div>
      {gruposVis.length === 0 && <div className="vd-vazio">{carregando ? 'Carregando…' : 'Nenhuma venda de mesa.'}</div>}
      {gruposVis.map(g => (
        <div key={g.titulo} className="vd-grp">
          <div className="vd-grph"><b>{g.titulo}</b><small>{subGrupo(g)}</small><em>{num(g.vendas.filter(v => v.status !== 'cancelada').reduce((s, v) => s + Number(v.total), 0))}</em></div>
          {g.vendasVis.map(({ c, ordem }) => {
            const itens = rodadas.filter(r => r.comanda_id === c.id && r.status !== 'cancelado').flatMap(r => r.itens)
            const formas = formasDe(c.id)
            const off = c.status === 'cancelada'
            return (
              <div key={c.id} className={`vd-row ${off ? 'off' : ''}`}>
                <div className="vd-rl">
                  <b>{c.status === 'aberta' ? `Comanda ${c.numero}` : `Venda ${ordem} · #${c.numero}`}</b>
                  <small>
                    {c.status === 'aberta'
                      ? `aberta às ${hora(c.aberta_em)}${c.garcom_nome ? ' · ' + c.garcom_nome : ''} · ainda não entra no total`
                      : off
                        ? `${hora(c.aberta_em)}${c.fechada_em ? ' → ' + hora(c.fechada_em) : ''} · cancelada${motivos[c.id] ? ' · ' + motivos[c.id].toLowerCase() : ''}`
                        : `${hora(c.aberta_em)} → ${hora(c.fechada_em)}${c.garcom_nome ? ' · ' + c.garcom_nome : ''} · ${qtdItens(itens)} itens`}
                  </small>
                </div>
                <span className={`vd-chip ${c.status}`}>{c.status === 'aberta' ? 'Aberta' : off ? 'Cancelada' : (formas.map(f => f.forma).join(' + ') || '—')}</span>
                <b className="vd-val">{num(c.total)}</b>
                <div className="vd-ac">
                  {c.status === 'aberta' && <button className="vd-b" onClick={() => editarMesa(c)}>Abrir</button>}
                  {c.status === 'fechada' && <>
                    <button className="vd-b" onClick={() => editarMesa(c)} aria-label="Editar venda"><i>✎</i><span> Editar</span></button>
                    <button className="vd-b red" onClick={() => cancelarMesa(c, ordem, g.total)} aria-label="Cancelar venda"><i>✕</i><span> Cancelar</span></button>
                  </>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )

  const painelBalcao = mostraBalcao && (
    <section className="vd-col">
      <div className="vd-colh"><b>Balcão (PDV)</b><span>{fmt(totPdv)}</span></div>
      {pdvVis.length === 0 && <div className="vd-vazio">{carregando ? 'Carregando…' : 'Nenhuma venda de balcão.'}</div>}
      {pdvVis.map(v => {
        const off = v.status === 'cancelado'
        return (
          <div key={v.id} className={`vd-row ${off ? 'off' : ''}`}>
            <div className="vd-rl">
              <b>#{v.order_number ?? ''}</b>
              <small>{hora(v.created_at)}{v.customer_name && v.customer_name !== 'Cliente balcão' ? ' · ' + v.customer_name : ''} · {off ? `cancelada${motivoPdv(v) ? ' · ' + motivoPdv(v).toLowerCase() : ''}` : `${qtdItens(v.itens)} ${qtdItens(v.itens) === 1 ? 'item' : 'itens'}`}</small>
            </div>
            <span className={`vd-chip ${off ? 'cancelada' : 'fechada'}`}>{off ? 'Cancelada' : (NOME_FORMA[v.payment_method || ''] || '—')}</span>
            <b className="vd-val">{num(v.total)}</b>
            <div className="vd-ac">
              {!off && <>
                <button className="vd-b" onClick={() => editarPdv(v)} aria-label="Editar venda"><i>✎</i><span> Editar</span></button>
                <button className="vd-b red" onClick={() => cancelarPdv(v)} aria-label="Cancelar venda"><i>✕</i><span> Cancelar</span></button>
              </>}
            </div>
          </div>
        )
      })}
      <div className="vd-colf">Venda editada fica marcada e guarda quem mudou. Toque em Editar para alterar uma venda já fechada.</div>
    </section>
  )

  const cancTem = (nome: string) => canc?.formas.find(f => f.forma === nome)?.valor || 0

  return (
    <div className="vd-ov">
      <style>{CSS}</style>
      <div className="vd-top">
        <button className="vd-back" onClick={onClose} aria-label="Voltar">←<span> Mesas</span></button>
        <div className="vd-mtot"><b>{fmt(totDia)}</b><small>{nVendas} vendas{nCanc ? ` · ${nCanc} cancelada${nCanc > 1 ? 's' : ''}` : ''}</small></div>
        <h1>Vendas do dia</h1>
        <input className="vd-busca" placeholder="Nº da venda ou mesa" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar venda" />
        <input type="date" className="vd-date" value={dia} max={hojeBr()} onChange={e => e.target.value && setDia(e.target.value)} aria-label="Dia" />
        <button className="vd-back" onClick={carregar} disabled={carregando}>{carregando ? '…' : 'Atualizar'}</button>
      </div>

      <div className="vd-body">
        <div className="vd-sub">Tudo que foi vendido {estaHoje ? 'hoje' : 'em ' + dataTxt} nas mesas e no balcão (PDV). Toque em Editar para abrir uma venda, mesmo já fechada.</div>

        <div className="vd-kpis">
          <div className="vd-k dark"><em>Total do dia</em><b>{fmt(totDia)}</b><small>só vendas fechadas, sem as canceladas</small></div>
          <div className="vd-k"><em>Vendas</em><b>{nVendas}</b><small>{fechadas.length} mesas · {pdvOk.length} balcão</small></div>
          <div className="vd-k"><em>Ticket médio</em><b>{num(ticket)}</b><small>por venda</small></div>
          <div className="vd-k"><em className="red">Canceladas</em><b>{nCanc}</b><small>{fmt(valCanc)} fora do total</small></div>
          <div className="vd-k forma"><em>Por forma de pagamento</em>
            <div>{['Pix', 'Crédito', 'Dinheiro', 'Débito'].map(f => <span key={f}>{f}<b>{num(porForma[f] || 0)}</b></span>)}</div>
            {(porForma.Cashback || 0) > 0 && <small>Cashback {num(porForma.Cashback)}</small>}
          </div>
        </div>

        <div className="vd-tabs">
          {([['todas', 'Todas', comandas.length + pdv.length], ['mesas', 'Mesas', comandas.length], ['balcao', 'Balcão (PDV)', pdv.length], ['canceladas', 'Canceladas', nCanc]] as const).map(([k, l, n]) => (
            <button key={k} className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{l} <span>· {n}</span></button>
          ))}
          {notaAbertas && <small className="vd-notaab">{notaAbertas}</small>}
        </div>

        {aviso && <div className="vd-aviso">{aviso}</div>}
        {!carregando && comandas.length === 0 && pdv.length === 0 && <div className="vd-vazio">Nenhuma venda neste dia.</div>}

        <div className={`vd-cols ${mostraMesas && mostraBalcao ? 'duas' : ''}`}>
          {painelMesas}
          {painelBalcao}
        </div>
        <p className="vd-nota">Mudou o valor de uma venda de mesa? Toque em Editar: a venda volta a ficar aberta, você ajusta e fecha de novo. O cashback já creditado não muda sozinho.</p>
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
              <button className="ok" onClick={confirmarPin} disabled={pinBusy || !pinVal}>{pinBusy ? 'Aguarde…' : 'Continuar'}</button>
            </div>
          </div>
        </div>
      )}

      {canc && (
        <div className="vd-pinov" onClick={() => !pinBusy && setCanc(null)}>
          <div className="vd-cbox" onClick={e => e.stopPropagation()}>
            <div className="vd-chead">
              <span className="vd-cico">⛔</span>
              <div><h2>Cancelar venda</h2><small>{canc.sub}</small></div>
              <button className="vd-cx" onClick={() => !pinBusy && setCanc(null)} aria-label="Fechar">×</button>
            </div>
            <div className="vd-cscroll">
              <div className="vd-csum">
                <div><small>{canc.resumo}</small><b>{num(canc.total)}</b></div>
                {canc.formas.map(f => <div key={f.forma} className="vd-cf"><span>{f.forma}</span><span>{num(f.valor)}</span></div>)}
              </div>
              <div className="vd-clabel">Por que está cancelando?</div>
              <div className="vd-cmot">
                {MOTIVOS.map(m => <button key={m} className={cMotivo === m ? 'on' : ''} onClick={() => setCMotivo(m)}>{m}</button>)}
              </div>
              <textarea className="vd-cobs" placeholder="Observação (opcional)" value={cObs} maxLength={300} onChange={e => setCObs(e.target.value)} />
              <div className="vd-clabel">O que acontece</div>
              <ol className="vd-cord">
                <li><i>1</i><span>Sai do <b>total do dia</b> (de {num(totDia)} para {num(Math.max(0, totDia - canc.total))}) e do resumo por forma de pagamento.</span></li>
                <li><i>2</i><span>Continua na lista riscada, com o motivo, para conferência do caixa.</span></li>
                {canc.cashback && <li><i>3</i><span>Cashback usado volta para o cliente; o cashback ganho nesta venda sai.</span></li>}
              </ol>
              {(cancTem('Crédito') + cancTem('Débito')) > 0 && <div className="vd-cwarn"><b>Teve cartão nessa venda.</b> O sistema não devolve dinheiro sozinho: o estorno de {fmt(cancTem('Crédito') + cancTem('Débito'))} no cartão é feito na maquininha.{cancTem('Dinheiro') > 0 ? ` O dinheiro (${fmt(cancTem('Dinheiro'))}) sai do caixa.` : ''}</div>}
              {cancTem('Pix') > 0 && <div className="vd-cwarn"><b>Teve Pix nessa venda.</b> Devolva {fmt(cancTem('Pix'))} ao cliente pelo seu banco.{(cancTem('Crédito') + cancTem('Débito')) === 0 && cancTem('Dinheiro') > 0 ? ` O dinheiro (${fmt(cancTem('Dinheiro'))}) sai do caixa.` : ''}</div>}
              {(cancTem('Crédito') + cancTem('Débito') + cancTem('Pix')) === 0 && cancTem('Dinheiro') > 0 && <div className="vd-cwarn">O dinheiro ({fmt(cancTem('Dinheiro'))}) sai do caixa.</div>}
              <div className="vd-clabel">PIN do gerente</div>
              <input className="vd-pin" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" autoCorrect="off" spellCheck={false}
                name={'sup' + Math.random().toString(36).slice(2, 8)} data-lpignore="true" data-1p-ignore="true" data-form-type="other"
                value={pinVal} onChange={e => setPinVal(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter') confirmarCancelamento() }} />
              {pinErro && <div className="vd-pinerr">{pinErro}</div>}
            </div>
            <div className="vd-cfoot">
              <button className="vd-cred" onClick={confirmarCancelamento} disabled={pinBusy || !pinVal || !cMotivo}>{pinBusy ? 'Aguarde…' : `Cancelar venda de ${fmt(canc.total)}`}</button>
              <button className="vd-cvolta" onClick={() => setCanc(null)} disabled={pinBusy}>Voltar sem cancelar</button>
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
.vd-top{display:flex;align-items:center;gap:10px;padding:10px 18px;background:#151210;color:#fff;flex-wrap:wrap}
.vd-top h1{margin:0;flex:1;font-family:'Anton',sans-serif;font-weight:400;font-size:26px;text-transform:uppercase;letter-spacing:.02em;order:2}
.vd-mtot{display:none}
.vd-back{background:transparent;color:#fff;border:1px solid #4a423a;border-radius:8px;height:44px;padding:0 16px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;order:1}
.vd-back:disabled{opacity:.6}
.vd-busca,.vd-date{height:44px;border-radius:8px;border:1px solid #4a423a;background:#fff;color:#151210;padding:0 12px;font-family:inherit;font-size:14px;order:3}
.vd-busca{width:190px}
.vd-top .vd-back:last-child{order:4}
.vd-body{flex:1;min-height:0;overflow-y:auto;padding:16px 18px 40px;display:flex;flex-direction:column;gap:14px;max-width:1360px;width:100%;margin:0 auto}
.vd-body>*{flex:none}
.vd-sub{color:#4f4c47;font-size:13px}
.vd-kpis{display:grid;grid-template-columns:1.25fr .8fr .8fr .8fr 1.35fr;gap:10px}
.vd-k{background:#fff;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:3px;border:1px solid #DCDDD6;min-width:0}
.vd-k em{font-style:normal;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#4f4c47;font-weight:800}
.vd-k em.red{color:#B3261E}
.vd-k b{font-family:'Anton',sans-serif;font-weight:400;font-size:30px;line-height:1.1;font-variant-numeric:tabular-nums}
.vd-k small{color:#4f4c47;font-size:12px}
.vd-k.dark{background:#151210;border-color:#151210}.vd-k.dark em{color:#cfc9bf}.vd-k.dark b{color:#FFC531;font-size:36px}.vd-k.dark small{color:#cfc9bf}
.vd-k.forma>div{display:grid;grid-template-columns:1fr 1fr;gap:3px 14px;margin-top:2px}
.vd-k.forma span{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:#4f4c47;font-weight:600}
.vd-k.forma span b{font-family:inherit;font-size:12.5px;color:#151210;font-weight:800}
.vd-tabs{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.vd-tabs button{height:42px;padding:0 16px;border-radius:8px;border:1px solid #DCDDD6;background:#fff;color:#151210;font-weight:700;font-size:13.5px;font-family:inherit;cursor:pointer}
.vd-tabs button span{color:#6F6C67;font-weight:600}
.vd-tabs button.on{background:#FFC531;border-color:#151210}.vd-tabs button.on span{color:#151210}
.vd-notaab{margin-left:auto;color:#4f4c47;font-size:12.5px}
.vd-aviso{background:#DDF1E7;color:#0B5B38;border-radius:8px;padding:10px 14px;font-weight:600}
.vd-vazio{text-align:center;color:#4f4c47;padding:28px 0}
.vd-cols{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.vd-cols.duas{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}
.vd-col{background:#fff;border:1px solid #DCDDD6;border-radius:10px;overflow:hidden}
.vd-colh{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #DCDDD6;background:#F5F6F2}
.vd-colh b{font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:800}
.vd-colh span{color:#4f4c47;font-weight:700;font-variant-numeric:tabular-nums}
.vd-grp{border-bottom:1px solid #ECEDE8}
.vd-grp:last-child{border-bottom:0}
.vd-grph{display:flex;align-items:baseline;gap:10px;padding:12px 16px 6px}
.vd-grph b{font-family:'Anton',sans-serif;font-weight:400;font-size:20px;text-transform:uppercase}
.vd-grph small{flex:1;color:#6F6C67;font-size:12.5px}
.vd-grph em{font-style:normal;font-weight:800;font-variant-numeric:tabular-nums}
.vd-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:12px;align-items:center;padding:10px 16px;border-top:1px solid #F0F1EC}
.vd-col>.vd-row:first-of-type{border-top:0}
.vd-rl{min-width:0;display:flex;flex-direction:column;gap:2px}
.vd-rl b{font-size:14px}
.vd-rl small{color:#6F6C67;font-size:12.5px}
.vd-row.off .vd-rl b,.vd-row.off .vd-val{text-decoration:line-through;color:#8a867f}
.vd-chip{font-size:12px;font-weight:700;border-radius:6px;padding:4px 10px;background:#EEEFEA;color:#3a3733;white-space:nowrap}
.vd-chip.cancelada{background:#F6DAD6;color:#8C2418}
.vd-chip.aberta{background:#DCE7F5;color:#1F3F6B}
.vd-val{font-variant-numeric:tabular-nums;font-size:16px;min-width:64px;text-align:right}
.vd-ac{display:flex;gap:6px;justify-content:flex-end;min-width:100px}
.vd-b{height:42px;padding:0 14px;border-radius:8px;border:1px solid #151210;background:#fff;color:#151210;font-weight:700;font-size:13.5px;font-family:inherit;cursor:pointer;white-space:nowrap}
.vd-b i{font-style:normal}
.vd-b.red{border-color:#E3B1AB;color:#B3261E}
.vd-colf{padding:10px 16px;background:#F5F6F2;color:#6F6C67;font-size:12px;border-top:1px solid #ECEDE8}
.vd-nota{color:#4f4c47;font-size:12.5px;margin:0}
.vd-pinov{position:fixed;inset:0;z-index:95;background:rgba(21,18,16,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.vd-pinbox{background:#fff;border-radius:12px;padding:20px;max-width:420px;width:100%;display:flex;flex-direction:column;gap:8px}
.vd-pinbox h2{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:24px;text-transform:uppercase}
.vd-pinbox p{margin:0;color:#4f4c47;font-size:13.5px;line-height:1.4}
.vd-pinbox label{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f4c47;margin-top:6px}
.vd-pin{height:56px;width:100%;border:2px solid #151210;border-radius:8px;padding:0 14px;font-size:28px;letter-spacing:.3em;text-align:center;-webkit-text-security:disc;font-family:inherit}
.vd-pinerr{background:#F6DAD6;color:#8C2418;border-radius:6px;padding:8px 10px;font-weight:600;font-size:13px}
.vd-pinbt{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:8px}
.vd-pinbt button{height:50px;border-radius:8px;border:1px solid #151210;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer;background:#fff;color:#151210}
.vd-pinbt button.ok{background:#FFC531}
.vd-pinbt button:disabled{opacity:.5;cursor:not-allowed}
.vd-cbox{background:#fff;border-radius:14px;max-width:460px;width:100%;max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden}
.vd-chead{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #ECEDE8}
.vd-chead>div{flex:1;min-width:0}
.vd-chead h2{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:24px;text-transform:uppercase}
.vd-chead small{color:#6F6C67;font-size:12.5px}
.vd-cico{width:40px;height:40px;border-radius:50%;background:#F6DAD6;display:flex;align-items:center;justify-content:center;font-size:18px}
.vd-cx{width:40px;height:40px;border-radius:8px;border:1px solid #DCDDD6;background:#fff;font-size:22px;cursor:pointer}
.vd-cscroll{padding:14px 16px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
.vd-csum{background:#F5F6F2;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}
.vd-csum>div:first-child{display:flex;justify-content:space-between;align-items:center;gap:10px}
.vd-csum small{color:#4f4c47;font-size:12px}
.vd-csum b{font-family:'Anton',sans-serif;font-weight:400;font-size:30px}
.vd-cf{display:flex;justify-content:space-between;font-size:12.5px;color:#4f4c47;font-weight:600}
.vd-clabel{font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;color:#4f4c47;margin-top:4px}
.vd-cmot{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.vd-cmot button{height:46px;border-radius:8px;border:1px solid #DCDDD6;background:#fff;font-weight:700;font-size:13.5px;font-family:inherit;cursor:pointer}
.vd-cmot button.on{background:#FFC531;border-color:#151210}
.vd-cobs{width:100%;min-height:64px;border:1px solid #DCDDD6;border-radius:8px;padding:10px;font-family:inherit;font-size:14px;resize:vertical}
.vd-cord{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.vd-cord li{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.35}
.vd-cord i{flex:none;width:22px;height:22px;border-radius:50%;background:#151210;color:#FFC531;font-style:normal;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center}
.vd-cwarn{background:#FFF3C9;border:1px solid #EBD58A;border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.4;color:#4a3600}
.vd-cfoot{padding:12px 16px 16px;border-top:1px solid #ECEDE8;display:flex;flex-direction:column;gap:8px;background:#FAFAF7}
.vd-cred{height:52px;border-radius:10px;border:0;background:#B3261E;color:#fff;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer}
.vd-cred:disabled{opacity:.45;cursor:not-allowed}
.vd-cvolta{height:46px;border-radius:10px;border:1px solid #DCDDD6;background:#fff;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer}
@media(max-width:1100px){
  .vd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .vd-k.dark,.vd-k.forma{grid-column:1/-1}
  .vd-cols.duas{grid-template-columns:minmax(0,1fr)}
}
@media(max-width:700px){
  .vd-top{padding:10px 12px;gap:8px}
  .vd-top h1,.vd-busca{display:none}
  .vd-back span{display:none}.vd-back{padding:0;width:44px}
  .vd-mtot{display:flex;flex-direction:column;flex:1;order:2;align-items:flex-end}
  .vd-mtot b{font-family:'Anton',sans-serif;font-weight:400;color:#FFC531;font-size:26px;line-height:1}
  .vd-mtot small{color:#cfc9bf;font-size:11.5px}
  .vd-date{flex:1;order:1;min-width:0}
  .vd-top .vd-back:last-child{width:auto;padding:0 12px}
  .vd-body{padding:12px 12px 40px}
  .vd-sub,.vd-kpis{display:none}
  .vd-tabs{flex-wrap:nowrap;overflow-x:auto;gap:6px}
  .vd-tabs button{flex:none;height:40px;padding:0 12px}
  .vd-tabs button span{display:none}
  .vd-notaab{display:none}
  .vd-row{grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;padding:10px 14px}
  .vd-chip{grid-row:2;grid-column:1;justify-self:start}
  .vd-val{grid-row:1;grid-column:2;font-size:17px}
  .vd-ac{grid-row:2;grid-column:2;min-width:0}
  .vd-b{width:42px;padding:0}.vd-b span{display:none}.vd-b:not(:has(i)){width:auto;padding:0 12px}
  .vd-cbox{max-height:100vh;border-radius:14px 14px 0 0;align-self:flex-end}
  .vd-pinov:has(.vd-cbox){padding:0;align-items:flex-end}
}
`
