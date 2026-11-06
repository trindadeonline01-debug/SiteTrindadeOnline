'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/adminFetch'
import { moduleActive } from '@/lib/modules'
import { beepChamado, pararSons, unlockAudio } from '@/lib/beep'
import { buildReceipt, buildKitchenTicket, imprimirVias, isRawBtMode, qzConnect, setPapelImpressora, setViasImpressao } from '@/lib/qzPrint'
import ConfirmModal from '@/components/painel/ConfirmModal'
import VendasDiaPanel from '@/components/painel/VendasDiaPanel'
import MesaCalculadora, { type CalcComanda, type Divisao, DIVISAO0 } from '@/components/painel/MesaCalculadora'
import QRCode from 'qrcode'
import { buildQrSheetHtml } from '@/lib/mesaQrSheet'
import { promoPrice } from '@/lib/lojaPricing'
import { npGroupContribution, type NpGrupo, type NpProduto, PESO_REGEX, pesoNum, pesoDisplay } from '@/lib/produtoCart'
import { ordenarComplementosLista } from '@/lib/produtoOrdem'

// Mesas e comandas (nov/2026) — mapa de mesas em tela cheia pro tablet do
// garçom (bare route, igual Cozinha/PDV). Tudo que mexe em dinheiro, PIN ou
// fechamento passa por POST /api/mesas (o servidor decide); aqui só pede e
// mostra. docs/DESENHO_MESAS_JOGOS.md.

