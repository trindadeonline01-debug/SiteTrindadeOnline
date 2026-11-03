'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/adminFetch'
import { moduleActive } from '@/lib/modules'
import { beep, unlockAudio } from '@/lib/beep'
import { qzPrintRaw, buildReceipt, buildKitchenTicket, isRawBtMode, printViaRawBt, setPapelImpressora } from '@/lib/qzPrint'
import { npGroupContribution, type NpGrupo, type NpProduto, PESO_REGEX, pesoNum, pesoDisplay } from '@/lib/produtoCart'

// Mesas e comandas (nov/2026) — mapa de mesas em tela cheia pro tablet do
// garçom (bare route, igual Cozinha/PDV). Tudo que mexe em dinheiro, PIN ou
// fechamento passa por POST /api/mesas (o servidor decide); aqui só pede e
// mostra. docs/DESENHO_MESAS_JOGOS.md.

type Mesa = { id: string; numero: number; nome: string | null; ativa: boolean }
type Comanda = {
  id: string; mesa_id: string; numero: number; garcom_nome: string | null; customer_phone: string | null; customer_name: string | null
  taxa_servico_ativa: boolean; taxa_servico_pct: number; desconto: number; desconto_motivo: string | null
  subtotal: number; taxa_valor: number; total: number; aberta_em: string
}
type ItemPed = { id: string; produto_id: string | null; product_name: string; unit_price: number; qty: number; peso_kg: number | null; selected_options: { name: string; price: number }[] }
type PedidoMesa = { id: string; order_number: number | null; comanda_id: string; status: string; created_at: string; notes: string | null; itens: ItemPed[] }
type Pagto = { id: string; comanda_id: string; forma: string; valor: number; pessoa: string | null }
type Chamado = { id: string; mesa_id: string; comanda_id: string | null; tipo: 'garcom' | 'conta' | 'pedido'; mensagem: string | null; criado_em: string }
type Garcom = { id: string; nome: string; ativo: boolean }
type Produto = NpProduto
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resp = any
type CallFn = (a: string, e?: Record<string, unknown>) => Promise<Resp>
type Linha = { key: string; produto: Produto; qty: number; pesoKg: number | null; modifiers: { name: string; price: number }[]; unit: number }

