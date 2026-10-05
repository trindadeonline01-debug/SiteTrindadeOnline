'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { npGroupContribution, type NpProduto, type NpCartLine } from '@/lib/produtoCart'

type DeliveryType = 'entrega' | 'retirada' | 'balcao'
type PedidoParaEditar = {
  id: string; order_number: number | null
  customer_name: string; customer_phone: string | null
  delivery_type: DeliveryType; delivery_address: string | null
  scheduled_for: string | null; payment_method: string | null
  delivery_fee: number; created_at: string
  itens: { id: string; product_name: string; unit_price: number; qty: number; peso_kg: number | null; selected_options: { name: string; price: number }[] }[]
}

// Linha do carrinho na edição, com o extra de peso variável — produto pesado
// na loja (carne, peixe) raramente bate exatamente 1kg/500g redondo, então o
// lojista precisa poder corrigir o valor final pelo peso real apurado na
// balança (pedido do Ricardo, set/2026, caso real: pediu 1kg de peixe, pesou
// 1,250kg). Detecta automaticamente pelo nome ("... Kg" no catálogo, ver
// padrão já documentado no KNOWLEDGE_BASE pra produto vendido por peso), mas
// dá pra ligar/desligar por item também, pra cobrir qualquer caso.
// unitPrice aqui SEMPRE representa o preço por kg quando pesoModo é true —
// o total da linha (o que de fato é salvo em loja_pedido_itens.unit_price,
// com qty travado em 1) é unitPrice × pesoKg. Reabrindo a edição depois,
// recupera o preço por kg de volta dividindo o total salvo pelo peso_kg
// salvo — não perde a informação entre uma correção e outra.
// pesoKg guarda só os DÍGITOS digitados (nunca vírgula/ponto) — igual
// máscara de dinheiro de PDV: os últimos 3 dígitos sempre viram a casa
// decimal (kg até grama), a vírgula é só de exibição. Ricardo pediu pra não
// precisar digitar vírgula/ponto na mão (set/2026). Campo number ligado
// direto a um valor já convertido também brigava com quem estava digitando
// (achado real: cada tecla resetava o campo no meio da digitação e o zero
// da frente empacava, ex: "01,2") — guardar só dígitos crus evita isso.
type EditItem = NpCartLine & { pesoModo: boolean; pesoKg: string }
const PESO_REGEX = /\bkg\b/i

function pesoDigitsFromKg(n: number): string {
  return String(Math.max(0, Math.round(n * 1000)))
}
function pesoNum(digits: string): number {
  const clean = digits.replace(/\D/g, '')
  return clean ? parseInt(clean, 10) / 1000 : 0
}
function pesoDisplay(digits: string): string {
  const clean = digits.replace(/\D/g, '')
  if (!clean) return ''
  const padded = clean.padStart(4, '0')
  const whole = padded.slice(0, -3).replace(/^0+(?=\d)/, '')
  return `${whole},${padded.slice(-3)}`
}
function lineTotal(l: EditItem): number {
  return l.pesoModo ? l.unitPrice * pesoNum(l.pesoKg) : l.unitPrice * l.qty
}

// Assinatura comparável do carrinho (nome × qtd @ preço unitário), ordenada
// pra não dar falso positivo só por causa da ordem dos itens — usada pra
// decidir se o pedido mudou o suficiente pra avisar o cliente (comparação
// por total sozinha deixaria passar o caso raro de trocar um item por outro
// de preço idêntico).
function itemsSignature(items: { name: string; qty: number; unitPrice: number }[]): string {
  return items.map(it => `${it.name}×${it.qty}@${it.unitPrice.toFixed(2)}`).sort().join('|')
}

