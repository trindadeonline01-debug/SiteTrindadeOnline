'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { moduleActive } from '@/lib/modules'
import { qzPrintRaw, buildReceipt, buildKitchenTicket, isRawBtMode, printViaRawBt } from '@/lib/qzPrint'
import { fetchPedidoComItensComRetry } from '@/lib/autoprint'
import { npGroupContribution, type NpGrupo, type NpProduto, type NpCartLine, PESO_REGEX, pesoNum, pesoDisplay } from '@/lib/produtoCart'

// PDV — tela cheia (bare route, igual Cozinha), pra venda de balcão rápida.
// Mesmo catálogo/preço/formas de pagamento da loja, só muda a visualização:
// grid denso de produtos (pedido do Ricardo, out/2026 — "pelo menos 18 por
// linha", um PDV de verdade não é feito de cards grandes) + carrinho em
// forma de recibo do lado, atalhos de teclado (F2/F3/F4) e tela de troco.
// Cria o MESMO pedido que "+ Novo pedido" de /painel/pedidos já cria hoje
// (origin: 'balcao', delivery_type: 'balcao') — zero mudança de schema,
// zero mudança no que os Relatórios já mostram (a venda cai em "🏪 Balcão"
// sozinha). Peso variável usa a mesma lógica de EditarPedidoPanel (extraída
// pra produtoCart.ts), só que com uma telinha de pesagem em vez de editar
// inline — pedido explícito do Ricardo no mockup aprovado.
type Item = NpCartLine & { pesoModo: boolean; pesoKg: string }
type Categoria = { id: string; name: string }

const PAY_ALL: Record<string, string> = {
  pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
  vale_refeicao: 'Vale-refeição', vale_alimentacao: 'Vale-alimentação', picpay: 'PicPay',
}
const PAY_ICON: Record<string, string> = { pix: '📱', dinheiro: '💵', cartao: '💳', cartao_credito: '💳', cartao_debito: '💳', vale_refeicao: '🍽️', vale_alimentacao: '🛒', picpay: '📲' }
function payLabel(key: string) { return PAY_ALL[key] || key }
function fmt(n: number) { return 'R$ ' + (Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',') }

function lineTotal(l: Item): number {
  return l.pesoModo ? l.unitPrice * pesoNum(l.pesoKg) : l.unitPrice * l.qty
}

// Máscara de dinheiro — mesma ideia da de peso (dígitos crus, 2 casas
// decimais a partir da direita), pra digitar valor recebido sem vírgula.
function moneyDigitsFromReais(n: number): string { return String(Math.max(0, Math.round(n * 100))) }
function moneyNum(digits: string): number {
  const clean = digits.replace(/\D/g, '')
  return clean ? parseInt(clean, 10) / 100 : 0
}
function moneyDisplay(digits: string): string {
  const clean = digits.replace(/\D/g, '')
  if (!clean) return '0,00'
  const padded = clean.padStart(3, '0')
  const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, '') || '0'
  return `${whole},${padded.slice(-2)}`
}