const FORMAS: { key: 'dinheiro' | 'cartao' | 'pix'; label: string }[] = [
  { key: 'dinheiro', label: '💵 Dinheiro' }, { key: 'cartao', label: '💳 Cartão' }, { key: 'pix', label: '📱 Pix' },
]
const fmt = (n: number) => 'R$ ' + (Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
function tempo(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}
function moneyDigits(d: string) { const c = d.replace(/\D/g, ''); return c ? parseInt(c, 10) / 100 : 0 }
function moneyShow(d: string) {
  const c = d.replace(/\D/g, ''); if (!c) return '0,00'
  const p = c.padStart(3, '0'); return `${p.slice(0, -2).replace(/^0+(?=\d)/, '') || '0'},${p.slice(-2)}`
}

export default function MesasPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [printerName, setPrinterName] = useState('')
  const [mesasEnabled, setMesasEnabled] = useState(false)
  const [taxaPct, setTaxaPct] = useState(10)
  const [hasPin, setHasPin] = useState(false)
  const [adminMode, setAdminMode] = useState(false)

  const [mesas, setMesas] = useState<Mesa[]>([])
  const [comandas, setComandas] = useState<Comanda[]>([])
  const [pedidos, setPedidos] = useState<PedidoMesa[]>([])
  const [pagtos, setPagtos] = useState<Pagto[]>([])
  const [chamados, setChamados] = useState<Chamado[]>([])
  const [garcons, setGarcons] = useState<Garcom[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<{ id: string; name: string }[]>([])

  const [abertaId, setAbertaId] = useState<string | null>(null)       // comanda aberta na tela
  const [abrirMesa, setAbrirMesa] = useState<Mesa | null>(null)       // escolher garçom
  const [showConfig, setShowConfig] = useState(false)
  const [picker, setPicker] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)
  const companyRef = useRef('')
  const chamadosVistos = useRef<Set<string> | null>(null)

  const call = useCallback(async (acao: string, extra: Record<string, unknown> = {}): Promise<Resp> => {
    setBusy(true)
    try {
      const res = await adminFetch('/api/mesas', { method: 'POST', body: JSON.stringify({ companyId: companyRef.current, acao, ...extra }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.error || 'Não consegui concluir.'); return null }
      setMsg('')
      return data
    } catch { setMsg('Sem conexão. Tente de novo.'); return null } finally { setBusy(false) }
  }, [])

  const load = useCallback(async () => {
    const cid = companyRef.current
    if (!cid) return
    const [m, c, g, ch] = await Promise.all([
      supabase.from('loja_mesas').select('id, numero, nome, ativa').eq('company_id', cid).eq('ativa', true).order('numero'),
      supabase.from('loja_comandas').select('*').eq('company_id', cid).eq('status', 'aberta'),
      supabase.from('loja_garcons').select('id, nome, ativo').eq('company_id', cid).order('nome'),
      supabase.from('loja_mesa_chamados').select('id, mesa_id, comanda_id, tipo, mensagem, criado_em').eq('company_id', cid).eq('status', 'aberto').order('criado_em'),
    ])
    const cs = (c.data || []) as Comanda[]
    setMesas((m.data || []) as Mesa[]); setComandas(cs); setGarcons((g.data || []) as Garcom[])
    const chs = (ch.data || []) as Chamado[]
    setChamados(chs)
    if (chamadosVistos.current && chs.some(x => !chamadosVistos.current!.has(x.id))) beep(2)
    chamadosVistos.current = new Set(chs.map(x => x.id))
    const ids = cs.map(x => x.id)
    if (ids.length === 0) { setPedidos([]); setPagtos([]); return }
    const [p, pg] = await Promise.all([
      supabase.from('loja_pedidos').select('id, order_number, comanda_id, status, created_at, notes, itens:loja_pedido_itens(*)').in('comanda_id', ids).order('created_at'),
      supabase.from('loja_comanda_pagamentos').select('id, comanda_id, forma, valor, pessoa').in('comanda_id', ids).order('criado_em'),
    ])
    setPedidos((p.data || []) as unknown as PedidoMesa[]); setPagtos((pg.data || []) as Pagto[])
  }, [])

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/mesas'; return }
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).maybeSingle()
      const empresaParam = new URLSearchParams(window.location.search).get('empresa')
      const isAdmin = profile?.user_type === 'admin' && !!empresaParam
      const SEL = 'id, name, loja_digital_enabled, trial_modules_until, loja_impressora_nome, loja_impressora_papel, mesas_enabled, loja_taxa_servico_pct, loja_supervisor_pin_hash'
      const { data: comp } = isAdmin
        ? await supabase.from('companies').select(SEL).eq('id', empresaParam).maybeSingle()
        : await supabase.from('companies').select(SEL).eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || (!isAdmin && !moduleActive(comp.loja_digital_enabled, comp.trial_modules_until))) { window.location.href = '/painel/compartilhar'; return }
      companyRef.current = comp.id
      setCompanyId(comp.id); setCompanyName(comp.name); setPrinterName(comp.loja_impressora_nome || ''); setPapelImpressora(comp.loja_impressora_papel)
      setMesasEnabled(!!comp.mesas_enabled); setTaxaPct(Number(comp.loja_taxa_servico_pct) || 0); setHasPin(!!comp.loja_supervisor_pin_hash); setAdminMode(isAdmin)
      if (comp.mesas_enabled || isAdmin) {
        const [{ data: prods }, { data: cats }] = await Promise.all([
          supabase.from('loja_produtos').select('id, name, sale_price, category_id, photo_url, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))').eq('company_id', comp.id).eq('active', true).order('display_order'),
          supabase.from('loja_categorias').select('id, name').eq('company_id', comp.id).order('display_order'),
        ])
        setProdutos((prods || []) as unknown as Produto[]); setCategorias((cats || []) as { id: string; name: string }[])
      }
      await load()
      setLoading(false)
      ch = supabase.channel(`mesas-${comp.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loja_comandas', filter: `company_id=eq.${comp.id}` }, () => load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loja_mesa_chamados', filter: `company_id=eq.${comp.id}` }, () => load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${comp.id}` }, () => load())
        .subscribe()
    })
    const t = setInterval(() => setTick(x => x + 1), 30000)
    const vis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); if (ch) supabase.removeChannel(ch) }
  }, [load])

  const comandaDaMesa = useMemo(() => new Map(comandas.map(c => [c.mesa_id, c])), [comandas])
  const comanda = comandas.find(c => c.id === abertaId) || null
  const fotos = useMemo(() => Object.fromEntries(produtos.map(p => [p.id, p.photo_url ?? null])) as Record<string, string | null>, [produtos])
  const mesaDe = (id: string) => mesas.find(m => m.id === id)

  async function imprimir(conteudos: string[]) {
    if (!printerName || conteudos.length === 0) return
    try {
      for (let i = 0; i < conteudos.length; i++) {
        if (isRawBtMode(printerName)) { if (i === 0) printViaRawBt(conteudos[i]); else setTimeout(() => printViaRawBt(conteudos[i]), 600 * i) }
        else await qzPrintRaw(printerName, conteudos[i])
      }
    } catch {}
  }

  // ---------- ações ----------
  async function abrirComanda(garcomId: string) {
    if (!abrirMesa) return
    const r = await call('abrir', { mesaId: abrirMesa.id, garcomId })
    if (r?.comandaId) { setAbrirMesa(null); await load(); setAbertaId(r.comandaId) }
  }

  async function lancarRodada(linhas: Linha[], obs: string) {
    if (!comanda) return false
    const r = await call('rodada', {
      comandaId: comanda.id, obs,
      itens: linhas.map(l => ({ produtoId: l.produto.id, qty: l.qty, pesoKg: l.pesoKg, modifiers: l.modifiers })),
    })
    if (!r) return false
    const mesa = mesaDe(comanda.mesa_id)
    await imprimir([buildKitchenTicket({
      pedidoShortId: `${mesa?.numero ?? ''}-${r.orderNumber ?? ''}`, createdAt: new Date().toISOString(), deliveryType: 'balcao', rotulo: `MESA ${mesa?.numero ?? ''} · ${comanda.garcom_nome || ''}`,
      items: linhas.map(l => ({ qty: l.qty, pesoKg: l.pesoKg, name: l.produto.name, unitPrice: l.unit, options: l.modifiers })), notes: obs || null,
    })])
    await load()
    return true
  }

  function dadosConta(c: Comanda) {
    const mesa = mesaDe(c.mesa_id)
    const peds = pedidos.filter(p => p.comanda_id === c.id && p.status !== 'cancelado')
    const items = peds.flatMap(p => p.itens).map(it => ({ qty: it.qty, pesoKg: it.peso_kg, name: it.product_name, unitPrice: it.unit_price, options: it.selected_options }))
    const extras: { label: string; valor: number }[] = []
    if (c.desconto > 0) extras.push({ label: 'Desconto', valor: -c.desconto })
    if (c.taxa_servico_ativa && c.taxa_valor > 0) extras.push({ label: `Servico ${c.taxa_servico_pct}%`, valor: c.taxa_valor })
    const pagamentos = pagtos.filter(p => p.comanda_id === c.id).map(p => ({ label: (FORMAS.find(f => f.key === p.forma)?.label.replace(/^\S+\s/, '') || p.forma) + (p.pessoa ? ` (${p.pessoa})` : ''), valor: p.valor }))
    return buildReceipt({
      companyName, pedidoShortId: `Comanda ${c.numero}`, createdAt: c.aberta_em, customerName: `Mesa ${mesa?.numero ?? ''}`, customerPhone: c.customer_phone,
      deliveryType: 'balcao', rotuloTipo: `MESA ${mesa?.numero ?? ''} - Garcom ${c.garcom_nome || ''}`, items, subtotal: c.subtotal, extras, total: c.total, pagamentos,
    })
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#6F6C67', background: '#E9EAE5' }}>Carregando...</div>

  const emUso = comandas.length
  return (
    <div className="ms-wrap" onClick={() => unlockAudio()}>
      <style>{CSS}</style>
      <div className="ms-top">
        <div className="ms-brand">{companyName}</div>
        <div className="ms-tabs">
          <a className="ms-tab on" href="#">Mesas</a>
          <a className="ms-tab" href={'/painel/cozinha' + (adminMode ? `?empresa=${companyId}` : '')}>Cozinha</a>
          <a className="ms-tab" href={'/painel/pdv' + (adminMode ? `?empresa=${companyId}` : '')}>Balcão</a>
        </div>
        <button className="ms-btn ghost" onClick={() => setShowConfig(true)}>⚙️ Configurar</button>
        <a className="ms-back" href={'/painel' + (adminMode ? `?empresa=${companyId}` : '')}>Sair ›</a>
      </div>

      {!mesasEnabled ? (
        <div className="ms-empty">
          <h2>Mesas ainda não está ativo nessa loja</h2>
          <p>Fale com a Trindade Online para ligar o módulo de mesas e comandas.</p>
          {adminMode && <button className="ms-btn" onClick={() => setShowConfig(true)}>Configurar / ligar</button>}
        </div>
      ) : (
        <div className="ms-body">
          <div className="ms-main">
            <div className="ms-head">
              <h1>Mesas</h1>
              <span>{emUso} em uso · {mesas.length - emUso} livres</span>
            </div>
            <div className="ms-legend">
              <span><i style={{ background: '#fff', border: '2px solid #b9bab2' }} />Livre</span>
              <span><i style={{ background: '#231F1B' }} />Ocupada</span>
              <span><i style={{ background: '#FFC531' }} />Pedido do cliente aguardando</span>
              <span><i style={{ background: '#D6392B' }} />Chamou o garçom</span>
              <span><i style={{ background: '#0B7347' }} />Pediu a conta</span>
            </div>
            {mesas.length === 0 && <div className="ms-note">Nenhuma mesa criada ainda. Toque em “⚙️ Configurar” e acrescente as mesas.</div>}
            <div className="ms-grid">
              {mesas.map(m => {
                const c = comandaDaMesa.get(m.id)
                const ch = chamados.filter(x => x.mesa_id === m.id)
                const k = !c ? 'livre' : ch.some(x => x.tipo === 'pedido') ? 'aguard' : ch.some(x => x.tipo === 'garcom') ? 'chama' : ch.some(x => x.tipo === 'conta') ? 'conta' : 'ocupada'
                const rotulo = { livre: 'Livre', ocupada: 'Ocupada', aguard: 'Aguardando garçom', chama: 'Chamou o garçom', conta: 'Pediu a conta' }[k]
                return (
                  <button key={m.id} className={`ms-mesa ${k}`} onClick={() => c ? setAbertaId(c.id) : setAbrirMesa(m)}>
                    <span className="top"><b>{m.numero}</b><em>{c ? tempo(c.aberta_em) : ''}</em></span>
                    <span className="bot"><strong>{rotulo}</strong><small>{c ? fmt(c.total) : ''}</small></span>
                  </button>
                )
              })}
            </div>
          </div>
          <aside className="ms-side">
            <div className="ms-sidehead"><h2>Chamados</h2><span className="ms-count">{chamados.length}</span></div>
            {chamados.length === 0 && <div className="ms-note">Nenhum chamado agora.</div>}
            {chamados.map(ch => {
              const m = mesaDe(ch.mesa_id)
              const c = ch.comanda_id ? comandas.find(x => x.id === ch.comanda_id) : comandaDaMesa.get(ch.mesa_id)
              const titulo = ch.tipo === 'garcom' ? `Mesa ${m?.numero} chamou o garçom` : ch.tipo === 'conta' ? `Mesa ${m?.numero} pediu a conta` : `Mesa ${m?.numero} · pedido novo`
              return (
                <div key={ch.id} className={`ms-chamado ${ch.tipo}`}>
                  <div><b>{titulo}</b><small>há {tempo(ch.criado_em)}</small></div>
                  {ch.mensagem && <p>{ch.mensagem}</p>}
                  <button className="ms-btn dark" disabled={busy} onClick={async () => {
                    if (ch.tipo === 'garcom') { await call('atender_chamado', { chamadoId: ch.id }); await load() }
                    else if (c) setAbertaId(c.id)
                    else if (m) setAbrirMesa(m)
                  }}>{ch.tipo === 'garcom' ? `Atender mesa ${m?.numero}` : ch.tipo === 'conta' ? 'Abrir comanda' : `Confirmar mesa ${m?.numero}`}</button>
                </div>
              )
            })}
            <div className="ms-foot">Cada chamado toca um som e fica na tela até alguém atender.</div>
          </aside>
        </div>
      )}

      {msg && !comanda && !picker && !showConfig && <div className="ms-toast" onClick={() => setMsg('')}>{msg}</div>}

      {abrirMesa && (
        <Modal onClose={() => setAbrirMesa(null)} titulo={`Abrir mesa ${abrirMesa.numero}`}>
          <p className="ms-p">Quem vai atender essa mesa? O nome fica travado até a conta fechar.</p>
          {garcons.filter(g => g.ativo).length === 0 && <div className="ms-note">Nenhum garçom cadastrado. Vá em “⚙️ Configurar” e cadastre.</div>}
          <div className="ms-garcons">
            {garcons.filter(g => g.ativo).map(g => <button key={g.id} className="ms-btn big" disabled={busy} onClick={() => abrirComanda(g.id)}>{g.nome}</button>)}
          </div>
          {msg && <div className="ms-err">{msg}</div>}
        </Modal>
      )}

      {comanda && !picker && (
        <ComandaView
          c={comanda} mesa={mesaDe(comanda.mesa_id)} mesas={mesas} comandas={comandas} comandaDaMesa={comandaDaMesa}
          pedidos={pedidos.filter(p => p.comanda_id === comanda.id)} pagtos={pagtos.filter(p => p.comanda_id === comanda.id)}
          busy={busy} msg={msg} setMsg={setMsg} call={call} load={load} fotos={fotos}
          onClose={() => { setAbertaId(null); setMsg('') }} onAdd={() => setPicker(true)}
          imprimirConta={() => imprimir([dadosConta(comanda)])}
          fechado={async () => { const conta = dadosConta(comanda); await imprimir([conta]); setAbertaId(null); await load() }}
        />
      )}

      {comanda && picker && (
        <Picker produtos={produtos} categorias={categorias} mesaNumero={mesaDe(comanda.mesa_id)?.numero}
          onClose={() => setPicker(false)} busy={busy} msg={msg}
          onLancar={async (l, obs) => { const ok = await lancarRodada(l, obs); if (ok) setPicker(false); return ok }} />
      )}

      {showConfig && (
        <Config
          companyId={companyId} adminMode={adminMode} mesasEnabled={mesasEnabled} taxaPct={taxaPct} hasPin={hasPin} garcons={garcons} totalMesas={mesas.length}
          call={call} busy={busy} msg={msg} recarregar={load}
          onClose={async () => {
            setShowConfig(false); setMsg('')
            const { data } = await supabase.from('companies').select('mesas_enabled, loja_taxa_servico_pct, loja_supervisor_pin_hash').eq('id', companyId).maybeSingle()
            if (data) { setMesasEnabled(!!data.mesas_enabled); setTaxaPct(Number(data.loja_taxa_servico_pct) || 0); setHasPin(!!data.loja_supervisor_pin_hash) }
            await load()
          }}
        />
      )}
    </div>
  )
}

