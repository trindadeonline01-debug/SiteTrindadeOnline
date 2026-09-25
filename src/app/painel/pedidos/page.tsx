'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { refreshSessionOnce } from '@/lib/authRefresh'
import { qzListPrinters, qzPrintRaw, buildReceipt, buildKitchenTicket, isRawBtMode, printViaRawBt, RAWBT_SENTINEL } from '@/lib/qzPrint'
import { fetchPedidoComItensComRetry } from '@/lib/autoprint'
import { useRealtimeResync } from '@/hooks/useRealtimeResync'
import { usePainelShell } from '@/contexts/PainelShellContext'
import { npGroupContribution, type NpOpcao, type NpGrupo, type NpProduto, type NpCartLine } from '@/lib/produtoCart'
import EditarPedidoPanel from '@/components/painel/EditarPedidoPanel'

type Item = { id: string; product_name: string; unit_price: number; qty: number; selected_options: { name: string; price: number }[] }
type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'
type Pedido = {
  id: string; order_number: number | null; customer_id: string | null; customer_name: string; customer_phone: string | null; delivery_address: string | null
  origin: string; status: Status; payment_method: string | null; payment_status: string
  delivery_type: 'entrega' | 'retirada' | 'balcao'; scheduled_for: string | null
  notes: string | null; subtotal: number; total: number; delivery_fee: number; motoboy_id: string | null
  created_at: string; accepted_at: string | null
  itens: Item[]
}
type LojaMotoboy = { id: string; nome: string; whatsapp: string; ativo: boolean }

const CUSTOMER_MSG: Partial<Record<Status, string>> = {
  em_preparo: 'Seu pedido já está em preparo!',
  pronto: 'Seu pedido está pronto!',
  saiu_entrega: 'Seu pedido saiu para entrega!',
  entregue: 'Pedido entregue. Bom apetite!',
  cancelado: 'Seu pedido foi cancelado.',
}
function notifyCustomer(customerId: string | null, companyName: string, status: Status) {
  const msg = CUSTOMER_MSG[status]
  if (!customerId || !msg) return
  fetch('/api/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: companyName, body: msg, target: 'external_user_id', userId: customerId, url: `${window.location.origin}/perfil` }),
  }).catch(() => {})
}
// Além do push no app, manda a atualização como mensagem de WhatsApp de
// verdade pro cliente (mesmo canal usado pra confirmar o pedido).
function notifyCustomerWhatsapp(companyId: string, phone: string | null, status: Status, deliveryType: string, pedidoId?: string) {
  if (!phone) return
  fetch('/api/loja/status-pedido', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, phone, status, deliveryType, pedidoId }),
  }).then(r => { if (!r.ok) console.error('[notifyCustomerWhatsapp] falhou', r.status) }).catch(err => console.error('[notifyCustomerWhatsapp] falhou', err))
}
// Ao escolher um motoboy PRÓPRIO (loja_motoboys) pra sair com o pedido,
// manda pro WhatsApp dele endereço (com link do Maps), itens, forma de
// pagamento e valor — pedido do Ricardo, set/2026: ele tinha que ligar
// avisando tudo na mão. Sem instância de WhatsApp conectada, a rota
// simplesmente não faz nada (fire-and-forget).
function notifyMotoboyWhatsapp(companyId: string, pedidoId: string, motoboyId: string) {
  fetch('/api/loja/notificar-motoboy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, pedidoId, motoboyId }),
  }).then(r => { if (!r.ok) console.error('[notifyMotoboyWhatsapp] falhou', r.status) }).catch(err => console.error('[notifyMotoboyWhatsapp] falhou', err))
}

const STATUS_LABEL: Record<Status, string> = { recebido: 'Recebido', em_preparo: 'Em preparo', pronto: 'Pronto', saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado' }
const ORIGIN_INFO: Record<string, { label: string; bg: string; fg: string }> = {
  cardapio_publico: { label: '🌐 Site', bg: '#E8F0FE', fg: '#1A56B0' },
  conversa: { label: '💬 WhatsApp', bg: '#E4F3EC', fg: '#157A52' },
  balcao: { label: '🏪 Balcão', bg: '#F0EDE8', fg: '#6E6656' },
}
function originInfo(origin: string) { return ORIGIN_INFO[origin] || { label: origin, bg: '#F0EDE8', fg: '#6E6656' } }
const PAY_LABEL: Record<string, string> = { pix: '💳 Pix', dinheiro: '💵 Dinheiro', cartao: '💳 Cartão' }
function payLabel(m: string | null) { return m ? (PAY_LABEL[m] || `💳 ${m}`) : '💳 —' }
// Containerzinho dividido ao meio — forma de pagamento de um lado, status do
// outro — reaproveitado tanto no resumo (card fechado) quanto no detalhe
// (card aberto, perto do item), pedido do Ricardo, set/2026.
function PaymentPill({ p, payUnpaidAfterDelivery, onToggle }: { p: Pedido; payUnpaidAfterDelivery: boolean; onToggle: (e: React.MouseEvent) => void }) {
  const pago = p.payment_status === 'pago'
  const bg = pago ? '#E4F3EC' : payUnpaidAfterDelivery ? '#FBEAEA' : '#FEF6DC'
  const leftColor = pago ? '#0F5C3C' : payUnpaidAfterDelivery ? '#8A251F' : '#6B4A0A'
  const rightColor = pago ? '#157A52' : payUnpaidAfterDelivery ? '#C43D3D' : '#8A6410'
  return (
    <div className="pd-pillrow pd-pillrow-click" style={{ background: bg }} onClick={onToggle} title="Toca pra marcar como pago/pendente">
      <div className="pd-pillhalf" style={{ color: leftColor }}>{payLabel(p.payment_method)}</div>
      <div className="pd-pillhalf" style={{ color: rightColor }}>{pago ? '✓ Pago' : '⚠ Cobrar na entrega'}</div>
    </div>
  )
}
const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  recebido: { bg: '#FEF0E0', fg: '#B5690C' }, em_preparo: { bg: '#FEF6DC', fg: '#8A6410' },
  pronto: { bg: '#E4F3EC', fg: '#157A52' }, saiu_entrega: { bg: '#E8F0FE', fg: '#1A56B0' },
  entregue: { bg: '#F0EDE8', fg: '#6E6656' }, cancelado: { bg: '#FBEAEA', fg: '#C43D3D' },
}
const FLOW: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue']
const BOARD_COLUMNS: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue']
type MobileStageKey = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'historico'
const MOBILE_STAGES: { key: MobileStageKey; label: string; accent: string; match: (s: Status) => boolean }[] = [
  { key: 'recebido', label: 'Recebido', accent: STATUS_COLOR.recebido.fg, match: s => s === 'recebido' },
  { key: 'em_preparo', label: 'Em preparo', accent: STATUS_COLOR.em_preparo.fg, match: s => s === 'em_preparo' },
  { key: 'pronto', label: 'Pronto', accent: STATUS_COLOR.pronto.fg, match: s => s === 'pronto' },
  { key: 'saiu_entrega', label: 'Saiu p/ entrega', accent: STATUS_COLOR.saiu_entrega.fg, match: s => s === 'saiu_entrega' },
  { key: 'historico', label: 'Histórico', accent: STATUS_COLOR.entregue.fg, match: s => s === 'entregue' || s === 'cancelado' },
]
function getNextAction(p: Pedido): { next: Status; label: string } | null {
  if (p.status === 'recebido') return { next: 'em_preparo', label: 'Iniciar preparo' }
  if (p.status === 'em_preparo') return { next: 'pronto', label: 'Marcar pronto' }
  if (p.status === 'pronto') {
    if (p.delivery_type === 'entrega') return { next: 'saiu_entrega', label: 'Saiu para entrega' }
    return { next: 'entregue', label: p.delivery_type === 'balcao' ? 'Finalizar pedido' : 'Cliente retirou' }
  }
  if (p.status === 'saiu_entrega') return { next: 'entregue', label: 'Marcar entregue' }
  return null
}
function flowFor(p: Pedido): Status[] { return p.delivery_type !== 'entrega' ? FLOW.filter(s => s !== 'saiu_entrega') : FLOW }