export default function PdvPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [printerName, setPrinterName] = useState('')
  const [payOptions, setPayOptions] = useState<string[]>(['dinheiro', 'pix', 'cartao'])

  const [produtos, setProdutos] = useState<NpProduto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [activeCat, setActiveCat] = useState<string>('all')
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const [cart, setCart] = useState<Item[]>([])
  const [detail, setDetail] = useState<NpProduto | null>(null)
  const [detailSel, setDetailSel] = useState<number[][]>([])
  const [pesoPrompt, setPesoPrompt] = useState<{ produto: NpProduto; modifiers: { name: string; price: number }[]; basePrice: number } | null>(null)
  const [pesoDigits, setPesoDigits] = useState('1000')

  const [payMethod, setPayMethod] = useState('')
  const [trocoOpen, setTrocoOpen] = useState(false)
  const [trocoDigits, setTrocoDigits] = useState('')
  const [finalizando, setFinalizando] = useState(false)
  const [erro, setErro] = useState('')
  const [successFlash, setSuccessFlash] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/pdv'; return }
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).maybeSingle()
      const empresaParam = new URLSearchParams(window.location.search).get('empresa')
      const isAdmin = profile?.user_type === 'admin' && !!empresaParam
      const SEL = 'id, name, loja_digital_enabled, loja_impressora_nome, loja_payment_methods, trial_modules_until'
      const { data: comp } = isAdmin
        ? await supabase.from('companies').select(SEL).eq('id', empresaParam).maybeSingle()
        : await supabase.from('companies').select(SEL).eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || (!isAdmin && !moduleActive(comp.loja_digital_enabled, comp.trial_modules_until))) { window.location.href = '/painel/compartilhar'; return }
      setCompanyId(comp.id)
      setCompanyName(comp.name)
      setPrinterName(comp.loja_impressora_nome || '')
      const configured: string[] = comp.loja_payment_methods || []
      const opts = configured.length > 0 ? configured : ['dinheiro', 'pix', 'cartao']
      setPayOptions(opts)
      setPayMethod(opts.includes('dinheiro') ? 'dinheiro' : opts[0])

      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase.from('loja_produtos').select('id, name, sale_price, category_id, photo_url, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))').eq('company_id', comp.id).eq('active', true).order('display_order'),
        supabase.from('loja_categorias').select('id, name').eq('company_id', comp.id).order('display_order'),
      ])
      setProdutos((prods || []) as any)
      setCategorias((cats || []) as any)
      setLoading(false)
      searchRef.current?.focus()
    })
  }, [])

  const subtotal = cart.reduce((s, l) => s + lineTotal(l), 0)
  const troco = moneyNum(trocoDigits) - subtotal

  function selectPayMethod(key: string) {
    setPayMethod(key)
    if (key === 'dinheiro' && cart.length > 0) {
      setTrocoDigits(moneyDigitsFromReais(subtotal))
      setTrocoOpen(true)
    }
  }

  // Atalhos de teclado pra forma de pagamento — F2 Dinheiro, F3 Pix, F4
  // Cartão (pedido do Ricardo, out/2026), só quando a loja de fato aceita
  // aquela forma. Escolher Dinheiro (clique ou F2) já abre a tela de troco
  // na hora — é assim que caixa de verdade funciona, não espera "Finalizar".
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, string> = { F2: 'dinheiro', F3: 'pix', F4: 'cartao' }
      const key = map[e.key]
      if (!key || !payOptions.includes(key)) return
      e.preventDefault()
      selectPayMethod(key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payOptions, cart])

  function addToCart(p: NpProduto, modifiers: { name: string; price: number }[], unitPrice: number) {
    const isPeso = PESO_REGEX.test(p.name)
    if (isPeso) {
      setPesoPrompt({ produto: p, modifiers, basePrice: unitPrice })
      setPesoDigits('1000')
      return
    }
    const key = p.id + '|' + modifiers.map(m => m.name).sort().join('+')
    setCart(prev => {
      const existing = prev.find(l => l.key === key)
      if (existing) return prev.map(l => l.key === key ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, { key, produtoId: p.id, name: p.name, modifiers, unitPrice, qty: 1, pesoModo: false, pesoKg: '' }]
    })
  }
  function handleProductClick(p: NpProduto) {
    if (p.groups?.length) { setDetail(p); setDetailSel(p.groups.map(() => [])) }
    else addToCart(p, [], p.sale_price)
  }
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
  const detailReqMet = detail ? detail.groups.every((g: NpGrupo, gi: number) => !g.required || detailSel[gi].length >= g.min_select) : true
  const detailPrice = detail ? detail.sale_price + detail.groups.reduce((s: number, g: NpGrupo, gi: number) => s + npGroupContribution(g, detailSel[gi]), 0) : 0
  function confirmDetail() {
    if (!detail || !detailReqMet) return
    const modifiers: { name: string; price: number }[] = []
    detail.groups.forEach((g: NpGrupo, gi: number) => detailSel[gi].forEach(oi => modifiers.push({ name: g.options[oi].name, price: g.options[oi].price })))
    addToCart(detail, modifiers, detailPrice)
    setDetail(null)
  }
  function confirmPeso() {
    if (!pesoPrompt) return
    const { produto, modifiers, basePrice } = pesoPrompt
    const key = `${produto.id}-${Date.now()}`
    setCart(prev => [...prev, { key, produtoId: produto.id, name: produto.name, modifiers, unitPrice: basePrice, qty: 1, pesoModo: true, pesoKg: pesoDigits }])
    setPesoPrompt(null)
  }
  function pesoKey(d: string) { setPesoDigits(prev => (prev === '0' ? d : prev + d).replace(/^0+(?=\d)/, '')) }
  function pesoBackspace() { setPesoDigits(prev => prev.slice(0, -1) || '0') }

  function changeQty(key: string, delta: number) {
    setCart(prev => prev.map(l => l.key === key ? { ...l, qty: l.qty + delta } : l).filter(l => l.qty > 0))
  }
  function removeItem(key: string) { setCart(prev => prev.filter(l => l.key !== key)) }
  function clearCart() { setCart([]) }

  function moneyKey(d: string) { setTrocoDigits(prev => (prev === '0' ? d : prev + d).replace(/^0+(?=\d)/, '')) }
  function moneyBackspace() { setTrocoDigits(prev => prev.slice(0, -1) || '0') }

  async function imprimirRecibo(pedidoId: string, orderNumber: number | null) {
    if (!printerName) return
    try {
      const data = await fetchPedidoComItensComRetry(pedidoId)
      if (!data) return
      const items = (data.itens || []).map((it: any) => ({ qty: it.qty, pesoKg: it.peso_kg, name: it.product_name, unitPrice: it.unit_price, options: it.selected_options }))
      const content = buildReceipt({
        companyName, pedidoShortId: String(orderNumber ?? pedidoId.slice(0, 8)), createdAt: data.created_at,
        customerName: data.customer_name, customerPhone: data.customer_phone, deliveryType: 'balcao',
        paymentMethod: data.payment_method, items, subtotal: data.subtotal, total: data.total,
      })
      const kitchenContent = buildKitchenTicket({ pedidoShortId: String(orderNumber ?? pedidoId.slice(0, 8)), createdAt: data.created_at, deliveryType: 'balcao', items })
      if (isRawBtMode(printerName)) {
        printViaRawBt(content)
        setTimeout(() => printViaRawBt(kitchenContent), 600)
      } else {
        await qzPrintRaw(printerName, content)
        await qzPrintRaw(printerName, kitchenContent)
      }
    } catch {}
  }

  async function finalizarVenda(method: string) {
    if (cart.length === 0 || finalizando) return
    setFinalizando(true)
    setErro('')
    const total = subtotal
    const { data: pedido, error: pedidoErr } = await supabase.from('loja_pedidos').insert({
      company_id: companyId, customer_id: null,
      customer_name: 'Cliente balcão', customer_phone: null,
      delivery_type: 'balcao', origin: 'balcao', payment_method: method,
      subtotal: total, total, accepted_at: new Date().toISOString(),
    }).select('id, order_number').single()
    if (pedidoErr || !pedido) {
      setErro(pedidoErr?.message || 'Não consegui registrar a venda — tenta de novo.')
      setFinalizando(false)
      return
    }
    const { error: itensErr } = await supabase.from('loja_pedido_itens').insert(cart.map(l => ({
      pedido_id: pedido.id, produto_id: l.produtoId, product_name: l.name,
      unit_price: l.pesoModo ? Math.round(l.unitPrice * pesoNum(l.pesoKg) * 100) / 100 : l.unitPrice,
      qty: l.pesoModo ? 1 : l.qty,
      peso_kg: l.pesoModo ? pesoNum(l.pesoKg) : null,
      selected_options: l.modifiers,
    })))
    if (itensErr) {
      setErro('Venda registrada, mas falhou ao salvar os itens: ' + itensErr.message)
      setFinalizando(false)
      return
    }
    fetch('/api/loja/registrar-pedido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId, total, subtotal: total, deliveryFee: 0, paymentMethod: method, deliveryType: 'balcao',
        items: cart.map(l => ({ produtoId: l.produtoId, name: l.name, qty: l.pesoModo ? 1 : l.qty, unitPrice: l.pesoModo ? Math.round(l.unitPrice * pesoNum(l.pesoKg) * 100) / 100 : l.unitPrice, modifiers: l.modifiers })),
      }),
    }).catch(() => {})
    await imprimirRecibo(pedido.id, pedido.order_number)
    setCart([])
    setTrocoOpen(false)
    setFinalizando(false)
    setSuccessFlash(`✓ Venda #${pedido.order_number ?? ''} registrada — ${fmt(total)}`)
    setTimeout(() => setSuccessFlash(''), 3000)
    searchRef.current?.focus()
  }

  function onFinishClick() {
    if (payMethod === 'dinheiro') { setTrocoDigits(moneyDigitsFromReais(subtotal)); setTrocoOpen(true); return }
    finalizarVenda(payMethod)
  }

  const filtered = produtos.filter(p =>
    (activeCat === 'all' || p.category_id === activeCat) &&
    (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
  )
  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && filtered.length === 1) { handleProductClick(filtered[0]); setSearch('') }
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#AAA', background: 'var(--ink)' }}>Carregando...</div>

  return (
    <div className="pdv-wrap">
      <style>{`
        .pdv-wrap{ min-height:100vh;background:#E9EAE5;font-family:'Archivo',sans-serif;display:flex;flex-direction:column; }
        .pdv-top{ background:#151210;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px;flex:none; }
        .pdv-back{ width:34px;height:34px;border-radius:9px;background:#232019;border:1px solid #3A352A;color:#fff;font-size:16px;cursor:pointer; }
        .pdv-title{ font-family:'Anton',sans-serif;font-size:16px;letter-spacing:.3px;flex:1; }
        .pdv-title small{ display:block;font-family:'Archivo',sans-serif;font-size:9.5px;color:#FFC531;font-weight:700;letter-spacing:.07em;text-transform:uppercase; }
        .pdv-printer{ display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;padding:5px 11px;border-radius:20px; }
        .pdv-printer.ok{ color:#4ADE80;background:rgba(15,138,87,.18); }
        .pdv-printer.off{ color:#F87171;background:rgba(248,113,113,.18); }

        .pdv-main{ flex:1;display:grid;grid-template-columns:1fr 340px;min-height:0; }
        .pdv-left{ padding:12px;overflow-y:auto; }
        .pdv-search-wrap{ position:relative;margin-bottom:10px; }
        .pdv-search{ width:100%;padding:14px 46px;border-radius:12px;border:2px solid #FFC531;background:#fff;font-size:14.5px;font-weight:600;font-family:inherit;outline:none;box-sizing:border-box; }
        .pdv-search-ico{ position:absolute;left:15px;top:50%;transform:translateY(-50%);font-size:16px; }
        .pdv-cats{ display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px; }
        .pdv-cat{ padding:7px 13px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;border:none; }
        .pdv-cat.on{ background:#151210;color:#FFC531; }
        .pdv-cat.off{ background:#fff;border:1.5px solid #B9AE97;color:#6E6656; }

        .pdv-grid{ display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:6px; }
        .pdv-prod{ position:relative;background:#fff;border:1.5px solid #DDD5C4;border-radius:10px;padding:5px;cursor:pointer;display:flex;flex-direction:column;text-align:left;font-family:inherit; }
        .pdv-prod-photo{ width:100%;aspect-ratio:1;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:4px;overflow:hidden;background:#F0EDE8; }
        .pdv-prod-photo img{ width:100%;height:100%;object-fit:cover; }
        .pdv-kg-badge{ position:absolute;top:7px;right:7px;background:#fff;color:#A87200;font-size:8px;font-weight:800;padding:1px 5px;border-radius:7px;box-shadow:0 1px 4px rgba(0,0,0,.18); }
        .pdv-prod-name{ font-size:9.5px;font-weight:700;color:#151210;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:3px;min-height:23px; }
        .pdv-prod-price{ font-size:10.5px;font-weight:800;color:#0F6B46; }
        .pdv-prod-price small{ font-weight:600;color:#8A8477;font-size:8.5px; }
        .pdv-empty{ padding:40px;text-align:center;color:#A79E8B;font-size:13px; }

        .pdv-right{ background:#fff;border-left:1.5px solid #DDD5C4;display:flex;flex-direction:column;min-height:0; }
        .pdv-rec-hd{ padding:14px 16px 10px;border-bottom:1px dashed #DDD5C4;flex:none; }
        .pdv-rec-hd b{ font-size:13px; }
        .pdv-rec-items{ flex:1;overflow-y:auto;padding:8px 16px;min-height:0; }
        .pdv-rec-line{ display:flex;align-items:flex-start;gap:7px;padding:8px 0;border-bottom:1px solid #F0EDE8; }
        .pdv-rec-line-main{ flex:1;min-width:0; }
        .pdv-rec-line-name{ font-size:12px;font-weight:700;color:#151210; }
        .pdv-rec-line-sub{ font-size:10px;color:#8A8477;margin-top:1px; }
        .pdv-rec-qty{ display:flex;align-items:center;gap:4px;flex:none; }
        .pdv-rec-qty button{ width:19px;height:19px;border-radius:5px;border:1px solid #B9AE97;background:#F4F1E9;cursor:pointer;font-weight:800;line-height:1; }
        .pdv-rec-qty span{ min-width:14px;text-align:center;font-size:11px;font-weight:700; }
        .pdv-rec-line-val{ font-size:12px;font-weight:800;white-space:nowrap;flex:none; }
        .pdv-rec-line-rm{ color:#C43D3D;font-size:12px;cursor:pointer;flex:none;background:none;border:none; }
        .pdv-rec-empty{ font-size:12px;color:#A79E8B;text-align:center;padding:30px 0; }

        .pdv-rec-foot{ border-top:1.5px solid #DDD5C4;padding:12px 16px calc(14px + env(safe-area-inset-bottom));flex:none; }
        .pdv-totrow{ display:flex;justify-content:space-between;font-size:18px;font-weight:800;color:#151210;margin-bottom:10px; }
        .pdv-paylbl{ font-size:10px;font-weight:800;color:#6E6656;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px; }
        .pdv-paychips{ display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px; }
        .pdv-paychip{ position:relative;flex:1;min-width:72px;padding:9px 4px 7px;text-align:center;border-radius:10px;border:1.5px solid #B9AE97;background:#fff;font-size:11.5px;font-weight:700;color:#6E6656;cursor:pointer; }
        .pdv-paychip.on{ background:#0F8A57;border-color:#0F8A57;color:#fff; }
        .pdv-paychip-key{ display:block;font-size:8px;font-weight:800;margin-top:2px;opacity:.75; }
        .pdv-finish{ width:100%;padding:14px;border-radius:12px;background:#0F8A57;color:#fff;font-size:14px;font-weight:800;text-align:center;border:none;cursor:pointer; }
        .pdv-finish:disabled{ opacity:.5;cursor:default; }
        .pdv-clear{ width:100%;padding:6px;text-align:center;font-size:11px;color:#A79E8B;font-weight:700;background:none;border:none;cursor:pointer; }
        .pdv-err{ color:#C43D3D;font-size:11.5px;font-weight:600;text-align:center;margin-bottom:8px; }
        .pdv-flash{ position:fixed;top:18px;left:50%;transform:translateX(-50%);background:#0F8A57;color:#fff;padding:12px 22px;border-radius:30px;font-weight:800;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:200; }

        .pdv-overlay{ position:fixed;inset:0;background:rgba(10,8,6,.6);z-index:150;display:flex;align-items:center;justify-content:center;padding:16px; }
        .pdv-modal{ background:#fff;border-radius:18px;padding:20px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.3); }
        .pdv-modal h3{ margin:0 0 4px;font-size:15px; }
        .pdv-modal-sub{ font-size:11.5px;color:#8A8477;margin-bottom:14px; }
        .pdv-grp{ margin:12px 0 6px;font-weight:800;font-size:12.5px; }
        .pdv-opt{ display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #F0EDE8;cursor:pointer;font-size:12.5px; }
        .pdv-opt.sel{ color:#0F8050;font-weight:700; }
        .pdv-modal-confirm{ width:100%;margin-top:14px;padding:12px;border-radius:9px;border:none;background:#151210;color:#FFC531;font-weight:800;font-size:13px;cursor:pointer; }
        .pdv-modal-confirm:disabled{ opacity:.5; }
        .pdv-modal-cancel{ width:100%;margin-top:8px;padding:10px;border-radius:9px;border:none;background:#F4F1E9;color:#6E6656;font-weight:700;font-size:12.5px;cursor:pointer; }

        .pdv-peso-prod{ display:flex;align-items:center;gap:10px;margin-bottom:16px; }
        .pdv-peso-emoji{ width:40px;height:40px;border-radius:10px;background:#FEF3E2;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;overflow:hidden; }
        .pdv-peso-emoji img{ width:100%;height:100%;object-fit:cover; }
        .pdv-peso-sub{ font-size:11px;color:#8A8477;margin-top:2px; }
        .pdv-digit-wrap{ display:flex;align-items:baseline;justify-content:center;gap:8px;background:#F4F1E9;border:2px solid #FFC531;border-radius:14px;padding:14px 8px;margin-bottom:12px; }
        .pdv-digit-wrap b{ font-family:'Anton',sans-serif;font-size:34px;letter-spacing:.5px;color:#151210; }
        .pdv-digit-wrap span{ font-size:14px;font-weight:700;color:#A87200; }
        .pdv-calc{ display:flex;justify-content:space-between;align-items:center;background:#F4F1E9;border-radius:10px;padding:10px 14px;margin-bottom:14px; }
        .pdv-calc span:first-child{ font-size:11.5px;color:#6E6656;font-weight:700; }
        .pdv-calc span:last-child{ font-size:17px;font-weight:800;color:#0F6B46; }
        .pdv-keys{ display:grid;grid-template-columns:repeat(3,1fr);gap:7px; }
        .pdv-key{ background:#F4F1E9;border:1.5px solid #DDD5C4;border-radius:10px;padding:12px 0;text-align:center;font-size:16px;font-weight:700;color:#151210;cursor:pointer; }

        .pdv-tc-quick{ display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px; }
        .pdv-tc-qbtn{ background:#fff;border:1.5px solid #B9AE97;border-radius:9px;padding:10px 4px;text-align:center;font-size:12px;font-weight:700;color:#151210;cursor:pointer; }
        .pdv-tc-qbtn.exact{ grid-column:span 3;color:#0F6B46;border-color:#0F8A57; }
        .pdv-result{ border-radius:12px;padding:14px;text-align:center;margin:12px 0; }
        .pdv-result.ok{ background:rgba(15,138,87,.1);border:1.5px solid rgba(15,138,87,.35); }
        .pdv-result.bad{ background:rgba(196,61,61,.08);border:1.5px solid rgba(196,61,61,.3); }
        .pdv-result-lbl{ font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px; }
        .pdv-result.ok .pdv-result-lbl, .pdv-result.ok .pdv-result-val{ color:#0F6B46; }
        .pdv-result.bad .pdv-result-lbl, .pdv-result.bad .pdv-result-val{ color:#C43D3D; }
        .pdv-result-val{ font-family:'Anton',sans-serif;font-size:26px; }
      `}</style>

      {successFlash && <div className="pdv-flash">{successFlash}</div>}

      <div className="pdv-top">
        <button className="pdv-back" onClick={() => window.location.href = '/painel/pedidos'}>‹</button>
        <div className="pdv-title"><small>PDV · Balcão</small>{companyName}</div>
        <div className={`pdv-printer ${printerName ? 'ok' : 'off'}`}>{printerName ? '● Impressora conectada' : '○ Sem impressora configurada'}</div>
      </div>

      <div className="pdv-main">
        <div className="pdv-left">
          <div className="pdv-search-wrap">
            <span className="pdv-search-ico">🔍</span>
            <input ref={searchRef} className="pdv-search" placeholder="Buscar produto ou aponte o leitor aqui..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={onSearchKeyDown} />
          </div>
          <div className="pdv-cats">
            <button className={`pdv-cat ${activeCat === 'all' ? 'on' : 'off'}`} onClick={() => setActiveCat('all')}>Todos</button>
            {categorias.map(c => (
              <button key={c.id} className={`pdv-cat ${activeCat === c.id ? 'on' : 'off'}`} onClick={() => setActiveCat(c.id)}>{c.name}</button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="pdv-empty">Nenhum produto encontrado.</div>
          ) : (
            <div className="pdv-grid">
              {filtered.map(p => (
                <button key={p.id} className="pdv-prod" onClick={() => handleProductClick(p)}>
                  {PESO_REGEX.test(p.name) && <span className="pdv-kg-badge">⚖️ kg</span>}
                  <div className="pdv-prod-photo">{p.photo_url ? <img src={p.photo_url} alt="" /> : '🍽️'}</div>
                  <div className="pdv-prod-name">{p.name}</div>
                  <div className="pdv-prod-price">{fmt(p.sale_price)}{PESO_REGEX.test(p.name) && <small>/kg</small>}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdv-right">
          <div className="pdv-rec-hd"><b>🧾 Pedido atual</b></div>
          <div className="pdv-rec-items">
            {cart.length === 0 && <div className="pdv-rec-empty">Nenhum item ainda — toque num produto pra começar.</div>}
            {cart.map(l => (
              <div className="pdv-rec-line" key={l.key}>
                <div className="pdv-rec-line-main">
                  <div className="pdv-rec-line-name">{l.name}</div>
                  <div className="pdv-rec-line-sub">
                    {l.pesoModo ? `${pesoDisplay(l.pesoKg)} kg × ${fmt(l.unitPrice)}/kg` : l.modifiers.length > 0 ? l.modifiers.map(m => m.name).join(', ') : null}
                  </div>
                </div>
                {!l.pesoModo && (
                  <div className="pdv-rec-qty">
                    <button onClick={() => changeQty(l.key, -1)}>−</button>
                    <span>{l.qty}</span>
                    <button onClick={() => changeQty(l.key, 1)}>+</button>
                  </div>
                )}
                <div className="pdv-rec-line-val">{fmt(lineTotal(l))}</div>
                <button className="pdv-rec-line-rm" onClick={() => removeItem(l.key)}>✕</button>
              </div>
            ))}
          </div>
          <div className="pdv-rec-foot">
            {erro && <div className="pdv-err">{erro}</div>}
            <div className="pdv-totrow"><span>Total</span><span>{fmt(subtotal)}</span></div>
            <div className="pdv-paylbl">Forma de pagamento</div>
            <div className="pdv-paychips">
              {payOptions.map(k => (
                <button key={k} className={`pdv-paychip ${payMethod === k ? 'on' : ''}`} onClick={() => selectPayMethod(k)}>
                  {PAY_ICON[k] || '💰'} {payLabel(k)}
                  {(k === 'dinheiro' || k === 'pix' || k === 'cartao') && <span className="pdv-paychip-key">{k === 'dinheiro' ? 'F2' : k === 'pix' ? 'F3' : 'F4'}</span>}
                </button>
              ))}
            </div>
            <button className="pdv-finish" disabled={cart.length === 0 || finalizando} onClick={onFinishClick}>{finalizando ? 'Registrando...' : `Finalizar venda — ${fmt(subtotal)}`}</button>
            <button className="pdv-clear" onClick={clearCart} disabled={cart.length === 0}>Limpar carrinho</button>
          </div>
        </div>
      </div>

      {/* grupos de opcionais */}
      {detail && (
        <div className="pdv-overlay" onClick={() => setDetail(null)}>
          <div className="pdv-modal" onClick={e => e.stopPropagation()}>
            <h3>{detail.name}</h3>
            {detail.groups.map((g: NpGrupo, gi: number) => (
              <div key={g.id}>
                <div className="pdv-grp">{g.name} {g.required && <span style={{ color: '#C43D3D', fontWeight: 700 }}>*obrigatório</span>}</div>
                {g.options.map((o, oi) => (
                  <div key={o.id} className={`pdv-opt ${detailSel[gi]?.includes(oi) ? 'sel' : ''}`} onClick={() => toggleOpt(gi, oi)}>
                    <span>{detailSel[gi]?.includes(oi) ? '✓ ' : ''}{o.name}</span>
                    <span>{o.price > 0 ? '+' + fmt(o.price) : 'grátis'}</span>
                  </div>
                ))}
              </div>
            ))}
            <button className="pdv-modal-confirm" disabled={!detailReqMet} onClick={confirmDetail}>Adicionar · {fmt(detailPrice)}</button>
            <button className="pdv-modal-cancel" onClick={() => setDetail(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* pesagem */}
      {pesoPrompt && (
        <div className="pdv-overlay" onClick={() => setPesoPrompt(null)}>
          <div className="pdv-modal" onClick={e => e.stopPropagation()}>
            <div className="pdv-peso-prod">
              <div className="pdv-peso-emoji">{pesoPrompt.produto.photo_url ? <img src={pesoPrompt.produto.photo_url} alt="" /> : '⚖️'}</div>
              <div>
                <h3 style={{ margin: 0 }}>{pesoPrompt.produto.name}</h3>
                <div className="pdv-peso-sub">{fmt(pesoPrompt.basePrice)} / kg</div>
              </div>
            </div>
            <div className="pdv-digit-wrap"><b>{pesoDisplay(pesoDigits)}</b><span>kg</span></div>
            <div className="pdv-calc"><span>Total da linha</span><span>{fmt(pesoPrompt.basePrice * pesoNum(pesoDigits))}</span></div>
            <div className="pdv-keys">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <div key={d} className="pdv-key" onClick={() => pesoKey(d)}>{d}</div>)}
              <div className="pdv-key" onClick={pesoBackspace}>⌫</div>
              <div className="pdv-key" onClick={() => pesoKey('0')}>0</div>
              <div className="pdv-key" onClick={() => pesoKey('00')}>00</div>
            </div>
            <button className="pdv-modal-confirm" onClick={confirmPeso}>Adicionar ao carrinho</button>
            <button className="pdv-modal-cancel" onClick={() => setPesoPrompt(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* troco */}
      {trocoOpen && (
        <div className="pdv-overlay" onClick={() => setTrocoOpen(false)}>
          <div className="pdv-modal" onClick={e => e.stopPropagation()}>
            <h3>💵 Pagamento em dinheiro</h3>
            <div className="pdv-calc" style={{ marginTop: 10 }}><span>Total do pedido</span><span>{fmt(subtotal)}</span></div>
            <div className="pdv-modal-sub" style={{ marginTop: 14, marginBottom: 6 }}>Quanto o cliente está pagando?</div>
            <div className="pdv-tc-quick">
              {[20, 50, 100, 150, 200].map(v => (
                <div key={v} className="pdv-tc-qbtn" onClick={() => setTrocoDigits(moneyDigitsFromReais(v))}>R$ {v}</div>
              ))}
              <div className="pdv-tc-qbtn exact" onClick={() => setTrocoDigits(moneyDigitsFromReais(subtotal))}>Valor exato — sem troco</div>
            </div>
            <div className="pdv-digit-wrap"><span style={{ color: '#6E6656', fontSize: 14, fontWeight: 700 }}>R$</span><b>{moneyDisplay(trocoDigits)}</b></div>
            <div className="pdv-keys">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <div key={d} className="pdv-key" onClick={() => moneyKey(d)}>{d}</div>)}
              <div className="pdv-key" onClick={moneyBackspace}>⌫</div>
              <div className="pdv-key" onClick={() => moneyKey('0')}>0</div>
              <div className="pdv-key" onClick={() => moneyKey('00')}>00</div>
            </div>
            <div className={`pdv-result ${troco >= 0 ? 'ok' : 'bad'}`}>
              <div className="pdv-result-lbl">{troco >= 0 ? 'Troco' : 'Falta'}</div>
              <div className="pdv-result-val">{fmt(Math.abs(troco))}</div>
            </div>
            <button className="pdv-modal-confirm" disabled={troco < 0 || finalizando} onClick={() => finalizarVenda('dinheiro')}>{finalizando ? 'Registrando...' : 'Confirmar pagamento'}</button>
            <button className="pdv-modal-cancel" onClick={() => setTrocoOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