// ================= Modal base =================
function Modal({ titulo, onClose, children, wide }: { titulo: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="ms-ov" onClick={onClose}>
      <div className={`ms-modal ${wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="ms-mh"><h3>{titulo}</h3><button className="ms-x" onClick={onClose} aria-label="Fechar">✕</button></div>
        {children}
      </div>
    </div>
  )
}

// ================= Comanda =================
function ComandaView(props: {
  c: Comanda; mesa?: Mesa; mesas: Mesa[]; comandas: Comanda[]; comandaDaMesa: Map<string, Comanda>
  pedidos: PedidoMesa[]; pagtos: Pagto[]; busy: boolean; msg: string; setMsg: (s: string) => void
  call: CallFn; load: () => Promise<void>; fotos: Record<string, string | null>
  onClose: () => void; onAdd: () => void; imprimirConta: () => void; fechado: () => Promise<void>
}) {
  const { c, mesa, pedidos, pagtos, busy, msg, setMsg, call, load } = props
  const [pin, setPin] = useState<{ titulo: string; run: (pin: string) => Promise<Resp> } | null>(null)
  const [pinVal, setPinVal] = useState('')
  const [forma, setForma] = useState<'dinheiro' | 'cartao' | 'pix'>('dinheiro')
  const [valorDig, setValorDig] = useState('')
  const [pessoa, setPessoa] = useState('')
  const [dividir, setDividir] = useState(2)
  const [sub, setSub] = useState<null | 'transferir' | 'juntar' | 'desconto' | 'cliente'>(null)
  const [descVal, setDescVal] = useState('')
  const [descMotivo, setDescMotivo] = useState('')
  const [fone, setFone] = useState(c.customer_phone ? c.customer_phone.replace(/^55/, '') : '')

  const pago = r2(pagtos.reduce((s, p) => s + Number(p.valor), 0))
  const falta = Math.max(0, r2(c.total - pago))
  const ativos = pedidos.filter(p => p.status !== 'cancelado')

  function pedirPin(titulo: string, run: (pin: string) => Promise<Resp>) { setPinVal(''); setMsg(''); setPin({ titulo, run }) }
  async function pagar() {
    const valor = moneyDigits(valorDig) || falta
    const r = await call('pagar', { comandaId: c.id, forma, valor, pessoa: pessoa.trim() || null })
    if (r) { setValorDig(''); setPessoa(''); await load() }
  }

  return (
    <div className="ms-ov full">
      <div className="ms-cmd">
        <div className="ms-cmdhead">
          <button className="ms-btn ghost" onClick={props.onClose}>← Mesas</button>
          <div className="t"><b>Mesa {mesa?.numero}</b><small>Comanda {c.numero} · Garçom {c.garcom_nome} · aberta há {tempo(c.aberta_em)}</small></div>
          <button className="ms-btn" onClick={props.onAdd}>+ Adicionar itens</button>
        </div>

        <div className="ms-cmdbody">
          <section className="ms-col">
            <h4>Consumo</h4>
            {ativos.length === 0 && <div className="ms-note">Nenhum pedido lançado ainda.</div>}
            {ativos.map((p, i) => (
              <div key={p.id} className="ms-rodada">
                <div className="rh"><b>Rodada {i + 1}</b><small>{new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {p.status.replace('_', ' ')}</small></div>
                {p.itens.map(it => (
                  <div key={it.id} className="it">
                    <Foto url={it.produto_id ? props.fotos[it.produto_id] : null} size={52} />
                    <span className="q">{it.peso_kg != null ? `${it.peso_kg}kg` : `${it.qty}×`}</span>
                    <span className="n">{it.product_name}{it.selected_options?.length > 0 && <small>{it.selected_options.map(o => o.name).join(', ')}</small>}</span>
                    <span className="v">{fmt(it.unit_price * it.qty)}</span>
                    <button className="ms-x sm" title="Cancelar item" onClick={() => pedirPin(`Cancelar “${it.product_name}”`, pin => call('cancelar_item', { itemId: it.id, pin }))}>✕</button>
                  </div>
                ))}
                {p.notes && <div className="obs">Obs: {p.notes}</div>}
              </div>
            ))}
          </section>

          <section className="ms-col narrow">
            <h4>Conta</h4>
            <div className="ms-tot">
              <div><span>Consumo</span><b>{fmt(c.subtotal)}</b></div>
              {c.desconto > 0 && <div><span>Desconto{c.desconto_motivo ? ` (${c.desconto_motivo})` : ''}</span><b>- {fmt(c.desconto)}</b></div>}
              <div><span>Taxa de serviço {c.taxa_servico_ativa ? `${c.taxa_servico_pct}%` : '(retirada)'}</span><b>{fmt(c.taxa_valor)}</b></div>
              <div className="big"><span>Total</span><b>{fmt(c.total)}</b></div>
              {pago > 0 && <div><span>Já pago</span><b>{fmt(pago)}</b></div>}
              <div className={`big ${falta > 0 ? 'warn' : 'ok'}`}><span>{falta > 0 ? 'Falta pagar' : 'Pago'}</span><b>{fmt(falta)}</b></div>
            </div>
            <div className="ms-row">
              <button className="ms-btn ghost" disabled={busy} onClick={async () => { await call('taxa_toggle', { comandaId: c.id, ativa: !c.taxa_servico_ativa }); await load() }}>{c.taxa_servico_ativa ? 'Tirar taxa' : 'Colocar taxa'}</button>
              <button className="ms-btn ghost" onClick={() => setSub('desconto')}>Desconto</button>
              <button className="ms-btn ghost" onClick={() => setSub('cliente')}>{c.customer_phone ? 'WhatsApp ✓' : 'WhatsApp'}</button>
              <button className="ms-btn ghost" onClick={props.imprimirConta}>🖨️ Conta</button>
            </div>

            <h4>Pagamento</h4>
            {pagtos.map(p => (
              <div key={p.id} className="ms-pg">
                <span>{FORMAS.find(f => f.key === p.forma)?.label}{p.pessoa ? ` · ${p.pessoa}` : ''}</span><b>{fmt(p.valor)}</b>
                <button className="ms-x sm" title="Remover pagamento" onClick={() => pedirPin('Remover pagamento', pin => call('remover_pagamento', { pagamentoId: p.id, pin }).then(async r => { await load(); return r }))}>✕</button>
              </div>
            ))}
            {falta > 0 && (
              <div className="ms-pay">
                <div className="ms-row">{FORMAS.map(f => <button key={f.key} className={`ms-chip ${forma === f.key ? 'on' : ''}`} onClick={() => setForma(f.key)}>{f.label}</button>)}</div>
                <div className="ms-row">
                  <input className="ms-in" inputMode="numeric" placeholder={`Valor (${moneyShow(String(Math.round(falta * 100)))})`} value={valorDig ? moneyShow(valorDig) : ''}
                    onChange={e => setValorDig(e.target.value.replace(/\D/g, ''))} />
                  <input className="ms-in" placeholder="Quem pagou (opcional)" value={pessoa} onChange={e => setPessoa(e.target.value)} />
                </div>
                <div className="ms-row">
                  <button className="ms-btn ghost" onClick={() => setValorDig(String(Math.round(falta * 100)))}>Tudo ({fmt(falta)})</button>
                  <select className="ms-in sm" value={dividir} onChange={e => setDividir(Number(e.target.value))}>{[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>÷ {n}</option>)}</select>
                  <button className="ms-btn ghost" onClick={() => setValorDig(String(Math.round(falta / dividir * 100)))}>= {fmt(r2(falta / dividir))}</button>
                  <button className="ms-btn" disabled={busy} onClick={pagar}>Registrar</button>
                </div>
              </div>
            )}
            {msg && <div className="ms-err">{msg}</div>}
            <div className="ms-row end">
              <button className="ms-btn danger" onClick={() => pedirPin('Cancelar comanda', pin => call('cancelar_comanda', { comandaId: c.id, pin }).then(async r => { if (r) { await load(); props.onClose() } return r }))}>Cancelar comanda</button>
              <button className="ms-btn ghost" onClick={() => setSub('transferir')}>Trocar de mesa</button>
              <button className="ms-btn ghost" onClick={() => setSub('juntar')}>Juntar mesas</button>
              <button className="ms-btn ok" disabled={busy || falta > 0.005} onClick={async () => { const r = await call('fechar', { comandaId: c.id }); if (r) await props.fechado() }}>Fechar conta</button>
            </div>
          </section>
        </div>
      </div>

      {pin && (
        <Modal titulo={pin.titulo} onClose={() => setPin(null)}>
          <p className="ms-p">Digite o PIN da supervisão.</p>
          <PinInput className="pin" autoFocus value={pinVal} onChange={setPinVal} />
          {msg && <div className="ms-err">{msg}</div>}
          <button className="ms-btn big" disabled={busy || pinVal.length < 4} onClick={async () => { const r = await pin.run(pinVal); if (r) { setPin(null); setPinVal(''); await load() } }}>Confirmar</button>
        </Modal>
      )}
      {sub === 'desconto' && (
        <Modal titulo="Desconto" onClose={() => setSub(null)}>
          <input className="ms-in" inputMode="numeric" placeholder="Valor do desconto" value={descVal ? moneyShow(descVal) : ''} onChange={e => setDescVal(e.target.value.replace(/\D/g, ''))} />
          <input className="ms-in" placeholder="Motivo" value={descMotivo} onChange={e => setDescMotivo(e.target.value)} />
          <button className="ms-btn big" disabled={!descVal} onClick={() => { setSub(null); pedirPin('Aplicar desconto', pin => call('desconto', { comandaId: c.id, valor: moneyDigits(descVal), motivo: descMotivo, pin }).then(async r => { await load(); return r })) }}>Continuar</button>
        </Modal>
      )}
      {sub === 'cliente' && (
        <Modal titulo="WhatsApp do cliente" onClose={() => setSub(null)}>
          <p className="ms-p">Serve para guardar prêmios e cashback. É opcional.</p>
          <input className="ms-in" inputMode="tel" placeholder="(21) 9XXXX-XXXX" value={fone} onChange={e => setFone(e.target.value)} />
          <button className="ms-btn big" disabled={busy} onClick={async () => { const r = await call('cliente', { comandaId: c.id, phone: fone }); if (r) { await load(); setSub(null) } }}>Salvar</button>
          {msg && <div className="ms-err">{msg}</div>}
        </Modal>
      )}
      {sub === 'transferir' && (
        <Modal titulo="Trocar de mesa" onClose={() => setSub(null)}>
          <p className="ms-p">Escolha uma mesa livre.</p>
          <div className="ms-pick">{props.mesas.filter(m => !props.comandaDaMesa.has(m.id)).map(m => (
            <button key={m.id} className="ms-btn big" disabled={busy} onClick={async () => { const r = await call('transferir', { comandaId: c.id, mesaDestinoId: m.id }); if (r) { await load(); setSub(null) } }}>{m.numero}</button>
          ))}</div>
          {msg && <div className="ms-err">{msg}</div>}
        </Modal>
      )}
      {sub === 'juntar' && (
        <Modal titulo="Juntar mesas" onClose={() => setSub(null)}>
          <p className="ms-p">Esta mesa será unida a qual mesa aberta? Os pedidos passam para a mesa escolhida.</p>
          <div className="ms-pick">{props.comandas.filter(x => x.id !== c.id).map(x => (
            <button key={x.id} className="ms-btn big" disabled={busy} onClick={async () => { const r = await call('juntar', { comandaId: c.id, comandaDestinoId: x.id }); if (r) { await load(); setSub(null); props.onClose() } }}>{props.mesas.find(m => m.id === x.mesa_id)?.numero}</button>
          ))}</div>
          {msg && <div className="ms-err">{msg}</div>}
        </Modal>
      )}
    </div>
  )
}

// ================= Seleção de itens =================
function Picker({ produtos, categorias, mesaNumero, onClose, onLancar, busy, msg }: {
  produtos: Produto[]; categorias: { id: string; name: string }[]; mesaNumero?: number; busy: boolean; msg: string
  onClose: () => void; onLancar: (l: Linha[], obs: string) => Promise<boolean>
}) {
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [obs, setObs] = useState('')
  const seq = useRef(0)
  const [peso, setPeso] = useState<{ p: Produto; dig: string } | null>(null)
  const [opc, setOpc] = useState<{ p: Produto; sel: number[][] } | null>(null)

  const lista = produtos.filter(p => (cat === 'all' || p.category_id === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
  const total = r2(linhas.reduce((s, l) => s + l.unit * (l.pesoKg != null ? 1 : l.qty), 0))

  function add(p: Produto, modifiers: { name: string; price: number }[] = [], pesoKg: number | null = null) {
    const extra = modifiers.reduce((s, m) => s + m.price, 0)
    const unit = r2(Number(p.sale_price) + extra)
    const key = p.id + '|' + modifiers.map(m => m.name).join(',') + (pesoKg != null ? '|' + (++seq.current) : '')
    setLinhas(prev => {
      const ex = pesoKg == null ? prev.find(l => l.key === key) : null
      if (ex) return prev.map(l => l.key === key ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, { key, produto: p, qty: 1, pesoKg, modifiers, unit: pesoKg != null ? r2(unit * pesoKg) : unit }]
    })
  }
  function tocar(p: Produto) {
    if (PESO_REGEX.test(p.name)) { setPeso({ p, dig: '' }); return }
    if (p.groups && p.groups.length > 0) { setOpc({ p, sel: p.groups.map(() => []) }); return }
    add(p)
  }
  function confirmarOpc() {
    if (!opc) return
    const mods: { name: string; price: number }[] = []
    for (let gi = 0; gi < opc.p.groups.length; gi++) {
      const g: NpGrupo = opc.p.groups[gi]; const sel = opc.sel[gi]
      if (sel.length < (g.required ? Math.max(1, g.min_select) : g.min_select)) return
      if (g.pricing_rule === 'maior_valor') {
        const contrib = npGroupContribution(g, sel); let usado = false
        sel.forEach(oi => { const pr = !usado && g.options[oi].price >= contrib ? contrib : 0; if (pr === contrib && contrib > 0) usado = true; mods.push({ name: g.options[oi].name, price: pr }) })
      } else sel.forEach(oi => mods.push({ name: g.options[oi].name, price: g.options[oi].price }))
    }
    add(opc.p, mods); setOpc(null)
  }
  const opcOk = opc ? opc.p.groups.every((g, gi) => opc.sel[gi].length >= (g.required ? Math.max(1, g.min_select) : g.min_select)) : false

  return (
    <div className="ms-ov full">
      <div className="ms-cmd">
        <div className="ms-cmdhead">
          <button className="ms-btn ghost" onClick={onClose}>← Comanda</button>
          <div className="t"><b>Adicionar à mesa {mesaNumero}</b><small>Toque nos produtos e lance o pedido</small></div>
        </div>
        <div className="ms-picker">
          <div className="ms-pl">
            <input className="ms-in" placeholder="Buscar produto" value={q} onChange={e => setQ(e.target.value)} />
            <div className="ms-cats">
              <button className={`ms-chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>Todos</button>
              {categorias.map(c => <button key={c.id} className={`ms-chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
            </div>
            <div className="ms-prods">
              {lista.map(p => (
                <button key={p.id} className="ms-prod" onClick={() => tocar(p)}>
                  <Foto url={p.photo_url} size={0} />
                  <span className="n">{p.name}</span>
                  <span className="p">{PESO_REGEX.test(p.name) ? `${fmt(Number(p.sale_price))}/kg` : fmt(Number(p.sale_price))}</span>
                </button>
              ))}
              {lista.length === 0 && <div className="ms-note">Nada encontrado.</div>}
            </div>
          </div>
          <div className="ms-cart">
            <h4>Pedido desta rodada</h4>
            {linhas.length === 0 && <div className="ms-note">Nenhum item ainda.</div>}
            {linhas.map(l => (
              <div key={l.key} className="ms-cl">
                <Foto url={l.produto.photo_url} size={44} />
                <div className="n">{l.pesoKg != null ? `${pesoDisplayKg(l.pesoKg)}kg ` : ''}{l.produto.name}{l.modifiers.length > 0 && <small>{l.modifiers.map(m => m.name).join(', ')}</small>}</div>
                {l.pesoKg == null ? (
                  <div className="qty">
                    <button onClick={() => setLinhas(p => p.map(x => x.key === l.key ? { ...x, qty: x.qty - 1 } : x).filter(x => x.qty > 0))}>−</button>
                    <b>{l.qty}</b>
                    <button onClick={() => setLinhas(p => p.map(x => x.key === l.key ? { ...x, qty: x.qty + 1 } : x))}>+</button>
                  </div>
                ) : <button className="ms-x sm" onClick={() => setLinhas(p => p.filter(x => x.key !== l.key))}>✕</button>}
                <span className="v">{fmt(l.unit * (l.pesoKg != null ? 1 : l.qty))}</span>
              </div>
            ))}
            <input className="ms-in" placeholder="Observação para a cozinha (opcional)" value={obs} onChange={e => setObs(e.target.value)} />
            {msg && <div className="ms-err">{msg}</div>}
            <div className="ms-cartfoot">
              <div className="big"><span>Total</span><b>{fmt(total)}</b></div>
              <button className="ms-btn ok big" disabled={busy || linhas.length === 0} onClick={async () => { await onLancar(linhas, obs) }}>Lançar pedido</button>
            </div>
          </div>
        </div>
      </div>

      {peso && (
        <Modal titulo={peso.p.name} onClose={() => setPeso(null)}>
          <p className="ms-p">Peso pesado na peixaria ({fmt(Number(peso.p.sale_price))}/kg)</p>
          <div className="ms-peso">{pesoDisplay(peso.dig) || '0,000'} kg</div>
          <div className="ms-keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => (
              <button key={k} onClick={() => setPeso(s => s && ({ ...s, dig: k === 'C' ? '' : k === '⌫' ? s.dig.slice(0, -1) : (s.dig + k).slice(0, 6) }))}>{k}</button>
            ))}
          </div>
          <button className="ms-btn ok big" disabled={pesoNum(peso.dig) <= 0} onClick={() => { add(peso.p, [], pesoNum(peso.dig)); setPeso(null) }}>Adicionar</button>
        </Modal>
      )}
      {opc && (
        <Modal titulo={opc.p.name} onClose={() => setOpc(null)}>
          {opc.p.groups.map((g, gi) => (
            <div key={g.id} className="ms-grp">
              <b>{g.name}{g.required ? ' *' : ''}<small> {g.max_select > 1 ? `até ${g.max_select}` : 'escolha 1'}</small></b>
              {g.options.map((o, oi) => {
                const on = opc.sel[gi].includes(oi)
                return (
                  <button key={o.id} className={`ms-chip block ${on ? 'on' : ''}`} onClick={() => setOpc(s => {
                    if (!s) return s
                    const cur = s.sel[gi]; let nx: number[]
                    if (on) nx = cur.filter(x => x !== oi)
                    else if (g.max_select <= 1) nx = [oi]
                    else nx = cur.length >= g.max_select ? cur : [...cur, oi]
                    return { ...s, sel: s.sel.map((a, i) => i === gi ? nx : a) }
                  })}>{o.name}{o.price > 0 ? ` + ${fmt(o.price)}` : ''}</button>
                )
              })}
            </div>
          ))}
          <button className="ms-btn ok big" disabled={!opcOk} onClick={confirmarOpc}>Adicionar</button>
        </Modal>
      )}
    </div>
  )
}
// PIN da supervisão NUNCA pode ir pro gerenciador de senhas do navegador:
// por isso não é type="password" (é isso que faz Chrome/Google oferecer
// "salvar senha"). Campo de texto comum, números mascarados por CSS, com
// autocomplete desligado e nome aleatório pra o navegador não reconhecer.
function PinInput({ value, onChange, className = '', autoFocus }: { value: string; onChange: (v: string) => void; className?: string; autoFocus?: boolean }) {
  const [nome] = useState(() => 'sup' + Math.random().toString(36).slice(2, 10))
  return (
    <input
      className={`ms-in ms-mask ${className}`} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus={autoFocus}
      name={nome} id={nome} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
      data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other"
      value={value} onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
    />
  )
}
function Foto({ url, size = 52 }: { url?: string | null; size?: number }) {
  const [erro, setErro] = useState(false)
  if (!url || erro) return <span className="ms-ph" style={{ width: size, height: size }}>🍽️</span>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" loading="lazy" className="ms-img" style={{ width: size, height: size }} onError={() => setErro(true)} />
}
function pesoDisplayKg(n: number) { return n.toFixed(3).replace('.', ',') }

// ================= Configuração =================
function Config({ companyId, adminMode, recarregar, mesasEnabled, taxaPct, hasPin, garcons, totalMesas, call, busy, msg, onClose }: {
  companyId: string; adminMode: boolean; mesasEnabled: boolean; taxaPct: number; hasPin: boolean; garcons: Garcom[]; totalMesas: number
  call: CallFn; busy: boolean; msg: string; onClose: () => void; recarregar: () => Promise<void>
}) {
  const [taxa, setTaxa] = useState(String(taxaPct))
  const [pin, setPin] = useState('')
  const [nome, setNome] = useState('')
  const [qtd, setQtd] = useState('5')
  const [ok, setOk] = useState('')
  const lista = garcons
  void companyId

  async function salvarGeral() {
    const r = await call('config_salvar', { taxaPct: Number(taxa.replace(',', '.')), ...(pin ? { pin } : {}) })
    if (r) { setOk('Salvo.'); setPin('') }
  }
  return (
    <Modal titulo="Configurar mesas" onClose={onClose} wide>
      {adminMode && (
        <div className="ms-cfg">
          <label className="ms-sw"><input type="checkbox" checked={mesasEnabled} onChange={async e => { await call('config_salvar', { mesasEnabled: e.target.checked }); setOk(e.target.checked ? 'Módulo ligado.' : 'Módulo desligado.') }} /> Módulo de Mesas ligado nesta loja (só a Trindade Online)</label>
        </div>
      )}
      <div className="ms-cfg">
        <h4>Taxa de serviço e PIN da supervisão</h4>
        <div className="ms-row">
          <label className="ms-lbl">Taxa de serviço (%)<input className="ms-in" inputMode="decimal" value={taxa} onChange={e => setTaxa(e.target.value)} /></label>
          <label className="ms-lbl">{hasPin ? 'Novo PIN (4 a 6 números)' : 'Definir PIN (4 a 6 números)'}<PinInput value={pin} onChange={setPin} /></label>
          <button className="ms-btn" disabled={busy} onClick={salvarGeral}>Salvar</button>
        </div>
        <small>{hasPin ? 'PIN definido.' : 'Sem PIN, ninguém consegue cancelar item, dar desconto ou cancelar comanda.'}</small>
      </div>
      <div className="ms-cfg">
        <h4>Garçons</h4>
        {lista.map(g => (
          <div key={g.id} className="ms-gl">
            <span style={{ opacity: g.ativo ? 1 : .5 }}>{g.nome}</span>
            <button className="ms-btn ghost" disabled={busy} onClick={async () => { await call('garcom_salvar', { id: g.id, nome: g.nome, ativo: !g.ativo }); await recarregar() }}>{g.ativo ? 'Desativar' : 'Reativar'}</button>
          </div>
        ))}
        <div className="ms-row">
          <input className="ms-in" placeholder="Nome do garçom" value={nome} onChange={e => setNome(e.target.value)} />
          <button className="ms-btn" disabled={busy || !nome.trim()} onClick={async () => { const r = await call('garcom_salvar', { nome }); if (r) { await recarregar(); setNome('') } }}>Adicionar</button>
        </div>
      </div>
      <div className="ms-cfg">
        <h4>Mesas ({totalMesas} cadastradas)</h4>
        <div className="ms-row">
          <input className="ms-in sm" inputMode="numeric" value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))} />
          <button className="ms-btn" disabled={busy || !qtd} onClick={async () => { const r = await call('mesas_acrescentar', { qtd: Number(qtd) }); if (r) setOk(`Criadas as mesas ${r.de} a ${r.ate}.`) }}>+ Acrescentar mesas</button>
        </div>
        <small>Ex.: acrescentar 5 depois da mesa 20 cria de 21 a 25 sozinho.</small>
      </div>
      {(msg || ok) && <div className={msg ? 'ms-err' : 'ms-okmsg'}>{msg || ok}</div>}
    </Modal>
  )
}

const CSS = `
.ms-wrap{min-height:100vh;background:#E9EAE5;color:#151210;font-family:'Archivo',system-ui,sans-serif;font-size:14px}
.ms-wrap *{box-sizing:border-box}
.ms-wrap button{font-family:inherit;cursor:pointer}
.ms-top{display:flex;align-items:center;gap:14px;padding:0 20px;min-height:60px;background:#151210;color:#fff;flex-wrap:wrap}
.ms-brand{font-family:'Anton',sans-serif;font-size:20px;letter-spacing:.03em;text-transform:uppercase}
.ms-tabs{display:flex;gap:6px;flex:1}
.ms-tab{color:#E9EAE5;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;min-height:44px;display:flex;align-items:center}
.ms-tab.on{background:#FFC531;color:#151210;font-weight:700}
.ms-back{color:#FFC531;text-decoration:none;font-weight:700}
.ms-btn{background:#151210;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:700;min-height:44px;font-size:14px}
.ms-btn.ghost{background:#fff;color:#151210;border:2px solid #151210}
.ms-top .ms-btn.ghost{background:transparent;color:#fff;border-color:#4a423a}
.ms-btn.dark{background:#151210;color:#fff;width:100%}
.ms-btn.ok{background:#0B7347;color:#fff}
.ms-btn.danger{background:#fff;color:#D6392B;border:2px solid #D6392B}
.ms-btn.big{min-height:52px;font-size:16px;width:100%}
.ms-btn:disabled{opacity:.45;cursor:not-allowed}
.ms-body{display:flex;min-height:calc(100vh - 60px)}
.ms-main{flex:1;min-width:0;padding:18px 22px;display:flex;flex-direction:column;gap:12px}
.ms-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
.ms-head h1{font-family:'Anton',sans-serif;font-size:32px;text-transform:uppercase;margin:0;line-height:1}
.ms-head span{font-size:13px;color:#4f4c47}
.ms-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:#3d3a36}
.ms-legend span{display:flex;align-items:center;gap:6px}
.ms-legend i{width:14px;height:14px;border-radius:4px;display:inline-block}
.ms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.ms-mesa{border:2px solid #b9bab2;background:#fff;color:#151210;border-radius:12px;padding:10px 14px;min-height:100px;text-align:left;display:flex;flex-direction:column;justify-content:space-between;gap:6px}
.ms-mesa .top{display:flex;justify-content:space-between;align-items:baseline}
.ms-mesa .top b{font-family:'Anton',sans-serif;font-size:34px;line-height:1;font-weight:400}
.ms-mesa .top em{font-style:normal;font-size:12px;font-weight:600;opacity:.85}
.ms-mesa .bot{display:flex;flex-direction:column;gap:2px}
.ms-mesa .bot strong{font-size:12.5px}
.ms-mesa .bot small{font-size:13px;font-weight:600;opacity:.9}
.ms-mesa.ocupada{background:#231F1B;border-color:#231F1B;color:#fff}
.ms-mesa.aguard{background:#FFC531;border-color:#FFC531}
.ms-mesa.chama{background:#D6392B;border-color:#D6392B;color:#fff}
.ms-mesa.conta{background:#0B7347;border-color:#0B7347;color:#fff}
.ms-side{width:340px;flex:none;background:#F5F6F2;border-left:1px solid #DCDDD6;padding:18px;display:flex;flex-direction:column;gap:12px}
.ms-sidehead{display:flex;justify-content:space-between;align-items:baseline}
.ms-sidehead h2{font-family:'Anton',sans-serif;font-size:22px;text-transform:uppercase;margin:0;font-weight:400}
.ms-count{background:#D6392B;color:#fff;border-radius:999px;padding:2px 10px;font-weight:700;font-size:13px}
.ms-chamado{background:#fff;border:1px solid #DCDDD6;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}
.ms-chamado.garcom{border:2px solid #D6392B}.ms-chamado.pedido{border:2px solid #FFC531}
.ms-chamado div{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.ms-chamado small{color:#6F6C67;font-size:12px}.ms-chamado p{margin:0;font-size:13px;color:#3d3a36}
.ms-foot{margin-top:auto;font-size:12px;color:#4f4c47;border-top:1px solid #DCDDD6;padding-top:10px}
.ms-note{font-size:13px;color:#4f4c47;background:#fff;border:1px dashed #b9bab2;border-radius:10px;padding:12px}
.ms-empty{max-width:520px;margin:60px auto;padding:0 20px;text-align:center}
.ms-empty h2{font-family:'Anton',sans-serif;text-transform:uppercase;font-weight:400;font-size:28px}
.ms-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#D6392B;color:#fff;padding:12px 18px;border-radius:10px;font-weight:600;z-index:90}
.ms-ov{position:fixed;inset:0;background:rgba(21,18,16,.55);display:flex;align-items:center;justify-content:center;padding:16px;z-index:60;overflow:auto}
.ms-ov.full{background:#E9EAE5;padding:0;align-items:stretch;justify-content:stretch;z-index:50}
.ms-modal{background:#fff;border-radius:16px;padding:18px;width:min(440px,100%);max-height:92vh;overflow:auto;display:flex;flex-direction:column;gap:12px;z-index:70}
.ms-modal.wide{width:min(640px,100%)}
.ms-mh{display:flex;justify-content:space-between;align-items:center}.ms-mh h3{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:22px;text-transform:uppercase}
.ms-x{background:#F5F6F2;border:0;border-radius:8px;width:44px;height:44px;font-size:16px}.ms-x.sm{width:36px;height:36px;font-size:13px}
.ms-p{margin:0;color:#3d3a36}
.ms-garcons,.ms-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.ms-in{border:2px solid #151210;border-radius:10px;padding:10px 12px;font-size:16px;min-height:46px;background:#fff;color:#151210;width:100%;font-family:inherit}
.ms-in.sm{width:90px}.ms-in.pin{text-align:center;letter-spacing:.5em;font-size:24px}
.ms-err{background:#FDECEA;color:#9B2318;border-radius:8px;padding:10px 12px;font-weight:600}
.ms-okmsg{background:#E3F4EB;color:#0B5B38;border-radius:8px;padding:10px 12px;font-weight:600}
.ms-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}.ms-row.end{justify-content:flex-end;margin-top:6px}
.ms-chip{background:#fff;border:1px solid #DCDDD6;border-radius:999px;padding:10px 16px;font-weight:600;min-height:44px;white-space:nowrap}
.ms-chip.on{background:#151210;color:#fff;border-color:#151210}.ms-chip.block{border-radius:10px;width:100%;text-align:left;margin-top:6px}
.ms-cmd{width:100%;display:flex;flex-direction:column;min-height:100vh}
.ms-cmdhead{display:flex;align-items:center;gap:12px;padding:12px 18px;background:#151210;color:#fff;flex-wrap:wrap}
.ms-cmdhead .ms-btn.ghost{background:transparent;color:#fff;border-color:#4a423a}
.ms-cmdhead .t{flex:1;display:flex;flex-direction:column}.ms-cmdhead .t b{font-family:'Anton',sans-serif;font-weight:400;font-size:24px;text-transform:uppercase}.ms-cmdhead .t small{color:#E9EAE5}
.ms-cmdbody{display:flex;gap:16px;padding:16px;flex-wrap:wrap;align-items:flex-start}
.ms-col{flex:1.2;min-width:300px;display:flex;flex-direction:column;gap:10px}.ms-col.narrow{flex:1;min-width:340px;background:#fff;border-radius:14px;padding:16px}
.ms-col h4,.ms-cfg h4,.ms-cart h4{margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6F6C67}
.ms-rodada{background:#fff;border:1px solid #DCDDD6;border-radius:12px;padding:10px 14px}
.ms-rodada .rh{display:flex;justify-content:space-between;color:#6F6C67;margin-bottom:4px}
.ms-rodada .it{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #ECEDE8}
.ms-rodada .q{font-weight:700;min-width:44px}.ms-rodada .n{flex:1;display:flex;flex-direction:column}.ms-rodada .n small{color:#6F6C67}.ms-rodada .v{font-weight:600}
.ms-rodada .obs{font-size:12.5px;color:#6F6C67;padding-top:4px}
.ms-tot{display:flex;flex-direction:column;gap:4px}.ms-tot div{display:flex;justify-content:space-between}
.ms-tot .big{font-family:'Anton',sans-serif;font-size:24px;border-top:1px solid #DCDDD6;padding-top:6px}.ms-tot .big.warn b{color:#D6392B}.ms-tot .big.ok b{color:#0B7347}
.ms-pg{display:flex;align-items:center;gap:8px;justify-content:space-between;background:#F5F6F2;border-radius:8px;padding:6px 10px}
.ms-pay{display:flex;flex-direction:column;gap:8px}
.ms-picker{display:flex;gap:16px;padding:16px;flex-wrap:wrap;align-items:flex-start}
.ms-pl{flex:2;min-width:320px;display:flex;flex-direction:column;gap:10px}.ms-cats{display:flex;gap:6px;overflow:auto;padding-bottom:4px}
.ms-prods{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.ms-prod{background:#fff;border:1px solid #DCDDD6;border-radius:12px;padding:12px;text-align:left;min-height:74px;display:flex;flex-direction:column;justify-content:space-between;gap:6px}
.ms-prod .n{font-weight:700;line-height:1.2}
.ms-mask{-webkit-text-security:disc;text-security:disc}
.ms-img{object-fit:cover;border-radius:8px;flex:none;background:#E9EAE5}
.ms-ph{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:#E9EAE5;font-size:20px;flex:none}
.ms-prod .ms-img,.ms-prod .ms-ph{width:100%!important;height:96px!important;border-radius:8px}.ms-prod .p{color:#4f4c47;font-weight:600}
.ms-cart{flex:1;min-width:300px;background:#fff;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;position:sticky;top:12px}
.ms-cl{display:flex;align-items:center;gap:8px;border-top:1px solid #ECEDE8;padding-top:8px}.ms-cl .n{flex:1;display:flex;flex-direction:column;font-weight:600}.ms-cl .n small{color:#6F6C67;font-weight:400}
.ms-cl .qty{display:flex;align-items:center;gap:8px}.ms-cl .qty button{width:40px;height:40px;border-radius:10px;border:2px solid #151210;background:#fff;font-size:20px;font-weight:700}
.ms-cartfoot{display:flex;flex-direction:column;gap:8px}.ms-cartfoot .big{display:flex;justify-content:space-between;font-family:'Anton',sans-serif;font-size:24px}
.ms-peso{font-family:'Anton',sans-serif;font-size:40px;text-align:center;background:#F5F6F2;border-radius:12px;padding:10px}
.ms-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.ms-keypad button{min-height:56px;border-radius:10px;border:1px solid #DCDDD6;background:#fff;font-size:22px;font-weight:700}
.ms-grp{display:flex;flex-direction:column}.ms-grp small{font-weight:400;color:#6F6C67}
.ms-cfg{display:flex;flex-direction:column;gap:8px;border-top:1px solid #ECEDE8;padding-top:12px}.ms-cfg:first-of-type{border-top:0;padding-top:0}
.ms-lbl{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:600;flex:1;min-width:140px}
.ms-gl{display:flex;justify-content:space-between;align-items:center}
.ms-sw{display:flex;gap:8px;align-items:center;font-weight:600}
@media(max-width:900px){.ms-body{flex-direction:column}.ms-side{width:auto;border-left:0;border-top:1px solid #DCDDD6}}
`
