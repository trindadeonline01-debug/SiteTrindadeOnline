'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { moduleActive } from '@/lib/modules'
import QRCode from 'qrcode'
import { BAIRROS_SAO_GONCALO, normalizeBairro } from '@/lib/bairrosSaoGoncalo'
import { usePainelShell } from '@/contexts/PainelShellContext'

type TaxaMetodo = 'bairro' | 'distancia'
type Company = {
  id: string; name: string; slug: string; address: string; loja_digital_enabled: boolean
  loja_taxa_entrega: number; loja_pedido_minimo: number; loja_payment_methods: string[]
  loja_taxa_metodo: TaxaMetodo; loja_frete_gratis_acima: number | null; loja_taxa_fora_area: number | null
  loja_lat: number | null; loja_lng: number | null
  crm_whatsapp_enabled: boolean; entrega_enabled: boolean
}
type Categoria = { id: string; name: string }
type ProdutoOpt = { id: string; name: string }
type BairroRow = { name: string; price: string; disabled: boolean }
type KmTier = { kmUntil: string; price: string }

const PAYMENT_PRESETS: { key: string; label: string }[] = [
  { key: 'pix', label: 'Pix' },
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'cartao_credito', label: 'Cartão de crédito' },
  { key: 'cartao_debito', label: 'Cartão de débito' },
  { key: 'vale_refeicao', label: 'Vale-refeição' },
  { key: 'vale_alimentacao', label: 'Vale-alimentação' },
  { key: 'picpay', label: 'PicPay' },
]
const PRESET_KEYS = PAYMENT_PRESETS.map(p => p.key)

function parsePt(v: string) { return parseFloat((v || '0').replace(',', '.')) || 0 }
function fmtPt(n: number | null | undefined) { return n == null ? '' : String(n).replace('.', ',') }

// Link/QR de uma granularidade só (catálogo inteiro/categoria/produto) —
// mesmo card visual pras 3, ESPECIFICACAO.md §9.2.
function ShareCard({ title, link }: { title: string; link: string }) {
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!link) { setQr(''); return }
    QRCode.toDataURL(link, { width: 160, margin: 1, color: { dark: '#1A1610', light: '#FFFFFF' } }).then(setQr).catch(() => {})
  }, [link])
  function copy() {
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <div className="crm-share-card">
      <div className="crm-share-title">{title}</div>
      <div className="crm-share-qr">{qr && <img src={qr} alt="QR Code" />}</div>
      <div className="crm-share-link">{link}</div>
      <button className="crm-share-btn" onClick={copy}>{copied ? 'Link copiado!' : 'Copiar link'}</button>
    </div>
  )
}

function defaultKmTiers(): KmTier[] {
  return [{ kmUntil: '1', price: '' }, { kmUntil: '3', price: '' }, { kmUntil: '5', price: '' }, { kmUntil: '10', price: '' }]
}