const PAY_BASE = [{ key: 'pix', label: 'Pix' }, { key: 'dinheiro', label: 'Dinheiro' }, { key: 'cartao', label: 'Cartão' }]
const PAY_ALL: Record<string, string> = {
  pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
  vale_refeicao: 'Vale-refeição', vale_alimentacao: 'Vale-alimentação', picpay: 'PicPay',
}
function payLabel(key: string) { return PAY_ALL[key] || key }
function timeAgo(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  return `${h}h${mins % 60 ? mins % 60 + 'min' : ''}`
}
function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function toLocalInputValue(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Tela única de edição de pedido — pedido do Ricardo, set/2026, inspirado no
// concorrente Brendi: nada de wizard em etapas, as 5 seções (cliente,
// produtos, endereço, agendamento, pagamento) ficam visíveis ao mesmo tempo
// numa única tela, sem scroll lateral. O painel inteiro tem altura máxima
// travada (92vh) com scroll interno — não pode "vazar" pra fora da página.
export default function EditarPedidoPanel({ pedido, companyId, onClose, onSaved }: {
  pedido: PedidoParaEditar
  companyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [nome, setNome] = useState(pedido.customer_name)
  const [telefone, setTelefone] = useState(pedido.customer_phone || '')
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(pedido.delivery_type)
  const [endereco, setEndereco] = useState(pedido.delivery_address || '')
  const [agendado, setAgendado] = useState(!!pedido.scheduled_for)
  const [scheduledFor, setScheduledFor] = useState(toLocalInputValue(pedido.scheduled_for))
  const [payMethod, setPayMethod] = useState(pedido.payment_method || '')
  const [items, setItems] = useState<EditItem[]>(pedido.itens.map(it => {
    const temPeso = it.peso_kg != null && it.peso_kg > 0
    return {
      key: it.id, produtoId: '', name: it.product_name, modifiers: it.selected_options || [],
      unitPrice: temPeso ? it.unit_price / it.peso_kg! : it.unit_price,
      qty: it.qty,
      pesoModo: temPeso || PESO_REGEX.test(it.product_name),
      pesoKg: pesoDigitsFromKg(temPeso ? it.peso_kg! : (it.qty || 1)),
    }
  }))

  const [produtos, setProdutos] = useState<NpProduto[]>([])
  const [loadingProdutos, setLoadingProdutos] = useState(true)
  const [payOptions, setPayOptions] = useState<{ key: string; label: string }[]>(PAY_BASE)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [detail, setDetail] = useState<NpProduto | null>(null)
  const [detailSel, setDetailSel] = useState<number[][]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Snapshot de como o pedido chegou nesta tela — compara contra o que vai
  // ser salvo pra decidir se avisa o cliente por WhatsApp. Lazy init (função
  // no useState) pra calcular só uma vez, a partir do pedido ORIGINAL — não
  // pode reusar o estado `items` pra isso, porque esse já é o rascunho
  // mutável que o lojista está editando.
  const [initialTotal] = useState(() => pedido.itens.reduce((s, it) => s + it.unit_price * it.qty, 0) + (pedido.delivery_type === 'entrega' ? (pedido.delivery_fee || 0) : 0))
  const [initialItemsKey] = useState(() => itemsSignature(pedido.itens.map(it => ({ name: it.product_name, qty: it.qty, unitPrice: it.unit_price }))))

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: comp }] = await Promise.all([
        supabase.from('loja_produtos').select('id, name, sale_price, category_id, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))').eq('company_id', companyId).eq('active', true).order('display_order'),
        supabase.from('companies').select('loja_payment_methods').eq('id', companyId).single(),
      ])
      setProdutos((prods || []) as any)
      setLoadingProdutos(false)
      const configured: string[] = comp?.loja_payment_methods || []
      if (configured.length > 0) setPayOptions(configured.map(k => ({ key: k, label: payLabel(k) })))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  // Se o método salvo no pedido não estiver na lista de opções da loja
  // (mudou a configuração depois, ou é texto livre antigo), mantém ele como
  // opção extra pra não sumir o que já estava selecionado.
  const allPayOptions = payMethod && !payOptions.some(p => p.key === payMethod)
    ? [...payOptions, { key: payMethod, label: payLabel(payMethod) }]
    : payOptions

  function changeQty(key: string, delta: number) {
    setItems(prev => prev.map(l => l.key === key ? { ...l, qty: l.qty + delta } : l).filter(l => l.qty > 0))
  }
  function togglePesoModo(key: string) {
    setItems(prev => prev.map(l => l.key === key ? { ...l, pesoModo: !l.pesoModo, pesoKg: l.pesoKg || pesoDigitsFromKg(l.qty || 1) } : l))
  }
  function setPesoKg(key: string, valor: string) {
    // Máscara de PDV: guarda só os dígitos digitados, sem limite de tamanho
    // artificial — a exibição (pesoDisplay) é que decide onde entra a
    // vírgula, sempre 3 casas a partir da direita.
    const digits = valor.replace(/\D/g, '')
    setItems(prev => prev.map(l => l.key === key ? { ...l, pesoKg: digits } : l))
  }
  function removeItem(key: string) { setItems(prev => prev.filter(l => l.key !== key)) }
  function addSimple(p: NpProduto) {
    setItems(prev => [...prev, { key: `${p.id}-${Date.now()}`, produtoId: p.id, name: p.name, modifiers: [], unitPrice: p.sale_price, qty: 1, pesoModo: PESO_REGEX.test(p.name), pesoKg: '1000' }])
    setPickerOpen(false)
  }
  function openDetail(p: NpProduto) { setDetail(p); setDetailSel(p.groups.map(() => [])); setPickerOpen(false) }
  function toggleOpt(gi: number, oi: number) {
    if (!detail) return
    const g = detail.groups[gi]
    setDetailSel(sel => sel.map((s, i) => {
      if (i !== gi) return s
      const active = s.includes(oi)
      if (g.max_select === 1) return active ? [] : [oi]
      if (active) return s.filter(x => x !== oi)
      if (s.length < g.max_select) return [...s, oi]
      return s
    }))
  }
  const detailReqMet = detail ? detail.groups.every((g, gi) => !g.required || detailSel[gi].length >= g.min_select) : true
  const detailPrice = detail ? detail.sale_price + detail.groups.reduce((s, g, gi) => s + npGroupContribution(g, detailSel[gi]), 0) : 0
  function confirmDetail() {
    if (!detail || !detailReqMet) return
    const modifiers: { name: string; price: number }[] = []
    detail.groups.forEach((g, gi) => detailSel[gi].forEach(oi => modifiers.push({ name: g.options[oi].name, price: g.options[oi].price })))
    setItems(prev => [...prev, { key: `${detail.id}-${Date.now()}`, produtoId: detail.id, name: detail.name, modifiers, unitPrice: detailPrice, qty: 1, pesoModo: PESO_REGEX.test(detail.name), pesoKg: '1000' }])
    setDetail(null)
  }

  const subtotal = items.reduce((s, l) => s + lineTotal(l), 0)
  const deliveryFee = deliveryType === 'entrega' ? (pedido.delivery_fee || 0) : 0
  const total = subtotal + deliveryFee

  async function handleSave() {
    setError('')
    if (!nome.trim()) { setError('Preenche o nome do cliente.'); return }
    if (items.length === 0) { setError('O pedido precisa ter pelo menos 1 produto.'); return }
    if (deliveryType === 'entrega' && !endereco.trim()) { setError('Preenche o endereço de entrega.'); return }
    setSaving(true)
    const { error: upErr } = await supabase.from('loja_pedidos').update({
      customer_name: nome.trim(),
      customer_phone: telefone.trim() || null,
      delivery_type: deliveryType,
      delivery_address: deliveryType === 'entrega' ? endereco.trim() : null,
      scheduled_for: agendado && scheduledFor ? new Date(scheduledFor).toISOString() : null,
      payment_method: payMethod || null,
      subtotal, total, delivery_fee: deliveryFee,
      updated_at: new Date().toISOString(),
    }).eq('id', pedido.id)
    if (upErr) { setError(upErr.message); setSaving(false); return }
    await supabase.from('loja_pedido_itens').delete().eq('pedido_id', pedido.id)
    const { error: itErr } = await supabase.from('loja_pedido_itens').insert(items.map(l => ({
      pedido_id: pedido.id, product_name: l.name,
      unit_price: l.pesoModo ? Math.round(l.unitPrice * pesoNum(l.pesoKg) * 100) / 100 : l.unitPrice,
      qty: l.pesoModo ? 1 : l.qty,
      peso_kg: l.pesoModo ? pesoNum(l.pesoKg) : null,
      selected_options: l.modifiers,
    })))
    if (itErr) { setError('Pedido atualizado, mas falhou ao salvar os itens: ' + itErr.message); setSaving(false); return }

    // Só avisa o cliente quando itens ou total de fato mudaram — edição que
    // só ajustou dado interno (nome, telefone, endereço, agendamento,
    // pagamento) não dispara mensagem nenhuma (pedido do Ricardo, out/2026).
    const newItemsKey = itemsSignature(items.map(l => ({
      name: l.name,
      qty: l.pesoModo ? 1 : l.qty,
      unitPrice: l.pesoModo ? Math.round(l.unitPrice * pesoNum(l.pesoKg) * 100) / 100 : l.unitPrice,
    })))
    if (newItemsKey !== initialItemsKey || total !== initialTotal) {
      fetch('/api/loja/pedido-editado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, pedidoId: pedido.id }),
      }).catch(() => {})
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="ep-overlay" onClick={onClose}>
      <style>{`
        /* Mobile primeiro (igual o resto do painel — corte em 768px): tela
           cheia, 1 coluna só, sem o "cartão flutuante" que sobrava largura
           no celular (achado real do Ricardo testando no celular da Vivi,
           set/2026). O layout de 3 colunas lado a lado é só a versão
           >=768px, não o padrão. */
        /* z-index acima da tabbar do rodapé mobile (9999) e do CartBar
           global (10000) — o painel é um modal de tela cheia, então precisa
           cobrir os dois de ponta a ponta, não ficar atrás deles (achado
           real do Ricardo, set/2026: rodapé do site tampando o fim da
           tela de editar pedido). */
        .ep-overlay{ position:fixed;inset:0;background:rgba(10,8,6,.55);z-index:10050;display:flex;align-items:center;justify-content:center;padding:0; }
        .ep-panel{ background:#fff;border-radius:0;width:100%;max-width:100%;max-height:100vh;min-width:0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35);font-family:'Archivo',sans-serif;color:var(--ink); }
        /* Tela cheia no mobile encosta direto na borda do aparelho — soma a
           área segura (notch/ilha dinâmica em cima, indicador de home
           embaixo) além do padding normal, senão o cabeçalho e os botões
           "Cancelar/Salvar" ficam parcialmente cobertos pelo hardware. */
        .ep-hd{ display:flex;align-items:center;gap:10px;padding:calc(14px + env(safe-area-inset-top)) 14px 14px;border-bottom:1px solid #EDE8E0;flex:none;min-width:0; }
        .ep-hd-num{ font-family:'Anton',sans-serif;font-size:15px;letter-spacing:.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .ep-timer{ display:flex;align-items:center;gap:5px;background:#F5F6F2;color:#6E6656;font-size:10.5px;font-weight:700;padding:5px 8px;border-radius:20px;flex:none;white-space:nowrap; }
        .ep-close{ margin-left:0;width:30px;height:30px;border-radius:9px;border:1.5px solid #E6E0D2;background:#fff;color:var(--ink);font-size:15px;cursor:pointer;flex:none; }
        /* minmax(0,1fr), não 1fr puro — 1fr sozinho tem um mínimo implícito
           igual ao conteúdo (min-width:auto da grid item), então qualquer
           coisa que não quebra linha (nome de produto comprido, chips de
           pagamento) empurrava a coluna inteira mais larga que a tela —
           com overflow-x:hidden isso não vira scroll, vira corte mesmo
           (achado real do Ricardo, out/2026, testando no celular). */
        .ep-body{ flex:1;overflow-y:auto;overflow-x:hidden;padding:12px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;align-items:start; }
        .ep-footer{ flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #EDE8E0; }
        @media(min-width:768px){
          .ep-overlay{ padding:16px; }
          .ep-panel{ border-radius:18px;max-width:1180px;max-height:92vh; }
          .ep-hd{ gap:12px;padding:16px 20px; }
          .ep-hd-num{ font-size:17px; }
          .ep-timer{ font-size:11.5px;padding:5px 10px; }
          .ep-close{ width:32px;height:32px;margin-left:auto; }
          .ep-body{ padding:16px 20px;grid-template-columns:270px minmax(0,1fr) 290px;gap:12px; }
          .ep-footer{ padding:13px 20px; }
          .ep-sec-produtos{ grid-row:span 2; }
        }
        .ep-err{ color:var(--alert);font-size:12px;font-weight:600; }
        .ep-btn{ border:none;border-radius:9px;padding:11px 18px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit; }
        .ep-btn-primary{ background:var(--ink);color:var(--sign); }
        .ep-btn-primary:disabled{ opacity:.6;cursor:default; }
        .ep-btn-ghost{ background:#F5F6F2;color:var(--ink); }

        .ep-sec{ background:#F5F6F2;border-radius:12px;padding:13px 13px 14px;border-left:4px solid transparent;min-width:0; }
        .ep-sec h4{ margin:0 0 9px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em; }
        .ep-sec-cliente{ border-left-color:var(--alert); } .ep-sec-cliente h4{ color:var(--alert); }
        .ep-sec-produtos{ border-left-color:#7A3FB0; } .ep-sec-produtos h4{ color:#7A3FB0; }
        .ep-sec-endereco{ border-left-color:var(--info); } .ep-sec-endereco h4{ color:var(--info); }
        .ep-sec-agenda{ border-left-color:#0E7C86; } .ep-sec-agenda h4{ color:#0E7C86; }
        .ep-sec-pagamento{ border-left-color:var(--open); } .ep-sec-pagamento h4{ color:var(--open); }

        .ep-field{ margin-bottom:9px; }
        .ep-field label{ display:block;font-size:10.5px;font-weight:700;color:#6E6656;margin-bottom:4px; }
        .ep-field input, .ep-field textarea{ width:100%;padding:9px 10px;border-radius:8px;border:1.5px solid #E6E0D2;background:#fff;color:var(--ink);font-size:12.5px;font-family:inherit; }
        .ep-field textarea{ resize:vertical;min-height:52px; }

        .ep-seg{ display:flex;background:#fff;border:1.5px solid #E6E0D2;border-radius:9px;overflow:hidden;margin-bottom:9px; }
        .ep-seg button{ flex:1;border:none;background:none;padding:9px 4px;font-size:11px;font-weight:700;color:#6E6656;cursor:pointer;font-family:inherit; }
        .ep-seg button.on-endereco{ background:var(--info);color:#fff; }
        .ep-seg button.on-agenda{ background:#0E7C86;color:#fff; }

        .ep-chips{ display:flex;flex-wrap:wrap;gap:6px; }
        .ep-chip{ border:1.5px solid #E6E0D2;background:#fff;color:#6E6656;padding:7px 11px;border-radius:20px;font-size:11.5px;font-weight:700;cursor:pointer; }
        .ep-chip.on{ background:var(--open);border-color:var(--open);color:#fff; }

        .ep-items{ display:flex;flex-direction:column;gap:7px;margin-bottom:9px;max-height:230px;overflow-y:auto; }
        .ep-item{ display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E6E0D2;border-radius:9px;padding:7px 9px;min-width:0; }
        .ep-item-name{ flex:1;min-width:0; }
        .ep-item-name b{ font-size:12px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .ep-item-mods{ font-size:10px;color:#A79E8B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .ep-qty{ display:flex;align-items:center;gap:5px;flex:none; }
        .ep-qty button{ width:20px;height:20px;border-radius:6px;border:1px solid #E6E0D2;background:#F5F6F2;cursor:pointer;font-weight:800;line-height:1; }
        .ep-qty span{ min-width:14px;text-align:center;font-weight:700;font-size:11.5px; }
        .ep-peso-toggle{ flex:none;width:22px;height:22px;border-radius:6px;border:1px solid #E6E0D2;background:#F5F6F2;cursor:pointer;font-size:11px;line-height:1;opacity:.5; }
        .ep-peso-toggle.on{ background:#7A3FB0;border-color:#7A3FB0;opacity:1; }
        .ep-peso{ display:flex;align-items:center;gap:4px;flex:none; }
        .ep-peso input{ width:70px;padding:5px 6px;border-radius:6px;border:1.5px solid #7A3FB0;background:#fff;font-size:12.5px;font-weight:700;text-align:right;font-family:inherit;box-sizing:border-box; }
        .ep-peso span{ font-size:10.5px;color:#6E6656;font-weight:700; }
        .ep-item-price{ flex:none;font-weight:800;font-size:11.5px;width:58px;text-align:right; }
        .ep-item-rm{ flex:none;border:none;background:none;color:var(--alert);cursor:pointer;font-size:13px;padding:0 2px; }
        .ep-add{ width:100%;padding:9px;border-radius:9px;border:1.5px dashed #7A3FB0;background:none;color:#7A3FB0;font-weight:700;font-size:12px;cursor:pointer;margin-bottom:9px; }
        .ep-totals{ border-top:1px dashed #E6E0D2;padding-top:7px;display:flex;justify-content:space-between;font-size:12.5px;font-weight:800; }

        .ep-picker{ position:absolute;inset:0;background:#fff;border-radius:9px;padding:10px;overflow-y:auto;z-index:5; }
        .ep-picker-item{ display:flex;justify-content:space-between;align-items:center;padding:9px 6px;border-bottom:1px solid #F0EDE8;cursor:pointer;font-size:12.5px; }
        .ep-picker-close{ width:100%;padding:8px;border-radius:8px;border:none;background:#F5F6F2;color:#6E6656;font-weight:700;font-size:11.5px;cursor:pointer;margin-top:6px; }

        .ep-detail-overlay{ position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10060;display:flex;align-items:flex-end;justify-content:center; }
        .ep-detail{ background:#fff;border-radius:18px 18px 0 0;max-width:460px;width:100%;max-height:80vh;overflow-y:auto;padding:18px 18px calc(18px + env(safe-area-inset-bottom)); }
        .ep-grp{ margin:14px 0 6px;font-weight:800;font-size:12.5px; }
        .ep-opt{ display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #F0EDE8;cursor:pointer;font-size:12.5px; }
        .ep-opt.sel{ color:var(--open);font-weight:700; }
        .ep-detail-confirm{ width:100%;margin-top:14px;padding:12px;border-radius:9px;border:none;background:var(--ink);color:var(--sign);font-weight:800;font-size:13px;cursor:pointer; }
        .ep-detail-confirm:disabled{ opacity:.5; }

      `}</style>

      <div className="ep-panel" onClick={e => e.stopPropagation()}>
        <div className="ep-hd">
          <div className="ep-hd-num">{pedido.order_number ? `#${pedido.order_number}` : `#${pedido.id.slice(0, 8)}`} · {pedido.customer_name}</div>
          <div className="ep-timer">⏱ Há {timeAgo(pedido.created_at)}</div>
          <button className="ep-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="ep-body">
          <div className="ep-sec ep-sec-cliente">
            <h4>👤 Cliente</h4>
            <div className="ep-field"><label>Nome</label><input value={nome} onChange={e => setNome(e.target.value)} /></div>
            <div className="ep-field"><label>WhatsApp</label><input value={telefone} onChange={e => setTelefone(e.target.value)} /></div>
          </div>

          <div className="ep-sec ep-sec-produtos" style={{ position: 'relative' }}>
            <h4>🛒 Produtos</h4>
            <div className="ep-items">
              {items.map(l => (
                <div className="ep-item" key={l.key}>
                  <div className="ep-item-name">
                    <b>{l.name}</b>
                    {l.modifiers.length > 0 && <div className="ep-item-mods">{l.modifiers.map(m => m.name).join(', ')}</div>}
                    {l.pesoModo && <div className="ep-item-mods">{fmt(l.unitPrice)}/kg</div>}
                  </div>
                  <button
                    className={`ep-peso-toggle ${l.pesoModo ? 'on' : ''}`}
                    title={l.pesoModo ? 'Vendido por peso — clique pra voltar a unidade' : 'Marcar como vendido por peso (kg)'}
                    onClick={() => togglePesoModo(l.key)}
                  >⚖️</button>
                  {l.pesoModo ? (
                    <div className="ep-peso">
                      <input
                        type="text" inputMode="numeric" placeholder="0,000"
                        value={pesoDisplay(l.pesoKg)} onChange={e => setPesoKg(l.key, e.target.value)}
                      />
                      <span>kg</span>
                    </div>
                  ) : (
                    <div className="ep-qty">
                      <button onClick={() => changeQty(l.key, -1)}>−</button>
                      <span>{l.qty}</span>
                      <button onClick={() => changeQty(l.key, 1)}>+</button>
                    </div>
                  )}
                  <div className="ep-item-price">{fmt(lineTotal(l))}</div>
                  <button className="ep-item-rm" onClick={() => removeItem(l.key)} title="Remover">✕</button>
                </div>
              ))}
              {items.length === 0 && <div style={{ fontSize: 12, color: '#A79E8B', padding: '8px 0' }}>Nenhum produto — adiciona pelo menos 1.</div>}
            </div>
            <button className="ep-add" onClick={() => setPickerOpen(true)}>+ Adicionar produto</button>
            <div className="ep-totals"><span>Total</span><span>{fmt(total)}</span></div>

            {pickerOpen && (
              <div className="ep-picker">
                {loadingProdutos && <div style={{ fontSize: 12, color: '#A79E8B' }}>Carregando catálogo...</div>}
                {!loadingProdutos && produtos.length === 0 && <div style={{ fontSize: 12, color: '#A79E8B' }}>Nenhum produto ativo no catálogo.</div>}
                {produtos.map(p => (
                  <div className="ep-picker-item" key={p.id} onClick={() => p.groups?.length ? openDetail(p) : addSimple(p)}>
                    <span>{p.name}</span><span>{fmt(p.sale_price)}</span>
                  </div>
                ))}
                <button className="ep-picker-close" onClick={() => setPickerOpen(false)}>Fechar</button>
              </div>
            )}
          </div>

          <div className="ep-sec ep-sec-endereco">
            <h4>📍 Entrega</h4>
            <div className="ep-seg">
              <button className={deliveryType === 'entrega' ? 'on-endereco' : ''} onClick={() => setDeliveryType('entrega')}>Entrega</button>
              <button className={deliveryType === 'retirada' ? 'on-endereco' : ''} onClick={() => setDeliveryType('retirada')}>Retirada</button>
              <button className={deliveryType === 'balcao' ? 'on-endereco' : ''} onClick={() => setDeliveryType('balcao')}>Balcão</button>
            </div>
            {deliveryType === 'entrega' && (
              <div className="ep-field"><label>Endereço</label><textarea value={endereco} onChange={e => setEndereco(e.target.value)} /></div>
            )}
          </div>

          <div className="ep-sec ep-sec-agenda">
            <h4>📅 Agendamento</h4>
            <div className="ep-seg">
              <button className={!agendado ? 'on-agenda' : ''} onClick={() => setAgendado(false)}>Agora</button>
              <button className={agendado ? 'on-agenda' : ''} onClick={() => setAgendado(true)}>Agendar</button>
            </div>
            {agendado && (
              <div className="ep-field"><label>Data e hora</label><input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} /></div>
            )}
          </div>

          <div className="ep-sec ep-sec-pagamento">
            <h4>💰 Pagamento</h4>
            <div className="ep-chips">
              {allPayOptions.map(p => (
                <span key={p.key} className={`ep-chip ${payMethod === p.key ? 'on' : ''}`} onClick={() => setPayMethod(p.key)}>{p.label}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="ep-footer">
          <span className="ep-err">{error}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="ep-btn ep-btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="ep-btn ep-btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
        </div>
      </div>

      {detail && (
        <div className="ep-detail-overlay" onClick={() => setDetail(null)}>
          <div className="ep-detail" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{detail.name}</h3>
            {detail.groups.map((g, gi) => (
              <div key={g.id}>
                <div className="ep-grp">{g.name} {g.required && <span style={{ color: 'var(--alert)', fontWeight: 700 }}>*obrigatório</span>}</div>
                {g.options.map((o, oi) => (
                  <div key={o.id} className={`ep-opt ${detailSel[gi]?.includes(oi) ? 'sel' : ''}`} onClick={() => toggleOpt(gi, oi)}>
                    <span>{detailSel[gi]?.includes(oi) ? '✓ ' : ''}{o.name}</span>
                    <span>{o.price > 0 ? '+' + fmt(o.price) : 'grátis'}</span>
                  </div>
                ))}
              </div>
            ))}
            <button className="ep-detail-confirm" disabled={!detailReqMet} onClick={confirmDetail}>Adicionar · {fmt(detailPrice)}</button>
          </div>
        </div>
      )}
    </div>
  )
}