// Pedido "atrasado" — ainda não existe um tempo combinado configurável por
// loja, então usa um teto razoável fixo: mais de 30min parado em
// recebido/em_preparo sem avançar (ESPECIFICACAO.md §10.7 — "pedido parado
// mais tempo que o combinado ganha borda vermelha").
const LATE_THRESHOLD_MIN = 30
function isLate(p: Pedido): boolean {
  if (p.status !== 'recebido' && p.status !== 'em_preparo') return false
  const mins = (Date.now() - new Date(p.created_at).getTime()) / 60000
  return mins > LATE_THRESHOLD_MIN
}

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
// Código que o cliente informa pro motoboy próprio na entrega — motoboy
// responde esse número no WhatsApp da própria loja pra confirmar (pedido do
// Ricardo, set/2026). 4 dígitos, nada criptográfico, só uma senha de
// entrega — mesma ideia (e mesmo tamanho) do código de 4 dígitos que já
// existe pro motoboy da PLATAFORMA (Trindade Entrega, genDeliveryCode em
// src/lib/entregaDispatch.ts), agora espelhada pro motoboy da própria loja.
function gen4DigitCode(): string { return String(Math.floor(1000 + Math.random() * 9000)) }
function fmtSchedule(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
// Dia operacional do painel de pedidos (pedido do Ricardo, set/2026): a tela
// vira um mini-PDV — abre sempre no dia de hoje, zerado, e pra ver o que
// aconteceu ontem é só trocar a data no seletor. Data em string local
// 'AAAA-MM-DD' (não usa toISOString, que converte pra UTC e pode virar o
// dia errado perto da meia-noite).
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysToDateStr(dateStr: string, delta: number) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function fmtDateLabel(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}
export default function PedidosPage() {
  // printerName/autoAceitar moraram aqui antes — agora vivem no layout do
  // painel (persiste entre navegações), pra impressão automática continuar
  // funcionando mesmo com outra tela do painel aberta (achado real do
  // Ricardo, set/2026). Beep e o disparo de impressão em si também
  // migraram pra lá; esta página só lê os valores e continua deixando
  // configurar (o "single source of truth" é o contexto).
  const { company, loading: shellLoading, printerName, autoAceitar, setPrinterName, setAutoAceitar } = usePainelShell()
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [motoboys, setMotoboys] = useState<LojaMotoboy[]>([])
  const [motoboySel, setMotoboySel] = useState<Record<string, string>>({})
  const [crmEnabled, setCrmEnabled] = useState(false)
  const [entregaEnabled, setEntregaEnabled] = useState(false)
  // Chavinha por empresa — desliga a chamada AUTOMÁTICA do motoboy da
  // plataforma (pra quem já tem motoboy próprio); o botão manual "🏍️ Chamar
  // motoboy" no card do pedido continua sempre disponível, independente
  // disso (Ricardo, set/2026).
  const [autoChamarMoto, setAutoChamarMoto] = useState(true)
  const [showPrinterModal, setShowPrinterModal] = useState(false)
  const [printerModalMode, setPrinterModalMode] = useState<'qz' | 'rawbt'>('qz')
  const [qzStatus, setQzStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [qzError, setQzError] = useState('')
  const [foundPrinters, setFoundPrinters] = useState<string[]>([])
  const [printerSaving, setPrinterSaving] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  // Pedido do Ricardo, set/2026 (loja Satoshi): o botão "IMPRIMIR PEDIDO" da
  // tarja vermelha tem que sumir assim que imprime — antes ficava lá até o
  // pedido mudar de status, mesmo já impresso.
  const [printedIds, setPrintedIds] = useState<Set<string>>(new Set())
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const isToday = selectedDate === todayStr()
  // Guarda a "data de hoje" conhecida da última checagem — se o dia virar
  // com a tela aberta (aba em segundo plano à noite, tablet ligado direto),
  // reaproveita os mesmos eventos de "aba voltou a existir" do
  // useRealtimeResync pra zerar sozinho pro novo dia. Só avança se o
  // lojista não tiver navegado pra uma data antiga de propósito.
  const autoTodayRef = useRef(todayStr())
  const [mobileStage, setMobileStage] = useState<MobileStageKey>('recebido')
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Coluna recolhida no board desktop — pedido do Ricardo, set/2026: nunca
  // pode ter scroll lateral no board, as colunas têm que sempre caber
  // 100% na tela (mockup aprovado). Grid com fração pra cada coluna
  // aberta + uma faixa estreita fixa pra cada recolhida, em vez de largura
  // fixa por coluna — assim elas encolhem sozinhas conforme a tela.
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())
  function toggleColCollapse(key: string) {
    setCollapsedCols(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  const companyIdRef = useRef('')
  const [deliveryCalled, setDeliveryCalled] = useState<Set<string>>(new Set())
  // pedido_id -> dados do delivery_orders correspondente — usado pra mostrar
  // a faixa "Nenhum motoboy aceitou" quando status vira sem_motoboy, e pra
  // mostrar motoboy + código direto no card fechado, sem precisar ir em
  // Entrega (Ricardo, set/2026). Dois códigos: pickup_code (retirada na
  // loja, mostra só até o motoboy confirmar que pegou) e delivery_code
  // (cliente, sempre visível como fallback caso o WhatsApp falhe).
  const [deliveryByPedido, setDeliveryByPedido] = useState<Record<string, { id: string; status: string; motoboy_name: string | null; pickup_code: string | null; picked_up_at: string | null; delivery_code: string | null }>>({})
  const [retryingMotoId, setRetryingMotoId] = useState<string | null>(null)
  const [motoErrors, setMotoErrors] = useState<Record<string, string>>({})
  const [motoLoading, setMotoLoading] = useState<string | null>(null)
  // Ref (não state) pra travar na hora — o disparo automático e um clique
  // manual no mesmo pedido não podem rodar ao mesmo tempo, e esperar o
  // re-render do state seria tarde demais pra evitar a corrida.
  const callingMotoboyRef = useRef<Set<string>>(new Set())

  const [editId, setEditId] = useState<string | null>(null)

  const [npOpen, setNpOpen] = useState(false)
  const [npProdutos, setNpProdutos] = useState<NpProduto[]>([])
  const [npLoadingProdutos, setNpLoadingProdutos] = useState(false)
  const [npCart, setNpCart] = useState<NpCartLine[]>([])
  const [npDetail, setNpDetail] = useState<NpProduto | null>(null)
  const [npDetailSel, setNpDetailSel] = useState<number[][]>([])
  const [npNome, setNpNome] = useState('')
  const [npTelefone, setNpTelefone] = useState('')
  const [npDeliveryType, setNpDeliveryType] = useState<'entrega' | 'retirada'>('entrega')
  const [npEndereco, setNpEndereco] = useState('')
  const [npObs, setNpObs] = useState('')
  const [npPay, setNpPay] = useState<'pix' | 'dinheiro' | 'cartao'>('dinheiro')
  const [npSaving, setNpSaving] = useState(false)
  const [npError, setNpError] = useState('')

  useEffect(() => {
    if (shellLoading) return
    if (!company || !company.loja_digital_enabled) { window.location.href = '/painel/compartilhar'; return }
    ;(async () => {
      setCompanyId(company.id); companyIdRef.current = company.id
      setCompanyName(company.name)
      setCrmEnabled(company.crm_whatsapp_enabled)
      setEntregaEnabled(company.entrega_enabled)
      setAutoChamarMoto(company.entrega_chamada_automatica)
      const { data: mb } = await supabase.from('loja_motoboys').select('*').eq('company_id', company.id).order('created_at')
      setMotoboys((mb || []) as LojaMotoboy[])
      await loadAll(company.id, selectedDate)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellLoading, company?.id])

  // Canal realtime isolado do carregamento inicial de propósito, e recriado
  // sempre que a aba volta a ficar visível/em foco/com internet — celular
  // com a tela apagada deixa o WebSocket "vivo" mas surdo (sem erro nenhum,
  // só para de entregar evento), e foi exatamente o que aconteceu na loja
  // da Vivi (set/2026): pedido chegou sem avisar, só normalizou com F5. A
  // rebusca da lista aqui embaixo garante que o pedido aparece na hora,
  // mesmo que o canal antigo tenha perdido o evento por completo (não
  // depende só dele se recuperar sozinho). Ver useRealtimeResync.
  const resyncTick = useRealtimeResync()

  // Detecta a virada do dia enquanto a tela fica aberta, reaproveitando os
  // mesmos gatilhos ("aba voltou a existir") do useRealtimeResync — não
  // mexe se o lojista tiver navegado de propósito pra uma data antiga.
  useEffect(() => {
    const nowStr = todayStr()
    if (nowStr !== autoTodayRef.current && selectedDate === autoTodayRef.current) {
      setSelectedDate(nowStr)
    }
    autoTodayRef.current = nowStr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resyncTick])

  useEffect(() => {
    if (!companyId) return
    refreshSessionOnce().catch(() => {})
    loadAll(companyId, selectedDate)
    const channel = supabase.channel(`pedidos-${companyId}-${resyncTick}`)
      // UPDATE aplica o payload direto no estado, sem rebuscar — bug real,
      // Ricardo set/2026 (Peixaria Trindade, pedido da Roberta): clicar em
      // "Aceitar" mudava a tela na hora, mas o UPDATE que esse próprio clique
      // gerou disparava esse canal de volta, chamando loadAll() — e se essa
      // rebusca (via PostgREST) pegasse o dado ainda não replicado, ela
      // sobrescrevia o estado certo com o valor antigo, travando a tela até
      // sair e voltar. O payload do realtime já traz a linha atualizada de
      // verdade (vem do WAL do Postgres, sem esse risco de réplica atrasada)
      // — usa ele direto em vez de arriscar uma leitura relida.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${companyId}` }, payload => {
        const row = payload.new as Partial<Pedido> & { id: string }
        setPedidos(prev => prev.map(p => p.id === row.id ? { ...p, ...row } : p))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${companyId}` }, () => {
        loadAll(companyIdRef.current, selectedDate)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'loja_pedidos', filter: `company_id=eq.${companyId}` }, () => {
        loadAll(companyIdRef.current, selectedDate)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', filter: `company_id=eq.${companyId}` }, () => {
        loadAll(companyIdRef.current, selectedDate)
      })
      .subscribe()
    // Rede de segurança: o canal realtime pode perder um evento sem nenhum
    // sinal de erro (achado real do Ricardo, set/2026, loja Satoshi — pedido
    // chegou, a impressora rodou — prova que o evento existiu — mas essa
    // tela não atualizou sozinha, só com F5). useRealtimeResync já cobre
    // "aba saiu e voltou", mas essa falha aconteceu com a tela ligada o
    // tempo todo, sem nenhuma dessas transições pra disparar a reconexão.
    // Rebusca a cada 20s garante que, na pior das hipóteses, a tela se
    // corrige sozinha rápido, sem depender do realtime ter funcionado.
    const pollIv = setInterval(() => loadAll(companyIdRef.current, selectedDate), 20000)
    return () => { supabase.removeChannel(channel); clearInterval(pollIv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, resyncTick, selectedDate])

  // Lista sempre presa a um único dia — mini-PDV, não um histórico infinito
  // (pedido do Ricardo, set/2026): a tela abre zerada no dia de hoje e só
  // mostra pedido de outro dia se o lojista trocar a data no seletor.
  async function loadAll(cid: string, dateStr: string) {
    const from = new Date(dateStr + 'T00:00:00')
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
    const { data } = await supabase.from('loja_pedidos').select('*, itens:loja_pedido_itens(*)').eq('company_id', cid)
      .gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
      .order('created_at', { ascending: false })
    setPedidos((data || []) as any)
    const { data: entregas } = await supabase.from('delivery_orders').select('id, pedido_id, status, motoboy_name, pickup_code, picked_up_at, delivery_code').eq('company_id', cid).not('pedido_id', 'is', null)
    setDeliveryCalled(new Set((entregas || []).map(e => e.pedido_id as string)))
    const byPedido: Record<string, { id: string; status: string; motoboy_name: string | null; pickup_code: string | null; picked_up_at: string | null; delivery_code: string | null }> = {}
    for (const e of entregas || []) if (e.pedido_id) byPedido[e.pedido_id as string] = { id: e.id as string, status: e.status as string, motoboy_name: e.motoboy_name as string | null, pickup_code: e.pickup_code as string | null, picked_up_at: e.picked_up_at as string | null, delivery_code: e.delivery_code as string | null }
    setDeliveryByPedido(byPedido)
  }

  async function chamarMotoboy(p: Pedido) {
    if (callingMotoboyRef.current.has(p.id)) return // já tem uma chamada rodando pra esse pedido
    callingMotoboyRef.current.add(p.id)
    setMotoErrors(prev => { const n = { ...prev }; delete n[p.id]; return n })
    setMotoLoading(p.id)

    const call = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/entrega/criar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session?.access_token, company_id: companyId, pedido_id: p.id,
          customer_name: p.customer_name, customer_phone: p.customer_phone, dropoff_address: p.delivery_address,
        }),
      })
      return { r, data: await r.json() }
    }

    let { r: res, data } = await call()
    // Token pode ter ficado velho (aba em segundo plano no celular sem
    // renovar sozinha) — força renovar a sessão (compartilhada, pra não
    // rodar duas renovações em paralelo) e tenta de novo antes de mostrar
    // erro pro lojista.
    if (res.status === 401) {
      await refreshSessionOnce()
      ;({ r: res, data } = await call())
    }
    callingMotoboyRef.current.delete(p.id)
    setMotoLoading(null)
    if (res.status === 401) {
      setMotoErrors(prev => ({ ...prev, [p.id]: (data.error || 'sessão inválida') + ' — atualiza a página (F5) e tenta de novo.' }))
      return
    }
    if (!res.ok || data.error) { setMotoErrors(prev => ({ ...prev, [p.id]: data.error || 'Não consegui chamar o motoboy.' })); return }
    setDeliveryCalled(prev => new Set(prev).add(p.id))
  }

  // Botão "🔁 Solicitar de novo" da faixa "Nenhum motoboy aceitou" — reabre
  // a busca pra essa entrega específica (Ricardo, set/2026).
  async function retryMotoboy(deliveryOrderId: string) {
    setRetryingMotoId(deliveryOrderId)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/entrega/retry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token, company_id: companyId, delivery_order_id: deliveryOrderId }),
    }).catch(() => {})
    setRetryingMotoId(null)
    loadAll(companyIdRef.current, selectedDate)
  }

  // Assim que o pedido entra em preparo, já chama o motoboy — ele viaja até
  // a loja enquanto o prato fica pronto, em vez de ficar esperando parado.
  function maybeAutoChamarMotoboy(pedido: Pedido) {
    if (entregaEnabled && autoChamarMoto && pedido.delivery_type === 'entrega' && pedido.delivery_address && !deliveryCalled.has(pedido.id)) {
      chamarMotoboy(pedido)
    }
  }

  // motoboyId só é passado ao virar "saiu_entrega" com motoboy PRÓPRIO
  // cadastrado (loja_motoboys) — não tem nada a ver com o motoboy da
  // plataforma (chamarMotoboy/Trindade Entrega, fluxo à parte). É só um
  // registro de quem entregou, pra alimentar o relatório.
  async function setStatus(id: string, status: Status, motoboyId?: string) {
    // Pedido do Ricardo, set/2026: não existe gateway automático aqui — todo
    // pagamento (Pix, dinheiro ou cartão) é cobrado na hora, pelo motoboy ou
    // no balcão. "Entregue" com pagamento "pendente" era um estado que nem
    // deveria existir (ESPECIFICACAO.md §12 #5) — em vez de só sinalizar o
    // problema, marca pago sozinho nessa transição.
    const autoPago = status === 'entregue' ? { payment_status: 'pago' as const } : {}
    // Motoboy próprio recebendo a corrida ganha um código novo — o cliente
    // informa esse número na entrega, o motoboy confirma respondendo no
    // WhatsApp da loja (webhook em /api/crm/webhook fecha o pedido sozinho
    // quando bate). Pedido do Ricardo, set/2026.
    const codigoEntrega = motoboyId ? { delivery_confirm_code: gen4DigitCode(), delivery_confirmed_at: null, motoboy_payment_status: 'pendente' } : {}
    // Pega o pedido de dentro do próprio updater (prev), não da variável
    // `pedidos` de fora — essa fecha sobre o array de quando o card foi
    // renderizado, que pode já estar velho na hora do clique (bug real,
    // Ricardo set/2026: notificação/motoboy não disparava depois de mudar
    // status, mesmo a tela em si já tendo atualizado certo).
    let pedidoRef: Pedido | undefined
    setPedidos(prev => prev.map(p => {
      if (p.id !== id) return p
      pedidoRef = p
      return { ...p, status, ...(motoboyId ? { motoboy_id: motoboyId } : {}), ...autoPago }
    }))
    await supabase.from('loja_pedidos').update({
      status, updated_at: new Date().toISOString(), ...(motoboyId ? { motoboy_id: motoboyId } : {}), ...autoPago, ...codigoEntrega,
    }).eq('id', id)
    if (pedidoRef) {
      notifyCustomer(pedidoRef.customer_id, companyName, status)
      notifyCustomerWhatsapp(companyId, pedidoRef.customer_phone, status, pedidoRef.delivery_type, id)
      if (status === 'em_preparo') maybeAutoChamarMotoboy(pedidoRef)
      if (motoboyId) notifyMotoboyWhatsapp(companyId, id, motoboyId)
    }
  }

  // payment_status nunca tinha jeito de mudar depois que o pedido era criado —
  // ficava travado em "pendente" pra sempre, mesmo entregue e pago, porque não
  // existe gateway de pagamento automático pro pedido da loja (só a intenção
  // declarada no checkout). O lojista marca manualmente quando recebeu.
  async function togglePaymentStatus(id: string) {
    let next: 'pago' | 'pendente' = 'pago'
    let found = false
    setPedidos(prev => prev.map(p => {
      if (p.id !== id) return p
      found = true
      next = p.payment_status === 'pago' ? 'pendente' : 'pago'
      return { ...p, payment_status: next }
    }))
    if (!found) return
    await supabase.from('loja_pedidos').update({ payment_status: next, updated_at: new Date().toISOString() }).eq('id', id)
  }

  async function acceptPedido(id: string) {
    const now = new Date().toISOString()
    let pedidoRef: Pedido | undefined
    setPedidos(prev => prev.map(p => {
      if (p.id !== id) return p
      pedidoRef = p
      return { ...p, accepted_at: now, status: 'em_preparo' }
    }))
    await supabase.from('loja_pedidos').update({ accepted_at: now, status: 'em_preparo', updated_at: now }).eq('id', id)
    if (pedidoRef) {
      notifyCustomer(pedidoRef.customer_id, companyName, 'em_preparo')
      notifyCustomerWhatsapp(companyId, pedidoRef.customer_phone, 'em_preparo', pedidoRef.delivery_type, id)
      maybeAutoChamarMotoboy(pedidoRef)
    }
  }

  function toggleAutoAceitar() { setAutoAceitar(!autoAceitar) }

  // Persiste na própria empresa (não é preferência de aparelho como
  // autoAceitar/impressora) — o disparo automático roda no servidor
  // (registrar-pedido), então precisa estar no banco pra ele conseguir ler.
  async function toggleAutoChamarMoto() {
    const next = !autoChamarMoto
    setAutoChamarMoto(next)
    await supabase.from('companies').update({ entrega_chamada_automatica: next }).eq('id', companyId)
  }

  async function printPedido(p: Pedido) {
    if (!printerName) { setShowPrinterModal(true); return }
    setPrintError(null)
    try {
      // Se o pedido foi carregado na tela antes dos itens terminarem de
      // salvar (pedido recém-chegado), busca de novo com retry em vez de
      // imprimir a segunda via já sem os itens.
      const pedidoParaImprimir = (p.itens?.length || 0) > 0 ? p : (await fetchPedidoComItensComRetry(p.id)) || p
      const items = (pedidoParaImprimir.itens || []).map((it: Item) => ({ qty: it.qty, name: it.product_name, unitPrice: it.unit_price, options: it.selected_options }))
      const content = buildReceipt({
        companyName, pedidoShortId: String(p.order_number ?? p.id.slice(0, 8)), createdAt: p.created_at,
        customerName: p.customer_name, customerPhone: p.customer_phone,
        deliveryType: p.delivery_type, address: p.delivery_address,
        paymentMethod: p.payment_method, notes: p.notes,
        items,
        subtotal: p.subtotal,
        deliveryFee: p.delivery_fee || 0,
        total: p.total,
      })
      const kitchenContent = buildKitchenTicket({
        pedidoShortId: String(p.order_number ?? p.id.slice(0, 8)), createdAt: p.created_at,
        deliveryType: p.delivery_type, items, notes: p.notes,
      })
      if (isRawBtMode(printerName)) {
        // Duas chamadas de `intent:` em sequência imediata perdem a segunda
        // — o Android ainda está trocando de app pra a primeira. Um respiro
        // curto entre elas é o suficiente.
        printViaRawBt(content)
        setTimeout(() => printViaRawBt(kitchenContent), 600)
      } else {
        await qzPrintRaw(printerName, content)
        await qzPrintRaw(printerName, kitchenContent)
      }
      setPrintedIds(prev => new Set(prev).add(p.id))
    } catch (err: any) {
      setPrintError(isRawBtMode(printerName)
        ? 'Não consegui imprimir — confere se o RawBT está instalado e a impressora pareada nele. ' + (err?.message || '')
        : 'Não consegui imprimir — confere se o QZ Tray está aberto no computador. ' + (err?.message || ''))
    }
  }

  // Só abre o modal e mostra a escolha de modo — não tenta falar com o QZ
  // Tray de cara, porque quem usa RawBT (tablet) não tem QZ Tray nenhum
  // rodando, e a tentativa de conexão só ia mostrar erro à toa.
  function openPrinterModal() {
    setShowPrinterModal(true)
    setPrinterModalMode(isRawBtMode(printerName) ? 'rawbt' : 'qz')
  }

  async function startQzSetup() {
    setPrinterModalMode('qz')
    setQzStatus('connecting')
    setQzError('')
    try {
      const { real, defaultPrinter } = await qzListPrinters()
      // Detecção automática: sobrou só uma impressora de verdade na lista
      // (depois de tirar PDF/Fax/OneNote e afins) — assume que é ela, sem
      // precisar a pessoa escolher na mão.
      if (real.length === 1) {
        setFoundPrinters(real)
        setQzStatus('connected')
        await selectPrinter(real[0])
        return
      }
      // Mais de uma impressora real: não dá pra saber sozinho qual tá
      // conectada de verdade, mas põe a impressora padrão do Windows/Mac
      // primeiro na lista — geralmente é a certa.
      const ordered = defaultPrinter && real.includes(defaultPrinter)
        ? [defaultPrinter, ...real.filter(n => n !== defaultPrinter)]
        : real
      setFoundPrinters(ordered)
      setQzStatus('connected')
    } catch (err: any) {
      setQzStatus('error')
      setQzError(err?.message || 'Não consegui falar com o QZ Tray. Confere se ele está instalado e aberto.')
    }
  }

  async function selectPrinter(name: string) {
    setPrinterSaving(true)
    setPrinterName(name)
    setPrinterSaving(false)
  }

  async function removePrinter() {
    setPrinterSaving(true)
    setPrinterName('')
    setPrinterSaving(false)
  }

  async function openNovoPedido() {
    setNpOpen(true)
    if (npProdutos.length === 0) {
      setNpLoadingProdutos(true)
      const { data } = await supabase.from('loja_produtos').select('id, name, sale_price, category_id, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))').eq('company_id', companyId).eq('active', true).order('display_order')
      setNpProdutos((data || []) as any)
      setNpLoadingProdutos(false)
    }
  }
  function closeNovoPedido() {
    setNpOpen(false); setNpCart([]); setNpDetail(null); setNpNome(''); setNpTelefone(''); setNpDeliveryType('entrega'); setNpEndereco(''); setNpObs(''); setNpPay('dinheiro'); setNpError('')
  }
  function npAddToCart(produtoId: string, name: string, price: number, modifiers: { name: string; price: number }[] = []) {
    const key = produtoId + '|' + modifiers.map(m => m.name).sort().join('+')
    setNpCart(prev => {
      const existing = prev.find(l => l.key === key)
      if (existing) return prev.map(l => l.key === key ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, { key, produtoId, name, modifiers, unitPrice: price, qty: 1 }]
    })
  }
  function npChangeQty(key: string, delta: number) {
    setNpCart(prev => prev.map(l => l.key === key ? { ...l, qty: l.qty + delta } : l).filter(l => l.qty > 0))
  }
  function npOpenDetail(p: NpProduto) { setNpDetail(p); setNpDetailSel(p.groups.map(() => [])) }
  function npToggleOpt(gi: number, oi: number) {
    if (!npDetail) return
    const g = npDetail.groups[gi]
    setNpDetailSel(sel => sel.map((s, i) => {
      if (i !== gi) return s
      const active = s.includes(oi)
      if (g.max_select === 1) return active ? [] : [oi]
      if (active) return s.filter(x => x !== oi)
      if (s.length < g.max_select) return [...s, oi]
      return s
    }))
  }
  const npDetailReqMet = npDetail ? npDetail.groups.every((g, gi) => !g.required || npDetailSel[gi].length >= g.min_select) : true
  const npDetailPrice = npDetail ? npDetail.sale_price + npDetail.groups.reduce((s, g, gi) => s + npGroupContribution(g, npDetailSel[gi]), 0) : 0
  function npConfirmDetail() {
    if (!npDetail || !npDetailReqMet) return
    const modifiers: { name: string; price: number }[] = []
    npDetail.groups.forEach((g, gi) => npDetailSel[gi].forEach(oi => modifiers.push({ name: g.options[oi].name, price: g.options[oi].price })))
    npAddToCart(npDetail.id, npDetail.name, npDetailPrice, modifiers)
    setNpDetail(null)
  }
  const npTotal = npCart.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  async function npCriarPedido() {
    if (!npNome.trim() || npCart.length === 0) return
    setNpSaving(true)
    setNpError('')
    if (npDeliveryType === 'entrega' && !npEndereco.trim()) { setNpError('Preenche o endereço de entrega.'); setNpSaving(false); return }
    const { data: pedido, error: pedidoErr } = await supabase.from('loja_pedidos').insert({
      company_id: companyId, customer_id: null,
      customer_name: npNome.trim(), customer_phone: npTelefone.trim() || null,
      delivery_address: npDeliveryType === 'entrega' ? npEndereco.trim() : null, delivery_type: npDeliveryType, origin: 'balcao', payment_method: npPay,
      subtotal: npTotal, total: npTotal, notes: npObs.trim() || null, accepted_at: new Date().toISOString(),
    }).select('id').single()
    if (pedidoErr || !pedido) {
      setNpError(pedidoErr?.message || 'Não consegui criar o pedido — tenta de novo.')
      setNpSaving(false)
      return
    }
    const { error: itensErr } = await supabase.from('loja_pedido_itens').insert(npCart.map(l => ({
      pedido_id: pedido.id, produto_id: l.produtoId, product_name: l.name, unit_price: l.unitPrice, qty: l.qty,
      selected_options: l.modifiers,
    })))
    if (itensErr) {
      setNpError('Pedido criado, mas falhou ao salvar os itens: ' + itensErr.message)
      setNpSaving(false)
      return
    }
    fetch('/api/loja/registrar-pedido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId, phone: npTelefone.trim() || null, name: npNome.trim(), address: npDeliveryType === 'entrega' ? npEndereco.trim() : null,
        total: npTotal, subtotal: npTotal, deliveryFee: 0,
        paymentMethod: npPay, deliveryType: npDeliveryType, notes: npObs.trim() || null,
        items: npCart.map(l => ({ produtoId: l.produtoId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, modifiers: l.modifiers })),
      }),
    }).catch(() => {})
    setNpSaving(false)
    closeNovoPedido()
    await loadAll(companyId, selectedDate)
  }

  function shiftDate(delta: number) {
    setSelectedDate(prev => {
      const next = addDaysToDateStr(prev, delta)
      return next > todayStr() ? todayStr() : next
    })
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#AAA' }}>Carregando...</div>

  const searched = search.trim()
    ? pedidos.filter(p => p.customer_name.toLowerCase().includes(search.trim().toLowerCase()) || p.id.startsWith(search.trim()))
    : pedidos
  const currentStage = MOBILE_STAGES.find(t => t.key === mobileStage)!
  const mobileList = searched.filter(p => currentStage.match(p.status))

  function renderCard(p: Pedido) {
    const open = openId === p.id
    const c = STATUS_COLOR[p.status]
    const o = originInfo(p.origin)
    const needsAccept = !autoAceitar && p.status === 'recebido' && !p.accepted_at
    const late = isLate(p)
    // Pagamento é estado do pedido, não um detalhe solto no meio do resumo
    // (dívida #5 — "entregue · pendente" parecia estado impossível quando
    // misturado na mesma linha). Continua podendo coexistir de verdade
    // (COD entregue sem cobrar ainda é real), mas com destaque visual
    // separado — e mais forte quando já foi entregue e ainda não foi pago.
    const payUnpaidAfterDelivery = p.payment_status !== 'pago' && (p.status === 'entregue' || p.status === 'saiu_entrega')
    return (
      <div className={`pd-card ${needsAccept ? 'pd-card-pending' : ''} ${late ? 'pd-card-late' : ''}`} key={p.id} style={{ '--accent': c.fg, borderLeft: `4px solid ${o.fg}` } as React.CSSProperties} onClick={() => setOpenId(open ? null : p.id)}>
        <div className="pd-row1">
          <div>
            <div className="pd-name">{p.order_number ? `#${p.order_number} · ` : ''}{p.customer_name}</div>
            <div className="pd-time">{timeAgo(p.created_at)} atrás <span className="pd-origin-tag" style={{ color: o.fg }}>· {o.label}</span></div>
          </div>
          <div className="pd-row1-right">
            <button className="pd-edit-btn" title="Editar pedido" onClick={e => { e.stopPropagation(); setEditId(p.id) }}>✏️</button>
            <span className="pd-badge" style={{ background: c.bg, color: c.fg }}>{STATUS_LABEL[p.status]}</span>
          </div>
        </div>
        {late && <div className="pd-late-flag">⚠ Parado há mais de {LATE_THRESHOLD_MIN}min sem avançar</div>}
        {/* Containerzinhos divididos ao meio, cada um com sua cor conforme o
            significado, em vez das pílulas soltas de tamanhos diferentes
            (e do texto pequeno "1 item · pix · Entrega") que existiam antes
            — pedido do Ricardo, set/2026: "organiza melhor visualmente". */}
        <div className="pd-pillrow" style={{ background: '#F7F5F0' }}>
          <div className="pd-pillhalf" style={{ color: '#3A342A' }}>📦 {p.itens?.length || 0} {p.itens?.length === 1 ? 'item' : 'itens'}</div>
          <div className="pd-pillhalf" style={{ color: '#3A342A' }}>{p.delivery_type === 'entrega' ? '🚴 Entrega' : p.delivery_type === 'balcao' ? '🧾 Balcão' : '🏪 Retirada'}</div>
        </div>
        {p.scheduled_for && <div className="pd-sum" style={{ color: '#B5690C', fontWeight: 700, marginTop: 6 }}>📅 Agendado pra {fmtSchedule(p.scheduled_for)}</div>}
        {/* Só aparece aqui em cima quando o card está FECHADO — quando abre,
            essa mesma informação desce pra perto do item no detalhe, e
            mostrar os dois ao mesmo tempo ficaria redundante (Ricardo,
            set/2026). */}
        {!open && <PaymentPill p={p} payUnpaidAfterDelivery={payUnpaidAfterDelivery} onToggle={e => { e.stopPropagation(); togglePaymentStatus(p.id) }} />}
        {(p.motoboy_id || deliveryByPedido[p.id]) && (
          <div className="pd-infobox">
            {p.motoboy_id && (
              <div className="pd-inforow" style={{ background: '#E8F0FE', color: '#1A56B0' }}>
                <span>🏍️ Entregou: <b>{motoboys.find(m => m.id === p.motoboy_id)?.nome || '—'}</b></span>
              </div>
            )}
            {deliveryByPedido[p.id] && (() => {
              const d = deliveryByPedido[p.id]
              // Antes de confirmar retirada, o código que importa pra loja é o
              // de RETIRADA — é ela quem passa esse número pro motoboy na mão.
              // Depois de retirado, o código de entrega vira só um fallback
              // (o cliente já recebeu o dele pelo WhatsApp) — pedido do
              // Ricardo, set/2026: nunca o mesmo código pros dois casos.
              const aindaNaoRetirou = !!d.motoboy_name && !d.picked_up_at && !!d.pickup_code
              return (
                <div className="pd-inforow" style={{ background: d.status === 'sem_motoboy' ? '#FBEAEA' : '#E8F0FE', color: d.status === 'sem_motoboy' ? '#C43D3D' : '#1A56B0' }}>
                  <span>
                    🏍️ {d.motoboy_name ? <b>{d.motoboy_name}</b> : d.status === 'sem_motoboy' ? <b>Nenhum motoboy aceitou</b> : 'Chamando motoboy...'}
                    {aindaNaoRetirou && <> — retirada</>}
                  </span>
                  {aindaNaoRetirou ? (d.pickup_code && <span className="pd-code">{d.pickup_code}</span>) : (d.delivery_code && <span className="pd-code">{d.delivery_code}</span>)}
                </div>
              )
            })()}
          </div>
        )}
        <div className="pd-total">{fmt(p.total)}</div>
        {isToday && needsAccept && <button className="pd-accept" onClick={e => { e.stopPropagation(); acceptPedido(p.id) }}>✓ Aceitar pedido</button>}
        {isToday && !needsAccept && !open && getNextAction(p) && (() => {
          const action = getNextAction(p)!
          const ativos = motoboys.filter(m => m.ativo)
          // Vira "saiu pra entrega" com motoboy PRÓPRIO cadastrado — com 2+
          // ativos, o dropdown aparece ACIMA do botão (escolhe primeiro,
          // depois clica); com 1 só, atribui sozinho; sem nenhum, segue sem
          // atribuir nada (a função é opcional, não trava o fluxo de quem
          // não usa). Pedido do Ricardo, set/2026.
          const precisaEscolher = action.next === 'saiu_entrega' && ativos.length > 1
          return (
            <>
              {precisaEscolher && (
                <select
                  className="pd-mb-select"
                  value={motoboySel[p.id] || ativos[0].id}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setMotoboySel(prev => ({ ...prev, [p.id]: e.target.value }))}
                >
                  {ativos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              )}
              <button className="pd-next" onClick={e => {
                e.stopPropagation()
                const motoboyId = action.next === 'saiu_entrega'
                  ? (ativos.length > 1 ? (motoboySel[p.id] || ativos[0].id) : ativos.length === 1 ? ativos[0].id : undefined)
                  : undefined
                setStatus(p.id, action.next, motoboyId)
              }}>{action.label} →</button>
            </>
          )
        })()}
        {open && (
          <div className="pd-detail" onClick={e => e.stopPropagation()}>
            {p.itens?.map(it => (
              <div key={it.id}>
                <div className="pd-item"><span>{it.qty}x {it.product_name}</span><span>{fmt(it.unit_price * it.qty)}</span></div>
                {it.selected_options?.map((o, i) => <div key={i} className="pd-mods">- {o.name}</div>)}
              </div>
            ))}
            <PaymentPill p={p} payUnpaidAfterDelivery={payUnpaidAfterDelivery} onToggle={e => { e.stopPropagation(); togglePaymentStatus(p.id) }} />
            {(p.delivery_address || p.customer_phone || p.notes) && (
              <div className="pd-detail-meta">
                {p.delivery_address && <div className="pd-meta-row">📍 {p.delivery_address}</div>}
                {p.customer_phone && <div className="pd-meta-row">📞 {p.customer_phone}</div>}
                {p.notes && <div className="pd-meta-row pd-meta-notes">📝 {p.notes}</div>}
              </div>
            )}
            {isToday && entregaEnabled && p.delivery_type === 'entrega' && p.status !== 'cancelado' && (
              deliveryCalled.has(p.id) ? null : (
                <>
                  <button className="pd-next" style={{ marginTop: 8 }} disabled={motoLoading === p.id} onClick={e => { e.stopPropagation(); chamarMotoboy(p) }}>
                    {motoLoading === p.id ? 'Chamando...' : '🏍️ Chamar motoboy'}
                  </button>
                  {motoErrors[p.id] && <div style={{ color: '#C43D3D', fontSize: 11, marginTop: 4 }}>{motoErrors[p.id]}</div>}
                </>
              )
            )}
            {isToday && (
              <div className="pd-chips">
                {flowFor(p).map(s => <button key={s} className={`pd-chip ${p.status === s ? 'current' : ''}`} onClick={() => setStatus(p.id, s)}>{STATUS_LABEL[s]}</button>)}
              </div>
            )}
            <button className="pd-print-btn" onClick={e => { e.stopPropagation(); printPedido(p) }}>🖨️ Imprimir pedido</button>
            {printError && <div style={{ color: '#C43D3D', fontSize: 11, marginTop: 4 }}>{printError}</div>}
            {isToday && p.status !== 'cancelado' && p.status !== 'entregue' && <button className="pd-cancel" onClick={() => setStatus(p.id, 'cancelado')}>Cancelar pedido</button>}
          </div>
        )}
      </div>
    )
  }

  const cancelados = searched.filter(p => p.status === 'cancelado')
  // Faixa de "imprime agora" — pedido do Ricardo, set/2026, testando no
  // tablet: além do som alto que já toca, quer o botão de imprimir bem
  // grande aparecendo sozinho assim que o pedido chega, sem precisar abrir
  // o card pra achar o botão lá dentro. Some sozinha quando o pedido sai de
  // "recebido" (aceito/avançado) — não precisa de "marcar como impresso" à
  // parte.
  // Só dispara em cima do dia de hoje — pedido "recebido" esquecido num dia
  // antigo (histórico) não é uma urgência de agora, não deve piscar nem
  // oferecer reimpressão como se tivesse acabado de chegar.
  const pedidosNovos = isToday ? pedidos.filter(p => p.status === 'recebido' && !printedIds.has(p.id)).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : []
  // Pedidos cuja entrega esgotou os motoboys disponíveis (status sem_motoboy)
  // — precisa aparecer bem visível aqui, não só em /painel/entrega, porque é
  // aqui que o lojista fica de olho (pedido do Ricardo, set/2026).
  const pedidosSemMotoboy = isToday
    ? pedidos.filter(p => deliveryByPedido[p.id]?.status === 'sem_motoboy').sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : []

  return (
    <>
    <div className="pd-wrap">
      <style>{`
        /* Sem tampa de 480px aqui — travava a tela numa coluna de celular
           mesmo em tablet, sobrando margem vazia dos dois lados numa largura
           que já cabia mais coisa (achado do Ricardo, set/2026, testando no
           tablet do Crepe Cone). Fluido até o breakpoint de desktop (768px),
           que troca pra outro layout de qualquer forma. */
        .pd-wrap{ width:100%;max-width:100%;margin:0 auto;min-height:100vh;background:var(--concrete);font-family:'Archivo',sans-serif;font-size:15px;color:var(--ink);padding-bottom:30px;overflow-x:hidden;min-width:0; }
        .pd-head{ padding:22px 12px 10px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 10px;position:sticky;top:0;background:#F7F5F0;z-index:5; }
        .pd-head-left{ display:flex;align-items:center;gap:6px;min-width:0; }
        .pd-head-right{ display:flex;align-items:center;gap:6px;flex:none; }
        .pd-head h1{ font-size:19px;margin:0;font-weight:800;flex:none;white-space:nowrap; }
        .pd-back{ flex:none;width:30px;height:30px;border-radius:50%;border:1px solid #E6E0D2;background:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;text-decoration:none;color:#1A1610; }
        .pd-auto-pill{ flex:none;display:flex;align-items:center;gap:4px;background:#fff;border:1px solid #E6E0D2;border-radius:20px;padding:5px 8px;cursor:pointer; }
        .pd-auto-pill .pd-switch{ width:24px;height:15px;border-radius:8px; }
        .pd-auto-pill .pd-switch .k{ width:11px;height:11px;top:2px;left:2px; }
        .pd-auto-pill .pd-switch.on .k{ left:11px; }
        .pd-new-pill{ flex:none;width:26px;height:26px;border-radius:50%;background:var(--sign);color:var(--ink);border:none;font-size:16px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center; }
        .pd-datebar{ display:flex;align-items:center;gap:8px;padding:0 16px 12px; }
        .pd-date-arrow{ flex:none;width:30px;height:30px;border-radius:8px;border:1px solid #E6E0D2;background:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit; }
        .pd-date-arrow:disabled{ opacity:.35;cursor:default; }
        .pd-date-input{ flex:1;min-width:0;padding:8px 10px;border-radius:9px;border:1px solid #E6E0D2;background:#fff;font-size:13.5px;font-family:inherit;color:var(--ink); }
        .pd-today-btn{ flex:none;padding:8px 12px;border-radius:9px;border:none;background:var(--sign);color:var(--ink);font-weight:800;font-size:12.5px;cursor:pointer;white-space:nowrap;font-family:inherit; }
        .pd-hist-banner{ background:#FEF6DC;color:#8A6410;font-size:12.5px;font-weight:700;padding:9px 16px;text-align:center; }
        .pd-searchbar{ padding:0 16px 12px; }
        .pd-tabs{ display:flex;gap:8px;padding:0 16px 12px;overflow-x:auto; }
        .pd-tab{ flex:none;display:flex;align-items:center;gap:6px;padding:8px 13px;border-radius:20px;border:1.5px solid #E6E0D2;background:#fff;font-weight:700;font-size:14.5px;color:#6E6656;cursor:pointer;white-space:nowrap; }
        .pd-tab.active{ background:var(--accent);color:#fff;border-color:var(--accent); }
        .pd-tab-count{ font-variant-numeric:tabular-nums;background:#EDE8E0;color:#6E6656;font-size:12px;font-weight:800;padding:1px 7px;border-radius:20px; }
        .pd-tab.active .pd-tab-count{ background:rgba(255,255,255,.3);color:#fff; }
        .pd-body{ padding:0 16px; }
        .pd-card{ background:#fff;border:1px solid #EDE8E0;border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer; }
        .pd-row1{ display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px; }
        .pd-row1-right{ display:flex;align-items:center;gap:6px;flex:none; }
        .pd-edit-btn{ width:24px;height:24px;border-radius:7px;border:1px solid #E6E0D2;background:#F7F5F0;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex:none;padding:0; }
        .pd-name{ font-weight:800;font-size:16px; }
        .pd-time{ font-size:12.5px;color:#A79E8B; }
        .pd-origin-tag{ font-weight:700; }
        .pd-badge{ font-size:12px;font-weight:800;padding:3px 8px;border-radius:7px; }
        .pd-sum{ font-size:13.5px;color:#6E6656;margin-bottom:2px; }
        /* Painel único agrupando pagamento + motoboy — cada linha tinta
           conforme o estado (verde/âmbar/vermelho/azul), bordas arredondadas
           só no conjunto, com um traço fino separando as linhas. Substitui
           as pílulas soltas de tamanhos inconsistentes que existiam antes
           (Ricardo, set/2026: "tá bagunçado"). */
        .pd-infobox{ margin-top:8px;border-radius:10px;overflow:hidden; }
        .pd-inforow{ display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 11px;font-size:13px;font-weight:700; }
        .pd-inforow + .pd-inforow{ border-top:1px solid rgba(0,0,0,.06); }
        .pd-code{ flex:none;font-family:'Courier New',monospace;font-weight:800;background:#1A1610;color:var(--sign,#FFC531);padding:2px 9px;border-radius:6px;font-size:13px;letter-spacing:2px; }
        /* Containerzinho dividido ao meio (item|entrega, forma de
           pagamento|status) — mesmo padrão visual do pd-infobox, só que em 2
           colunas lado a lado em vez de empilhado. */
        .pd-pillrow{ margin-top:8px;display:flex;border-radius:10px;overflow:hidden; }
        .pd-pillhalf{ flex:1;padding:8px 11px;font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:6px;min-width:0; }
        .pd-pillhalf + .pd-pillhalf{ border-left:1px solid rgba(0,0,0,.08); }
        .pd-pillrow-click{ cursor:pointer; }
        .pd-total{ font-weight:800;font-size:17px;margin-top:10px; }
        .pd-detail{ margin-top:12px;padding-top:12px;border-top:1px dashed #EDE8E0; }
        .pd-item{ display:flex;justify-content:space-between;font-size:14px;padding:3px 0; }
        .pd-mods{ font-size:13px;color:#A79E8B;padding-left:12px; }
        .pd-detail-meta{ margin-top:10px;display:flex;flex-direction:column;gap:4px;background:#F7F5F0;border-radius:9px;padding:9px 11px; }
        .pd-meta-row{ font-size:12.5px;color:#3A342A; }
        .pd-meta-notes{ color:#6E6656; }
        .pd-chips{ display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px; }
        .pd-chip{ font-size:12.5px;font-weight:700;padding:8px 10px;border-radius:8px;border:1px solid #E6E0D2;background:#fff;cursor:pointer;color:#6E6656;text-align:center; }
        .pd-chip.current{ background:var(--sign);color:var(--ink);border-color:var(--sign); }
        .pd-cancel{ font-size:12px;color:#C43D3D;font-weight:700;background:none;border:none;cursor:pointer;margin-top:8px; }
        .pd-print-btn{ width:100%;margin-top:8px;padding:9px;border-radius:9px;border:1.5px solid #E6E0D2;background:#fff;color:#6E6656;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit; }
        .pd-printer-pill{ padding:9px 14px;border-radius:9px;border:1.5px solid #E6E0D2;background:#fff;color:#8A6410;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;white-space:nowrap; }
        .pp-overlay{ position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:70;display:flex;align-items:center;justify-content:center;padding:16px; }
        .pp-modal{ background:#fff;border-radius:16px;max-width:400px;width:100%;padding:22px;max-height:88vh;overflow-y:auto; }
        .pp-modal h2{ font-size:15px;margin:0 0 4px;font-weight:800; }
        .pp-modal p{ font-size:12px;color:#6E6656;line-height:1.6;margin:0 0 14px; }
        .pp-mode-tabs{ display:flex;gap:6px;margin-bottom:16px;background:#F0EDE8;border-radius:10px;padding:4px; }
        .pp-mode-tab{ flex:1;padding:8px;border:none;border-radius:7px;background:transparent;color:#6E6656;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit; }
        .pp-mode-tab.sel{ background:#fff;color:#1A1610;box-shadow:0 1px 3px rgba(0,0,0,.1); }
        .pp-step{ display:flex;gap:10px;margin-bottom:14px; }
        .pp-step-n{ flex:none;width:22px;height:22px;border-radius:50%;background:#F0EDE8;color:#6E6656;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center; }
        .pp-step-txt{ font-size:12.5px;color:#3A342A;line-height:1.5;padding-top:2px; }
        .pp-dl-btn{ display:inline-block;margin-top:6px;padding:8px 14px;border-radius:8px;background:var(--ink);color:var(--sign);font-weight:700;font-size:12px;text-decoration:none; }
        .pp-retry{ width:100%;padding:10px;border-radius:9px;border:1.5px solid #E6E0D2;background:#fff;color:#3A342A;font-weight:700;font-size:12.5px;cursor:pointer;margin-top:6px;font-family:inherit; }
        .pp-printer-item{ display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1.5px solid #E6E0D2;border-radius:9px;margin-bottom:8px;cursor:pointer; }
        .pp-printer-item.sel{ border-color:#157A52;background:#E4F3EC; }
        .pp-close{ width:100%;padding:10px;border-radius:9px;border:none;background:#F0EDE8;color:#6E6656;font-weight:700;font-size:12.5px;cursor:pointer;margin-top:10px;font-family:inherit; }
        .pp-err{ background:#FBEAEA;color:#C43D3D;font-size:11.5px;padding:9px 11px;border-radius:8px;margin-bottom:12px;line-height:1.5; }
        .pd-empty{ text-align:center;color:#A79E8B;padding:40px 0;font-size:14px; }
        .pd-card-pending{ border:1.5px solid var(--accent); }
        .pd-accept{ width:100%;margin-top:8px;padding:9px;border-radius:9px;border:none;background:var(--accent);color:#fff;font-weight:800;font-size:14.5px;cursor:pointer; }
        .pd-next{ width:100%;margin-top:8px;padding:10px;border-radius:9px;border:none;background:var(--accent);color:#fff;font-weight:800;font-size:14.5px;cursor:pointer; }
        .pd-mb-select{ width:100%;margin-top:8px;padding:9px 10px;border-radius:9px;border:1.5px solid #E0DDD8;background:#fff;color:#111;font-weight:700;font-size:14px;font-family:inherit; }
        .pd-toolbar{ display:none; }
        .pd-search{ width:100%;padding:9px 12px;border-radius:9px;border:1px solid #E6E0D2;background:#F7F5F0;font-size:14px;font-family:inherit; }
        .pd-autotoggle{ display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:#6E6656;cursor:pointer; }
        .pd-switch{ width:36px;height:20px;border-radius:11px;background:#E6E0D2;position:relative;cursor:pointer;flex:none; }
        .pd-switch.on{ background:#157A52; }
        .pd-switch .k{ position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s; }
        .pd-switch.on .k{ left:18px; }
        .pd-newbtn{ padding:10px;border-radius:9px;border:none;background:var(--sign);color:var(--ink);font-weight:800;font-size:14px;cursor:pointer; }
        .np-overlay{ position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60;display:flex;align-items:flex-end;justify-content:center; }
        .np-drawer{ background:#F7F5F0;width:100%;max-width:480px;max-height:92vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden; }
        .np-head{ padding:16px;border-bottom:1px solid #EDE8E0;display:flex;justify-content:space-between;align-items:center;background:#fff; }
        .np-close{ width:28px;height:28px;border-radius:50%;border:1px solid #E6E0D2;background:#fff;cursor:pointer; }
        .np-body{ flex:1;overflow-y:auto;padding:14px 16px; }
        .np-section-label{ font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#A79E8B;margin:12px 0 6px; }
        .np-input{ width:100%;padding:9px 12px;border-radius:9px;border:1px solid #E6E0D2;background:#fff;font-size:12.5px;font-family:inherit;margin-bottom:8px; }
        .np-paychip{ flex:1;padding:9px;border-radius:9px;border:1.5px solid #E6E0D2;background:#fff;font-size:12px;font-weight:700;cursor:pointer; }
        .np-paychip.active{ background:var(--ink);color:var(--sign);border-color:var(--ink); }
        .np-prodgrid{ display:grid;grid-template-columns:1fr 1fr;gap:8px; }
        .np-prod{ background:#fff;border:1px solid #E6E0D2;border-radius:10px;padding:10px;cursor:pointer; }
        .np-prod-name{ font-size:12px;font-weight:700; }
        .np-prod-price{ font-size:11.5px;color:#6E6656;margin-top:3px; }
        .np-cartline{ display:flex;align-items:center;gap:6px;font-size:12px;padding:6px 0;border-bottom:1px solid #EDE8E0; }
        .np-qtybtn{ width:22px;height:22px;border-radius:6px;border:1px solid #E6E0D2;background:#fff;cursor:pointer;font-weight:800; }
        .np-totalrow{ display:flex;justify-content:space-between;font-weight:800;font-size:14px;padding-top:10px;margin-top:6px;border-top:1px dashed #E6E0D2; }
        .np-back{ background:none;border:none;color:#8A6410;font-weight:700;font-size:12px;cursor:pointer;padding:0; }
        .np-opt{ display:flex;justify-content:space-between;padding:9px 10px;border:1px solid #E6E0D2;border-radius:9px;margin-bottom:6px;font-size:12px;cursor:pointer;background:#fff; }
        .np-opt.active{ border-color:var(--sign-dark);background:#FEF3E2; }
        .np-addcart{ width:100%;padding:12px;border-radius:10px;border:none;background:var(--sign);color:var(--ink);font-weight:800;cursor:pointer; }
        .np-addcart:disabled{ background:#E2DCCB;color:#A79E8B; }
        .np-foot{ padding:12px 16px 16px;border-top:1px solid #EDE8E0;background:#fff; }
        .np-createbtn{ width:100%;padding:13px;border-radius:10px;border:none;background:#157A52;color:#fff;font-weight:800;cursor:pointer; }
        .np-createbtn:disabled{ background:#D8D2C4;color:#8A8577; }
        .pd-board{ display:none; }
        @media(min-width:768px){
          .pd-wrap{ max-width:none;margin:0;padding-bottom:40px; }
          .pd-mobile-only{ display:none; }
          .pd-toolbar{ display:flex;flex-direction:row;align-items:center;padding:16px 32px;gap:10px;background:#fff;border-bottom:1px solid #EDE8E0; }
          .pd-search{ max-width:280px; }
          .pd-datebar{ padding:0;flex:none; }
          .pd-date-input{ flex:none;width:150px; }
          .pd-autotoggle{ margin-left:auto; }
          .pd-newbtn{ padding:10px 20px; }
          /* display:grid em vez de flex+overflow-x:auto — sem scroll
             lateral nunca, as colunas dividem a largura disponível (uma
             fração cada, definida via JS em gridTemplateColumns) e
             encolhem sozinhas conforme a tela fica menor. */
          .pd-board{ display:grid;gap:10px;padding:20px 24px 28px;align-items:start; }
          .pd-board-col{ min-width:0;background:#EFEBE1;border-radius:14px;padding:10px;max-height:calc(100vh - 190px);display:flex;flex-direction:column;border-top:4px solid var(--accent); }
          .pd-board-colhead{ display:flex;align-items:center;gap:4px;padding:4px 4px 10px;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent); }
          .pd-board-colhead-lbl{ flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
          .pd-board-count{ background:var(--accent);color:#fff;font-size:12.5px;font-weight:800;padding:1px 8px;border-radius:20px;flex:none; }
          .pd-board-collapse{ width:20px;height:20px;border-radius:6px;border:none;background:rgba(0,0,0,.06);color:var(--accent);cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;flex:none;padding:0; }
          .pd-board-scroll{ overflow-y:auto;overflow-x:hidden;flex:1;min-height:0; }
          .pd-board .pd-card{ margin-bottom:8px; }
          .pd-board-empty-msg{ text-align:center;color:#A79E8B;font-size:13px;padding:20px 8px; }
          /* Coluna recolhida: tira estreita fixa, só rótulo (na vertical) +
             contador — pedido do Ricardo, set/2026. */
          .pd-board-col.collapsed{ padding:8px 4px; }
          .pd-board-col.collapsed .pd-board-colhead{ flex-direction:column;padding:0;gap:8px; }
          .pd-board-col.collapsed .pd-board-colhead-lbl{ writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;font-size:10.5px;flex:none;overflow:visible; }
          .pd-board-col.collapsed .pd-board-count{ writing-mode:horizontal-tb; }
          .pd-board-col.collapsed .pd-board-scroll{ display:none; }
        }
        /* Não fica sticky no mobile de propósito — a faixa do título
           (.pd-head) já é sticky lá, e duas coisas grudadas no topo ao
           mesmo tempo brigam pelo mesmo espaço. No desktop nada mais é
           sticky, então aqui pode grudar sem colidir com nada. */
        .pd-newalert{ position:relative;z-index:6;display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between;background:#C43D3D;color:#fff;padding:14px 16px;animation:pd-newalert-pulse 1.2s ease-in-out infinite; }
        .pd-newalert-txt{ font-size:14px;font-weight:800;flex:1;min-width:180px; }
        .pd-newalert-more{ font-weight:700;opacity:.85; }
        .pd-newalert-btn{ flex:none;padding:14px 22px;border-radius:11px;border:none;background:#fff;color:#C43D3D;font-weight:900;font-size:14px;cursor:pointer;white-space:nowrap; }
        @keyframes pd-newalert-pulse{ 0%,100%{ background:#C43D3D; } 50%{ background:#A82F2F; } }
        @media(min-width:768px){ .pd-newalert{ position:sticky;top:0;padding:18px 32px; } .pd-newalert-txt{ font-size:15px; } .pd-newalert-btn{ padding:16px 28px;font-size:15.5px; } }
        .pd-newalert-err{ background:#FBEAEA;color:#C43D3D;font-size:13px;font-weight:700;padding:10px 16px;line-height:1.5; }
        .pd-motoalert{ position:relative;z-index:6;display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between;background:#B5690C;color:#fff;padding:14px 16px;animation:pd-motoalert-pulse 1.2s ease-in-out infinite; }
        .pd-motoalert-txt{ font-size:14px;font-weight:800;flex:1;min-width:180px; }
        .pd-motoalert-more{ font-weight:700;opacity:.85; }
        .pd-motoalert-btn{ flex:none;padding:14px 22px;border-radius:11px;border:none;background:#fff;color:#B5690C;font-weight:900;font-size:14px;cursor:pointer;white-space:nowrap; }
        .pd-motoalert-btn:disabled{ opacity:.6;cursor:not-allowed; }
        @keyframes pd-motoalert-pulse{ 0%,100%{ background:#B5690C; } 50%{ background:#8F5209; } }
        /* Nunca sticky (mesmo no desktop) de propósito — se essa faixa e a
           de "pedido novo" aparecerem juntas, duas sticky top:0 brigam pelo
           mesmo espaço em vez de empilhar direito. Essa aqui só acompanha o
           scroll normal, sempre logo abaixo da outra quando as duas existem. */
        @media(min-width:768px){ .pd-motoalert{ padding:18px 32px; } .pd-motoalert-txt{ font-size:15px; } .pd-motoalert-btn{ padding:16px 28px;font-size:15.5px; } }
        .pd-card-late{ border:1.5px solid #C43D3D !important; }
        .pd-late-flag{ color:#C43D3D;font-weight:800;font-size:12px;margin-top:4px; }
      `}</style>
      {pedidosNovos.length > 0 && (
        <div className="pd-newalert">
          <div className="pd-newalert-txt">
            🔔 Pedido {pedidosNovos[0].order_number ? `#${pedidosNovos[0].order_number}` : ''} — {pedidosNovos[0].customer_name} — {fmt(pedidosNovos[0].total)}
            {pedidosNovos.length > 1 && <span className="pd-newalert-more"> · +{pedidosNovos.length - 1} outro(s) aguardando</span>}
          </div>
          <button className="pd-newalert-btn" onClick={() => printPedido(pedidosNovos[0])}>🖨️ IMPRIMIR PEDIDO</button>
        </div>
      )}
      {pedidosNovos.length > 0 && printError && <div className="pd-newalert-err">{printError}</div>}
      {pedidosSemMotoboy.length > 0 && (
        <div className="pd-motoalert">
          <div className="pd-motoalert-txt">
            🏍️ NENHUM MOTOBOY ACEITOU A CORRIDA — Pedido {pedidosSemMotoboy[0].order_number ? `#${pedidosSemMotoboy[0].order_number}` : ''} — {pedidosSemMotoboy[0].customer_name}
            {pedidosSemMotoboy.length > 1 && <span className="pd-motoalert-more"> · +{pedidosSemMotoboy.length - 1} outro(s)</span>}
          </div>
          <button className="pd-motoalert-btn" disabled={retryingMotoId === deliveryByPedido[pedidosSemMotoboy[0].id]?.id}
            onClick={() => { const d = deliveryByPedido[pedidosSemMotoboy[0].id]; if (d) retryMotoboy(d.id) }}>
            {retryingMotoId === deliveryByPedido[pedidosSemMotoboy[0].id]?.id ? 'Chamando...' : '🔁 SOLICITAR DE NOVO'}
          </button>
        </div>
      )}
      <div className="pd-mobile-only">
        <div className="pd-head">
          <div className="pd-head-left">
            <a href="/painel/compartilhar" className="pd-back">‹</a>
            <h1>Pedidos</h1>
            <label className="pd-auto-pill" title="Aceitar pedidos automaticamente">
              <div className={`pd-switch ${autoAceitar ? 'on' : ''}`} onClick={toggleAutoAceitar}><div className="k" /></div>
            </label>
            {entregaEnabled && (
              <label className="pd-auto-pill" title="Chamar motoboy da plataforma automaticamente">
                <span>🏍️</span>
                <div className={`pd-switch ${autoChamarMoto ? 'on' : ''}`} onClick={toggleAutoChamarMoto}><div className="k" /></div>
              </label>
            )}
          </div>
          <div className="pd-head-right">
            {isToday && <button className="pd-new-pill" onClick={openNovoPedido} title="Novo pedido">+</button>}
            <button onClick={openPrinterModal} style={{ fontSize: 11, fontWeight: 700, color: printerName ? '#157A52' : '#8A6410', background: printerName ? '#E4F3EC' : '#FBF1DC', padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>🖨️ {printerName ? 'Impressora' : 'Configurar'}</button>
            <a href="/painel/cozinha" style={{ fontSize: 11, fontWeight: 700, color: '#8A6410', background: '#FBF1DC', padding: '7px 12px', borderRadius: 8, textDecoration: 'none' }}>🍳 Cozinha</a>
          </div>
        </div>
        <div className="pd-datebar">
          <button className="pd-date-arrow" onClick={() => shiftDate(-1)} aria-label="Dia anterior">‹</button>
          <input type="date" className="pd-date-input" value={selectedDate} max={todayStr()} onChange={e => e.target.value && setSelectedDate(e.target.value)} />
          <button className="pd-date-arrow" onClick={() => shiftDate(1)} disabled={isToday} aria-label="Próximo dia">›</button>
          {!isToday && <button className="pd-today-btn" onClick={() => setSelectedDate(todayStr())}>Hoje</button>}
        </div>
        {!isToday && <div className="pd-hist-banner">📅 Vendo {fmtDateLabel(selectedDate)} — histórico, só consulta</div>}
        <div className="pd-searchbar">
          <input className="pd-search" placeholder="Buscar por cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="pd-tabs">
          {MOBILE_STAGES.map(t => {
            const count = searched.filter(p => t.match(p.status)).length
            return (
              <button key={t.key} className={`pd-tab ${mobileStage === t.key ? 'active' : ''}`} style={{ '--accent': t.accent } as React.CSSProperties} onClick={() => setMobileStage(t.key)}>
                {t.label} <span className="pd-tab-count">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="pd-body">
          {mobileList.length === 0 && <div className="pd-empty">Nenhum pedido em {currentStage.label.toLowerCase()}.</div>}
          {mobileList.map(renderCard)}
        </div>
      </div>

      <div className="pd-toolbar">
        <div className="pd-datebar">
          <button className="pd-date-arrow" onClick={() => shiftDate(-1)} aria-label="Dia anterior">‹</button>
          <input type="date" className="pd-date-input" value={selectedDate} max={todayStr()} onChange={e => e.target.value && setSelectedDate(e.target.value)} />
          <button className="pd-date-arrow" onClick={() => shiftDate(1)} disabled={isToday} aria-label="Próximo dia">›</button>
          {!isToday && <button className="pd-today-btn" onClick={() => setSelectedDate(todayStr())}>Hoje</button>}
        </div>
        <input className="pd-search" placeholder="Buscar por cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        <label className="pd-autotoggle">
          <div className={`pd-switch ${autoAceitar ? 'on' : ''}`} onClick={toggleAutoAceitar}><div className="k" /></div>
          Aceitar pedidos automaticamente
        </label>
        {entregaEnabled && (
          <label className="pd-autotoggle" title="Desliga se a loja já usa motoboy próprio — o botão 'Chamar motoboy' do card continua disponível de qualquer jeito">
            <div className={`pd-switch ${autoChamarMoto ? 'on' : ''}`} onClick={toggleAutoChamarMoto}><div className="k" /></div>
            🏍️ Chamar motoboy da plataforma automático
          </label>
        )}
        <button className="pd-printer-pill" onClick={openPrinterModal} style={printerName ? { background: '#E4F3EC', color: '#157A52', borderColor: '#B7DFC9' } : {}}>
          🖨️ {printerName ? `Impressora: ${isRawBtMode(printerName) ? 'RawBT (tablet)' : printerName}` : 'Configurar impressora'}
        </button>
        {isToday && <button className="pd-newbtn" onClick={openNovoPedido}>+ Novo pedido</button>}
      </div>
      {!isToday && <div className="pd-hist-banner">📅 Vendo {fmtDateLabel(selectedDate)} — histórico, só consulta</div>}

      {(() => {
        const showCancelados = cancelados.length > 0
        const colKeys: string[] = [...BOARD_COLUMNS, ...(showCancelados ? ['cancelado'] : [])]
        // Uma fração igual pra cada coluna aberta, faixa fixa estreita pra
        // cada recolhida — nunca soma mais que a largura disponível, então
        // nunca precisa de scroll lateral (pedido do Ricardo, set/2026).
        const gridTemplateColumns = colKeys.map(k => collapsedCols.has(k) ? '44px' : 'minmax(0,1fr)').join(' ')
        return (
          <div className="pd-board" style={{ gridTemplateColumns }}>
            {BOARD_COLUMNS.map(status => {
              const items = searched.filter(p => p.status === status)
              const isCollapsed = collapsedCols.has(status)
              return (
                <div className={`pd-board-col ${isCollapsed ? 'collapsed' : ''}`} key={status} style={{ '--accent': STATUS_COLOR[status].fg } as React.CSSProperties}>
                  <div className="pd-board-colhead">
                    <button className="pd-board-collapse" onClick={() => toggleColCollapse(status)} title={isCollapsed ? 'Expandir coluna' : 'Recolher coluna'}>{isCollapsed ? '›' : '‹'}</button>
                    <span className="pd-board-colhead-lbl">{STATUS_LABEL[status]}</span>
                    <span className="pd-board-count">{items.length}</span>
                  </div>
                  <div className="pd-board-scroll">
                    {items.length === 0 ? <div className="pd-board-empty-msg">Nenhum pedido</div> : items.map(renderCard)}
                  </div>
                </div>
              )
            })}
            {showCancelados && (() => {
              const isCollapsed = collapsedCols.has('cancelado')
              return (
                <div className={`pd-board-col ${isCollapsed ? 'collapsed' : ''}`} key="cancelado" style={{ '--accent': '#C43D3D' } as React.CSSProperties}>
                  <div className="pd-board-colhead">
                    <button className="pd-board-collapse" onClick={() => toggleColCollapse('cancelado')} title={isCollapsed ? 'Expandir coluna' : 'Recolher coluna'}>{isCollapsed ? '›' : '‹'}</button>
                    <span className="pd-board-colhead-lbl">Cancelados</span>
                    <span className="pd-board-count">{cancelados.length}</span>
                  </div>
                  <div className="pd-board-scroll">{cancelados.map(renderCard)}</div>
                </div>
              )
            })()}
          </div>
        )
      })()}

      {npOpen && (
        <div className="np-overlay" onClick={closeNovoPedido}>
          <div className="np-drawer" onClick={e => e.stopPropagation()}>
            <div className="np-head"><b>Novo pedido — Balcão/Telefone</b><button className="np-close" onClick={closeNovoPedido} aria-label="Fechar">✕</button></div>
            {!npDetail ? (
              <div className="np-body">
                <div className="np-section-label">Cliente</div>
                <input className="np-input" placeholder="Nome do cliente" value={npNome} onChange={e => setNpNome(e.target.value)} />
                <input className="np-input" placeholder="Telefone (opcional)" value={npTelefone} onChange={e => setNpTelefone(e.target.value)} inputMode="tel" />

                <div className="np-section-label">Entrega</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button className={`np-paychip ${npDeliveryType === 'entrega' ? 'active' : ''}`} onClick={() => setNpDeliveryType('entrega')}>🚚 Entrega</button>
                  <button className={`np-paychip ${npDeliveryType === 'retirada' ? 'active' : ''}`} onClick={() => setNpDeliveryType('retirada')}>🏪 Retirada</button>
                </div>
                {npDeliveryType === 'entrega' && (
                  <input className="np-input" placeholder="Endereço de entrega" value={npEndereco} onChange={e => setNpEndereco(e.target.value)} />
                )}
                <input className="np-input" placeholder="Observação (opcional)" value={npObs} onChange={e => setNpObs(e.target.value)} />

                <div className="np-section-label">Pagamento</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {(['dinheiro', 'pix', 'cartao'] as const).map(m => (
                    <button key={m} className={`np-paychip ${npPay === m ? 'active' : ''}`} onClick={() => setNpPay(m)}>{m === 'pix' ? 'Pix' : m === 'dinheiro' ? 'Dinheiro' : 'Cartão'}</button>
                  ))}
                </div>

                <div className="np-section-label">Itens do pedido</div>
                {npLoadingProdutos && <div style={{ fontSize: 12, color: '#A79E8B' }}>Carregando catálogo...</div>}
                {!npLoadingProdutos && npProdutos.length === 0 && <div style={{ fontSize: 12, color: '#A79E8B' }}>Nenhum produto ativo no catálogo.</div>}
                <div className="np-prodgrid">
                  {npProdutos.map(p => (
                    <div key={p.id} className="np-prod" onClick={() => p.groups?.length ? npOpenDetail(p) : npAddToCart(p.id, p.name, Number(p.sale_price))}>
                      <div className="np-prod-name">{p.name}</div>
                      <div className="np-prod-price">{fmt(Number(p.sale_price))}</div>
                    </div>
                  ))}
                </div>

                {npCart.length > 0 && (
                  <>
                    <div className="np-section-label">Carrinho</div>
                    {npCart.map(l => (
                      <div key={l.key} className="np-cartline">
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700 }}>{l.name}</div>
                          {l.modifiers.length > 0 && <div style={{ fontSize: 10.5, color: '#A79E8B' }}>{l.modifiers.map(m => m.name).join(', ')}</div>}
                        </div>
                        <button className="np-qtybtn" onClick={() => npChangeQty(l.key, -1)}>−</button>
                        <span style={{ width: 20, textAlign: 'center' }}>{l.qty}</span>
                        <button className="np-qtybtn" onClick={() => npChangeQty(l.key, 1)}>+</button>
                        <b style={{ width: 60, textAlign: 'right' }}>{fmt(l.unitPrice * l.qty)}</b>
                      </div>
                    ))}
                    <div className="np-totalrow"><span>Total</span><span>{fmt(npTotal)}</span></div>
                  </>
                )}
              </div>
            ) : (
              <div className="np-body">
                <button className="np-back" onClick={() => setNpDetail(null)}>‹ Voltar</button>
                <div style={{ fontWeight: 800, fontSize: 15, margin: '10px 0' }}>{npDetail.name}</div>
                {npDetail.groups.map((g, gi) => (
                  <div key={g.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5 }}>{g.name}</div>
                    <div style={{ fontSize: 10.5, color: '#A79E8B', marginBottom: 6 }}>
                      {g.required ? `Obrigatório · Escolha ${g.min_select}${g.max_select > g.min_select ? '-' + g.max_select : ''}` : `Opcional · Escolha até ${g.max_select}`}
                    </div>
                    {g.options.map((o, oi) => {
                      const active = npDetailSel[gi]?.includes(oi)
                      return (
                        <div key={o.id} className={`np-opt ${active ? 'active' : ''}`} onClick={() => npToggleOpt(gi, oi)}>
                          <span>{o.name}</span><span>{o.price > 0 ? '+ ' + fmt(o.price) : 'Grátis'}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <button className="np-addcart" disabled={!npDetailReqMet} onClick={npConfirmDetail}>Adicionar — {fmt(npDetailPrice)}</button>
              </div>
            )}
            {!npDetail && (
              <div className="np-foot">
                {npError && <div style={{ color: '#C43D3D', fontSize: 11.5, lineHeight: 1.5, marginBottom: 8 }}>{npError}</div>}
                <button className="np-createbtn" disabled={npSaving || !npNome.trim() || npCart.length === 0} onClick={npCriarPedido}>{npSaving ? 'Criando...' : 'Criar pedido'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showPrinterModal && (
        <div className="pp-overlay" onClick={() => setShowPrinterModal(false)}>
          <div className="pp-modal" onClick={e => e.stopPropagation()}>
            <h2>🖨️ Impressora de pedidos</h2>
            <p>Imprime o pedido automaticamente numa impressora térmica de 80mm, quando "Aceitar pedidos automaticamente" estiver ligado.</p>

            <div className="pp-mode-tabs">
              <button className={`pp-mode-tab ${printerModalMode === 'qz' ? 'sel' : ''}`} onClick={() => setPrinterModalMode('qz')}>💻 Computador</button>
              <button className={`pp-mode-tab ${printerModalMode === 'rawbt' ? 'sel' : ''}`} onClick={() => setPrinterModalMode('rawbt')}>📱 Tablet</button>
            </div>

            {printerModalMode === 'qz' && (
              <>
                {!isRawBtMode(printerName) && printerName && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#157A52', marginBottom: 8 }}>✓ Impressora configurada: {printerName}</div>
                )}
                {qzStatus !== 'connected' && (
                  <>
                    <div className="pp-step">
                      <span className="pp-step-n">1</span>
                      <span className="pp-step-txt">
                        Baixa e instala o app de impressão (uma vez só, no computador da impressora):<br/>
                        <a className="pp-dl-btn" href={supabase.storage.from('app-downloads').getPublicUrl('qz-tray-windows.exe').data.publicUrl} target="_blank" rel="noopener noreferrer">🪟 Baixar app de impressão (Windows)</a>{' '}
                        <a className="pp-dl-btn" href={supabase.storage.from('app-downloads').getPublicUrl('qz-tray-mac.pkg').data.publicUrl} target="_blank" rel="noopener noreferrer">🍎 Baixar app de impressão (Mac)</a>
                      </span>
                    </div>
                    <div className="pp-step">
                      <span className="pp-step-n">2</span>
                      <span className="pp-step-txt">Abre o app instalado (fica rodando quietinho, sem precisar mexer de novo) e volta aqui.</span>
                    </div>
                    <div className="pp-step">
                      <span className="pp-step-n">3</span>
                      <span className="pp-step-txt">Clica em "Testar conexão" — na primeira vez o app vai perguntar se pode confiar nesse site; marca "lembrar" pra não perguntar de novo.</span>
                    </div>
                    <div className="pp-step">
                      <span className="pp-step-n">4</span>
                      <span className="pp-step-txt">
                        Se continuar pedindo permissão toda hora mesmo marcando "lembrar", baixa os dois certificados abaixo e importa o certificado <b>raiz</b> como confiável nas configurações avançadas do app de impressão (pede ajuda ao suporte se precisar):<br/>
                        <a className="pp-dl-btn" href="/api/qz/certificado/raiz" target="_blank" rel="noopener noreferrer">🔐 Baixar certificado raiz</a>{' '}
                        <a className="pp-dl-btn" href="/api/qz/certificado/site" target="_blank" rel="noopener noreferrer">📄 Baixar certificado do site</a>
                      </span>
                    </div>
                    {qzStatus === 'error' && <div className="pp-err">{qzError}</div>}
                    <button className="pp-retry" onClick={startQzSetup} disabled={qzStatus === 'connecting'}>
                      {qzStatus === 'connecting' ? 'Conectando...' : '🔄 Testar conexão'}
                    </button>
                  </>
                )}

                {qzStatus === 'connected' && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#6E6656', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
                      {foundPrinters.length === 1 ? 'Impressora detectada automaticamente' : 'Escolhe a impressora'}
                    </div>
                    {foundPrinters.length === 0 && <div className="pp-err">Nenhuma impressora encontrada no computador. Confere se ela está ligada e instalada no Windows/Mac.</div>}
                    {foundPrinters.map(name => (
                      <div key={name} className={`pp-printer-item ${printerName === name ? 'sel' : ''}`} onClick={() => selectPrinter(name)}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{name}</span>
                        {printerName === name && <span style={{ color: '#157A52', fontSize: 12, fontWeight: 800 }}>✓ Selecionada</span>}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {printerModalMode === 'rawbt' && (
              <>
                {isRawBtMode(printerName) && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#157A52', marginBottom: 8 }}>✓ Impressão por RawBT ativada</div>
                )}
                <div className="pp-step">
                  <span className="pp-step-n">1</span>
                  <span className="pp-step-txt">Instala o app <b>RawBT</b> (grátis, Play Store) no tablet.</span>
                </div>
                <div className="pp-step">
                  <span className="pp-step-n">2</span>
                  <span className="pp-step-txt">Abre o RawBT, pareia a impressora térmica por Bluetooth por dentro dele e escolhe o idioma/página de código Português nas configurações do app.</span>
                </div>
                <div className="pp-step">
                  <span className="pp-step-n">3</span>
                  <span className="pp-step-txt">Clica no botão abaixo pra ativar. Não precisa "conectar" com nada aqui — é o próprio botão "🖨️ Imprimir" no pedido que vai abrir o RawBT na hora.</span>
                </div>
                <button className="pp-retry" onClick={() => selectPrinter(RAWBT_SENTINEL)} disabled={printerSaving}>
                  {isRawBtMode(printerName) ? '✓ Ativado' : 'Ativar impressão por RawBT'}
                </button>
                <div style={{ fontSize: 11, color: '#8A6410', marginTop: 8, lineHeight: 1.5 }}>
                  ⚠ No tablet, a impressão automática de pedido novo não funciona — o Android só deixa abrir o RawBT depois de um toque de verdade na tela. Precisa tocar em "🖨️ Imprimir" em cada pedido.
                </div>
              </>
            )}

            {printerName && (
              <button className="pp-retry" style={{ color: '#C43D3D' }} onClick={removePrinter} disabled={printerSaving}>✕ Remover impressora configurada</button>
            )}
            <button className="pp-close" onClick={() => setShowPrinterModal(false)}>Fechar</button>
          </div>
        </div>
      )}

      {editId && (() => {
        const pedido = pedidos.find(p => p.id === editId)
        if (!pedido) return null
        return (
          <EditarPedidoPanel
            pedido={pedido}
            companyId={companyId}
            onClose={() => setEditId(null)}
            onSaved={() => loadAll(companyId, selectedDate)}
          />
        )
      })()}
    </div>
    </>
  )
}
