'use client'
import { useEffect, useRef, useState, use } from 'react'
import { supabase } from '@/lib/supabase'
import { isOpenNow } from '@/lib/businessHours'

type Opcao = { id: string; name: string; price: number; max_qty: number | null; photo_url?: string | null }
type Grupo = { id: string; name: string; required: boolean; min_select: number; max_select: number; pricing_rule: 'soma' | 'maior_valor'; options: Opcao[] }
type Produto = {
  id: string; name: string; description: string | null; photo_url: string | null
  category_id: string | null; sale_price: number
  promo_type: 'percent' | 'fixed' | null; promo_value: number | null
  promo_starts_at: string | null; promo_ends_at: string | null
  available_days: number[] | null
  total_pedidos: number
  esgotado: boolean; track_stock: boolean; stock_qty: number | null
  groups: Grupo[]
}
function isSoldOut(p: Produto) { return p.esgotado || (p.track_stock && (p.stock_qty ?? 0) <= 0) }
function cartStorageKey(slug: string) { return `cardapio_cart_${slug}` }
type Categoria = { id: string; name: string; display_order: number }
type Company = {
  id: string; name: string; slug: string; phone: string | null; address: string | null
  avg_rating: number; total_reviews: number; status: string
  loja_digital_enabled: boolean; flexible_hours?: boolean; owner_id?: string
  loja_taxa_entrega: number; loja_pedido_minimo: number
  hours?: any[]
}
type CartLine = { key: string; produtoId: string; name: string; modifiers: { name: string; price: number }[]; unitPrice: number; qty: number }

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function promoPrice(p: Produto): number | null {
  if (!p.promo_type || !p.promo_value) return null
  const now = Date.now()
  if (p.promo_starts_at && now < new Date(p.promo_starts_at).getTime()) return null
  if (p.promo_ends_at && now > new Date(p.promo_ends_at).getTime()) return null
  return p.promo_type === 'percent' ? p.sale_price * (1 - p.promo_value / 100) : Math.max(0, p.sale_price - p.promo_value)
}
function availableToday(p: Produto) {
  if (!p.available_days || p.available_days.length === 0) return true
  return p.available_days.includes(new Date().getDay())
}
function groupContribution(g: Grupo, selectedIdx: number[]): number {
  const prices = selectedIdx.map(oi => g.options[oi].price)
  if (prices.length === 0) return 0
  return g.pricing_rule === 'maior_valor' ? Math.max(...prices) : prices.reduce((a, b) => a + b, 0)
}