type Mesa = { id: string; numero: number; nome: string | null; ativa: boolean }
type Comanda = {
  id: string; company_id: string; mesa_id: string | null; tipo?: 'mesa' | 'retirada'; rotulo?: string | null; numero: number; garcom_nome: string | null; customer_phone: string | null; customer_name: string | null
  taxa_servico_ativa: boolean; taxa_servico_pct: number; desconto: number; desconto_motivo: string | null
  imprimir_producao_em?: string | null; imprimir_producao_todas?: boolean; imprimir_conta_em?: string | null
  subtotal: number; taxa_valor: number; total: number; aberta_em: string
}
type ItemPed = { id: string; produto_id: string | null; product_name: string; unit_price: number; qty: number; peso_kg: number | null; selected_options: { name: string; price: number }[] }
type PedidoMesa = { id: string; order_number: number | null; comanda_id: string; status: string; created_at: string; notes: string | null; impresso_em?: string | null; itens: ItemPed[] }
type Pagto = { id: string; comanda_id: string; forma: string; cartao_tipo?: string | null; valor: number; pessoa: string | null }
type PedidoQr = { itens: { produtoId: string; nome: string; qty: number; modifiers: { name: string; price: number }[]; notes: string | null; unit: number }[]; obs: string | null; telefone: string | null; total: number }
type Chamado = { id: string; mesa_id: string; comanda_id: string | null; tipo: 'garcom' | 'conta' | 'pedido'; mensagem: string | null; criado_em: string; payload: PedidoQr | null }
type Garcom = { id: string; nome: string; ativo: boolean }
type Produto = NpProduto & { promo_type?: string | null; promo_value?: number | null; promo_starts_at?: string | null; promo_ends_at?: string | null }
// Preço de venda de hoje (com promoção, se estiver valendo) — o mesmo que o servidor cobra.
function precoDe(p: Produto): number {
  const base = Number(p.sale_price)
  const v = promoPrice({ ...p, sale_price: base, promo_value: p.promo_value != null ? Number(p.promo_value) : null } as never)
  return v != null ? r2(v) : base
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resp = any
type CallFn = (a: string, e?: Record<string, unknown>) => Promise<Resp>
type Linha = { key: string; produto: Produto; qty: number; pesoKg: number | null; modifiers: { name: string; price: number }[]; unit: number }

type FormaUi = 'dinheiro' | 'debito' | 'credito' | 'pix' | 'cashback'
const FORMAS: { key: FormaUi; label: string }[] = [
  { key: 'dinheiro', label: '💵 Dinheiro' }, { key: 'debito', label: '💳 Débito' }, { key: 'credito', label: '💳 Crédito' }, { key: 'pix', label: '📱 Pix' }, { key: 'cashback', label: '🎁 Cashback' },
]
// Débito e crédito são o mesmo "cartao" no banco, com o tipo guardado à parte (o cashback tem percentual diferente).
function formaApi(f: FormaUi | 'cartao'): { forma: string; cartaoTipo?: 'debito' | 'credito' } {
  if (f === 'debito' || f === 'credito') return { forma: 'cartao', cartaoTipo: f }
  return { forma: f }
}
function formaExibida(p: { forma: string; cartao_tipo?: string | null }): string {
  return p.forma === 'cartao' ? (p.cartao_tipo === 'debito' || p.cartao_tipo === 'credito' ? p.cartao_tipo : 'cartao') : p.forma
}
const PAY_ICON: Record<string, { cor: string; tint: string; nome: string; d: React.ReactNode }> = {
  dinheiro: { cor: '#0B7347', tint: '#DDF1E7', nome: 'Dinheiro', d: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></> },
  cartao: { cor: '#2A4E7A', tint: '#E1EAF5', nome: 'Cartão', d: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></> },
  debito: { cor: '#2A4E7A', tint: '#E1EAF5', nome: 'Débito', d: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></> },
  credito: { cor: '#2A4E7A', tint: '#E1EAF5', nome: 'Crédito', d: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></> },
  pix: { cor: '#0E7C86', tint: '#DCF1F2', nome: 'Pix', d: <><path d="M12 3l9 9-9 9-9-9z" /><path d="M9 12l3-3 3 3-3 3z" /></> },
  cashback: { cor: '#9A6A00', tint: '#FFF1CC', nome: 'Cashback', d: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></> },
}
function PayIcon({ forma, cor, size = 18 }: { forma: string; cor?: string; size?: number }) {
  const m = PAY_ICON[forma]
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={cor || m?.cor} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{m?.d}</svg>
}
const fmt = (n: number) => 'R$ ' + (Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
function tempo(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}
function formatFone(raw: string) {
  const d = raw.replace(/\D/g, '').replace(/^55/, '')
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : raw
}
function moneyDigits(d: string) { const c = d.replace(/\D/g, ''); return c ? parseInt(c, 10) / 100 : 0 }
function moneyShow(d: string) {
  const c = d.replace(/\D/g, ''); if (!c) return '0,00'
  const p = c.padStart(3, '0'); return `${p.slice(0, -2).replace(/^0+(?=\d)/, '') || '0'},${p.slice(-2)}`
}

// Pausa de impressão nas mesas (pedido do Ricardo, 4/nov/2026: dia de teste do sistema, sem testar impressão).
// Pra voltar a imprimir: esvaziar esta lista.
const IMPRESSAO_PAUSADA_EMPRESAS: string[] = [] // vazio = impressão liberada em todas (Calçada do Peixe liberada em 5/nov/2026)

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
  const [contasPedidas, setContasPedidas] = useState<Comanda[]>([])  // contas pedidas por outro aparelho (inclui já fechadas)
  const [chamados, setChamados] = useState<Chamado[]>([])
  const [garcons, setGarcons] = useState<Garcom[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<{ id: string; name: string }[]>([])

  const [abertaId, setAbertaId] = useState<string | null>(null)       // comanda aberta na tela
  const [abrirMesa, setAbrirMesa] = useState<Mesa | null>(null)       // escolher garçom
  const [abrirPessoas, setAbrirPessoas] = useState<number | null>(null)
  const [abrirFone, setAbrirFone] = useState('')
  const [abrirNome, setAbrirNome] = useState('')
  const [abrirRetirada, setAbrirRetirada] = useState(false)           // nova retirada (sem mesa)
  const [showConfig, setShowConfig] = useState(false)
  const [calcLivre, setCalcLivre] = useState(false)
  const [showVendas, setShowVendas] = useState(false)
  const [picker, setPicker] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)
  const companyRef = useRef('')
  const chamadosVistos = useRef<Set<string> | null>(null)
  const chamadosAbertosAntes = useRef<Set<string>>(new Set())
  const [pedidoQr, setPedidoQr] = useState<Chamado | null>(null)
  const [pedirCfgPin, setPedirCfgPin] = useState(false)

  const call = useCallback(async (acao: string, extra: Record<string, unknown> = {}): Promise<Resp> => {
    setBusy(true)
    // Limite de 25s: uma chamada pendurada (internet ruim, sessão travada) não pode deixar
    // os botões desativados para sempre — antes disso "Lançar pedido" ficava cinza e nada mais respondia.
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const tempo = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 25000) })
      const res = await Promise.race([adminFetch('/api/mesas', { method: 'POST', body: JSON.stringify({ companyId: companyRef.current, acao, ...extra }) }), tempo])
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.error || 'Não consegui concluir.'); return null }
      setMsg('')
      return data
    } catch (e) {
      setMsg(e instanceof Error && e.message === 'timeout' ? 'Demorou demais para responder. Confira a internet e tente de novo (confira se o pedido já não entrou na comanda).' : 'Sem conexão. Tente de novo.')
      return null
    } finally { if (timer) clearTimeout(timer); setBusy(false) }
  }, [])

  const load = useCallback(async () => {
    const cid = companyRef.current
    if (!cid) return
    const [m, c, g, ch, cp] = await Promise.all([
      supabase.from('loja_mesas').select('id, numero, nome, ativa').eq('company_id', cid).eq('ativa', true).order('numero'),
      supabase.from('loja_comandas').select('*').eq('company_id', cid).eq('status', 'aberta'),
      supabase.from('loja_garcons').select('id, nome, ativo').eq('company_id', cid).order('nome'),
      supabase.from('loja_mesa_chamados').select('id, mesa_id, comanda_id, tipo, mensagem, criado_em, payload').eq('company_id', cid).eq('status', 'aberto').order('criado_em'),
      supabase.from('loja_comandas').select('*').eq('company_id', cid).not('imprimir_conta_em', 'is', null),
    ])
    setContasPedidas((cp.data || []) as Comanda[])
    const cs = (c.data || []) as Comanda[]
    setMesas((m.data || []) as Mesa[]); setComandas(cs); setGarcons((g.data || []) as Garcom[])
    const chs = (ch.data || []) as Chamado[]
    setChamados(chs)
    // Chamado atendido em outro aparelho (sumiu da lista): cala o toque aqui também.
    if (chamadosVistos.current && [...chamadosVistos.current].some(id => !chs.some(x => x.id === id) && chamadosAbertosAntes.current.has(id))) pararSons()
    chamadosAbertosAntes.current = new Set(chs.map(x => x.id))
    if (chamadosVistos.current) {
      const novos = chs.filter(x => !chamadosVistos.current!.has(x.id))
      // Pedido do cliente pelo QR: sem som (decisão do Ricardo, 6/nov/2026) — só aparece o aviso na tela.
      // Chamado de garçom / pedir a conta continua com o aviso curto.
      if (novos.some(x => x.tipo !== 'pedido')) beepChamado()
    }
    // Acumula (não substitui): um chamado que já tocou nunca toca de novo nesta tela, mesmo que a lista oscile.
    chamadosVistos.current = new Set([...(chamadosVistos.current || []), ...chs.map(x => x.id)])
    const ids = cs.map(x => x.id)
    if (ids.length === 0) { setPedidos([]); setPagtos([]); return }
    const [p, pg] = await Promise.all([
      supabase.from('loja_pedidos').select('id, order_number, comanda_id, status, created_at, notes, impresso_em, itens:loja_pedido_itens(*)').in('comanda_id', ids).order('created_at'),
      supabase.from('loja_comanda_pagamentos').select('id, comanda_id, forma, cartao_tipo, valor, pessoa').in('comanda_id', ids).order('criado_em'),
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
      const SEL = 'id, name, loja_digital_enabled, trial_modules_until, loja_impressora_nome, loja_impressora_papel, impressao_vias_completa, impressao_vias_producao, mesas_enabled, loja_taxa_servico_pct, loja_supervisor_pin_hash'
      const { data: comp } = isAdmin
        ? await supabase.from('companies').select(SEL).eq('id', empresaParam).maybeSingle()
        : await supabase.from('companies').select(SEL).eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || (!isAdmin && !moduleActive(comp.loja_digital_enabled, comp.trial_modules_until))) { window.location.href = '/painel/compartilhar'; return }
      companyRef.current = comp.id
      setCompanyId(comp.id); setCompanyName(comp.name); setPrinterName(comp.loja_impressora_nome || ''); setPapelImpressora(comp.loja_impressora_papel); setViasImpressao(comp.impressao_vias_completa, comp.impressao_vias_producao)
      setMesasEnabled(!!comp.mesas_enabled); setTaxaPct(Number(comp.loja_taxa_servico_pct) || 0); setHasPin(!!comp.loja_supervisor_pin_hash); setAdminMode(isAdmin)
      if (comp.mesas_enabled || isAdmin) {
        const [{ data: prods }, { data: cats }] = await Promise.all([
          supabase.from('loja_produtos').select('id, name, sale_price, promo_type, promo_value, promo_starts_at, promo_ends_at, category_id, photo_url, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))').eq('company_id', comp.id).eq('active', true).eq('canal_mesa', true).order('display_order'),
          supabase.from('loja_categorias').select('id, name').eq('company_id', comp.id).order('display_order'),
        ])
        setProdutos(ordenarComplementosLista((prods || []) as any[]) as unknown as Produto[]); setCategorias((cats || []) as { id: string; name: string }[])
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

  const comandaDaMesa = useMemo(() => new Map(comandas.filter(c => c.mesa_id).map(c => [c.mesa_id as string, c])), [comandas])
  const retiradas = useMemo(() => comandas.filter(c => c.tipo === 'retirada').sort((a, b) => a.aberta_em.localeCompare(b.aberta_em)), [comandas])
  const comanda = comandas.find(c => c.id === abertaId) || null
  const fotos = useMemo(() => Object.fromEntries(produtos.map(p => [p.id, p.photo_url ?? null])) as Record<string, string | null>, [produtos])
  const mesaDe = (id: string | null) => id ? mesas.find(m => m.id === id) : undefined
  const nomeConta = (c: Comanda) => c.tipo === 'retirada' ? `RETIRADA ${c.rotulo ? c.rotulo.toUpperCase() : '#' + c.numero}` : `MESA ${mesaDe(c.mesa_id)?.numero ?? ''}`
  const impressaoPausada = IMPRESSAO_PAUSADA_EMPRESAS.includes(companyId)

  // tipo 'producao' = comandinha da cozinha (sem valores); 'completa' = conta.
  // Quantas cópias de cada sai vem de Impressora → "Quantas vias" (0 a 2).
  // forcar: botão manual "Imprimir conta" sempre sai ao menos 1.
  async function imprimir(conteudos: string[], tipo: 'completa' | 'producao', forcar = false): Promise<boolean> {
    if (impressaoPausada) return false
    if (!printerName || conteudos.length === 0) return false
    try {
      for (const c of conteudos) await imprimirVias(printerName, tipo === 'completa' ? c : null, tipo === 'producao' ? c : null, tipo === 'completa' && forcar ? 1 : 0)
      return true
    } catch { return false }
  }

  // ---------- ações ----------
  async function abrirComanda(garcomId: string) {
    if (!abrirMesa) return
    const r = await call('abrir', { mesaId: abrirMesa.id, garcomId, pessoas: abrirPessoas, phone: abrirFone.trim() || undefined, nome: abrirNome.trim() || undefined })
    if (r?.comandaId) { setAbrirMesa(null); setAbrirPessoas(null); setAbrirFone(''); setAbrirNome(''); await load(); setAbertaId(r.comandaId) }
  }

  async function abrirNovaRetirada(garcomId: string, rotulo: string) {
    const r = await call('abrir_retirada', { garcomId, rotulo })
    if (r?.comandaId) { setAbrirRetirada(false); await load(); setAbertaId(r.comandaId) }
  }

  async function lancarRodada(linhas: Linha[], obs: string) {
    if (!comanda) return false
    const r = await call('rodada', {
      comandaId: comanda.id, obs,
      itens: linhas.map(l => ({ produtoId: l.produto.id, qty: l.qty, pesoKg: l.pesoKg, modifiers: l.modifiers })),
    })
    if (!r) return false
    // Não imprime sozinho: a atendente lança tudo e imprime para a produção no botão "Imprimir produção".
    await load()
    return true
  }

  // Imprime para a produção TUDO que foi lançado e ainda não saiu no papel, num papelzinho só.
  // todas=true reimprime tudo (menu ⋯). Só marca como impresso quando é a impressão normal.
  // Este aparelho consegue imprimir? (RawBT no tablet, ou QZ Tray rodando — o computador da impressora.)
  async function podeImprimirAqui(): Promise<boolean> {
    if (!printerName) return false
    if (isRawBtMode(printerName)) return true
    try { await qzConnect(); return true } catch { return false }
  }

  // Monta e imprime a produção da comanda com o que está no banco AGORA. Marca como impresso só se saiu.
  async function executarProducao(c: Comanda, todas: boolean): Promise<'ok' | 'nada' | 'erro'> {
    const { data } = await supabase.from('loja_pedidos').select('id, order_number, status, notes, impresso_em, itens:loja_pedido_itens(*)').eq('comanda_id', c.id)
    const peds = ((data || []) as unknown as PedidoMesa[]).filter(p => p.status !== 'cancelado' && (todas || !p.impresso_em)).sort((x, y) => (x.order_number ?? 0) - (y.order_number ?? 0))
    if (peds.length === 0) return 'nada'
    const mesa = mesaDe(c.mesa_id)
    const items = peds.flatMap(p => p.itens).map(it => ({ qty: it.qty, pesoKg: it.peso_kg, name: it.product_name, unitPrice: it.unit_price, options: it.selected_options }))
    const notes = peds.map(p => p.notes).filter(Boolean).join(' | ') || null
    const ok = await imprimir([buildKitchenTicket({
      pedidoShortId: `${c.tipo === 'retirada' ? 'R' + c.numero : (mesa?.numero ?? '')}-${peds.map(p => p.order_number ?? '').join('/')}`, createdAt: new Date().toISOString(), deliveryType: 'balcao',
      titulo: nomeConta(c), rotulo: `Garcom: ${c.garcom_nome || ''}`, items, notes,
    })], 'producao')
    if (!ok) return 'erro'
    // Só marca como impresso se saiu de verdade; assim o botão continua pedindo até dar certo.
    if (!todas) await supabase.from('loja_pedidos').update({ impresso_em: new Date().toISOString() }).in('id', peds.map(p => p.id)).is('impresso_em', null)
    return 'ok'
  }

  async function imprimirProducao(c: Comanda, todas = false) {
    if (!printerName) { setMsg('Escolha a impressora em Pedidos → 🖨️ Impressora.'); return }
    if (await podeImprimirAqui()) {
      const r = await executarProducao(c, todas)
      if (r === 'nada') { setMsg('Nada novo para imprimir.'); return }
      if (r === 'erro') { setMsg('Não consegui imprimir. Confira a impressora e toque em Imprimir produção de novo.'); return }
      setMsg(''); await load(); return
    }
    // Sem impressora neste aparelho (celular): pede para o computador imprimir.
    const r = await call('producao_pedir', { comandaId: c.id, todas })
    if (r) setMsg('📨 Enviado para a impressora do computador. Se não sair, confira se a tela de Mesas está aberta lá.')
  }

  // Computador com a impressora: imprime os pedidos feitos pelos outros aparelhos (celular).
  const imprimindoRemoto = useRef(false)
  useEffect(() => {
    const pend = comandas.filter(c => c.imprimir_producao_em)
    if (pend.length === 0 || !printerName || isRawBtMode(printerName) || imprimindoRemoto.current) return
    imprimindoRemoto.current = true
    ;(async () => {
      try {
        if (!(await podeImprimirAqui())) return
        for (const c of pend) {
          // Reivindica: só o aparelho que conseguir zerar o pedido (com o mesmo carimbo) imprime — evita papel duplicado.
          const { data: ganhou } = await supabase.from('loja_comandas').update({ imprimir_producao_em: null }).eq('id', c.id).eq('imprimir_producao_em', c.imprimir_producao_em as string).select('id')
          if (!ganhou || ganhou.length === 0) continue
          const r = await executarProducao(c, !!c.imprimir_producao_todas)
          if (r === 'erro') setMsg('Não consegui imprimir o pedido do celular. Confira a impressora e peça de novo.')
        }
        await load()
      } finally { imprimindoRemoto.current = false }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comandas, printerName])

  // Imprime a conta aqui se este aparelho tem impressora; senão (celular) pede para o computador imprimir.
  async function imprimirContaAgora(c: Comanda, forcar = true) {
    if (await podeImprimirAqui()) {
      const ok = await imprimir([dadosConta(c)], 'completa', forcar)
      if (ok || impressaoPausada) return
      setMsg('Não consegui imprimir a conta. Confira a impressora.'); return
    }
    const r = await call('conta_pedir', { comandaId: c.id })
    if (r) setMsg('📨 Conta enviada para a impressora do computador. Se não sair, confira se a tela de Mesas está aberta lá.')
  }

  // Computador com a impressora: imprime as contas pedidas pelo celular (a comanda pode já estar fechada).
  const imprimindoConta = useRef(false)
  useEffect(() => {
    if (contasPedidas.length === 0 || !printerName || isRawBtMode(printerName) || imprimindoConta.current) return
    imprimindoConta.current = true
    ;(async () => {
      try {
        if (!(await podeImprimirAqui())) return
        for (const c of contasPedidas) {
          const { data: ganhou } = await supabase.from('loja_comandas').update({ imprimir_conta_em: null }).eq('id', c.id).eq('imprimir_conta_em', c.imprimir_conta_em as string).select('id')
          if (!ganhou || ganhou.length === 0) continue
          const [{ data: ps }, { data: pg }] = await Promise.all([
            supabase.from('loja_pedidos').select('id, order_number, comanda_id, status, created_at, notes, impresso_em, itens:loja_pedido_itens(*)').eq('comanda_id', c.id).order('created_at'),
            supabase.from('loja_comanda_pagamentos').select('id, comanda_id, forma, cartao_tipo, valor, pessoa').eq('comanda_id', c.id).order('criado_em'),
          ])
          const ok = await imprimir([montarConta(c, (ps || []) as unknown as PedidoMesa[], (pg || []) as Pagto[])], 'completa', true)
          if (!ok) setMsg('Não consegui imprimir a conta do celular. Confira a impressora e peça de novo.')
        }
        await load()
      } finally { imprimindoConta.current = false }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contasPedidas, printerName])

  function dadosConta(c: Comanda) { return montarConta(c, pedidos.filter(p => p.comanda_id === c.id), pagtos.filter(p => p.comanda_id === c.id)) }
  function montarConta(c: Comanda, todosPeds: PedidoMesa[], pgs: Pagto[]) {
    const mesa = mesaDe(c.mesa_id)
    const peds = todosPeds.filter(p => p.status !== 'cancelado')
    const items = peds.flatMap(p => p.itens).map(it => ({ qty: it.qty, pesoKg: it.peso_kg, name: it.product_name, unitPrice: it.unit_price, options: it.selected_options }))
    const extras: { label: string; valor: number }[] = []
    if (c.desconto > 0) extras.push({ label: 'Desconto', valor: -c.desconto })
    if (c.taxa_servico_ativa && c.taxa_valor > 0) extras.push({ label: `Servico ${c.taxa_servico_pct}%`, valor: c.taxa_valor })
    const pagamentos = pgs.map(p => ({ label: (FORMAS.find(f => f.key === formaExibida(p))?.label.replace(/^\S+\s/, '') || p.forma) + (p.pessoa ? ` (${p.pessoa})` : ''), valor: p.valor }))
    return buildReceipt({
      companyName, pedidoShortId: `Comanda ${c.numero}`, createdAt: c.aberta_em, customerName: c.tipo === 'retirada' ? `Retirada${c.rotulo ? ' ' + c.rotulo : ''}` : `Mesa ${mesa?.numero ?? ''}`, customerPhone: c.customer_phone,
      deliveryType: 'balcao', rotuloTipo: `${nomeConta(c)} - Atend. ${c.garcom_nome || ''}`, items, subtotal: c.subtotal, extras, total: c.total, pagamentos,
    })
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#6F6C67', background: '#E9EAE5' }}>Carregando...</div>

  const emUso = comandas.filter(c => c.tipo !== 'retirada').length
  return (
    <div className="ms-wrap" onClick={() => unlockAudio()}>
      <style>{CSS}</style>
      {impressaoPausada && <div style={{ background: '#FFC531', color: '#151210', fontWeight: 800, fontSize: 13, textAlign: 'center', padding: '6px 10px' }}>🖨️ Impressão PAUSADA (modo teste) — nada sai na impressora</div>}
      <div className="ms-top">
        <div className="ms-brand">{companyName}</div>
        <div className="ms-tabs">
          <a className="ms-tab on" href="#">Mesas</a>
          <a className="ms-tab" href={'/painel/cozinha' + (adminMode ? `?empresa=${companyId}` : '')}>Cozinha</a>
          <a className="ms-tab" href={'/painel/pdv' + (adminMode ? `?empresa=${companyId}` : '')}>Balcão</a>
        </div>
        <button className="ms-btn calc" onClick={() => setCalcLivre(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#151210" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><rect x="8" y="6" width="8" height="3" /><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" /></svg>Calculadora</button>
        <button className="ms-btn ghost" onClick={() => setShowVendas(true)}>📋 Vendas do dia</button>
        <button className="ms-btn ghost" onClick={() => { if (adminMode || !hasPin) setShowConfig(true); else { setMsg(''); setPedirCfgPin(true) } }}>⚙️ Configurar</button>
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
                  <button key={m.id} className={`ms-mesa ${k}`} onClick={() => { pararSons(); if (c) setAbertaId(c.id); else setAbrirMesa(m) }}>
                    <span className="top"><b>{m.numero}</b><em>{c ? tempo(c.aberta_em) : ''}</em></span>
                    <span className="bot"><strong>{rotulo}</strong><span className="row"><span className="who">{c?.garcom_nome || ''}</span><small>{c ? fmt(c.total) : ''}</small></span></span>
                  </button>
                )
              })}
            </div>
            <div className="ms-head ms-rethead">
              <h1>Retirada</h1>
              <span>{retiradas.length === 0 ? 'Sem taxa de serviço' : `${retiradas.length} em andamento · sem taxa de serviço`}</span>
            </div>
            <div className="ms-grid">
              {retiradas.map(c => (
                <button key={c.id} className="ms-mesa ret" onClick={() => setAbertaId(c.id)}>
                  <span className="top"><b className="rt">{c.rotulo || `#${c.numero}`}</b><em>{tempo(c.aberta_em)}</em></span>
                  <span className="bot"><strong>Retirada</strong><span className="row"><span className="who">{c.garcom_nome || ''}</span><small>{fmt(c.total)}</small></span></span>
                </button>
              ))}
              <button className="ms-mesa ret novo" disabled={busy} onClick={() => setAbrirRetirada(true)}>
                <span className="top"><b>+</b></span>
                <span className="bot"><strong>Nova retirada</strong></span>
              </button>
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
                  {ch.tipo === 'pedido' && ch.payload && (
                    <ul className="ms-qrl">
                      {ch.payload.itens.slice(0, 4).map((i, k) => <li key={k}>{i.qty}× {i.nome}</li>)}
                      {ch.payload.itens.length > 4 && <li>+ {ch.payload.itens.length - 4} item(ns)</li>}
                    </ul>
                  )}
                  <button className="ms-btn dark" disabled={busy} onClick={async () => {
                    pararSons()
                    if (ch.tipo === 'garcom') { await call('atender_chamado', { chamadoId: ch.id }); await load() }
                    else if (ch.tipo === 'pedido' && ch.payload) setPedidoQr(ch)
                    else {
                      // Pedido de conta: ao abrir a comanda o chamado já é dado como atendido (para de tocar e some da lista).
                      await call('atender_chamado', { chamadoId: ch.id }); await load()
                      if (c) setAbertaId(c.id)
                      else if (m) setAbrirMesa(m)
                    }
                  }}>{ch.tipo === 'garcom' ? `Atender mesa ${m?.numero}` : ch.tipo === 'conta' ? 'Abrir comanda' : `Ver pedido da mesa ${m?.numero}`}</button>
                  {ch.tipo !== 'pedido' && ch.tipo !== 'garcom' && <button className="ms-btn ghost" style={{ marginTop: 6, width: '100%' }} disabled={busy} onClick={async () => { await call('atender_chamado', { chamadoId: ch.id }); await load() }}>Já atendi (tirar da lista)</button>}
                </div>
              )
            })}
            <div className="ms-foot">Cada chamado toca um som e fica na tela até alguém atender.</div>
          </aside>
        </div>
      )}

      {msg && !comanda && !picker && !showConfig && <div className={`ms-toast ${msg.startsWith('🎁') ? 'ok' : ''}`} onClick={() => setMsg('')}>{msg}</div>}

      {abrirMesa && (
        <Modal onClose={() => { setAbrirMesa(null); setAbrirPessoas(null); setAbrirFone(''); setAbrirNome('') }} titulo={`Abrir mesa ${abrirMesa.numero}`}>
          <div className="ms-lbl">Quantas pessoas?</div>
          <div className="ms-pess">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <button key={n} type="button" className={abrirPessoas === n ? 'on' : ''} onClick={() => setAbrirPessoas(n)}>{n}</button>)}
            <input type="number" inputMode="numeric" min={1} max={60} placeholder="+" aria-label="Outra quantidade de pessoas"
              value={abrirPessoas && abrirPessoas > 8 ? abrirPessoas : ''} onChange={e => setAbrirPessoas(e.target.value ? Math.min(60, Math.max(1, Number(e.target.value))) : null)} />
          </div>
          <div className="ms-lbl">WhatsApp do cliente <span>(peça: ele ganha cashback e avisos)</span></div>
          <div className="ms-fone">
            <input type="tel" inputMode="tel" autoComplete="off" placeholder="(21) 99999-9999" value={abrirFone} onChange={e => setAbrirFone(e.target.value)} />
            <input type="text" autoComplete="off" placeholder="Nome (opcional)" value={abrirNome} onChange={e => setAbrirNome(e.target.value)} />
          </div>
          <p className="ms-p">Quem vai atender essa mesa? O nome fica travado até a conta fechar.</p>
          {garcons.filter(g => g.ativo).length === 0 && <div className="ms-note">Nenhum garçom cadastrado. Vá em “⚙️ Configurar” e cadastre.</div>}
          <div className="ms-garcons">
            {garcons.filter(g => g.ativo).map(g => <button key={g.id} className="ms-btn big" disabled={busy} onClick={() => abrirComanda(g.id)}>{g.nome}</button>)}
          </div>
          {msg && <div className="ms-err">{msg}</div>}
        </Modal>
      )}

      {abrirRetirada && (
        <RetiradaModal garcons={garcons.filter(g => g.ativo)} busy={busy} msg={msg} onClose={() => { setAbrirRetirada(false); setMsg('') }} onAbrir={abrirNovaRetirada} />
      )}

      {comanda && !picker && (
        <ComandaView
          key={comanda.id} c={comanda} mesa={mesaDe(comanda.mesa_id)} mesas={mesas} comandas={comandas} comandaDaMesa={comandaDaMesa}
          pedidos={pedidos.filter(p => p.comanda_id === comanda.id)} pagtos={pagtos.filter(p => p.comanda_id === comanda.id)}
          busy={busy} msg={msg} setMsg={setMsg} call={call} load={load} fotos={fotos}
          onClose={() => { setAbertaId(null); setMsg('') }} onAdd={() => setPicker(true)}
          imprimirConta={() => imprimirContaAgora(comanda)}
          imprimirProducao={(todas) => imprimirProducao(comanda, todas)}
          fechado={async () => { await imprimirContaAgora(comanda, false); setAbertaId(null); await load() }}
        />
      )}

      {comanda && picker && (
        <Picker produtos={produtos} categorias={categorias} alvo={comanda.tipo === 'retirada' ? `a retirada ${comanda.rotulo || '#' + comanda.numero}` : `à mesa ${mesaDe(comanda.mesa_id)?.numero ?? ''}`}
          onClose={() => setPicker(false)} busy={busy} msg={msg}
          onLancar={async (l, obs) => { const ok = await lancarRodada(l, obs); if (ok) setPicker(false); return ok }} />
      )}

      {calcLivre && <MesaCalculadora onClose={() => setCalcLivre(false)} />}

      {showVendas && companyId && (
        <VendasDiaPanel
          companyId={companyId}
          onClose={() => setShowVendas(false)}
          onMudou={load}
          onAbrirComanda={async (id) => { await load(); setAbertaId(id); setShowVendas(false) }}
        />
      )}

      {pedirCfgPin && (
        <ConfigPinModal busy={busy} msg={msg} call={call}
          onClose={() => { setPedirCfgPin(false); setMsg('') }}
          onOk={() => { setPedirCfgPin(false); setMsg(''); setShowConfig(true) }} />
      )}

      {pedidoQr && pedidoQr.payload && (
        <PedidoQrModal
          chamado={pedidoQr} payload={pedidoQr.payload} mesa={mesaDe(pedidoQr.mesa_id)} comanda={comandaDaMesa.get(pedidoQr.mesa_id) || null}
          garcons={garcons.filter(g => g.ativo)} busy={busy} msg={msg}
          onClose={() => { setPedidoQr(null); setMsg('') }}
          onAceitar={async (garcomId) => {
            const r = await call('pedido_aceitar', { chamadoId: pedidoQr.id, garcomId })
            if (!r) return
            await imprimir([buildKitchenTicket({
              pedidoShortId: `${r.mesaNumero ?? ''}-${r.orderNumber ?? ''}`, createdAt: new Date().toISOString(), deliveryType: 'balcao', rotulo: `MESA ${r.mesaNumero ?? ''} · ${r.garcomNome || ''} · PEDIDO DO CLIENTE`,
              items: (r.linhas || []).map((l: { qty: number; peso_kg: number | null; product_name: string; unit_price: number; selected_options: { name: string; price: number }[] }) => ({ qty: l.qty, pesoKg: l.peso_kg, name: l.product_name, unitPrice: l.unit_price, options: l.selected_options })), notes: r.obs || null,
            })], 'producao')
            if (r.pedidoId) await supabase.from('loja_pedidos').update({ impresso_em: new Date().toISOString() }).eq('id', r.pedidoId).is('impresso_em', null)
            setPedidoQr(null); setMsg(''); await load(); if (r.comandaId) setAbertaId(r.comandaId)
          }}
          onRecusar={async (motivo) => { const r = await call('pedido_recusar', { chamadoId: pedidoQr.id, motivo }); if (r) { setPedidoQr(null); setMsg(''); await load() } }}
        />
      )}

      {showConfig && (
        <Config
          companyId={companyId} nomeLoja={companyName} adminMode={adminMode} mesasEnabled={mesasEnabled} taxaPct={taxaPct} hasPin={hasPin} garcons={garcons} totalMesas={mesas.length}
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
function Modal({ titulo, onClose, children, wide, cfg }: { titulo: string; onClose: () => void; children: React.ReactNode; wide?: boolean; cfg?: boolean }) {
  return (
    <div className="ms-ov" onClick={onClose}>
      <div className={`ms-modal ${wide ? 'wide' : ''} ${cfg ? 'cfg' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="ms-mh"><h3>{titulo}</h3><button className="ms-x" onClick={onClose} aria-label="Fechar">✕</button></div>
        {children}
      </div>
    </div>
  )
}

// Nova retirada: quem atende + nome/identificação opcional do cliente.
function RetiradaModal({ garcons, busy, msg, onClose, onAbrir }: { garcons: Garcom[]; busy: boolean; msg: string; onClose: () => void; onAbrir: (garcomId: string, rotulo: string) => void }) {
  const [rotulo, setRotulo] = useState('')
  return (
    <Modal titulo="Nova retirada" onClose={onClose}>
      <p className="ms-p">Cliente que vai buscar o pedido. Não cobra taxa de serviço (dá para colocar depois, se precisar).</p>
      <label className="ms-lbl">Nome do cliente (opcional)<input className="ms-in" value={rotulo} maxLength={40} placeholder="Ex.: Maria" onChange={e => setRotulo(e.target.value)} /></label>
      <p className="ms-p">Quem está atendendo?</p>
      {garcons.length === 0 && <div className="ms-note">Nenhum garçom cadastrado. Vá em “⚙️ Configurar” e cadastre.</div>}
      <div className="ms-garcons">
        {garcons.map(g => <button key={g.id} className="ms-btn big" disabled={busy} onClick={() => onAbrir(g.id, rotulo)}>{g.nome}</button>)}
      </div>
      {msg && <div className="ms-err">{msg}</div>}
    </Modal>
  )
}


// Pede o PIN da supervisão antes de abrir as configurações das mesas.
function ConfigPinModal({ busy, msg, call, onClose, onOk }: { busy: boolean; msg: string; call: CallFn; onClose: () => void; onOk: () => void }) {
  const [val, setVal] = useState('')
  async function entrar() {
    const r = await call('config_abrir', { pin: val })
    if (r) onOk()
  }
  return (
    <Modal titulo="Configurações da mesa" onClose={onClose}>
      <p className="ms-p">Digite a senha de administrador (PIN da supervisão) para abrir as configurações.</p>
      <PinInput className="pin" autoFocus value={val} onChange={setVal} onEnter={() => { if (!busy && val.length >= 4) entrar() }} />
      {msg && <div className="ms-err">{msg}</div>}
      <button className="ms-btn big" disabled={busy || val.length < 4} onClick={entrar}>Abrir configurações</button>
    </Modal>
  )
}

// ================= Pedido do cliente (QR) =================
function PedidoQrModal({ chamado, payload, mesa, comanda, garcons, busy, msg, onClose, onAceitar, onRecusar }: {
  chamado: Chamado; payload: PedidoQr; mesa?: Mesa; comanda: Comanda | null; garcons: Garcom[]; busy: boolean; msg: string
  onClose: () => void; onAceitar: (garcomId?: string) => Promise<void>; onRecusar: (motivo: string) => Promise<void>
}) {
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const fora = !!comanda && !!chamado.comanda_id && chamado.comanda_id !== comanda.id
  return (
    <Modal titulo={`Pedido da mesa ${mesa?.numero ?? ''}`} onClose={onClose}>
      <p className="ms-p">{comanda ? `Conta aberta com ${comanda.garcom_nome || 'garçom'}. Ao aceitar, o pedido entra na comanda e vai para a cozinha.` : 'Mesa livre. Escolha quem atende: a conta é aberta e o pedido vai para a cozinha.'}</p>
      <ul className="ms-qrbox">
        {payload.itens.map((i, k) => (
          <li key={k}>
            <b>{i.qty}× {i.nome}</b>
            {i.modifiers.length > 0 && <small>{i.modifiers.map(m => m.name).join(', ')}</small>}
            {i.notes && <small>Obs.: {i.notes}</small>}
            <span>{fmt(i.unit * i.qty)}</span>
          </li>
        ))}
      </ul>
      {payload.obs && <div className="ms-note">Observação do cliente: {payload.obs}</div>}
      {payload.telefone && <div className="ms-note">WhatsApp informado: {payload.telefone.replace(/^55/, '')}</div>}
      <div className="ms-qrtot"><span>Total deste pedido</span><b>{fmt(payload.total)}</b></div>
      {fora && <div className="ms-err">Esse pedido era de uma conta que já fechou. Recuse e peça para o cliente ler o QR de novo.</div>}
      {!recusando && !fora && (comanda ? (
        <button className="ms-btn ok big" disabled={busy} onClick={() => onAceitar()}>Aceitar e enviar à cozinha</button>
      ) : (
        <>
          {garcons.length === 0 && <div className="ms-note">Nenhum garçom cadastrado. Vá em “⚙️ Configurar”.</div>}
          <div className="ms-garcons">
            {garcons.map(g => <button key={g.id} className="ms-btn big" disabled={busy} onClick={() => onAceitar(g.id)}>Aceitar · {g.nome}</button>)}
          </div>
        </>
      ))}
      {recusando ? (
        <div className="ms-row" style={{ marginTop: 10 }}>
          <input className="ms-in" autoFocus placeholder="Motivo (o cliente vê). Ex.: acabou o item" value={motivo} onChange={e => setMotivo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !busy) onRecusar(motivo.trim()) }} />
          <button className="ms-btn dark" disabled={busy} onClick={() => onRecusar(motivo.trim())}>Recusar pedido</button>
          <button className="ms-btn ghost" onClick={() => setRecusando(false)}>Voltar</button>
        </div>
      ) : (
        <button className="ms-btn ghost" style={{ marginTop: 10 }} disabled={busy} onClick={() => setRecusando(true)}>Recusar pedido</button>
      )}
      {msg && <div className="ms-err">{msg}</div>}
    </Modal>
  )
}

// ================= Comanda =================
function ComandaView(props: {
  c: Comanda; mesa?: Mesa; mesas: Mesa[]; comandas: Comanda[]; comandaDaMesa: Map<string, Comanda>
  pedidos: PedidoMesa[]; pagtos: Pagto[]; busy: boolean; msg: string; setMsg: (s: string) => void
  call: CallFn; load: () => Promise<void>; fotos: Record<string, string | null>
  onClose: () => void; onAdd: () => void; imprimirConta: () => void; imprimirProducao: (todas?: boolean) => Promise<void>; fechado: () => Promise<void>
}) {
  const { c, mesa, pedidos, pagtos, busy, msg, setMsg, call, load } = props
  const [pin, setPin] = useState<{ titulo: string; run: (pin: string) => Promise<Resp> } | null>(null)
  const [pinVal, setPinVal] = useState('')
  const [forma, setForma] = useState<FormaUi>('dinheiro')
  const [saldoCash, setSaldoCash] = useState(0)
  const [cashVerif, setCashVerif] = useState(false)
  const [valorDig, setValorDig] = useState('')
  const [pessoa, setPessoa] = useState('')
  // Divisão da conta em partes (pessoas): ao tocar em ÷2/÷3/÷4 aparecem N
  // botões com o valor certo de cada parte (a última absorve os centavos).
  // O garçom toca na parte, escolhe a forma, põe o nome e registra; a próxima
  // parte com saldo é selecionada sozinha. Se alguém sai ("Tirar parte"), a
  // conta do grupo é dividida de novo pelo novo número de pessoas e quem já
  // pagou só completa a diferença (ex.: R$ 100 em 4 de 25, uma já pagou 25 e
  // uma sai → 100 ÷ 3 = 33,33: quem pagou deve 8,33 e as outras 33,33).
  // Fica só na tela: os pagamentos já estão no servidor.
  // alvo[i] = quanto a pessoa i deve no total; pagos[i] = ids dos pagamentos dela.
  const [partes, setPartes] = useState<null | { alvo: number[]; pagos: string[][] }>(null)
  const [parteSel, setParteSel] = useState<number | null>(null)
  const pessoaRef = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState(false)
  const [calcAberta, setCalcAberta] = useState(false)
  // Divisão da calculadora (quem já pagou, nomes, itens por pessoa): guardada neste aparelho
  // por comanda, pra não se perder ao fechar a calculadora ou sair da comanda. Some ao fechar a conta.
  const chaveDiv = `mesas_divisao_${c.id}`
  const [divisao, setDivisao] = useState<Divisao>(() => {
    try { const s = localStorage.getItem(chaveDiv); return s ? { ...DIVISAO0, ...JSON.parse(s) } : DIVISAO0 } catch { return DIVISAO0 }
  })
  useEffect(() => {
    try {
      if (divisao === DIVISAO0 || JSON.stringify(divisao) === JSON.stringify(DIVISAO0)) localStorage.removeItem(chaveDiv)
      else localStorage.setItem(chaveDiv, JSON.stringify(divisao))
    } catch { /* sem armazenamento: segue só na tela */ }
  }, [chaveDiv, divisao])
  const limparDivisao = () => { try { localStorage.removeItem(chaveDiv) } catch { /* ok */ } }
  const [sub, setSub] = useState<null | 'transferir' | 'juntar' | 'desconto' | 'cliente'>(null)
  const [descVal, setDescVal] = useState('')
  const [descMotivo, setDescMotivo] = useState('')
  const [fone, setFone] = useState(c.customer_phone ? c.customer_phone.replace(/^55/, '') : '')

  // Saldo de cashback do cliente desta conta (só se a comanda tem WhatsApp e a loja usa cashback).
  const nPagtos = pagtos.length
  useEffect(() => {
    if (!c.customer_phone) return
    let vivo = true
    adminFetch('/api/mesas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: c.company_id, acao: 'cashback_saldo', comandaId: c.id }) })
      .then(r => r.json()).then(d => { if (vivo) { setSaldoCash(Number(d?.saldo) || 0); setCashVerif(!!d?.verificado) } }).catch(() => {})
    return () => { vivo = false }
  }, [c.id, c.company_id, c.customer_phone, nPagtos])
  const formasVisiveis = FORMAS.filter(f => f.key !== 'cashback' || (c.customer_phone && saldoCash > 0.004))

  const pago = r2(pagtos.reduce((s, p) => s + Number(p.valor), 0))
  const falta = Math.max(0, r2(c.total - pago))
  const ativos = pedidos.filter(p => p.status !== 'cancelado')
  const pendProd = ativos.filter(p => !p.impresso_em).length  // rodadas lançadas que ainda não saíram no papel da produção
  const rodadas = ativos.map((p, i) => ({ p, n: i + 1 })).reverse()   // mais recente primeiro
  const nItens = ativos.reduce((n, p) => n + p.itens.length, 0)
  const valorEf = valorDig ? moneyDigits(valorDig) : falta
  const pct = c.total > 0 ? Math.min(100, Math.round(pago / c.total * 100)) : 0
  const centavos = (v: number) => String(Math.round(v * 100))
  const calcComanda: CalcComanda = {
    titulo: `Mesa ${mesa?.numero ?? ''} · Comanda ${c.numero}`,
    consumo: c.subtotal, total: c.total, falta, pago, taxaPct: c.taxa_servico_pct, taxaAtiva: c.taxa_servico_ativa,
    itens: ativos.flatMap(p => p.itens).map(it => ({
      id: it.id, nome: it.product_name, qtd: it.peso_kg != null ? `${String(it.peso_kg).replace('.', ',')} kg` : `${it.qty}×`, total: r2(it.unit_price * it.qty),
    })),
  }
  // Pagamento feito de dentro da calculadora: registra na comanda e devolve o id
  // (a calculadora usa o id pra marcar a pessoa como paga). Null = deu erro.
  async function pagarDaCalculadora(valor: number, quem: string, formaPg: 'dinheiro' | 'debito' | 'credito' | 'pix'): Promise<string | null> {
    setMsg('')
    const r = await call('pagar', { comandaId: c.id, ...formaApi(formaPg), valor, pessoa: quem || null })
    if (!r) return null
    await load()
    return (r.pagamentoId as string) || null
  }
  const splitEq = (T: number, n: number) => {
    const base = Math.floor(T * 100 / n) / 100
    return Array.from({ length: n }, (_, i) => i < n - 1 ? base : r2(T - base * (n - 1)))
  }
  const pagoDe = (i: number) => r2((partes?.pagos[i] || []).reduce((t, id) => t + Number(pagtos.find(x => x.id === id)?.valor || 0), 0))
  const restaDe = (i: number) => partes ? Math.max(0, r2(partes.alvo[i] - pagoDe(i))) : 0
  const nomeDe = (i: number) => (partes?.pagos[i] || []).map(id => pagtos.find(x => x.id === id)?.pessoa).find(Boolean) || null
  function dividir(n: number) {
    if (partes?.alvo.length === n) { setPartes(null); setParteSel(null); setValorDig(''); return }
    const alvo = splitEq(falta, n)
    setPartes({ alvo, pagos: alvo.map(() => []) })
    setParteSel(0); setValorDig(centavos(alvo[0])); setPessoa('')
  }
  function escolherParte(i: number) {
    if (!partes) return
    setParteSel(i); setValorDig(centavos(restaDe(i))); setPessoa('')
    pessoaRef.current?.focus()
  }
  // Alguém não vai pagar: refaz a divisão do total do grupo por (N-1).
  function tirarParte(k: number) {
    if (!partes || partes.alvo.length <= 1 || (partes.pagos[k] || []).length > 0) return
    const T = r2(partes.alvo.reduce((t, v) => t + v, 0))
    const alvo = splitEq(T, partes.alvo.length - 1)
    const pagos = partes.pagos.filter((_, i) => i !== k)
    const novo = { alvo, pagos }
    setPartes(novo)
    const rest = (i: number) => Math.max(0, r2(alvo[i] - pagos[i].reduce((t, id) => t + Number(pagtos.find(x => x.id === id)?.valor || 0), 0)))
    const prox = alvo.findIndex((_, i) => rest(i) > 0.005)
    if (prox >= 0) { setParteSel(prox); setValorDig(centavos(rest(prox))) } else { setParteSel(null); setValorDig('') }
  }

  function pedirPin(titulo: string, run: (pin: string) => Promise<Resp>) { setPinVal(''); setMsg(''); setPin({ titulo, run }) }
  // Mesa zerada (sem pedido ativo): libera sem PIN.
  const [confLiberar, setConfLiberar] = useState(false)
  async function liberarMesa() {
    const r = await call('cancelar_comanda', { comandaId: c.id })
    setConfLiberar(false)
    if (r) { limparDivisao(); await load(); props.onClose() }
  }
  async function confirmarPin() {
    if (!pin || busy || pinVal.length < 4) return
    const r = await pin.run(pinVal)
    if (r) { setPin(null); setPinVal(''); await load() }
  }
  // "+" ao lado do item: lança mais uma unidade igual (mesmas opções) como uma nova rodada, que vai para a cozinha.
  async function maisUm(it: ItemPed) {
    if (!it.produto_id) return
    const r = await call('rodada', { comandaId: c.id, itens: [{ produtoId: it.produto_id, qty: 1, pesoKg: null, modifiers: it.selected_options || [] }] })
    if (r) await load()
  }

  async function fecharConta() {
    const r = await call('fechar', { comandaId: c.id }); if (r) { limparDivisao(); await props.fechado(); const cb = Number(r.cashbackGanho) || 0, qz = Number(r.premioQuiz) || 0; if (cb > 0 || qz > 0) props.setMsg(`🎁 Cliente ganhou ${fmt(cb + qz)} de cashback para o próximo pedido${qz > 0 ? ` (inclui ${fmt(qz)} do Quiz)` : ''}`) }
  }
  async function pagar() {
    const valor = valorEf
    // Cashback com o WhatsApp ainda não confirmado por código: só com o PIN da supervisão.
    if (forma === 'cashback' && !cashVerif) {
      pedirPin('Usar cashback sem confirmação do cliente', pin => call('pagar', { comandaId: c.id, ...formaApi(forma), valor, pessoa: pessoa.trim() || null, pin }).then(async r => { if (r) { setPessoa(''); setValorDig(''); await load() } return r }))
      return
    }
    const r = await call('pagar', { comandaId: c.id, ...formaApi(forma), valor, pessoa: pessoa.trim() || null })
    if (r) {
      setPessoa('')
      if (partes && parteSel !== null) {
        const pagos = partes.pagos.map((ids, i) => i === parteSel && r.pagamentoId ? [...ids, r.pagamentoId as string] : ids)
        setPartes({ ...partes, pagos })
        // saldo de cada pessoa já contando este pagamento (a lista do servidor ainda não recarregou)
        const resta = (i: number) => Math.max(0, r2(partes.alvo[i] - (pagoDe(i) + (i === parteSel ? valor : 0))))
        const ordem = partes.alvo.map((_, i) => (i + parteSel + 1) % partes.alvo.length)
        const prox = ordem.find(i => resta(i) > 0.005)
        if (prox !== undefined) { setParteSel(prox); setValorDig(centavos(resta(prox))) } else { setParteSel(null); setValorDig('') }
      } else setValorDig('')
      await load()
    }
  }

  const ST: Record<string, [string, string]> = { recebido: ['Na cozinha', 'wait'], em_preparo: ['Na cozinha', 'wait'], pronto: ['Pronto', 'ok'], saiu_entrega: ['Entregue', 'done'], entregue: ['Entregue', 'done'] }
  const X = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f4c47" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>

  return (
    <div className="ms-ov full">
      <div className="cm">
        <header className="cm-top">
          <button className="cm-hb" onClick={props.onClose}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg><span className="hide-s">Mesas</span></button>
          <div className="cm-title">{c.tipo === 'retirada' ? `Retirada${c.rotulo ? ' · ' + c.rotulo : ''}` : `Mesa ${mesa?.numero}`}</div>
          <div className="cm-meta">
            <div><span>Comanda</span><b>{c.numero}</b></div>
            <div><span>Garçom</span><b>{c.garcom_nome}</b></div>
            <div><span>Aberta há</span><b>{tempo(c.aberta_em)}</b></div>
            <div className="wa">
              {c.customer_phone
                ? <button onClick={() => setSub('cliente')}><span>WhatsApp</span><b>{formatFone(c.customer_phone)} ✓</b></button>
                : <button className="add" onClick={() => setSub('cliente')}>+ WhatsApp do cliente</button>}
            </div>
          </div>
          <button className="cm-hb calc" onClick={() => setCalcAberta(true)} aria-label="Calculadora"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#151210" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><rect x="8" y="6" width="8" height="3" /><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" /></svg><span className="hide-s">Calculadora</span></button>
          <button className="cm-hb hide-s" onClick={props.imprimirConta}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" /><rect x="7" y="14" width="10" height="6" /></svg>Imprimir conta</button>
          <div className="cm-menuwrap">
            <button className="cm-hb sq" aria-label="Mais ações" aria-expanded={menu} onClick={() => setMenu(m => !m)}><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg></button>
            {menu && (
              <>
                <div className="cm-scrim" onClick={() => setMenu(false)} />
                <div className="cm-menu">
                  <button className="show-s" onClick={() => { setMenu(false); props.imprimirConta() }}>Imprimir conta</button>
                  <button onClick={() => { setMenu(false); void props.imprimirProducao(true) }}>Reimprimir produção (tudo)</button>
                  <button onClick={() => { setMenu(false); setSub('transferir') }}>{c.tipo === 'retirada' ? 'Transformar em mesa' : 'Trocar de mesa'}</button>
                  <button onClick={() => { setMenu(false); setSub('juntar') }}>Juntar mesas</button>
                  <button className="danger" onClick={() => { setMenu(false); if (ativos.length === 0) { setConfLiberar(true); return } pedirPin('Cancelar comanda', pin => call('cancelar_comanda', { comandaId: c.id, pin }).then(async r => { if (r) { limparDivisao(); await load(); props.onClose() } return r })) }}>{ativos.length === 0 ? 'Liberar mesa' : 'Cancelar comanda'}</button>
                </div>
              </>
            )}
          </div>
        </header>

        <div className="cm-body">
          <main className="cm-main">
            <div className="cm-mini">
              <div className="r"><span>Total com serviço</span><b>{fmt(c.total)}</b></div>
              <div className="bar"><i style={{ width: pct + '%' }} /></div>
              <div className="r2"><span>Pago <b>{fmt(pago)}</b></span><span className={falta > 0 ? 'falta' : 'okk'}>{falta > 0 ? `Falta ${fmt(falta)}` : 'Pago'}</span></div>
            </div>

            <div className="cm-mhead">
              <div><h1>{c.tipo === 'retirada' ? 'Consumo da retirada' : 'Consumo da mesa'}</h1><span>{ativos.length === 0 ? 'Nenhum pedido lançado ainda' : `${ativos.length} ${ativos.length === 1 ? 'rodada' : 'rodadas'} · ${nItens} ${nItens === 1 ? 'item' : 'itens'} · mais recente primeiro`}</span></div>
              {ativos.length > 0 && (pendProd > 0
                ? <button className="cm-prod" disabled={busy} onClick={() => props.imprimirProducao(false)}>🖨️ Imprimir produção ({pendProd} {pendProd === 1 ? 'rodada' : 'rodadas'})</button>
                : <button className="cm-prod again" disabled={busy} onClick={() => props.imprimirProducao(true)}>🖨️ Imprimir produção de novo</button>)}
              {ativos.length > 0 && <button className="cm-add hide-s" onClick={props.onAdd}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#151210" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Adicionar itens</button>}
            </div>

            {ativos.length === 0 && (
              <div className="cm-empty">
                <div className="ic"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#151210" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3v8a2 2 0 0 0 2 2v8" /><path d="M11 3v8" /><path d="M5 3v6" /><path d="M17 3c-2 2-3 5-3 8h3v10" /></svg></div>
                <h2>Mesa aberta</h2>
                <p>Lance o primeiro pedido para a cozinha começar. Cada novo pedido vira uma rodada nesta mesma comanda.</p>
                <button className="cm-add big" onClick={props.onAdd}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#151210" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Adicionar itens</button>
                <small>O cliente também pode pedir pelo QR da mesa. O pedido dele aparece aqui para você confirmar.</small>
                <div className="cm-ou"><i /><span>ou</span><i /></div>
                <button className="cm-liberar" disabled={busy} onClick={() => setConfLiberar(true)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
                  <span className="t"><b>{c.tipo === 'retirada' ? 'Cancelar retirada' : 'Liberar mesa'}</b><em>{c.tipo === 'retirada' ? 'Cliente desistiu? A retirada sai da lista.' : 'Cliente desistiu? A mesa volta a ficar livre.'}</em></span>
                </button>
              </div>
            )}

            {rodadas.map(({ p, n }) => {
              const [rot, cls] = ST[p.status] || ['—', 'done']
              return (
                <section key={p.id} className="cm-rod">
                  <header><b>Rodada {n}</b><span>{new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><i /><em className={cls}>{rot}</em></header>
                  {p.itens.map(it => (
                    <div key={it.id} className="cm-it">
                      <Foto url={it.produto_id ? props.fotos[it.produto_id] : null} size={48} />
                      <div className="nm"><span>{it.product_name}</span>{it.selected_options?.length > 0 && <small>{it.selected_options.map(o => o.name).join(' · ')}</small>}</div>
                      <b className="qt">{it.peso_kg != null ? `${String(it.peso_kg).replace('.', ',')} kg` : `${it.qty}×`}</b>
                      <b className="vl">{fmt(it.unit_price * it.qty)}</b>
                      {it.peso_kg == null && it.produto_id
                        ? <button className="cm-sq plus" disabled={busy} aria-label={`Mais um ${it.product_name}`} title="Mais um (nova rodada)" onClick={() => maisUm(it)}>+</button>
                        : <span />}
                      <button className="cm-sq" aria-label={`Cancelar ${it.product_name} (pede o PIN)`} onClick={() => pedirPin(`Cancelar “${it.product_name}”`, pin => call('cancelar_item', { itemId: it.id, pin }))}>{X}</button>
                    </div>
                  ))}
                  {p.notes && <div className="cm-obs">Obs: {p.notes}</div>}
                </section>
              )
            })}
          </main>

          <aside className="cm-aside">
            <div className="cm-scroll">
              <h2>Conta</h2>
              <div className="cm-sum">
                <div><span>Consumo</span><b>{fmt(c.subtotal)}</b><i /></div>
                <div><span>Taxa de serviço {c.taxa_servico_pct}%</span><b>{c.taxa_servico_ativa ? fmt(c.taxa_valor) : 'retirada'}</b>
                  <button className="cm-mini-btn" disabled={busy} onClick={async () => { await call('taxa_toggle', { comandaId: c.id, ativa: !c.taxa_servico_ativa }); await load() }}>{c.taxa_servico_ativa ? 'Tirar' : 'Colocar'}</button></div>
                <div><span>Desconto{c.desconto_motivo ? ` (${c.desconto_motivo})` : ''}</span><b>{c.desconto > 0 ? `- ${fmt(c.desconto)}` : '—'}</b>
                  <button className="cm-mini-btn" onClick={() => setSub('desconto')}>{c.desconto > 0 ? 'Alterar' : 'Aplicar'}</button></div>
              </div>
              <div className="cm-total"><span>Total</span><b>{fmt(c.total)}</b></div>
              <div className="cm-prog">
                <div className="r"><span>Pago <b className="pg">{fmt(pago)}</b></span><span className={falta > 0 ? 'falta' : 'okk'}>{falta > 0 ? `Falta ${fmt(falta)}` : 'Conta paga ✓'}</span></div>
                <div className="bar"><i style={{ width: pct + '%' }} /></div>
              </div>

              {pagtos.length > 0 && (
                <div className="cm-pgs">
                  {pagtos.map(pg => (
                    <div key={pg.id} className="cm-pg">
                      <span className="ico" style={{ background: PAY_ICON[formaExibida(pg)]?.tint }}><PayIcon forma={formaExibida(pg)} size={17} /></span>
                      <span><b>{PAY_ICON[formaExibida(pg)]?.nome || pg.forma}</b>{pg.pessoa ? ` · ${pg.pessoa}` : ''}</span><b>{fmt(pg.valor)}</b>
                      <button className="cm-sq sm" aria-label="Remover pagamento (pede o PIN)" onClick={() => pedirPin('Remover pagamento', pin => call('remover_pagamento', { pagamentoId: pg.id, pin }).then(async r => { await load(); return r }))}>{X}</button>
                    </div>
                  ))}
                </div>
              )}

              {falta > 0.005 ? (
                <div className="cm-pay" id="ms-pagamento">
                  <h3 className="hide-s">Registrar pagamento</h3>
                  <div className="cm-seg" style={{ gridTemplateColumns: `repeat(${formasVisiveis.length}, minmax(0, 1fr))` }}>
                    {formasVisiveis.map(f => <button key={f.key} className={forma === f.key ? 'on' : ''} onClick={() => { setForma(f.key); if (f.key === 'cashback') { setPartes(null); setParteSel(null); setValorDig(centavos(Math.min(falta, saldoCash))) } }}><PayIcon forma={f.key} cor={forma === f.key ? '#151210' : undefined} />{PAY_ICON[f.key].nome}{f.key === 'cashback' ? ` ${fmt(saldoCash)}${cashVerif ? ' ✓' : ''}` : ''}</button>)}
                  </div>
                  <div className="cm-val"><span>R$</span>
                    <input aria-label="Valor a registrar" inputMode="numeric" value={valorDig ? moneyShow(valorDig) : moneyShow(String(Math.round(falta * 100)))}
                      onFocus={e => e.target.select()} onChange={e => setValorDig(e.target.value.replace(/\D/g, ''))} />
                  </div>
                  <div className="cm-quick one">
                    <button className={!partes && Math.abs(valorEf - falta) < 0.005 ? 'on' : ''} onClick={() => { setPartes(null); setParteSel(null); setValorDig(centavos(falta)) }}><em>Tudo</em><b>{moneyShow(centavos(falta))}</b></button>
                    {[2, 3, 4].map(n => (
                      <button key={n} className={`cm-gone ${partes?.alvo.length === n ? 'on' : ''}`} onClick={() => dividir(n)}><em>÷ {n}</em><b>{moneyShow(centavos(r2(falta / n)))}</b></button>
                    ))}
                  </div>
                  {partes && (
                    <div className="cm-parts cm-gone">
                      <div className="ph">
                        <span>Dividido em {partes.alvo.length} · toque em uma parte</span>
                        <div>
                          {parteSel !== null && partes.alvo.length > 1 && (partes.pagos[parteSel] || []).length === 0 && (
                            <button onClick={() => tirarParte(parteSel)}>Tirar parte {parteSel + 1}</button>
                          )}
                          <button onClick={() => { setPartes(null); setParteSel(null); setValorDig('') }}>Cancelar divisão</button>
                        </div>
                      </div>
                      <div className="pg" style={{ gridTemplateColumns: `repeat(${Math.min(partes.alvo.length, 4)},minmax(0,1fr))` }}>
                        {partes.alvo.map((_, i) => {
                          const resta = restaDe(i)
                          const jaPagou = pagoDe(i) > 0
                          const paga = jaPagou && resta <= 0.005
                          return (
                            <button key={i} className={`${paga ? 'paid' : ''} ${parteSel === i && !paga ? 'on' : ''}`} disabled={paga} onClick={() => escolherParte(i)}>
                              <em>{paga ? `✓ ${nomeDe(i) || 'Pago'}` : jaPagou ? `${nomeDe(i) || `Parte ${i + 1}`} · resta` : `Parte ${i + 1}`}</em><b>{moneyShow(centavos(paga ? pagoDe(i) : resta))}</b>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <input ref={pessoaRef} className="cm-who cm-gone" aria-label="Quem pagou (opcional)" placeholder="Quem pagou? (opcional)" value={pessoa} onChange={e => setPessoa(e.target.value)} />
                  <button className="cm-payfull" disabled={busy || !(valorEf > 0)} onClick={pagar}>Pagar · {fmt(valorEf)}</button>
                </div>
              ) : ativos.length === 0 ? (
                <div className="cm-hint">Os pagamentos aparecem aqui assim que houver consumo na mesa.</div>
              ) : (
                <div className="cm-hint ok">Tudo pago. Confira e feche a conta.</div>
              )}
              {msg && <div className="ms-err">{msg}</div>}
            </div>

            <div className="cm-foot hide-s" id="ms-fechar">
              <button className="cm-close" disabled={busy || falta > 0.005 || ativos.length === 0} onClick={fecharConta}>Fechar conta</button>
              <small>{ativos.length === 0 ? 'Adicione itens para poder fechar a conta.' : falta > 0.005 ? <>Falta <b>{fmt(falta)}</b> para poder fechar.</> : (c.tipo === 'retirada' ? 'Ao fechar, a retirada sai da lista.' : 'Ao fechar, a mesa fica livre para o próximo cliente.')}</small>
            </div>
          </aside>
        </div>

        <div className="cm-bar">
          <button className="cm-add" onClick={props.onAdd}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#151210" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Itens</button>
          <button className="cm-pagar" disabled={busy || (falta > 0.005 ? !(valorEf > 0) : ativos.length === 0)} onClick={falta > 0.005 ? pagar : fecharConta}>{falta > 0.005 ? `Pagar · ${fmt(valorEf)}` : 'Fechar conta'}</button>
        </div>
      </div>

      {calcAberta && (
        <MesaCalculadora comanda={calcComanda} onClose={() => setCalcAberta(false)}
          pagtos={pagtos.map(p => ({ id: p.id, valor: Number(p.valor), forma: formaExibida(p), pessoa: p.pessoa }))}
          divisao={divisao} setDivisao={setDivisao} erro={msg}
          onPagar={falta > 0.005 ? pagarDaCalculadora : undefined} />
      )}
      {confLiberar && (
        <ConfirmModal perigo titulo={c.tipo === 'retirada' ? 'Cancelar esta retirada?' : `Liberar a Mesa ${mesa?.numero}?`} mensagem={c.tipo === 'retirada' ? 'A retirada sai da lista. Nenhum pedido ou pagamento será perdido, pois não há nenhum.' : 'A mesa volta a ficar livre para o próximo cliente. Nenhum pedido ou pagamento será perdido, pois não há nenhum.'}
          confirmar={c.tipo === 'retirada' ? 'Cancelar retirada' : 'Liberar mesa'} ocupado={busy} onConfirm={liberarMesa} onCancel={() => setConfLiberar(false)} />
      )}
      {pin && (
        <Modal titulo={pin.titulo} onClose={() => setPin(null)}>
          <p className="ms-p">Digite o PIN da supervisão.</p>
          <PinInput className="pin" autoFocus value={pinVal} onChange={setPinVal} onEnter={confirmarPin} />
          {msg && <div className="ms-err">{msg}</div>}
          <button className="ms-btn big" disabled={busy || pinVal.length < 4} onClick={confirmarPin}>Confirmar</button>
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
        <Modal titulo={c.tipo === 'retirada' ? 'Transformar em mesa' : 'Trocar de mesa'} onClose={() => setSub(null)}>
          <p className="ms-p">{c.tipo === 'retirada' ? 'O cliente vai comer aqui? Escolha uma mesa livre. A taxa de serviço passa a valer (você ainda pode tirar).' : 'Escolha uma mesa livre.'}</p>
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
function Picker({ produtos, categorias, alvo, onClose, onLancar, busy, msg }: {
  produtos: Produto[]; categorias: { id: string; name: string }[]; alvo: string; busy: boolean; msg: string
  onClose: () => void; onLancar: (l: Linha[], obs: string) => Promise<boolean>
}) {
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [obs, setObs] = useState('')
  const seq = useRef(0)
  // Abre já com o cursor na busca (computador/tablet com teclado). No celular não foca sozinho, para o teclado não cobrir os produtos.
  const buscaRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (window.innerWidth > 1000) buscaRef.current?.focus() }, [])
  const valorDig = (d: string) => (d ? parseInt(d, 10) / 100 : 0)
  const [peso, setPeso] = useState<{ p: Produto; dig: string; modo: 'kg' | 'valor' } | null>(null)
  const [opc, setOpc] = useState<{ p: Produto; sel: number[][] } | null>(null)

  const lista = produtos.filter(p => (cat === 'all' || p.category_id === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
  const total = r2(linhas.reduce((s, l) => s + l.unit * (l.pesoKg != null ? 1 : l.qty), 0))

  function add(p: Produto, modifiers: { name: string; price: number }[] = [], pesoKg: number | null = null, valorFixo: number | null = null) {
    // Item adicionado: limpa a busca (e volta o cursor nela no computador) para já procurar o próximo.
    setQ('')
    if (window.innerWidth > 1000) setTimeout(() => buscaRef.current?.focus(), 0)
    const extra = modifiers.reduce((s, m) => s + m.price, 0)
    const unit = r2(precoDe(p) + extra)
    const key = p.id + '|' + modifiers.map(m => m.name).join(',') + (pesoKg != null ? '|' + (++seq.current) : '')
    setLinhas(prev => {
      const ex = pesoKg == null ? prev.find(l => l.key === key) : null
      if (ex) return prev.map(l => l.key === key ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, { key, produto: p, qty: 1, pesoKg, modifiers, unit: pesoKg != null ? (valorFixo != null ? r2(valorFixo) : r2(unit * pesoKg)) : unit }]
    })
  }
  function tocar(p: Produto) {
    if (PESO_REGEX.test(p.name)) { setPeso({ p, dig: '', modo: 'kg' }); return }
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
          <div className="t"><b>Adicionar {alvo}</b><small>Toque nos produtos e lance o pedido</small></div>
        </div>
        <div className="ms-picker">
          <div className="ms-pl">
            <input className="ms-in" placeholder="Buscar produto" value={q} onChange={e => setQ(e.target.value)} ref={buscaRef} />
            <div className="ms-cats">
              <button className={`ms-chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>Todos</button>
              {categorias.map(c => <button key={c.id} className={`ms-chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
            </div>
            <div className="ms-prods">
              {lista.map(p => (
                <button key={p.id} className="ms-prod" onClick={() => tocar(p)}>
                  <Foto url={p.photo_url} size={0} />
                  <span className="n">{p.name}</span>
                  <span className="p">{precoDe(p) < Number(p.sale_price) && <s style={{ opacity: .55, fontWeight: 400, marginRight: 6 }}>{fmt(Number(p.sale_price))}</s>}{PESO_REGEX.test(p.name) ? `${fmt(precoDe(p))}/kg` : fmt(precoDe(p))}</span>
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
              <button className="ms-btn ok big" disabled={busy || linhas.length === 0} onClick={async () => { await onLancar(linhas, obs) }}>{busy ? 'Lançando…' : 'Lançar pedido'}</button>
            </div>
          </div>
        </div>
      </div>

      {peso && (
        <Modal titulo={peso.p.name} onClose={() => setPeso(null)}>
          <p className="ms-p">Peixe pesado na peixaria ({fmt(Number(precoDe(peso.p)))}/kg)</p>
          <div className="ms-modo">
            <button className={peso.modo === 'kg' ? 'on' : ''} onClick={() => setPeso(s => s && ({ ...s, modo: 'kg', dig: '' }))}>Digitar o peso (kg)</button>
            <button className={peso.modo === 'valor' ? 'on' : ''} onClick={() => setPeso(s => s && ({ ...s, modo: 'valor', dig: '' }))}>Digitar o valor (R$)</button>
          </div>
          <div className="ms-peso">{peso.modo === 'kg' ? `${pesoDisplay(peso.dig) || '0,000'} kg` : fmt(valorDig(peso.dig))}</div>
          {peso.modo === 'valor' && (
            <p className="ms-p" style={{ textAlign: 'center' }}>{valorDig(peso.dig) > 0 && Number(precoDe(peso.p)) > 0 ? `≈ ${(valorDig(peso.dig) / Number(precoDe(peso.p))).toFixed(3).replace('.', ',')} kg` : 'Digite o valor do peixe já pesado'}</p>
          )}
          <div className="ms-keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => (
              <button key={k} onClick={() => setPeso(s => s && ({ ...s, dig: k === 'C' ? '' : k === '⌫' ? s.dig.slice(0, -1) : (s.dig + k).slice(0, 6) }))}>{k}</button>
            ))}
          </div>
          <button className="ms-btn ok big" disabled={peso.modo === 'kg' ? pesoNum(peso.dig) <= 0 : valorDig(peso.dig) <= 0 || !(Number(precoDe(peso.p)) > 0)} onClick={() => {
            if (peso.modo === 'kg') add(peso.p, [], pesoNum(peso.dig))
            else { const v = valorDig(peso.dig); add(peso.p, [], Math.round((v / Number(precoDe(peso.p))) * 1e6) / 1e6, v) }
            setPeso(null)
          }}>Adicionar</button>
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
function PinInput({ value, onChange, className = '', autoFocus, onEnter }: { value: string; onChange: (v: string) => void; className?: string; autoFocus?: boolean; onEnter?: () => void }) {
  const [nome] = useState(() => 'sup' + Math.random().toString(36).slice(2, 10))
  return (
    <input
      className={`ms-in ms-mask ${className}`} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus={autoFocus}
      name={nome} id={nome} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
      data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other"
      value={value} onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
      onKeyDown={e => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() } }}
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
function Config({ companyId, nomeLoja, adminMode, recarregar, mesasEnabled, taxaPct, hasPin, garcons, totalMesas, call, busy, msg, onClose }: {
  companyId: string; nomeLoja: string; adminMode: boolean; mesasEnabled: boolean; taxaPct: number; hasPin: boolean; garcons: Garcom[]; totalMesas: number
  call: CallFn; busy: boolean; msg: string; onClose: () => void; recarregar: () => Promise<void>
}) {
  const [taxa, setTaxa] = useState(String(taxaPct))
  const [pin, setPin] = useState('')
  const [pinAtual, setPinAtual] = useState('')
  const [pinGerado, setPinGerado] = useState('')
  const [editando, setEditando] = useState<null | { id: string; nome: string; pin: string }>(null)
  const [nome, setNome] = useState('')
  const [qtd, setQtd] = useState('5')
  const [ok, setOk] = useState('')
  const [qrPedir, setQrPedir] = useState(true)
  const [porMin, setPorMin] = useState('3')
  const lista = garcons

  // Colunas da Fase 2 lidas à parte: se o banco ainda não as tem, segue com o padrão.
  useEffect(() => {
    supabase.from('companies').select('mesas_qr_pedir, mesas_pedidos_por_minuto').eq('id', companyId).maybeSingle().then(({ data }) => {
      if (!data) return
      setQrPedir(data.mesas_qr_pedir !== false); setPorMin(String(data.mesas_pedidos_por_minuto || 3))
    })
  }, [companyId])

  async function salvarQr() {
    const r = await call('config_salvar', { qrPedir, pedidosPorMinuto: Number(porMin) })
    if (r) setOk('Salvo.')
  }

  // Logo no centro do QR: guardada no Storage em um caminho fixo da loja (sem coluna
  // nova no banco). Se não existir, o QR sai limpo, sem nada no meio.
  const logoPath = `${companyId}/qr-logo.png`
  const logoPublicUrl = supabase.storage.from('loja-produtos').getPublicUrl(logoPath).data.publicUrl
  const [logoVer, setLogoVer] = useState(0)
  const [logoTem, setLogoTem] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch(`${logoPublicUrl}?v=${logoVer}`, { method: 'HEAD', cache: 'no-store' }).then(r => { if (vivo) setLogoTem(r.ok) }).catch(() => { if (vivo) setLogoTem(false) })
    return () => { vivo = false }
  }, [logoPublicUrl, logoVer])

  async function enviarLogo(file: File) {
    try {
      const bmp = await createImageBitmap(file)
      const lado = 400
      const canvas = document.createElement('canvas'); canvas.width = lado; canvas.height = lado
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lado, lado)
      const k = Math.min(lado / bmp.width, lado / bmp.height)
      ctx.drawImage(bmp, (lado - bmp.width * k) / 2, (lado - bmp.height * k) / 2, bmp.width * k, bmp.height * k)
      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new Error('imagem inválida')
      const { error } = await supabase.storage.from('loja-produtos').upload(logoPath, blob, { upsert: true, contentType: 'image/png', cacheControl: '60' })
      if (error) throw new Error(error.message)
      setLogoVer(v => v + 1)
      setOk('Logo salva. Ela aparece no centro do QR na próxima impressão.')
    } catch (e: any) {
      setOk('Não deu pra enviar a logo: ' + (e?.message || 'erro desconhecido'))
    }
  }
  async function removerLogo() {
    await supabase.storage.from('loja-produtos').remove([logoPath])
    setLogoVer(v => v + 1)
    setOk('Logo removida do QR.')
  }
  async function logoDataUrl(): Promise<string | null> {
    try {
      const r = await fetch(`${logoPublicUrl}?v=${logoVer}`, { cache: 'no-store' })
      if (!r.ok) return null
      const blob = await r.blob()
      return await new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(blob) })
    } catch { return null }
  }

  // Folha de QR codes pra imprimir e plastificar: um cartão por mesa, o link leva
  // só à página daquela mesa (código aleatório, não dá acesso a conta nenhuma).
  // Layout em src/lib/mesaQrSheet.ts (4 cartões de 91 x 128 mm por folha A4).
  async function imprimirQrs() {
    const { data } = await supabase.from('loja_mesas').select('numero, qr_token').eq('company_id', companyId).eq('ativa', true).order('numero')
    if (!data || data.length === 0) { setOk('Crie as mesas primeiro.'); return }
    // Correção de erro 'H' (30%): aguenta a logo por cima sem deixar de ler.
    const cards = await Promise.all(data.map(async m => ({
      numero: m.numero as number,
      qrDataUrl: await QRCode.toDataURL(`${window.location.origin}/mesa/${m.qr_token}`, { width: 900, margin: 0, errorCorrectionLevel: 'H', color: { dark: '#151210', light: '#FFFFFF' } }),
    })))
    const logo = await logoDataUrl()
    const w = window.open('', '_blank')
    if (!w) { setOk('O navegador bloqueou a janela. Permita pop-ups e tente de novo.'); return }
    w.document.write(buildQrSheetHtml({ nomeLoja: nomeLoja.trim() || 'Nossa loja', cards, logoUrl: logo }))
    w.document.close()
  }

  async function salvarGeral() {
    const r = await call('config_salvar', { taxaPct: Number(taxa.replace(',', '.')), ...(pin ? { pin, pinAtual } : {}) })
    if (r) { setOk(pin ? 'Salvo. PIN novo definido.' : 'Salvo.'); setPin(''); setPinAtual(''); setPinGerado('') }
  }
  const [confZerar, setConfZerar] = useState(false)
  async function zerarPin() {
    const r = await call('pin_zerar', {})
    setConfZerar(false)
    if (r) { setPinGerado(String(r.pin)); setOk('') }
  }
  async function salvarNomeGarcom() {
    if (!editando) return
    const g = lista.find(x => x.id === editando.id)
    const r = await call('garcom_salvar', { id: editando.id, nome: editando.nome, ativo: g?.ativo !== false, pin: editando.pin })
    if (r) { await recarregar(); setEditando(null); setOk('Nome do garçom alterado.') }
  }
  return (
    <Modal titulo="Configurar mesas" onClose={onClose} wide cfg>
      {adminMode && (
        <div className="ms-adm">
          <label className="ms-sw"><input type="checkbox" checked={mesasEnabled} onChange={async e => { await call('config_salvar', { mesasEnabled: e.target.checked }); setOk(e.target.checked ? 'Módulo ligado.' : 'Módulo desligado.') }} /> Módulo de Mesas ligado nesta loja (só a Trindade Online)</label>
        </div>
      )}
      <div className="ms-cfgwrap">
        <div className="ms-cfgcol">
      <div className="ms-card">
        <h4>Taxa de serviço e PIN da supervisão</h4>
        <div className="ms-row">
          <label className="ms-lbl">Taxa de serviço (%)<input className="ms-in" inputMode="decimal" value={taxa} onChange={e => setTaxa(e.target.value)} /></label>
          {hasPin && !adminMode && <label className="ms-lbl">PIN atual<PinInput value={pinAtual} onChange={setPinAtual} onEnter={() => { if (!busy && !(pin && pinAtual.length < 4)) salvarGeral() }} /></label>}
          <label className="ms-lbl">{hasPin ? 'Novo PIN (4 a 6 números)' : 'Definir PIN (4 a 6 números)'}<PinInput value={pin} onChange={setPin} onEnter={() => { if (!busy && !(pin && hasPin && !adminMode && pinAtual.length < 4)) salvarGeral() }} /></label>
          <button className="ms-btn" disabled={busy || (!!pin && hasPin && !adminMode && pinAtual.length < 4)} onClick={salvarGeral}>Salvar</button>
        </div>
        <small>{hasPin ? (adminMode ? 'PIN definido. Como Trindade Online você pode trocar sem o PIN atual.' : 'PIN definido. Para trocar, digite o PIN atual e o novo. Esqueceu o PIN? Peça à Trindade Online para zerar.') : 'Sem PIN, ninguém consegue cancelar item, dar desconto ou cancelar comanda.'}</small>
        {adminMode && (
          <div className="ms-row" style={{ marginTop: 8 }}>
            <button className="ms-btn ghost" disabled={busy} onClick={() => setConfZerar(true)}>Zerar PIN e gerar novo</button>
          </div>
        )}
        {pinGerado && <div className="ms-okmsg">Novo PIN da loja: <b style={{ fontSize: 22, letterSpacing: '.15em' }}>{pinGerado}</b><br />Passe para a loja agora. Ele não aparece de novo (depois a loja pode trocar por um PIN dela).</div>}
      </div>
      <div className="ms-card">
        <h4>Garçons</h4>
        {lista.map(g => (
          editando?.id === g.id ? (
            <div key={g.id} className="ms-row">
              <input className="ms-in" aria-label="Novo nome do garçom" value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && !busy && editando.nome.trim() && (adminMode || editando.pin.length >= 4)) salvarNomeGarcom() }} />
              {!adminMode && <label className="ms-lbl">PIN da supervisão<PinInput value={editando.pin} onChange={v => setEditando({ ...editando, pin: v })} onEnter={() => { if (!busy && editando.nome.trim() && editando.pin.length >= 4) salvarNomeGarcom() }} /></label>}
              <button className="ms-btn" disabled={busy || !editando.nome.trim() || (!adminMode && editando.pin.length < 4)} onClick={salvarNomeGarcom}>Salvar</button>
              <button className="ms-btn ghost" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          ) : (
            <div key={g.id} className="ms-gl">
              <span style={{ opacity: g.ativo ? 1 : .5 }}>{g.nome}</span>
              <button className="ms-btn ghost" disabled={busy} onClick={() => { setOk(''); setEditando({ id: g.id, nome: g.nome, pin: '' }) }}>Editar nome</button>
              <button className="ms-btn ghost" disabled={busy} onClick={async () => { await call('garcom_salvar', { id: g.id, nome: g.nome, ativo: !g.ativo }); await recarregar() }}>{g.ativo ? 'Desativar' : 'Reativar'}</button>
            </div>
          )
        ))}
        <div className="ms-row">
          <input className="ms-in" placeholder="Nome do garçom" value={nome} onChange={e => setNome(e.target.value)} />
          <button className="ms-btn" disabled={busy || !nome.trim()} onClick={async () => { const r = await call('garcom_salvar', { nome }); if (r) { await recarregar(); setNome('') } }}>Adicionar</button>
        </div>
      </div>
        </div>
        <div className="ms-cfgcol">
      <div className="ms-card">
        <h4>Pedido pelo QR da mesa</h4>
        <label className="ms-sw"><input type="checkbox" checked={qrPedir} onChange={e => setQrPedir(e.target.checked)} /> O cliente pode montar o pedido pelo celular (o garçom sempre confirma antes de ir para a cozinha)</label>
        <div className="ms-row" style={{ marginTop: 8 }}>
          <label className="ms-lbl">Envios por minuto, por mesa<input className="ms-in sm" inputMode="numeric" value={porMin} onChange={e => setPorMin(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
          <button className="ms-btn" disabled={busy || !porMin} onClick={salvarQr}>Salvar</button>
          <button className="ms-btn ghost" disabled={busy} onClick={imprimirQrs}>🖨️ Imprimir QR das mesas</button>
        </div>
        <div className="ms-row" style={{ marginTop: 10, alignItems: 'center' }}>
          {logoTem && <img src={`${logoPublicUrl}?v=${logoVer}`} alt="Logo no QR" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 8, border: '1px solid #B9AE97', background: '#fff' }} />}
          <label className="ms-btn ghost" style={{ cursor: 'pointer' }}>
            {logoTem ? 'Trocar logo do QR' : 'Enviar logo pro centro do QR'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) enviarLogo(f); e.target.value = '' }} />
          </label>
          {logoTem && <button className="ms-btn ghost" onClick={removerLogo}>Remover logo</button>}
        </div>
        <small>O limite conta cada clique em “Enviar para o garçom” dentro de 1 minuto, não importa quantos itens tenha o pedido; fechar e abrir a página não zera. Padrão: 3. Peixe por peso nunca sai pelo QR: o cliente só chama o garçom.</small>
      </div>
      <div className="ms-card">
        <h4>Mesas ({totalMesas} cadastradas)</h4>
        <div className="ms-row">
          <input className="ms-in sm" inputMode="numeric" value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))} />
          <button className="ms-btn" disabled={busy || !qtd} onClick={async () => { const r = await call('mesas_acrescentar', { qtd: Number(qtd) }); if (r) { await recarregar(); setOk(`Mesas ${r.de} a ${r.ate} criadas.`) } }}>+ Acrescentar mesas</button>
          <button className="ms-btn ghost" disabled={busy || !qtd || Number(qtd) > totalMesas} onClick={async () => {
            const n = Number(qtd)
            const { data } = await supabase.from('loja_mesas').select('numero').eq('company_id', companyId).eq('ativa', true).order('numero', { ascending: false }).limit(n)
            const nums = (data || []).map(m => m.numero).sort((x, y) => x - y)
            if (nums.length === 0) return
            const faixa = nums.length === 1 ? `a mesa ${nums[0]}` : `as mesas ${nums[0]} a ${nums[nums.length - 1]}`
            if (!window.confirm(`Tirar ${faixa}?\n\nElas saem da tela e os QR codes delas param de abrir. O histórico das contas continua guardado.`)) return
            const r = await call('mesas_remover', { qtd: n })
            if (r) { await recarregar(); setOk(`Mesas ${r.de} a ${r.ate} removidas. Restam ${r.restam}.`) }
          }}>− Tirar mesas</button>
        </div>
        <small>A quantidade vale para os dois botões. Ex.: acrescentar 5 depois da mesa 20 cria de 21 a 25; tirar 5 remove as últimas 5, de trás para frente (mesa com conta aberta não sai).</small>
      </div>
        </div>
      </div>
      {(msg || ok) && <div className={msg ? 'ms-err' : 'ms-okmsg'}>{msg || ok}</div>}
      {confZerar && (
        <ConfirmModal perigo titulo="Zerar o PIN desta loja?" mensagem="Vamos gerar um PIN novo. O PIN antigo deixa de funcionar na hora, e o novo aparece uma única vez para você passar à loja."
          confirmar="Zerar e gerar novo" ocupado={busy} onConfirm={zerarPin} onCancel={() => setConfZerar(false)} />
      )}
    </Modal>
  )
}

const CSS = `
.cm{width:100%;height:100vh;height:100dvh;display:flex;flex-direction:column;background:#E9EAE5}
.cm-top{flex:none;min-height:72px;background:#151210;color:#fff;display:flex;align-items:center;gap:14px;padding:8px 20px;position:relative}
.cm-hb{display:flex;align-items:center;gap:8px;background:transparent;color:#fff;border:1px solid #4a423a;border-radius:8px;padding:0 14px;height:44px;font-weight:600;font-size:14px;flex:none}
.cm-hb.calc{background:#FFC531;color:#151210;border:2px solid #151210;font-weight:700}
.ms-top .ms-btn.calc{background:#FFC531;color:#151210;border:2px solid #151210;display:flex;align-items:center;gap:8px}
.cm-hb.sq{width:44px;padding:0;justify-content:center}
.cm-ou{display:flex;align-items:center;gap:12px;width:100%;max-width:360px;margin-top:6px}.cm-ou i{flex:1;height:1px;background:#DCDDD6}.cm-ou span{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6F6C67;font-weight:700}
.cm-liberar{display:flex;align-items:center;gap:12px;width:100%;max-width:360px;min-height:60px;padding:8px 18px;border:1.5px solid #D9A39C;border-radius:10px;background:#fff;color:#B3261A;font-family:inherit;cursor:pointer;text-align:left}
.cm-liberar:hover{background:#FDF3F1;border-color:#B3261A}.cm-liberar:disabled{opacity:.5;cursor:not-allowed}
.cm-liberar .t{display:flex;flex-direction:column;gap:1px;min-width:0}.cm-liberar b{font-size:15.5px;font-weight:700}.cm-liberar em{font-style:normal;font-size:12.5px;color:#6F6C67;line-height:1.3}
.cm-title{font-family:'Anton',sans-serif;font-size:34px;line-height:1;text-transform:uppercase;letter-spacing:.02em;padding-right:6px;flex:none}
.cm-meta{display:flex;flex:1;min-width:0;overflow:hidden}
.cm-meta>div{display:flex;flex-direction:column;gap:2px;padding:0 16px;border-left:1px solid #3a342d;justify-content:center;flex:none}
.cm-meta span{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#B9B3A8}
.cm-meta b{font-size:14px;font-weight:600;color:#fff;white-space:nowrap}
.cm-meta .wa button{background:transparent;border:0;color:#fff;text-align:left;padding:0;display:flex;flex-direction:column;gap:2px}
.cm-meta .wa button.add{height:34px;padding:0 12px;border:1px dashed #8a7f72;border-radius:6px;color:#E9EAE5;font-weight:600;font-size:12.5px;display:block}
.cm-menuwrap{position:relative;flex:none}
.cm-scrim{position:fixed;inset:0;z-index:80}
.cm-menu{position:absolute;right:0;top:52px;z-index:81;background:#fff;color:#151210;border:1px solid #DCDDD6;border-radius:10px;box-shadow:0 10px 30px rgba(21,18,16,.25);min-width:220px;padding:6px;display:flex;flex-direction:column}
.cm-menu button{background:transparent;border:0;text-align:left;padding:0 14px;height:46px;border-radius:6px;font-weight:600;font-size:14.5px;color:#151210}
.cm-menu button:hover{background:#F5F6F2}.cm-menu .danger{color:#B3261A;border-top:1px solid #ECEDE8;border-radius:0 0 6px 6px;margin-top:4px}
.cm-body{flex:1;min-height:0;width:100%;max-width:1560px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) 420px}
.cm-main{min-width:0;overflow-y:auto;padding:24px 28px;display:flex;flex-direction:column;gap:14px}
.cm-mini{display:none}
.cm-mhead{display:flex;align-items:center;gap:12px 16px;flex-wrap:wrap}
.cm-mhead>div{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:2px}
.cm-mhead h1{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:30px;text-transform:uppercase;line-height:1.05}
.cm-mhead span{font-size:13px;color:#4f4c47}
.cm-prod{display:flex;align-items:center;justify-content:center;gap:8px;background:#151210;color:#FFC531;border:2px solid #FFC531;border-radius:10px;padding:0 18px;height:52px;font-weight:800;font-size:15px;flex:none;cursor:pointer;animation:cmprod 1.6s ease-in-out infinite}
.cm-prod:disabled{opacity:.5;animation:none}
.cm-prod.again{animation:none;background:#fff;color:#151210;border-color:#151210}
@keyframes cmprod{0%,100%{box-shadow:0 0 0 0 rgba(255,197,49,.55)}50%{box-shadow:0 0 0 8px rgba(255,197,49,0)}}
@media(max-width:700px){.cm-mhead{flex-wrap:wrap}.cm-prod{width:100%}}
.cm-add{display:flex;align-items:center;justify-content:center;gap:10px;background:#FFC531;color:#151210;border:0;border-radius:10px;padding:0 22px;height:52px;font-weight:700;font-size:16px;flex:none}
.cm-add.big{height:60px;padding:0 32px;font-size:18px}
.cm-empty{background:#fff;border:2px dashed #b9bab2;border-radius:12px;display:flex;flex-direction:column;align-items:center;gap:16px;padding:44px 28px;text-align:center}
.cm-empty .ic{width:80px;height:80px;border-radius:12px;background:#FFF3C9;display:flex;align-items:center;justify-content:center}
.cm-empty h2{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:30px;text-transform:uppercase;line-height:1.05}
.cm-empty p{margin:0;font-size:15px;line-height:1.5;color:#3d3a36;max-width:440px}.cm-empty small{font-size:13px;color:#4f4c47;max-width:420px;line-height:1.45}
.cm-rod{background:#fff;border:1px solid #DCDDD6;border-radius:10px;overflow:hidden;flex:none}
.cm-rod>header{display:flex;align-items:center;gap:10px;padding:8px 16px;background:#F5F6F2}
.cm-rod>header b{font-size:13px;letter-spacing:.04em;text-transform:uppercase}.cm-rod>header span{font-size:13px;color:#4f4c47}.cm-rod>header i{flex:1}
.cm-rod>header em{font-style:normal;border-radius:4px;padding:4px 8px;font-weight:700;font-size:11px;letter-spacing:.05em;text-transform:uppercase}
.cm-rod em.wait{background:#FFF3C9;color:#5C3F00}.cm-rod em.ok{background:#DDF1E7;color:#0B5B38}.cm-rod em.done{background:#ECEDE8;color:#3d3a36}
.cm-it{display:grid;grid-template-columns:48px minmax(0,1fr) 78px 100px 40px 40px;align-items:center;gap:14px;padding:10px 16px;border-top:1px solid #ECEDE8}
.cm-it .nm{min-width:0;display:flex;flex-direction:column;gap:2px}.cm-it .nm span{font-weight:600;font-size:15px}.cm-it .nm small{font-size:12.5px;color:#4f4c47}
.cm-it .qt{text-align:right;font-size:14px;font-variant-numeric:tabular-nums}.cm-it .vl{text-align:right;font-size:15px;font-variant-numeric:tabular-nums}
.cm-obs{padding:8px 16px;border-top:1px solid #ECEDE8;font-size:12.5px;color:#4f4c47}
.cm-sq{width:40px;height:40px;border:1px solid #DCDDD6;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0}
.cm-sq.sm{width:36px;height:36px;border:0;background:transparent}
.cm-sq.plus{background:#FFC531;border-color:#FFC531;color:#151210;font-size:26px;font-weight:700;line-height:1}
.cm-sq.plus:disabled{opacity:.5}
.cm-aside{min-height:0;display:flex;flex-direction:column;background:#fff;border-left:1px solid #DCDDD6}
.cm-scroll{flex:1;min-height:0;overflow-y:auto;padding:22px 24px;display:flex;flex-direction:column;gap:14px}
.cm-scroll h2{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:24px;text-transform:uppercase;line-height:1}
.cm-sum>div{display:grid;grid-template-columns:minmax(0,1fr) auto 84px;align-items:center;gap:10px;min-height:38px;font-size:14px}
.cm-sum b{font-variant-numeric:tabular-nums;text-align:right}.cm-sum .cm-mini-btn{justify-self:end}
.cm-mini-btn{height:30px;padding:0 10px;border:1px solid #b9bab2;background:#fff;border-radius:6px;font-weight:600;font-size:12.5px;color:#151210}
.cm-total{display:flex;justify-content:space-between;align-items:center;background:#FFF6D6;border:1px solid #EBD27C;border-radius:10px;padding:12px 16px}
.cm-total span{font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5C3F00}
.cm-total b{font-family:'Anton',sans-serif;font-weight:400;font-size:42px;line-height:1;font-variant-numeric:tabular-nums}
.cm-prog .r,.cm-mini .r2{display:flex;justify-content:space-between;align-items:baseline;font-size:13.5px;margin-bottom:8px}
.cm-prog .r b,.cm-mini .r2 b{font-variant-numeric:tabular-nums}
.falta{color:#B3261A;font-weight:700;font-size:15px;font-variant-numeric:tabular-nums}.okk{color:#0B7347;font-weight:700;font-size:15px}
.cm-prog .bar,.cm-mini .bar{height:8px;background:#E9EAE5;border-radius:4px;overflow:hidden}.cm-prog .bar i,.cm-mini .bar i{display:block;height:100%;background:#0B7347}
.cm-pgs{display:flex;flex-direction:column;gap:6px}
.cm-pg{display:grid;grid-template-columns:30px minmax(0,1fr) auto 36px;align-items:center;gap:10px;background:#F5F6F2;border-radius:8px;padding:4px 4px 4px 8px;min-height:44px;font-size:14px}
.cm-pg .ico{width:30px;height:30px;border-radius:6px;display:flex;align-items:center;justify-content:center}
.cm-prog .r b.pg,.cm-mini .r2 b.pg{color:#0B5B38}
.cm-pay{display:flex;flex-direction:column;gap:10px;border-top:1px solid #DCDDD6;padding-top:14px}
.cm-pay h3{margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#4f4c47}
.cm-seg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.cm-seg button{height:46px;border:1px solid #b9bab2;border-radius:6px;background:#fff;color:#151210;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;min-width:0}
.cm-seg button.on{background:#FFC531;border:2px solid #151210;font-weight:700}
.cm-val{display:flex;align-items:center;gap:8px;border:2px solid #151210;border-radius:8px;height:54px;padding:0 14px;background:#fff;min-width:0}
.cm-val span{color:#4f4c47;font-size:16px;font-weight:600;flex:none}
.cm-val input{flex:1;min-width:0;width:100%;border:0;outline:0;font-family:'Anton',sans-serif;font-size:28px;background:transparent;color:#151210;font-variant-numeric:tabular-nums}
.cm-quick{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.cm-quick.one{grid-template-columns:minmax(0,1fr)}
.cm-quick button{height:46px;border:1px solid #b9bab2;border-radius:6px;background:#fff;color:#151210;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:0}
.cm-quick button em{font-style:normal;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#4f4c47}.cm-quick button b{font-size:13px;font-variant-numeric:tabular-nums}
.cm-quick button.on{background:#FFF6D6;border:2px solid #151210}
.cm-parts{background:#F5F6F2;border:1px solid #DCDDD6;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px}
.cm-parts .ph{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#4f4c47;font-weight:700}
.cm-parts .ph>div{display:flex;gap:4px;flex:none}
.cm-parts .ph button{background:transparent;border:0;text-decoration:underline;font-size:12px;font-weight:600;color:#4f4c47;text-transform:none;letter-spacing:0;padding:4px}
.cm-parts .pg{display:grid;gap:6px}
.cm-parts .pg button{height:46px;border:1px solid #b9bab2;border-radius:6px;background:#fff;color:#151210;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:0;padding:0 4px}
.cm-parts .pg button em{font-style:normal;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#4f4c47;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-parts .pg button b{font-size:13px;font-variant-numeric:tabular-nums}
.cm-parts .pg button.on{background:#FFF6D6;border:2px solid #151210}
.cm-parts .pg button.paid{background:#DDF1E7;border-color:#8FCFB0;color:#0B5B38;cursor:default}.cm-parts .pg button.paid em{color:#0B5B38}
.cm-who{border:1px solid #b9bab2;border-radius:8px;height:42px;padding:0 14px;font-size:14px;background:#fff;color:#151210;min-width:0;width:100%}
.cm-reg{height:50px;border:0;border-radius:10px;background:#2A4E7A;color:#fff;font-weight:700;font-size:16px}.cm-reg:disabled{opacity:.45}
.cm-hint{background:#F5F6F2;border-radius:8px;padding:14px 16px;font-size:13.5px;line-height:1.45;color:#3d3a36}
.cm-hint.ok{background:#DDF1E7;color:#0B5B38;font-weight:600}
.cm-foot{flex:none;padding:14px 24px 20px;border-top:1px solid #DCDDD6;background:#F5F6F2;display:flex;flex-direction:column;gap:8px}
.cm-close{height:56px;border:0;border-radius:10px;background:#0B7347;color:#fff;font-weight:700;font-size:17px}
.cm-close:disabled{background:#DCDDD6;color:#4f4c47;cursor:not-allowed}
.cm-foot small{text-align:center;font-size:13px;color:#4f4c47}
.cm-bar{display:none}
.show-s{display:none}
/* Divisão e "quem pagou" ficam só na Calculadora (celular e computador iguais). No computador o pagamento é o botão Pagar; no celular, o da barra de baixo. */
.cm-gone{display:none!important}
.cm-payfull{height:56px;border:0;border-radius:10px;background:#2A4E7A;color:#fff;font-weight:800;font-size:17px;cursor:pointer}
.cm-payfull:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:1000px){
  .cm-top{padding:10px 14px;gap:10px;min-height:64px}.cm-title{font-size:26px}
  .cm-meta>div:not(.wa):nth-child(n+3){display:none}.cm-meta>div{padding:0 10px}
  .hide-s{display:none!important}.show-s{display:block!important}.cm-payfull{display:none}
  .cm-body{display:flex;flex-direction:column;overflow-y:auto;max-width:none}
  .cm-main{flex:none;overflow:visible;padding:14px}.cm-aside{flex:none;min-height:auto;overflow:visible;border-left:0;border-top:1px solid #DCDDD6}
  .cm-scroll{flex:none;min-height:auto;overflow:visible;padding:18px 14px calc(110px + env(safe-area-inset-bottom))}.cm-foot{flex:none;padding:14px 14px calc(110px + env(safe-area-inset-bottom))}
  .cm-total{padding:10px 14px}.cm-total b{font-size:34px}.cm-sum>div{grid-template-columns:minmax(0,1fr) auto 78px}
  .cm-mini{display:block;background:#fff;border:1px solid #DCDDD6;border-radius:10px;padding:14px 16px}
  .cm-mini .r{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
  .cm-mini .r span{font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4f4c47}
  .cm-mini .r b{font-family:'Anton',sans-serif;font-weight:400;font-size:32px;line-height:1;font-variant-numeric:tabular-nums}
  .cm-mini .r2{margin:8px 0 0}
  .cm-mhead h1{font-size:22px}.cm-it{grid-template-columns:44px minmax(0,1fr) auto 36px 36px;gap:8px;padding:8px 12px}.cm-it .qt{display:none}.cm-it .nm span{font-size:14px}.cm-it .vl{font-size:14px}
  .cm-sq{width:36px;height:36px}
  .cm-bar{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:10px;position:fixed;left:0;right:0;bottom:0;z-index:55;background:#fff;border-top:1px solid #DCDDD6;padding:12px 14px calc(14px + env(safe-area-inset-bottom))}
  .cm-bar .cm-add{height:54px;padding:0}.cm-pagar:disabled{opacity:.45}.cm-pagar{background:#2A4E7A;color:#fff;border:0;border-radius:10px;height:54px;font-weight:700;font-size:16px}
}
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
.ms-rethead{margin-top:18px}
.ms-mesa.ret{background:#fff;border:2px solid #151210}.ms-mesa.ret .top b{font-size:26px;word-break:break-word}
.ms-mesa.ret.novo{background:transparent;border:2px dashed #8a8678;color:#4f4c47;align-items:center;justify-content:center}
.ms-mesa.ret.novo .top b{font-size:34px}.ms-mesa.ret.novo .bot{align-items:center}
.ms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.ms-mesa{border:2px solid #b9bab2;background:#fff;color:#151210;border-radius:10px;padding:10px 14px;min-height:112px;cursor:pointer;text-align:left;display:flex;flex-direction:column;justify-content:space-between;gap:6px}
.ms-mesa .top{display:flex;justify-content:space-between;align-items:baseline}
.ms-mesa .top b{font-family:'Anton',sans-serif;font-size:34px;line-height:1;font-weight:400}
.ms-mesa .top em{font-style:normal;font-size:12px;font-weight:600;opacity:.85}
.ms-mesa .bot{display:flex;flex-direction:column;gap:2px}
.ms-mesa .bot strong{font-size:12.5px}
.ms-mesa .bot small{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.ms-mesa .bot .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;min-height:18px}.ms-mesa .bot .who{font-size:12px;opacity:.8;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
.ms-qrl{list-style:none;margin:0;padding:0;font-size:13px;color:#3d3a36;display:flex;flex-direction:column;gap:2px}
.ms-qrbox{list-style:none;margin:10px 0;padding:0;border:1px solid #DCDDD6;border-radius:10px;background:#fff}
.ms-qrbox li{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:10px 12px;border-bottom:1px solid #ECEDE8}.ms-qrbox li:last-child{border-bottom:0}
.ms-qrbox li b{font-size:15px}.ms-qrbox li small{grid-column:1;color:#6F6C67;font-size:12.5px}.ms-qrbox li span{grid-row:1;grid-column:2;font-variant-numeric:tabular-nums;font-weight:600}
.ms-qrtot{display:flex;justify-content:space-between;align-items:baseline;margin:10px 0 12px}.ms-qrtot b{font-family:'Anton',sans-serif;font-weight:400;font-size:30px}
.ms-chamado small{color:#6F6C67;font-size:12px}.ms-chamado p{margin:0;font-size:13px;color:#3d3a36}
.ms-foot{margin-top:auto;font-size:12px;color:#4f4c47;border-top:1px solid #DCDDD6;padding-top:10px}
.ms-note{font-size:13px;color:#4f4c47;background:#fff;border:1px dashed #b9bab2;border-radius:10px;padding:12px}
.ms-empty{max-width:520px;margin:60px auto;padding:0 20px;text-align:center}
.ms-empty h2{font-family:'Anton',sans-serif;text-transform:uppercase;font-weight:400;font-size:28px}
.ms-toast.ok{background:#0B7347}
.ms-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#D6392B;color:#fff;padding:12px 18px;border-radius:10px;font-weight:600;z-index:90}
.ms-ov{position:fixed;inset:0;background:rgba(21,18,16,.55);display:flex;align-items:center;justify-content:center;padding:16px;z-index:60;overflow:auto}
.ms-ov.full{background:#E9EAE5;padding:0;align-items:stretch;justify-content:stretch;z-index:50}
.ms-modal{background:#fff;border-radius:16px;padding:18px;width:min(440px,100%);max-height:92vh;overflow:auto;display:flex;flex-direction:column;gap:12px;z-index:70}
.ms-modal.wide{width:min(640px,100%)}
.ms-mh{display:flex;justify-content:space-between;align-items:center}.ms-mh h3{margin:0;font-family:'Anton',sans-serif;font-weight:400;font-size:22px;text-transform:uppercase}
.ms-x{background:#F5F6F2;border:0;border-radius:8px;width:44px;height:44px;font-size:16px}.ms-x.sm{width:36px;height:36px;font-size:13px}
.ms-p{margin:0;color:#3d3a36}
.ms-lbl{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#4f4c47;margin:4px 0 6px}
.ms-lbl span{text-transform:none;letter-spacing:0;font-weight:600;color:#6F6C67}
.ms-pess{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:6px;margin-bottom:10px}
.ms-pess button,.ms-pess input{height:46px;border-radius:8px;border:1px solid #DCDDD6;background:#fff;font-weight:800;font-size:16px;font-family:inherit;text-align:center;min-width:0;color:#151210}
.ms-pess button.on{background:#FFC531;border-color:#151210}
.ms-fone{display:grid;grid-template-columns:1.3fr 1fr;gap:8px;margin-bottom:12px}
.ms-fone input{height:46px;border-radius:8px;border:1px solid #DCDDD6;padding:0 12px;font-size:15px;font-family:inherit;min-width:0}
@media(max-width:520px){.ms-pess{grid-template-columns:repeat(5,minmax(0,1fr))}.ms-fone{grid-template-columns:1fr}}
.ms-garcons,.ms-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.ms-in{border:2px solid #151210;border-radius:10px;padding:10px 12px;font-size:16px;min-height:46px;background:#fff;color:#151210;width:100%;font-family:inherit}
.ms-in.sm{width:90px}.ms-in.pin{text-align:center;letter-spacing:.5em;font-size:24px}
.ms-err{background:#FDECEA;color:#9B2318;border-radius:8px;padding:10px 12px;font-weight:600}
.ms-okmsg{background:#E3F4EB;color:#0B5B38;border-radius:8px;padding:10px 12px;font-weight:600}
.ms-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}.ms-row.end{justify-content:flex-end;margin-top:6px}
.ms-chip{background:#fff;border:1px solid #b9bab2;border-radius:8px;padding:10px 16px;cursor:pointer;font-weight:600;min-height:44px;white-space:nowrap}
.ms-chip.on{background:#FFC531;color:#151210;border:2px solid #151210;font-weight:700}.ms-chip.block{border-radius:10px;width:100%;text-align:left;margin-top:6px}
.ms-cmd{width:100%;display:flex;flex-direction:column;min-height:100vh}
.ms-cmdhead{display:flex;align-items:center;gap:12px;padding:12px 18px;background:#151210;color:#fff;flex-wrap:wrap}
.ms-cmdhead .ms-btn.ghost{background:transparent;color:#fff;border-color:#4a423a}
.ms-cmdhead .t{flex:1;display:flex;flex-direction:column}.ms-cmdhead .t b{font-family:'Anton',sans-serif;font-weight:400;font-size:24px;text-transform:uppercase}.ms-cmdhead .t small{color:#E9EAE5}
.ms-cmdbody{display:flex;gap:16px;padding:16px;flex-wrap:wrap;align-items:flex-start}
.ms-col{flex:1.2;min-width:300px;display:flex;flex-direction:column;gap:10px}.ms-col.narrow{flex:1;min-width:340px;background:#fff;border-radius:14px;padding:16px}
.ms-col h4,.ms-cfg h4,.ms-card h4,.ms-cart h4{margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6F6C67}
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
.ms-prod{background:#fff;border:1px solid #b9bab2;border-radius:10px;padding:10px;text-align:left;min-height:74px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;gap:6px}
.ms-prod .n{font-weight:700;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.5em}
.ms-prod:active{background:#FFF6D6;border-color:#151210}
.ms-mask{-webkit-text-security:disc;text-security:disc}
.ms-img{object-fit:cover;border-radius:8px;flex:none;background:#E9EAE5}
.ms-ph{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:#E9EAE5;font-size:20px;flex:none}
.ms-prod .ms-img,.ms-prod .ms-ph{width:100%!important;height:96px!important;border-radius:8px}.ms-prod .p{color:#151210;font-weight:700;font-variant-numeric:tabular-nums}
.ms-cart{flex:1;min-width:300px;background:#fff;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;position:sticky;top:12px}
.ms-cl{display:flex;align-items:center;gap:8px;border-top:1px solid #ECEDE8;padding-top:8px}.ms-cl .n{flex:1;display:flex;flex-direction:column;font-weight:600}.ms-cl .n small{color:#6F6C67;font-weight:400}
.ms-cl .qty{display:flex;align-items:center;gap:8px}.ms-cl .qty button{width:40px;height:40px;border-radius:10px;border:2px solid #151210;background:#fff;font-size:20px;font-weight:700}
.ms-cartfoot{display:flex;flex-direction:column;gap:8px}.ms-cartfoot .big{display:flex;justify-content:space-between;font-family:'Anton',sans-serif;font-size:24px}
.ms-modo{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}.ms-modo button{min-height:44px;border-radius:10px;border:1px solid #b9bab2;background:#fff;font-weight:700}.ms-modo button.on{background:#151210;color:#FFC531;border-color:#151210}
.ms-peso{font-family:'Anton',sans-serif;font-size:40px;text-align:center;background:#F5F6F2;border-radius:12px;padding:10px}
.ms-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.ms-keypad button{min-height:56px;border-radius:10px;border:1px solid #DCDDD6;background:#fff;font-size:22px;font-weight:700}
.ms-grp{display:flex;flex-direction:column}.ms-grp small{font-weight:400;color:#6F6C67}
.ms-modal.cfg{width:min(900px,100%);background:#E9EAE5;padding:0;gap:0;border:1px solid #9C988B}
.ms-modal.cfg>.ms-mh{background:#151210;color:#fff;padding:14px 18px;border-radius:16px 16px 0 0;position:sticky;top:0;z-index:2}
.ms-modal.cfg>.ms-mh .ms-x{color:#fff}
.ms-modal.cfg>.ms-adm,.ms-modal.cfg>.ms-cfgwrap,.ms-modal.cfg>.ms-okmsg,.ms-modal.cfg>.ms-err{margin:14px 18px 0}
.ms-modal.cfg>.ms-cfgwrap{margin-bottom:18px}
.ms-adm{background:#FFC531;color:#151210;border-radius:10px;padding:10px 14px}
.ms-cfgwrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}
.ms-cfgcol{display:flex;flex-direction:column;gap:14px;min-width:0}
.ms-card{background:#fff;border:1px solid #9C988B;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
.ms-card small{color:#6F6C67;line-height:1.4}
@media(max-width:760px){.ms-cfgwrap{grid-template-columns:1fr}.ms-modal.cfg{border-radius:16px 16px 0 0}}
.ms-cfg{display:flex;flex-direction:column;gap:8px;border-top:1px solid #ECEDE8;padding-top:12px}.ms-cfg:first-of-type{border-top:0;padding-top:0}
.ms-lbl{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:600;flex:1;min-width:140px}
.ms-gl{display:flex;align-items:center;gap:8px}.ms-gl>span{flex:1;min-width:0}
.ms-sw{display:flex;gap:8px;align-items:center;font-weight:600}
@media(max-width:900px){.ms-body{flex-direction:column}.ms-side{width:auto;border-left:0;border-top:1px solid #DCDDD6}}
`