export default function CompartilharPage() {
  const { company: shellCompany, loading: shellLoading } = usePainelShell()
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<Company | null>(null)
  const [view, setView] = useState<'hub' | 'share' | 'entrega' | 'pagamento'>('hub')
  const [viewingMethod, setViewingMethod] = useState<TaxaMetodo>('bairro')
  const [activating, setActivating] = useState<TaxaMetodo | null>(null)
  const [activateError, setActivateError] = useState('')

  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [produtosOpt, setProdutosOpt] = useState<ProdutoOpt[]>([])
  const [selCat, setSelCat] = useState('')
  const [selProd, setSelProd] = useState('')

  const [minimoInput, setMinimoInput] = useState('0')
  const [freteGratisInput, setFreteGratisInput] = useState('0')
  const [foraAreaInput, setForaAreaInput] = useState('')
  const [bairros, setBairros] = useState<BairroRow[]>(BAIRROS_SAO_GONCALO.map(name => ({ name, price: '', disabled: false })))
  const [bairroSearch, setBairroSearch] = useState('')
  const [quickfillVal, setQuickfillVal] = useState('')
  const [kmTiers, setKmTiers] = useState<KmTier[]>(defaultKmTiers())
  const [kmLastPrice, setKmLastPrice] = useState('')
  const [kmLastBlocked, setKmLastBlocked] = useState(true)
  const [savingEntrega, setSavingEntrega] = useState(false)
  const [entregaSaved, setEntregaSaved] = useState(false)

  const [paymentMethods, setPaymentMethods] = useState<string[]>(['pix', 'dinheiro', 'cartao_credito'])
  const [customInput, setCustomInput] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [paymentSaved, setPaymentSaved] = useState(false)

  useEffect(() => {
    if (shellLoading) return
    if (!shellCompany) { setCompany(null); setLoading(false); return }
    supabase
      .from('companies')
      .select('id, name, slug, address, loja_digital_enabled, loja_taxa_entrega, loja_pedido_minimo, loja_payment_methods, loja_taxa_metodo, loja_frete_gratis_acima, loja_taxa_fora_area, loja_lat, loja_lng, crm_whatsapp_enabled, entrega_enabled, trial_modules_until')
      .eq('id', shellCompany.id)
      .maybeSingle()
      .then(async ({ data: comp }) => {
      if (comp) {
        setCompany({
          ...comp,
          loja_digital_enabled: moduleActive(comp.loja_digital_enabled, comp.trial_modules_until),
          crm_whatsapp_enabled: moduleActive(comp.crm_whatsapp_enabled, comp.trial_modules_until),
          entrega_enabled: moduleActive(comp.entrega_enabled, comp.trial_modules_until),
        })
        setViewingMethod((comp.loja_taxa_metodo as TaxaMetodo) || 'bairro')
        setMinimoInput(Number(comp.loja_pedido_minimo || 0).toFixed(2).replace('.', ','))
        setFreteGratisInput(Number(comp.loja_frete_gratis_acima || 0).toFixed(2).replace('.', ','))
        setForaAreaInput(fmtPt(comp.loja_taxa_fora_area))
        setPaymentMethods(comp.loja_payment_methods?.length ? comp.loja_payment_methods : ['pix', 'dinheiro', 'cartao_credito'])
        if (moduleActive(comp.loja_digital_enabled, comp.trial_modules_until)) {
          const [{ data: cats }, { data: prods }, { data: bairroRows }, { data: tierRows }] = await Promise.all([
            supabase.from('loja_categorias').select('id,name').eq('company_id', comp.id).order('display_order'),
            supabase.from('loja_produtos').select('id,name').eq('company_id', comp.id).eq('active', true).order('display_order'),
            supabase.from('company_delivery_bairros').select('bairro, price, disabled').eq('company_id', comp.id),
            supabase.from('company_delivery_km_tiers').select('position, km_until, price, blocked').eq('company_id', comp.id).order('position'),
          ])
          setCategorias(cats || [])
          setProdutosOpt(prods || [])

          setBairros(BAIRROS_SAO_GONCALO.map(name => {
            const row = (bairroRows || []).find(r => normalizeBairro(r.bairro) === normalizeBairro(name))
            return { name, price: row?.price != null ? fmtPt(Number(row.price)) : '', disabled: row?.disabled || false }
          }))

          if (tierRows?.length) {
            const finitos = tierRows.filter(t => t.km_until != null)
            const ultimo = tierRows.find(t => t.km_until == null)
            setKmTiers(finitos.map(t => ({ kmUntil: String(t.km_until), price: t.price != null ? fmtPt(Number(t.price)) : '' })))
            if (ultimo) { setKmLastBlocked(ultimo.blocked); setKmLastPrice(ultimo.price != null ? fmtPt(Number(ultimo.price)) : '') }
          }
        }
      } else {
        setCompany(null)
      }
      setLoading(false)
    })
  }, [shellLoading, shellCompany?.id])

  const cardapioLink = company ? `https://trindadeonline.com.br/empresa/${company.slug}/cardapio` : ''

  useEffect(() => {
    if (!cardapioLink) return
    QRCode.toDataURL(cardapioLink, { width: 200, margin: 1, color: { dark: '#1A1610', light: '#FFFFFF' } })
      .then(setQrDataUrl).catch(() => {})
  }, [cardapioLink])

  function copyLink() {
    navigator.clipboard.writeText(cardapioLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  async function activateMethod(m: TaxaMetodo) {
    if (!company || company.loja_taxa_metodo === m) return
    setActivating(m)
    setActivateError('')
    let latLngPatch: Partial<Company> = {}
    if (m === 'distancia' && (company.loja_lat == null || company.loja_lng == null)) {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setActivateError('Sessão expirada — recarregue a página.'); setActivating(null); return }
      const res = await fetch('/api/loja/geocodificar-loja', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, company_id: company.id }),
      })
      const data = await res.json()
      if (!res.ok) { setActivateError(data.error || 'Não conseguimos localizar sua loja.'); setActivating(null); return }
      latLngPatch = { loja_lat: data.lat, loja_lng: data.lng }
    }
    await supabase.from('companies').update({ loja_taxa_metodo: m, ...latLngPatch }).eq('id', company.id)
    setCompany(prev => prev ? { ...prev, loja_taxa_metodo: m, ...latLngPatch } : prev)
    setActivating(null)
  }

  function updateBairro(name: string, patch: Partial<BairroRow>) {
    setBairros(prev => prev.map(b => b.name === name ? { ...b, ...patch } : b))
  }
  function toggleBairroOff(name: string) {
    setBairros(prev => prev.map(b => b.name === name ? { ...b, disabled: !b.disabled } : b))
  }
  function applyQuickfill() {
    if (!quickfillVal.trim()) return
    setBairros(prev => prev.map(b => (!b.price && !b.disabled) ? { ...b, price: quickfillVal } : b))
  }
  const bairrosFiltrados = useMemo(() => {
    const q = normalizeBairro(bairroSearch)
    return q ? bairros.filter(b => normalizeBairro(b.name).includes(q)) : bairros
  }, [bairros, bairroSearch])
  const bairroConfiguredCount = useMemo(() => bairros.filter(b => b.price !== '' || b.disabled).length, [bairros])

  function updateKmTier(idx: number, patch: Partial<KmTier>) {
    setKmTiers(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
  }
  function addKmRow() {
    const prevMax = kmTiers.length ? Number(kmTiers[kmTiers.length - 1].kmUntil) || 0 : 0
    setKmTiers(prev => [...prev, { kmUntil: String(prevMax + 2), price: '' }])
  }
  function removeKmRow(idx: number) {
    if (kmTiers.length <= 1) return
    setKmTiers(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveEntrega() {
    if (!company) return
    setSavingEntrega(true)
    const loja_pedido_minimo = parsePt(minimoInput)
    const loja_frete_gratis_acima = parsePt(freteGratisInput)
    const loja_taxa_fora_area = foraAreaInput.trim() === '' ? null : parsePt(foraAreaInput)

    await supabase.from('companies').update({ loja_pedido_minimo, loja_frete_gratis_acima, loja_taxa_fora_area }).eq('id', company.id)

    await supabase.from('company_delivery_bairros').delete().eq('company_id', company.id)
    const bairroRows = bairros
      .filter(b => b.price !== '' || b.disabled)
      .map(b => ({ company_id: company.id, bairro: b.name, price: b.disabled ? null : (parsePt(b.price) || null), disabled: b.disabled }))
    if (bairroRows.length) await supabase.from('company_delivery_bairros').insert(bairroRows)

    await supabase.from('company_delivery_km_tiers').delete().eq('company_id', company.id)
    const tierRows = [
      ...kmTiers.map((t, i) => ({ company_id: company.id, position: i, km_until: parsePt(t.kmUntil) || null, price: t.price !== '' ? parsePt(t.price) : null, blocked: false })),
      { company_id: company.id, position: kmTiers.length, km_until: null, price: kmLastBlocked ? null : (parsePt(kmLastPrice) || null), blocked: kmLastBlocked },
    ]
    await supabase.from('company_delivery_km_tiers').insert(tierRows)

    setCompany(prev => prev ? { ...prev, loja_pedido_minimo, loja_frete_gratis_acima, loja_taxa_fora_area } : prev)
    setSavingEntrega(false)
    setEntregaSaved(true)
    setTimeout(() => setEntregaSaved(false), 2000)
  }

  function togglePreset(key: string) {
    setPaymentMethods(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  }
  function addCustomPayment() {
    const v = customInput.trim()
    if (!v || paymentMethods.some(m => m.toLowerCase() === v.toLowerCase())) { setCustomInput(''); return }
    setPaymentMethods(prev => [...prev, v])
    setCustomInput('')
  }
  function removeCustomPayment(v: string) {
    setPaymentMethods(prev => prev.filter(m => m !== v))
  }
  const customEntries = useMemo(() => paymentMethods.filter(m => !PRESET_KEYS.includes(m) && m !== 'cartao'), [paymentMethods])

  async function savePaymentMethods() {
    if (!company || paymentMethods.length === 0) return
    setSavingPayment(true)
    await supabase.from('companies').update({ loja_payment_methods: paymentMethods }).eq('id', company.id)
    setSavingPayment(false)
    setPaymentSaved(true)
    setTimeout(() => setPaymentSaved(false), 2000)
  }

  if (loading) {
    return <div style={wrap}><div style={{ color: '#AAA', fontSize: 13 }}>Carregando...</div></div>
  }
  if (!company) {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🏪</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Nenhuma empresa encontrada</div>
        <a href="/anunciar" style={btn}>Cadastrar minha empresa</a>
      </div>
    )
  }
  if (!company.loja_digital_enabled) {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🧾</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>Cardápio + Pedidos</div>
        <div style={{ fontSize: 13, color: '#666', textAlign: 'center', maxWidth: 300, lineHeight: 1.6, marginBottom: 20 }}>
          Catálogo com opcionais e combos, cardápio digital pros seus clientes comprarem, e um painel de pedidos com tela pra cozinha. Ainda não está ativo pra {company.name}.
        </div>
        <a href="/empresa/planos" style={btn}>Saiba mais</a>
      </div>
    )
  }

  const metodoAtivo = company.loja_taxa_metodo
  const entregaStatus = metodoAtivo === 'bairro'
    ? `Por bairro · ${bairroConfiguredCount} de ${BAIRROS_SAO_GONCALO.length} configurados`
    : `Por distância · ${kmTiers.length + 1} faixas`

  return (
    <>
      <div className="crm-hub-content">
        <style>{`
          .crm-hub-content{padding:24px 16px 80px;min-width:0;}
          @media(min-width:768px){.crm-hub-content{padding:28px 32px;}}

          .hub-head{margin-bottom:18px;}
          .hub-eyebrow{font-size:11px;font-weight:800;color:var(--sign-dark);letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px;}
          .hub-sub{font-size:13px;color:var(--muted);max-width:520px;line-height:1.5;}
          .hub-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
          @media(max-width:900px){.hub-grid{grid-template-columns:1fr;}}
          .hub-card{background:#fff;border:1px solid #E6E0D2;border-radius:16px;padding:18px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:10px;transition:border-color .15s, transform .15s;}
          .hub-card:hover{border-color:var(--sign-dark);transform:translateY(-1px);}
          .hub-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
          .hub-card-ico{width:42px;height:42px;border-radius:11px;background:var(--concrete-2,#F5F6F2);display:flex;align-items:center;justify-content:center;font-size:20px;flex:none;}
          .hub-card-chev{color:var(--muted);font-size:16px;margin-top:6px;}
          .hub-card-title{font-weight:800;font-size:14.5px;}
          .hub-card-desc{font-size:12px;color:var(--muted);line-height:1.5;}
          .hub-card-status{display:inline-flex;align-self:flex-start;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:4px 9px;border-radius:20px;margin-top:2px;background:rgba(168,114,0,.1);color:var(--sign-dark);}
          .hub-card.ghost{border-style:dashed;background:transparent;align-items:center;justify-content:center;text-align:center;color:var(--muted);cursor:default;}
          .hub-card.ghost:hover{transform:none;border-color:#E6E0D2;}

          .crm-panel-back-row{display:flex;align-items:center;gap:12px;margin-bottom:18px;}
          .crm-back{width:32px;height:32px;border-radius:50%;border:1px solid #E6E0D2;background:#fff;font-size:15px;cursor:pointer;flex:none;}
          .crm-panel-title{font-family:'Anton',sans-serif;font-size:19px;letter-spacing:.5px;text-transform:uppercase;}

          .crm-share-card{margin:0 auto 16px;max-width:320px;background:#fff;border:1px solid #EDE8E0;border-radius:14px;padding:18px;text-align:center;}
          @media(min-width:768px){.crm-share-card{max-width:280px;margin:0 0 16px;}}
          .crm-share-title{font-weight:800;font-size:13.5px;margin-bottom:12px;}
          .crm-share-qr{width:160px;height:160px;margin:0 auto 12px;border-radius:10px;overflow:hidden;background:#F0EDE8;}
          .crm-share-qr img{width:100%;height:100%;}
          .crm-share-link{font-size:10.5px;color:#888;word-break:break-all;margin-bottom:10px;}
          .crm-share-btn{width:100%;padding:9px;border-radius:9px;border:none;background:var(--sign);color:var(--ink);font-weight:700;font-size:12px;cursor:pointer;}
          .crm-config-card{margin:0 auto 16px;max-width:320px;background:#fff;border:1px solid #EDE8E0;border-radius:14px;padding:18px;}
          @media(min-width:768px){.crm-config-card{max-width:280px;margin:0 0 16px;}}
          .crm-config-title{font-weight:800;font-size:13.5px;margin-bottom:4px;}
          .crm-config-sub{font-size:10.5px;color:#888;margin-bottom:12px;line-height:1.5;}
          .crm-config-field{margin-bottom:10px;}
          .crm-config-field label{display:block;font-size:10.5px;font-weight:700;color:#6E6656;margin-bottom:5px;}
          .crm-config-field input{width:100%;padding:9px 11px;border-radius:9px;border:1px solid #E6E0D2;font-size:12.5px;font-family:inherit;}
          .crm-select{width:100%;padding:9px 11px;border-radius:9px;border:1px solid #E6E0D2;font-size:12.5px;font-family:inherit;background:#fff;margin-bottom:4px;}
          .crm-config-btn{padding:9px 20px;border-radius:9px;border:none;background:var(--ink);color:var(--sign);font-weight:700;font-size:12px;cursor:pointer;margin-top:4px;}
          .crm-payment-row{display:flex;align-items:center;gap:9px;font-size:12.5px;padding:7px 0;cursor:pointer;}
          .crm-payment-row input{width:15px;height:15px;accent-color:var(--ink);}

          .entrega-wide{max-width:100%;}
          .entrega-card{background:#fff;border:1px solid #E6E0D2;border-radius:16px;padding:20px;margin-bottom:16px;}
          .entrega-card.fallback{background:var(--concrete-2,#F5F6F2);}
          .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
          @media(max-width:640px){.field-row{grid-template-columns:1fr;}}

          .method-tabs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;}
          @media(max-width:640px){.method-tabs{grid-template-columns:1fr;}}
          .method-tab{display:flex;flex-direction:column;gap:6px;text-align:left;padding:14px 16px;border-radius:14px;border:1.5px solid #E6E0D2;background:#fff;cursor:pointer;transition:opacity .15s;}
          .method-tab.on{border-color:var(--ink);background:var(--concrete-2,#F5F6F2);}
          .method-tab:not(.on){opacity:.72;}
          .method-tab:not(.on):hover{opacity:1;border-color:var(--muted);}
          .method-tab-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}
          .method-tab-title{font-weight:800;font-size:13.5px;display:flex;align-items:center;gap:9px;}
          .tab-dot{width:9px;height:9px;border-radius:50%;background:#E6E0D2;flex:none;display:inline-block;}
          .tab-dot.on{background:var(--open,#0F8A57);box-shadow:0 0 0 3px rgba(15,138,87,.15);}
          .method-tab-desc{font-size:11.5px;color:var(--muted);padding-left:18px;line-height:1.45;}
          .method-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
          .method-toggle-btn{padding:8px 16px;border-radius:20px;border:1.5px solid var(--sign-dark);background:transparent;color:var(--sign-dark);font-weight:800;font-size:11.5px;cursor:pointer;white-space:nowrap;flex:none;}
          .method-toggle-btn.on{background:var(--open,#0F8A57);border-color:var(--open,#0F8A57);color:#fff;cursor:default;}
          .method-toggle-btn:disabled{opacity:.6;cursor:wait;}
          .activate-error{font-size:11.5px;color:var(--alert,#D6392B);margin-bottom:10px;}

          .geo-strip{display:flex;align-items:center;gap:10px;background:var(--concrete-2,#F5F6F2);border:1px solid #E6E0D2;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;}
          .bairro-toolbar{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;}
          .bairro-toolbar input[type=text]{flex:1;min-width:180px;padding:9px 12px;border-radius:9px;border:1px solid #E6E0D2;font-size:12.5px;font-family:inherit;}
          .quickfill{display:flex;gap:8px;flex:none;}
          .quickfill input{width:90px;padding:9px 10px;border-radius:9px;border:1px solid #E6E0D2;font-size:12.5px;font-family:inherit;}
          .quickfill button{padding:0 12px;border-radius:9px;border:1.5px dashed var(--sign-dark);background:transparent;color:var(--sign-dark);font-weight:700;font-size:11.5px;cursor:pointer;white-space:nowrap;}
          .bairro-count{font-size:11.5px;color:var(--muted);margin-bottom:10px;}
          .bairro-count b{color:var(--ink);}
          .bairro-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:9px;max-height:520px;overflow-y:auto;padding:2px 2px 4px;}
          .bairro-cell{border:1px solid #E6E0D2;border-radius:10px;padding:9px 10px;background:#fff;}
          .bairro-cell.self{border-color:var(--sign-dark);background:rgba(255,197,49,.08);}
          .bairro-cell.off{background:var(--concrete-2,#F5F6F2);}
          .bairro-cell-name{font-size:11.5px;font-weight:700;margin-bottom:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          .bairro-cell-row{display:flex;align-items:center;gap:6px;}
          .bairro-cell input{flex:1;min-width:0;padding:6px 7px;border-radius:7px;border:1px solid #E6E0D2;font-size:12px;font-family:inherit;text-align:right;}
          .bairro-cell input:disabled{background:var(--concrete-2,#F5F6F2);color:#C7C3B9;}
          .bairro-off-btn{width:26px;height:26px;border-radius:7px;border:1.5px solid #E6E0D2;background:#fff;font-size:12px;cursor:pointer;flex:none;color:var(--muted);line-height:1;}
          .bairro-off-btn.on{background:var(--alert,#D6392B);border-color:var(--alert,#D6392B);color:#fff;}
          .bairro-off-label{font-size:10px;color:var(--alert,#D6392B);font-weight:700;flex:1;}
          .bairro-empty{grid-column:1/-1;text-align:center;padding:30px;color:var(--muted);font-size:12.5px;}

          .km-rows{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;}
          .km-row{display:flex;align-items:center;gap:10px;border:1px solid #E6E0D2;border-radius:10px;padding:10px 12px;}
          .km-row-label{flex:1;font-size:12.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
          .km-row-label input.km-num{width:48px;padding:5px 6px;border-radius:6px;border:1px solid #E6E0D2;font-size:12px;text-align:center;font-family:inherit;}
          .km-row input.km-price{width:100px;padding:7px 9px;border-radius:8px;border:1px solid #E6E0D2;font-size:12.5px;font-family:inherit;text-align:right;}
          .km-row.last{background:var(--concrete-2,#F5F6F2);}
          .km-off-label{font-size:11px;color:var(--alert,#D6392B);font-weight:700;}
          .km-remove-btn{width:24px;height:24px;border-radius:6px;border:none;background:transparent;color:var(--muted);font-size:15px;cursor:pointer;flex:none;}
          .km-add-btn{align-self:flex-start;padding:8px 14px;border-radius:9px;border:1.5px dashed var(--sign-dark);background:transparent;color:var(--sign-dark);font-weight:700;font-size:12px;cursor:pointer;}

          .pay-grid{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;}
          .pay-chip{display:flex;align-items:center;gap:7px;padding:9px 14px;border-radius:10px;border:1.5px solid #E6E0D2;font-size:12.5px;font-weight:600;cursor:pointer;background:#fff;}
          .pay-chip .dot{width:16px;height:16px;border-radius:5px;border:1.5px solid #E6E0D2;flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;}
          .pay-chip.on{border-color:var(--ink);background:var(--concrete-2,#F5F6F2);}
          .pay-chip.on .dot{background:var(--open,#0F8A57);border-color:var(--open,#0F8A57);}
          .pay-custom-row{display:flex;gap:8px;margin-bottom:12px;}
          .pay-custom-row input{flex:1;padding:10px 12px;border-radius:9px;border:1px solid #E6E0D2;font-size:13px;font-family:inherit;}
          .pay-add-btn{padding:0 16px;border-radius:9px;border:1.5px dashed var(--sign-dark);background:transparent;color:var(--sign-dark);font-weight:800;font-size:13px;cursor:pointer;}
          .pay-custom-list{display:flex;flex-wrap:wrap;gap:8px;}
          .pay-custom-chip{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 14px;border-radius:20px;background:var(--ink);color:#fff;font-size:12px;font-weight:600;}
          .pay-custom-chip button{width:18px;height:18px;border-radius:50%;border:none;background:rgba(255,255,255,.18);color:#fff;font-size:11px;cursor:pointer;line-height:1;}
        `}</style>

        {view === 'hub' && (
          <div>
            <div className="hub-head">
              <div className="hub-eyebrow">Cardápio de {company.name}</div>
              <div className="hub-sub">Configure como seus clientes recebem o link, quanto pagam de entrega e quais formas de pagamento você aceita.</div>
            </div>
            <div className="hub-grid">
              <div className="hub-card" onClick={() => setView('share')}>
                <div className="hub-card-top"><div className="hub-card-ico">📲</div><div className="hub-card-chev">›</div></div>
                <div className="hub-card-title">Compartilhar</div>
                <div className="hub-card-desc">Link, QR code, ou um link só de uma categoria ou produto.</div>
              </div>
              <div className="hub-card" onClick={() => setView('entrega')}>
                <div className="hub-card-top"><div className="hub-card-ico">🚚</div><div className="hub-card-chev">›</div></div>
                <div className="hub-card-title">Taxa de entrega</div>
                <div className="hub-card-desc">Por bairro ou por distância — você escolhe o método.</div>
                <span className="hub-card-status">{entregaStatus}</span>
              </div>
              <div className="hub-card" onClick={() => setView('pagamento')}>
                <div className="hub-card-top"><div className="hub-card-ico">💳</div><div className="hub-card-chev">›</div></div>
                <div className="hub-card-title">Formas de pagamento</div>
                <div className="hub-card-desc">Pix, cartão, dinheiro — e o que mais você aceitar.</div>
                <span className="hub-card-status">{paymentMethods.length} ativas</span>
              </div>
              <div className="hub-card ghost">
                <div className="hub-card-ico">✨</div>
                <div className="hub-card-title" style={{ color: 'var(--muted)' }}>Em breve</div>
                <div className="hub-card-desc">Novas formas de divulgar sua loja vão aparecer aqui.</div>
              </div>
            </div>
          </div>
        )}

        {view === 'share' && (
          <div>
            <div className="crm-panel-back-row"><button className="crm-back" onClick={() => setView('hub')}>‹</button><span className="crm-panel-title">Compartilhar</span></div>

            <div className="crm-share-card">
              <div className="crm-share-title">📲 Link do cardápio completo</div>
              <div className="crm-share-qr">{qrDataUrl && <img src={qrDataUrl} alt="QR Code do cardápio" />}</div>
              <div className="crm-share-link">{cardapioLink}</div>
              <button className="crm-share-btn" onClick={copyLink}>{copied ? 'Link copiado!' : 'Copiar link'}</button>
            </div>

            {categorias.length > 0 && (
              <div className="crm-config-card">
                <div className="crm-config-title">🗂️ Link de uma categoria</div>
                <div className="crm-config-sub">"Olha só os combos" — manda o cardápio já filtrado.</div>
                <select className="crm-select" value={selCat} onChange={e => setSelCat(e.target.value)}>
                  <option value="">Escolha uma categoria...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {selCat && <ShareCard title="🗂️ Categoria selecionada" link={`${cardapioLink}?cat=${selCat}`} />}
              </div>
            )}

            {produtosOpt.length > 0 && (
              <div className="crm-config-card">
                <div className="crm-config-title">🍽️ Link de um produto</div>
                <div className="crm-config-sub">"É esse aqui, {'{'}preço{'}'}" — o mais usado no dia a dia. Página própria, indexável no Google.</div>
                <select className="crm-select" value={selProd} onChange={e => setSelProd(e.target.value)}>
                  <option value="">Escolha um produto...</option>
                  {produtosOpt.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {selProd && <ShareCard title="🍽️ Produto selecionado" link={`https://trindadeonline.com.br/empresa/${company.slug}/item/${selProd}`} />}
              </div>
            )}
          </div>
        )}

        {view === 'entrega' && (
          <div className="entrega-wide">
            <div className="crm-panel-back-row"><button className="crm-back" onClick={() => setView('hub')}>‹</button><span className="crm-panel-title">Taxa de entrega</span></div>

            <div className="entrega-card">
              <div className="crm-config-title">🧾 Pedido mínimo e frete grátis</div>
              <div className="field-row">
                <div className="crm-config-field"><label>Pedido mínimo (R$)</label><input value={minimoInput} onChange={e => setMinimoInput(e.target.value)} /></div>
                <div className="crm-config-field"><label>Frete grátis a partir de (R$)</label><input value={freteGratisInput} onChange={e => setFreteGratisInput(e.target.value)} /></div>
              </div>
              <div className="crm-config-sub" style={{ margin: 0 }}>Pedido igual ou acima do valor de frete grátis não paga taxa — não importa o método escolhido abaixo. Deixe 0 se você não quiser oferecer frete grátis.</div>
            </div>

            <div className="crm-config-title" style={{ marginBottom: 10 }}>Como calcular a taxa de entrega?</div>
            <div className="crm-config-sub" style={{ marginTop: -6 }}>Navegue livre entre as duas telas pra configurar — nenhuma passa a valer até você clicar em "Ativar" dentro dela.</div>
            <div className="method-tabs">
              <div className={`method-tab ${viewingMethod === 'bairro' ? 'on' : ''}`} onClick={() => setViewingMethod('bairro')}>
                <div className="method-tab-top">
                  <div className="method-tab-title"><span className={`tab-dot ${metodoAtivo === 'bairro' ? 'on' : ''}`} />📍 Por bairro</div>
                </div>
                <div className="method-tab-desc">Um valor pra cada bairro de São Gonçalo. Mais preciso, dá mais trabalho de configurar.</div>
              </div>
              <div className={`method-tab ${viewingMethod === 'distancia' ? 'on' : ''}`} onClick={() => setViewingMethod('distancia')}>
                <div className="method-tab-top">
                  <div className="method-tab-title"><span className={`tab-dot ${metodoAtivo === 'distancia' ? 'on' : ''}`} />📏 Por distância (km)</div>
                </div>
                <div className="method-tab-desc">Faixas de km a partir da sua loja, com distância real calculada pela rua.</div>
              </div>
            </div>

            {activateError && <div className="activate-error">⚠️ {activateError}</div>}

            {viewingMethod === 'bairro' && (
              <>
                <div className="entrega-card">
                  <div className="method-card-head">
                    <div className="crm-config-title" style={{ margin: 0 }}>🚚 Taxa por bairro</div>
                    <button
                      className={`method-toggle-btn ${metodoAtivo === 'bairro' ? 'on' : ''}`}
                      disabled={activating === 'bairro'}
                      onClick={() => activateMethod('bairro')}
                    >
                      {metodoAtivo === 'bairro' ? '✓ Ativado' : activating === 'bairro' ? 'Ativando...' : 'Ativar este método'}
                    </button>
                  </div>
                  <div className="geo-strip">📍 São Gonçalo — RJ, 91 bairros oficiais.</div>
                  <div className="crm-config-sub" style={{ marginBottom: 10 }}>O cliente digita o CEP no carrinho, a gente descobre o bairro e aplica a taxa daqui. Marcou "sem entrega"? O cardápio avisa o cliente e não deixa fechar pedido pra lá.</div>

                  <div className="bairro-toolbar">
                    <input type="text" placeholder="🔎 Buscar bairro..." value={bairroSearch} onChange={e => setBairroSearch(e.target.value)} />
                    <div className="quickfill">
                      <input type="text" placeholder="R$ 8,00" value={quickfillVal} onChange={e => setQuickfillVal(e.target.value)} />
                      <button onClick={applyQuickfill}>⚡ Aplicar aos sem preço</button>
                    </div>
                  </div>
                  <div className="bairro-count"><b>{bairroConfiguredCount}</b> de <b>{BAIRROS_SAO_GONCALO.length}</b> bairros já configurados — o resto usa a taxa de "Fora de São Gonçalo" abaixo.</div>
                  <div className="bairro-grid">
                    {bairrosFiltrados.length === 0 && <div className="bairro-empty">Nenhum bairro encontrado pra "{bairroSearch}"</div>}
                    {bairrosFiltrados.map(b => (
                      <div key={b.name} className={`bairro-cell ${b.name === 'Trindade' ? 'self' : ''} ${b.disabled ? 'off' : ''}`}>
                        <div className="bairro-cell-name">{b.name}{b.name === 'Trindade' ? ' ⭐' : ''}</div>
                        <div className="bairro-cell-row">
                          {b.disabled
                            ? <span className="bairro-off-label">Sem entrega</span>
                            : <input type="text" placeholder="0,00" value={b.price} onChange={e => updateBairro(b.name, { price: e.target.value })} />}
                          <button className={`bairro-off-btn ${b.disabled ? 'on' : ''}`} onClick={() => toggleBairroOff(b.name)} title={b.disabled ? 'Reativar entrega' : 'Marcar sem entrega'}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="entrega-card fallback">
                  <div className="crm-config-title">🌐 Fora de São Gonçalo</div>
                  <div className="crm-config-sub">Fallback usado se o CEP do cliente cair fora da lista acima (outra cidade, ou CEP novo que ainda não mapeamos). Deixe em branco pra usar a taxa fixa antiga.</div>
                  <div className="crm-config-field" style={{ maxWidth: 180 }}><label>Taxa (R$)</label><input placeholder="0,00" value={foraAreaInput} onChange={e => setForaAreaInput(e.target.value)} /></div>
                </div>
              </>
            )}

            {viewingMethod === 'distancia' && (
              <div className="entrega-card">
                <div className="method-card-head">
                  <div className="crm-config-title" style={{ margin: 0 }}>📏 Taxa por distância</div>
                  <button
                    className={`method-toggle-btn ${metodoAtivo === 'distancia' ? 'on' : ''}`}
                    disabled={activating === 'distancia'}
                    onClick={() => activateMethod('distancia')}
                  >
                    {metodoAtivo === 'distancia' ? '✓ Ativado' : activating === 'distancia' ? 'Localizando sua loja...' : 'Ativar este método'}
                  </button>
                </div>
                <div className="crm-config-sub">A distância é calculada pela rua (não linha reta), a partir do endereço cadastrado da sua loja até o endereço de entrega. Cada faixa vale até o km indicado.</div>
                <div className="km-rows">
                  {kmTiers.map((t, i) => (
                    <div className="km-row" key={i}>
                      <div className="km-row-label">
                        {i === 0 ? 'Até' : <>De <input className="km-num" value={kmTiers[i - 1].kmUntil} disabled /> até</>}
                        <input className="km-num" value={t.kmUntil} onChange={e => updateKmTier(i, { kmUntil: e.target.value })} /> km
                      </div>
                      <input className="km-price" placeholder="0,00" value={t.price} onChange={e => updateKmTier(i, { price: e.target.value })} />
                      <button className="km-remove-btn" onClick={() => removeKmRow(i)} title="Remover faixa">×</button>
                    </div>
                  ))}
                  <div className="km-row last">
                    <div className="km-row-label">Acima de <input className="km-num" value={kmTiers[kmTiers.length - 1]?.kmUntil || '0'} disabled /> km</div>
                    {kmLastBlocked
                      ? <span className="km-off-label">Não entrego</span>
                      : <input className="km-price" placeholder="0,00" value={kmLastPrice} onChange={e => setKmLastPrice(e.target.value)} />}
                    <button className={`bairro-off-btn ${kmLastBlocked ? 'on' : ''}`} onClick={() => setKmLastBlocked(v => !v)} title={kmLastBlocked ? 'Permitir cobrando taxa' : 'Marcar como não entrego'}>✕</button>
                  </div>
                </div>
                <button className="km-add-btn" onClick={addKmRow}>+ Adicionar faixa</button>
              </div>
            )}

            <button className="crm-config-btn" disabled={savingEntrega} onClick={saveEntrega}>{entregaSaved ? 'Salvo!' : savingEntrega ? 'Salvando...' : 'Salvar entrega'}</button>
          </div>
        )}

        {view === 'pagamento' && (
          <div>
            <div className="crm-panel-back-row"><button className="crm-back" onClick={() => setView('hub')}>‹</button><span className="crm-panel-title">Formas de pagamento</span></div>

            <div className="crm-config-card" style={{ maxWidth: 420 }}>
              <div className="crm-config-title">💳 O que você aceita</div>
              <div className="crm-config-sub">Só aparece pro cliente escolher no cardápio o que estiver marcado aqui.</div>
              <div className="pay-grid">
                {PAYMENT_PRESETS.map(p => (
                  <div key={p.key} className={`pay-chip ${paymentMethods.includes(p.key) ? 'on' : ''}`} onClick={() => togglePreset(p.key)}>
                    <span className="dot">{paymentMethods.includes(p.key) ? '✓' : ''}</span>{p.label}
                  </div>
                ))}
              </div>

              <div className="crm-config-title" style={{ marginTop: 4 }}>✏️ Forma personalizada</div>
              <div className="crm-config-sub">Não achou a sua na lista? Escreve aqui do seu jeito.</div>
              <div className="pay-custom-row">
                <input placeholder="Ex: Depósito, boleto, fiado do bairro..." value={customInput} onChange={e => setCustomInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomPayment()} />
                <button className="pay-add-btn" onClick={addCustomPayment}>+ Adicionar</button>
              </div>
              {customEntries.length > 0 && (
                <div className="pay-custom-list">
                  {customEntries.map(v => (
                    <div key={v} className="pay-custom-chip">{v}<button onClick={() => removeCustomPayment(v)}>×</button></div>
                  ))}
                </div>
              )}
              {paymentMethods.length === 0 && <div style={{ fontSize: 11, color: '#C43D3D', margin: '10px 0 0' }}>Marque pelo menos uma forma de pagamento.</div>}
              <button className="crm-config-btn" disabled={savingPayment || paymentMethods.length === 0} onClick={savePaymentMethods}>{paymentSaved ? 'Salvo!' : savingPayment ? 'Salvando...' : 'Salvar formas de pagamento'}</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh', padding: 24, fontFamily: 'Archivo,sans-serif', background: 'var(--concrete)', textAlign: 'center'
}
const btn: React.CSSProperties = {
  background: 'var(--sign)', color: 'var(--ink)', padding: '11px 24px', borderRadius: 10,
  textDecoration: 'none', fontWeight: 700, fontSize: 13
}