export default function CardapioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<Company | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [filterCat, setFilterCat] = useState('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [detail, setDetail] = useState<Produto | null>(null)
  const [detailSel, setDetailSel] = useState<number[][]>([])
  const groupRefs = useRef<(HTMLDivElement | null)[]>([])
  const [detailQty, setDetailQty] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deliveryType, setDeliveryType] = useState<'entrega' | 'retirada'>('entrega')
  const [cep, setCep] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState(false)
  const [numero, setNumero] = useState('')
  const [cepData, setCepData] = useState<{ logradouro: string; bairro: string; localidade: string; uf: string } | null>(null)
  const [address, setAddress] = useState('')
  const [agendarRetirada, setAgendarRetirada] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [obs, setObs] = useState('')
  const [payMethod, setPayMethod] = useState<'pix' | 'dinheiro' | 'cartao'>('pix')
  const [success, setSuccess] = useState(false)
  const [confirming, setConfirming] = useState(false)

  function formatCep(v: string) { return v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2') }
  function buildAddress(data: { logradouro: string; bairro: string; localidade: string; uf: string }, num: string) {
    return [data.logradouro + (num ? ', ' + num : ''), data.bairro, `${data.localidade}-${data.uf}`].filter(Boolean).join(', ')
  }
  async function handleCepChange(v: string) {
    setCep(formatCep(v))
    setCepError(false)
    const digits = v.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) { setCepError(true); setCepData(null) } else {
        const parsed = { logradouro: data.logradouro || '', bairro: data.bairro || '', localidade: data.localidade || '', uf: data.uf || '' }
        setCepData(parsed)
        setAddress(buildAddress(parsed, numero))
      }
    } catch { setCepError(true) }
    setCepLoading(false)
  }
  function handleNumeroChange(v: string) {
    setNumero(v)
    if (cepData) setAddress(buildAddress(cepData, v))
  }

  useEffect(() => {
    supabase.from('companies')
      .select('id,name,slug,phone,address,avg_rating,total_reviews,status,loja_digital_enabled,flexible_hours,owner_id,loja_taxa_entrega,loja_pedido_minimo,hours:company_hours(label,hours,order,day_of_week,open_time,close_time,closed)')
      .eq('slug', slug).maybeSingle()
      .then(async ({ data: comp }) => {
        if (!comp || comp.status !== 'active' || !comp.loja_digital_enabled) { setCompany(null); setLoading(false); return }
        setCompany(comp as any)
        const [{ data: cats }, { data: prods }] = await Promise.all([
          supabase.from('loja_categorias').select('*').eq('company_id', comp.id).order('display_order'),
          supabase.from('loja_produtos').select('*, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))').eq('company_id', comp.id).eq('active', true).order('display_order'),
        ])
        setCategorias(cats || [])
        setProdutos(((prods || []) as any[]).filter(availableToday))
        setLoading(false)
      })
    let restoredCart = false
    try {
      const saved = localStorage.getItem(cartStorageKey(slug))
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed.cart) && parsed.cart.length > 0) {
          setCart(parsed.cart)
          setDeliveryType(parsed.deliveryType || 'entrega')
          setCep(parsed.cep || '')
          setNumero(parsed.numero || '')
          setCepData(parsed.cepData || null)
          setAddress(parsed.address || '')
          setAgendarRetirada(!!parsed.agendarRetirada)
          setScheduleDate(parsed.scheduleDate || '')
          setScheduleTime(parsed.scheduleTime || '')
          setObs(parsed.obs || '')
          setPayMethod(parsed.payMethod || 'pix')
          setDrawerOpen(true)
          restoredCart = true
        }
        localStorage.removeItem(cartStorageKey(slug))
      }
    } catch {}

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || restoredCart) return
      const { data: profile } = await supabase.from('profiles').select('address').eq('id', session.user.id).maybeSingle()
      if (profile?.address) setAddress(profile.address)
    })
  }, [slug])

  function addToCart(produtoId: string, name: string, price: number, qty: number, modifiers: { name: string; price: number }[] = []) {
    const key = produtoId + '|' + modifiers.map(m => m.name).sort().join('+')
    setCart(prev => {
      const existing = prev.find(l => l.key === key)
      if (existing) return prev.map(l => l.key === key ? { ...l, qty: l.qty + qty } : l)
      return [...prev, { key, produtoId, name, modifiers, unitPrice: price, qty }]
    })
  }
  const [flashId, setFlashId] = useState<string | null>(null)
  function quickAdd(p: Produto, price: number) {
    addToCart(p.id, p.name, price, 1)
    setFlashId(p.id)
    setTimeout(() => setFlashId(id => id === p.id ? null : id), 500)
  }
  function changeCartQty(key: string, delta: number) {
    setCart(prev => prev.flatMap(l => {
      if (l.key !== key) return [l]
      const qty = l.qty + delta
      return qty <= 0 ? [] : [{ ...l, qty }]
    }))
  }
  function removeCartLine(key: string) {
    setCart(prev => prev.filter(l => l.key !== key))
  }
  const cartTotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  const cartCount = cart.reduce((s, l) => s + l.qty, 0)

  function openDetail(p: Produto) { setDetail(p); setDetailSel(p.groups.map(() => [])); setDetailQty(1) }
  function toggleOpt(gi: number, oi: number) {
    if (!detail) return
    const g = detail.groups[gi]
    setDetailSel(sel => {
      const next = sel.map((s, i) => {
        if (i !== gi) return s
        const active = s.includes(oi)
        if (g.max_select === 1) return active ? [] : [oi]
        if (active) return s.filter(x => x !== oi)
        if (s.length < g.max_select) return [...s, oi]
        return s
      })
      // Ao completar um grupo (bater o máximo de escolhas), rola sozinho até
      // o próximo grupo — evita o cliente ter que descer a tela na mão pra
      // achar a próxima etapa (ex: escolheu os 2 sabores, já mostra a borda).
      if (next[gi].length === g.max_select && next[gi].length !== sel[gi].length) {
        const nextEl = groupRefs.current[gi + 1]
        if (nextEl) setTimeout(() => nextEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
      }
      return next
    })
  }
  const detailUnitPrice = detail ? (promoPrice(detail) ?? detail.sale_price) + detail.groups.reduce((s, g, gi) => s + groupContribution(g, detailSel[gi]), 0) : 0
  const detailReqMet = detail ? detail.groups.every((g, gi) => !g.required || detailSel[gi].length >= g.min_select) : true

  function confirmAddDetail() {
    if (!detail || !detailReqMet) return
    const modifiers: { name: string; price: number }[] = []
    detail.groups.forEach((g, gi) => detailSel[gi].forEach(oi => modifiers.push({ name: g.options[oi].name, price: g.options[oi].price })))
    addToCart(detail.id, detail.name, detailUnitPrice, detailQty, modifiers)
    setDetail(null)
  }

  async function confirmOrder() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      try {
        localStorage.setItem(cartStorageKey(slug), JSON.stringify({
          cart, deliveryType, cep, numero, cepData, address, agendarRetirada, scheduleDate, scheduleTime, obs, payMethod,
        }))
      } catch {}
      window.location.href = `/login?redirect=/empresa/${slug}/cardapio`
      return
    }
    if (!company || cart.length === 0) return
    if (Number(company.loja_pedido_minimo || 0) > 0 && cartTotal < Number(company.loja_pedido_minimo)) return
    if (deliveryType === 'entrega' && !address.trim()) return
    setConfirming(true)
    const taxa = deliveryType === 'entrega' ? Number(company.loja_taxa_entrega || 0) : 0
    const total = cartTotal + taxa
    const scheduledFor = deliveryType === 'retirada' && agendarRetirada && scheduleDate && scheduleTime
      ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString() : null
    const { data: profile } = await supabase.from('profiles').select('name, phone').eq('id', session.user.id).maybeSingle()
    const { data: pedido } = await supabase.from('loja_pedidos').insert({
      company_id: company.id, customer_id: session.user.id,
      customer_name: profile?.name || 'Cliente', customer_phone: profile?.phone || null,
      delivery_address: deliveryType === 'entrega' ? address : null, delivery_type: deliveryType, scheduled_for: scheduledFor,
      origin: 'cardapio_publico', payment_method: payMethod,
      subtotal: cartTotal, total, notes: obs.trim() || null,
    }).select('id').single()
    if (pedido) {
      await supabase.from('loja_pedido_itens').insert(cart.map(l => ({
        pedido_id: pedido.id, produto_id: l.produtoId, product_name: l.name, unit_price: l.unitPrice, qty: l.qty,
        selected_options: l.modifiers,
      })))
      fetch('/api/loja/registrar-pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id, phone: profile?.phone || null, name: profile?.name || 'Cliente',
          address: deliveryType === 'entrega' ? address : null, total, subtotal: cartTotal, deliveryFee: taxa,
          paymentMethod: payMethod, deliveryType, notes: obs.trim() || null,
          items: cart.map(l => ({ produtoId: l.produtoId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, modifiers: l.modifiers })),
        }),
      }).catch(() => {})
      if (company.owner_id) {
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `Novo pedido — ${company.name}`,
            body: `${profile?.name || 'Cliente'} pediu ${fmt(total)}`,
            target: 'external_user_id', userId: company.owner_id,
            url: `${window.location.origin}/painel/crm/pedidos`,
          }),
        }).catch(() => {})
      }
    }
    setConfirming(false)
    setSuccess(true)
    setTimeout(() => {
      setDrawerOpen(false); setSuccess(false); setCart([]); setObs('')
      setAgendarRetirada(false); setScheduleDate(''); setScheduleTime('')
    }, 2500)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#AAA', background: '#F0EDE8' }}>Carregando...</div>
  if (!company) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', background: '#F0EDE8', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>🍽️</div>
      <div style={{ fontWeight: 700 }}>Cardápio não disponível</div>
    </div>
  )

  const open = isOpenNow(company.hours as any, company.flexible_hours)
  const taxaEntrega = deliveryType === 'entrega' ? Number(company.loja_taxa_entrega || 0) : 0
  const orderTotal = cartTotal + taxaEntrega
  const abaixoMinimo = Number(company.loja_pedido_minimo || 0) > 0 && cartTotal < Number(company.loja_pedido_minimo)
  const searchTerm = search.trim().toLowerCase()
  const filtered = produtos
    .filter(p => filterCat === 'all' || p.category_id === filterCat)
    .filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm))
  const maisPedidos = !searchTerm ? [...produtos].filter(p => p.total_pedidos > 0 && !isSoldOut(p)).sort((a, b) => b.total_pedidos - a.total_pedidos).slice(0, 4) : []

  return (
    <div className="cd-wrap">
      <style>{`
        .cd-wrap{ max-width:480px;margin:0 auto;min-height:100vh;background:#F0EDE8;font-family:'Inter',sans-serif;font-size:13px;color:#111;position:relative;padding-bottom:${cart.length ? '90px' : '20px'}; }
        .cd-top{ background:#111;padding:22px 16px 10px;text-align:center; }
        .cd-bc{ font-size:11px;color:#fff;font-weight:700; }
        .cd-bc a{ color:#C9951A;text-decoration:none; }
        .cd-head{ padding:14px 16px 0; }
        .cd-card{ background:#fff;border:1px solid #EDE8E0;border-radius:14px;padding:16px; }
        .cd-top2{ display:flex;align-items:center;gap:12px;margin-bottom:10px; }
        .cd-av{ width:46px;height:46px;border-radius:12px;background:linear-gradient(155deg,#C9951A,#B8841A);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px; }
        .cd-name{ font-size:19px;font-weight:800;text-transform:uppercase;color:#111; }
        .cd-sub{ font-size:11.5px;color:#AAA; }
        .cd-tag{ font-size:10.5px;padding:3px 9px;border-radius:7px;font-weight:600;display:inline-block; }
        .cd-tag.open{ background:#EDFAF3;color:#0F6E56; }
        .cd-tag.closed{ background:#FEF0F0;color:#E24B4A; }
        .cd-statusrow{ display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-top:0.5px solid #F0EDE8; }
        .cd-rating{ display:flex;align-items:center;gap:6px;font-size:12.5px;flex:none; }
        .cd-search{ padding:12px 16px 0; }
        .cd-search input{ width:100%;padding:11px 14px;border-radius:12px;border:1px solid #EDE8E0;background:#fff;font-size:13px;font-family:inherit; }
        .cd-catbar{ position:sticky;top:0;z-index:15;background:#F0EDE8;padding:12px 16px 8px;display:flex;gap:8px;overflow-x:auto; }
        .cd-catchip{ flex:none;font-size:12px;font-weight:700;padding:7px 14px;border-radius:20px;background:#fff;border:1px solid #EDE8E0;color:#555;cursor:pointer; }
        .cd-catchip.active{ background:#111;color:#C9951A;border-color:#111; }
        .cd-menu{ padding:2px 16px; }
        .cd-hot-row{ display:flex;gap:10px;overflow-x:auto;padding:2px 2px 10px; }
        .cd-hot-card{ flex:none;width:140px;background:#fff;border:1px solid #EDE8E0;border-radius:12px;padding:8px;cursor:pointer;transition:transform .3s; }
        .cd-hot-card.cd-flash{ animation:cdFlash .5s ease; border-color:#C9951A; }
        .cd-hot-photo{ width:100%;height:82px;border-radius:8px;background:linear-gradient(135deg,#FBF1DC,#F0EDE8);display:flex;align-items:center;justify-content:center;font-size:22px;overflow:hidden;margin-bottom:6px; }
        .cd-hot-photo img{ width:100%;height:100%;object-fit:cover; }
        .cd-hot-name{ font-size:11px;font-weight:700;line-height:1.3; }
        .cd-hot-price{ font-size:11px;font-weight:800;margin-top:3px; }
        .cd-sec{ font-size:17px;font-weight:800;letter-spacing:.01em;color:#1A1610;margin:26px 2px 10px;padding-left:11px;border-left:4px solid #C9951A;line-height:1.2; }
        .cd-prowgroup{ background:#fff;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.04);overflow:hidden; }
        .cd-prow{ display:flex;gap:11px;padding:11px 12px;border-bottom:1px solid #EFEAE0;align-items:center;cursor:pointer;transition:background .3s,transform .3s; }
        .cd-prowgroup .cd-prow:last-child{ border-bottom:none; }
        .cd-prow.cd-flash{ animation:cdFlash .5s ease; }
        @keyframes cdFlash{ 0%{ background:#FBF1DC; } 35%{ background:#F5DFA0; transform:scale(1.012); } 100%{ background:transparent; transform:scale(1); } }
        .cd-prow-soldout{ cursor:default;opacity:.55; }
        .cd-prow-soldout .cd-pphoto{ filter:grayscale(1); }
        .cd-pphoto{ width:66px;height:66px;border-radius:11px;background:linear-gradient(135deg,#FBF1DC,#F0EDE8);display:flex;align-items:center;justify-content:center;font-size:22px;position:relative;overflow:hidden; }
        .cd-pphoto img{ width:100%;height:100%;object-fit:cover; }
        .cd-badge{ position:absolute;top:-6px;left:-6px;background:#E24B4A;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:6px; }
        .cd-pmid{ flex:1;min-width:0; }
        .cd-pname{ font-size:13px;font-weight:700; }
        .cd-pdesc{ font-size:11px;color:#AAA;margin-top:2px; }
        .cd-pprice{ font-size:13px;font-weight:800;margin-top:4px; }
        .cd-pprice.was{ font-size:10.5px;color:#AAA;text-decoration:line-through;margin-left:5px;font-weight:600; }
        .cd-addbtn{ flex:none;width:30px;height:30px;border-radius:9px;border:1.5px solid #C9951A;background:#FEF3E2;color:#C9951A;font-size:16px;font-weight:800;cursor:pointer;transition:background .2s,color .2s,transform .2s; }
        .cd-addbtn.added{ background:#C9951A;color:#fff;transform:scale(1.12); }
        .cd-chev{ flex:none;width:26px;height:26px;border-radius:50%;border:none;background:#F0EDE8;color:#AAA;font-size:13px;font-weight:800;cursor:pointer; }
        .cd-cartbar{ position:fixed;left:50%;transform:translateX(-50%);bottom:16px;width:calc(100% - 32px);max-width:448px;padding:13px 16px;border-radius:16px;background:#C9951A;color:#1A1610;display:flex;align-items:center;justify-content:space-between;box-shadow:0 10px 24px -8px rgba(0,0,0,.35);cursor:pointer;z-index:10000; }
        .cd-overlay{ position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9990;display:${detail || drawerOpen ? 'block' : 'none'}; }
        .cd-detail{ position:fixed;top:0;left:0;right:0;bottom:0;max-width:480px;margin:0 auto;background:#F0EDE8;z-index:10000;display:flex;flex-direction:column;overflow:hidden; }
        .cd-hero{ height:200px;flex:none;background:linear-gradient(135deg,#FBF1DC,#E7DCC2);display:flex;align-items:center;justify-content:center;font-size:54px;position:relative;overflow:hidden; }
        .cd-hero img{ width:100%;height:100%;object-fit:cover; }
        .cd-hero-scrim{ position:absolute;top:0;left:0;right:0;height:70px;background:linear-gradient(180deg,rgba(0,0,0,.32),transparent);z-index:1; }
        .cd-herobtn{ position:absolute;top:14px;right:14px;width:38px;height:38px;border-radius:50%;background:rgba(20,15,8,.55);backdrop-filter:blur(3px);border:1px solid rgba(255,255,255,.3);font-size:19px;font-weight:800;color:#fff;cursor:pointer;z-index:2;box-shadow:0 3px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center; }
        .cd-dscroll{ flex:1;overflow-y:auto;padding:16px; }
        .cd-optgroup{ border-top:7px solid #F0EDE8;margin:0 -16px; }
        .cd-og-head{ background:#FBF1DC;padding:11px 16px;display:flex;align-items:center;gap:8px; }
        .cd-og-mid{ flex:1;min-width:0; }
        .cd-og-name{ font-weight:800;font-size:13.5px; }
        .cd-og-sub{ font-size:10px;color:#8A6410;margin-top:1px; }
        .cd-og-req{ flex:none;background:#C43D3D;color:#fff;font-size:9px;font-weight:800;padding:3px 7px;border-radius:6px;letter-spacing:.03em; }
        .cd-og-count{ flex:none;background:#C9951A;color:#fff;font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px;font-variant-numeric:tabular-nums; }
        .cd-orow{ display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:0.5px solid #EDE8E0;cursor:pointer; }
        .cd-oimg{ width:42px;height:42px;border-radius:9px;overflow:hidden;flex:none;background:#F0EDE8; }
        .cd-oimg img{ width:100%;height:100%;object-fit:cover; }
        .cd-omax{ font-size:9.5px;color:#AAA;margin-top:1px; }
        .cd-ocheck{ width:20px;height:20px;border:1.5px solid #D8D2C4;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex:none; }
        .cd-ocheck.radio{ border-radius:50%; }
        .cd-ocheck.active{ background:#C9951A;border-color:#C9951A; }
        .cd-oplus{ flex:none;width:26px;height:26px;border-radius:50%;border:1.5px solid #C9951A;color:#8A6410;background:#FEF3E2;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center; }
        .cd-oplus.active{ background:#C9951A;color:#fff;border-color:#C9951A; }
        .cd-dfoot{ flex:none;background:#fff;border-top:1px solid #EDE8E0;padding:12px 16px 16px;display:flex;gap:10px; }
        .cd-addcart{ flex:1;padding:14px;border-radius:12px;border:none;background:#C9951A;color:#1A1610;font-weight:800;font-size:13px;cursor:pointer; }
        .cd-addcart:disabled{ background:#E2DCCB;color:#A79E8B; }
        .cd-drawer{ position:fixed;left:0;right:0;bottom:0;max-width:480px;margin:0 auto;background:#fff;z-index:10000;border-radius:20px 20px 0 0;max-height:88vh;display:flex;flex-direction:column; }
        .cd-dhead{ padding:16px;border-bottom:1px solid #EDE8E0;display:flex;justify-content:space-between;align-items:center; }
        .cd-dbody{ flex:1;overflow-y:auto;padding:14px 16px; }
        .cd-diinput{ width:100%;padding:10px 12px;border-radius:10px;border:1px solid #EDE8E0;background:#F0EDE8;font-size:13px;font-family:inherit; }
        .cd-paychip{ padding:8px 13px;border-radius:20px;border:1.5px solid #EDE8E0;background:#fff;font-size:12px;font-weight:700;cursor:pointer;margin-right:8px; }
        .cd-paychip.active{ background:#111;color:#C9951A;border-color:#111; }
        .cd-totalrow{ display:flex;justify-content:space-between;padding-top:12px;margin-top:8px;border-top:1px dashed #EDE8E0;font-weight:800;font-size:16px; }
      `}</style>

      <div className="cd-top"><div className="cd-bc"><a href="/">Trindade Online</a> › <a href={`/empresa/${company.slug}`}>{company.name}</a> › Cardápio</div></div>
      <div className="cd-head">
        <div className="cd-card">
          <div className="cd-top2">
            <div className="cd-av">{company.name.slice(0, 2).toUpperCase()}</div>
            <div><div className="cd-name">{company.name}</div><div className="cd-sub">{company.address || ''}</div></div>
          </div>
          <div className="cd-statusrow">
            <span className={`cd-tag ${open ? 'open' : 'closed'}`}>{open ? '● Aberto agora' : '● Fechado agora'}</span>
            <div className="cd-rating"><span style={{ color: '#C9951A' }}>★★★★★</span><b>{Number(company.avg_rating || 0).toFixed(1)}</b><span style={{ color: '#AAA' }}>({company.total_reviews || 0})</span></div>
          </div>
        </div>
      </div>

      <div className="cd-search">
        <input placeholder="Buscar no cardápio..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="cd-catbar">
        <button className={`cd-catchip ${filterCat === 'all' ? 'active' : ''}`} onClick={() => setFilterCat('all')}>Tudo</button>
        {categorias.map(c => <button key={c.id} className={`cd-catchip ${filterCat === c.id ? 'active' : ''}`} onClick={() => setFilterCat(c.id)}>{c.name}</button>)}
      </div>

      {maisPedidos.length > 0 && (
        <div className="cd-menu">
          <div className="cd-sec">🔥 Mais pedidos</div>
          <div className="cd-hot-row">
            {maisPedidos.map(p => {
              const promo = promoPrice(p)
              const hasOpts = p.groups && p.groups.length > 0
              return (
                <div className={`cd-hot-card ${flashId === p.id ? 'cd-flash' : ''}`} key={p.id} onClick={() => hasOpts ? openDetail(p) : quickAdd(p, promo ?? p.sale_price)}>
                  <div className="cd-hot-photo">{p.photo_url ? <img src={p.photo_url} alt="" /> : '🍽️'}</div>
                  <div className="cd-hot-name">{p.name}</div>
                  {(promo ?? p.sale_price) > 0 && <div className="cd-hot-price">{fmt(promo ?? p.sale_price)}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="cd-menu">
        {searchTerm && filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#AAA', padding: '30px 0', fontSize: 12.5 }}>Nenhum produto encontrado pra "{search.trim()}"</div>
        )}
        {categorias.filter(c => filterCat === 'all' || filterCat === c.id).map(cat => {
          const items = filtered.filter(p => p.category_id === cat.id)
          if (!items.length) return null
          return (
            <div key={cat.id}>
              <div className="cd-sec">{cat.name}</div>
              <div className="cd-prowgroup">
              {items.map(p => {
                const promo = promoPrice(p)
                const hasOpts = p.groups && p.groups.length > 0
                const soldOut = isSoldOut(p)
                return (
                  <div className={`cd-prow ${soldOut ? 'cd-prow-soldout' : ''} ${flashId === p.id ? 'cd-flash' : ''}`} key={p.id} onClick={() => { if (soldOut) return; hasOpts ? openDetail(p) : quickAdd(p, promo ?? p.sale_price) }}>
                    <div className="cd-pphoto">
                      {p.photo_url ? <img src={p.photo_url} alt="" /> : '🍽️'}
                      {!soldOut && promo != null && <span className="cd-badge">{p.promo_type === 'percent' ? `-${p.promo_value}%` : `-${fmt(p.promo_value!)}`}</span>}
                    </div>
                    <div className="cd-pmid">
                      <div className="cd-pname">{p.name}</div>
                      {p.description && <div className="cd-pdesc">{p.description}</div>}
                      {soldOut
                        ? <div className="cd-pprice" style={{ color: '#C43D3D' }}>Esgotado</div>
                        : (promo ?? p.sale_price) > 0 && <div className="cd-pprice">{fmt(promo ?? p.sale_price)}{promo != null && <span className="was">{fmt(p.sale_price)}</span>}</div>}
                    </div>
                    {!soldOut && (hasOpts ? <button className="cd-chev">›</button> : <button className={`cd-addbtn ${flashId === p.id ? 'added' : ''}`}>{flashId === p.id ? '✓' : '+'}</button>)}
                  </div>
                )
              })}
              </div>
            </div>
          )
        })}
      </div>

      {cart.length > 0 && (
        <div className="cd-cartbar" onClick={() => setDrawerOpen(true)}>
          <span>{cartCount} {cartCount === 1 ? 'item' : 'itens'} · Ver carrinho</span><b>{fmt(cartTotal)}</b>
        </div>
      )}

      <div className="cd-overlay" onClick={() => { setDetail(null); setDrawerOpen(false) }} />

      {detail && (
        <div className="cd-detail">
          <div className="cd-hero">
            {detail.photo_url ? <img src={detail.photo_url} alt="" /> : detail.name[0]}
            <div className="cd-hero-scrim" />
            <button className="cd-herobtn" onClick={() => setDetail(null)}>‹</button>
          </div>
          <div className="cd-dscroll">
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{detail.name}</div>
            {(promoPrice(detail) ?? detail.sale_price) > 0 && (
              <div style={{ fontSize: 15, fontWeight: 700, color: '#555', marginBottom: 9 }}>{fmt(promoPrice(detail) ?? detail.sale_price)}</div>
            )}
            {detail.description && <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.6, marginBottom: 14 }}>{detail.description}</div>}
            {detail.groups.map((g, gi) => {
              const selCount = detailSel[gi]?.length || 0
              return (
              <div className="cd-optgroup" key={g.id} ref={el => { groupRefs.current[gi] = el }}>
                <div className="cd-og-head">
                  <div className="cd-og-mid">
                    <div className="cd-og-name">{g.name}</div>
                    <div className="cd-og-sub">{g.required ? `Escolha ${g.min_select}${g.max_select > g.min_select ? '-' + g.max_select : ''} ${g.max_select > 1 ? 'itens' : 'item'}` : `Escolha até ${g.max_select} ${g.max_select > 1 ? 'itens' : 'item'}`}</div>
                  </div>
                  {g.required && <span className="cd-og-req">OBRIGATÓRIO</span>}
                  <span className="cd-og-count">{selCount}/{g.max_select}</span>
                </div>
                {g.options.map((o, oi) => {
                  const active = detailSel[gi]?.includes(oi)
                  return (
                    <div className="cd-orow" key={o.id} onClick={() => toggleOpt(gi, oi)}>
                      {o.photo_url && <div className="cd-oimg"><img src={o.photo_url} alt="" /></div>}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{o.name}</div>
                        <div style={{ fontSize: 11, color: '#555' }}>{o.price > 0 ? '+ ' + fmt(o.price) : 'Grátis'}</div>
                        {o.max_qty != null && <div className="cd-omax">Máx {o.max_qty}</div>}
                      </div>
                      {g.max_select === 1
                        ? <div className={`cd-ocheck radio ${active ? 'active' : ''}`}>{active ? '●' : ''}</div>
                        : <div className={`cd-oplus ${active ? 'active' : ''}`}>{active ? '✓' : '+'}</div>}
                    </div>
                  )
                })}
              </div>
              )
            })}
          </div>
          <div className="cd-dfoot">
            <div style={{ display: 'flex', border: '1.5px solid #C9951A', borderRadius: 12, overflow: 'hidden' }}>
              <button onClick={() => setDetailQty(q => Math.max(1, q - 1))} style={{ width: 34, border: 'none', background: '#FEF3E2', color: '#C9951A', fontWeight: 800 }}>−</button>
              <span style={{ width: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{detailQty}</span>
              <button onClick={() => setDetailQty(q => q + 1)} style={{ width: 34, border: 'none', background: '#FEF3E2', color: '#C9951A', fontWeight: 800 }}>+</button>
            </div>
            <button className="cd-addcart" disabled={!detailReqMet} onClick={confirmAddDetail}>Adicionar — {fmt(detailUnitPrice * detailQty)}</button>
          </div>
        </div>
      )}

      {drawerOpen && (
        <div className="cd-drawer">
          <div className="cd-dhead"><b>Seu pedido</b><button onClick={() => setDrawerOpen(false)} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #EDE8E0', background: '#F0EDE8' }}>✕</button></div>
          {!success ? (
            <>
              <div className="cd-dbody">
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', color: '#AAA', marginBottom: 8, fontWeight: 800 }}>Itens</div>
                {cart.map(l => (
                  <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '0.5px solid #EDE8E0', fontSize: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span>{l.name}</span>
                      {l.modifiers.length > 0 && <span style={{ display: 'block', fontSize: 10.5, color: '#AAA' }}>{l.modifiers.map(m => m.name).join(', ')}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                      <button onClick={() => changeCartQty(l.key, -1)} style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid #E2DCCB', background: '#F7F5F0', fontWeight: 800, fontSize: 13, lineHeight: 1, cursor: 'pointer' }}>−</button>
                      <b style={{ minWidth: 14, textAlign: 'center' }}>{l.qty}</b>
                      <button onClick={() => changeCartQty(l.key, 1)} style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid #E2DCCB', background: '#F7F5F0', fontWeight: 800, fontSize: 13, lineHeight: 1, cursor: 'pointer' }}>+</button>
                    </div>
                    <b style={{ flex: 'none', minWidth: 60, textAlign: 'right' }}>{fmt(l.qty * l.unitPrice)}</b>
                    <button onClick={() => removeCartLine(l.key)} aria-label="Remover item" style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', color: '#C43D3D', fontSize: 14, cursor: 'pointer' }}>🗑</button>
                  </div>
                ))}
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', color: '#AAA', margin: '14px 0 8px', fontWeight: 800 }}>Como você quer receber?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`cd-paychip ${deliveryType === 'entrega' ? 'active' : ''}`} style={{ flex: 1, marginRight: 0, textAlign: 'center' }} onClick={() => setDeliveryType('entrega')}>🚴 Entrega</button>
                  <button className={`cd-paychip ${deliveryType === 'retirada' ? 'active' : ''}`} style={{ flex: 1, marginRight: 0, textAlign: 'center' }} onClick={() => setDeliveryType('retirada')}>🏪 Retirar na loja</button>
                </div>

                {deliveryType === 'entrega' ? (
                  <>
                    <div style={{ fontSize: 10.5, textTransform: 'uppercase', color: '#AAA', margin: '14px 0 8px', fontWeight: 800 }}>Endereço</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input className="cd-diinput" style={{ flex: 1 }} value={cep} onChange={e => handleCepChange(e.target.value)} placeholder="CEP" inputMode="numeric" />
                      <input className="cd-diinput" style={{ width: 90 }} value={numero} onChange={e => handleNumeroChange(e.target.value)} placeholder="Número" />
                    </div>
                    {cepLoading && <div style={{ fontSize: 11, color: '#AAA', marginBottom: 6 }}>Buscando endereço...</div>}
                    {cepError && <div style={{ fontSize: 11, color: '#C43D3D', marginBottom: 6 }}>CEP não encontrado — preenche o endereço direto embaixo</div>}
                    <input className="cd-diinput" value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, bairro, complemento" />
                  </>
                ) : (
                  <>
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" checked={agendarRetirada} onChange={e => setAgendarRetirada(e.target.checked)} id="cd-agendar" />
                      <label htmlFor="cd-agendar" style={{ fontSize: 12, fontWeight: 600 }}>Agendar retirada pra outro dia/horário</label>
                    </div>
                    {agendarRetirada && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input className="cd-diinput" type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                        <input className="cd-diinput" type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
                      </div>
                    )}
                  </>
                )}

                <div style={{ fontSize: 10.5, textTransform: 'uppercase', color: '#AAA', margin: '14px 0 8px', fontWeight: 800 }}>Observações (opcional)</div>
                <textarea className="cd-diinput" style={{ minHeight: 56, resize: 'vertical' }} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex: sem cebola, troco pra R$50..." />
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', color: '#AAA', margin: '14px 0 8px', fontWeight: 800 }}>Pagamento</div>
                {(['pix', 'dinheiro', 'cartao'] as const).map(m => <button key={m} className={`cd-paychip ${payMethod === m ? 'active' : ''}`} onClick={() => setPayMethod(m)}>{m === 'pix' ? 'Pix' : m === 'dinheiro' ? 'Dinheiro' : 'Cartão'}</button>)}
                {abaixoMinimo && (
                  <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#FEF0E0', color: '#B5690C', fontSize: 11.5, fontWeight: 600 }}>
                    Pedido mínimo de {fmt(Number(company.loja_pedido_minimo))} — faltam {fmt(Number(company.loja_pedido_minimo) - cartTotal)}
                  </div>
                )}
                {taxaEntrega > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 12, color: '#555' }}><span>Taxa de entrega</span><span>{fmt(taxaEntrega)}</span></div>
                )}
                <div className="cd-totalrow"><span>Total</span><span>{fmt(orderTotal)}</span></div>
              </div>
              <div style={{ padding: '14px 16px 16px', borderTop: '1px solid #EDE8E0' }}>
                <button className="cd-addcart" style={{ width: '100%' }} disabled={confirming || (deliveryType === 'entrega' && !address.trim()) || (agendarRetirada && (!scheduleDate || !scheduleTime)) || abaixoMinimo} onClick={confirmOrder}>{confirming ? 'Enviando...' : 'Confirmar pedido'}</button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 30, gap: 10 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#EDFAF3', color: '#0F6E56', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>✓</div>
              <b style={{ fontSize: 15 }}>Pedido enviado!</b>
              <p style={{ fontSize: 12.5, color: '#555', maxWidth: 260 }}>A {company.name} recebeu seu pedido.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
