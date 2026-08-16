'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/compressImage'
import CrmShell from '@/components/CrmShell'

type Categoria = { id: string; name: string; display_order: number }
type Opcao = { id?: string; name: string; price: number; max_qty: number | null; linked_produto_id: string | null }
type Grupo = { id?: string; name: string; required: boolean; min_select: number; max_select: number; pricing_rule: 'soma' | 'maior_valor'; options: Opcao[] }
type Produto = {
  id: string; name: string; description: string | null; photo_url: string | null
  category_id: string | null; cost_price: number; sale_price: number
  track_stock: boolean; stock_qty: number | null; stock_alert_qty: number | null
  available_days: number[] | null
  promo_type: 'percent' | 'fixed' | null; promo_value: number | null
  promo_starts_at: string | null; promo_ends_at: string | null
  active: boolean; esgotado: boolean; display_order: number
  category?: { name: string } | null
}

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const emptyForm = () => ({
  id: '' as string,
  name: '', description: '', photo_url: '' as string | null,
  category_id: '', cost_price: '0', sale_price: '0',
  track_stock: false, stock_qty: '', stock_alert_qty: '',
  restrictDays: false, days: [] as number[],
  hasPromo: false, promo_type: 'percent' as 'percent' | 'fixed', promo_value: '15',
  promo_starts_at: '', promo_ends_at: '',
  active: true,
  groups: [] as Grupo[],
})

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function margin(cost: number, price: number) { return price > 0 ? Math.round(((price - cost) / price) * 100) : 0 }
function parsePt(v: string) { return parseFloat((v || '0').replace(',', '.')) || 0 }

export default function CatalogoPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [view, setView] = useState<'list' | 'form'>('list')
  const [filterCat, setFilterCat] = useState('all')
  const [form, setForm] = useState(emptyForm())
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [savingProd, setSavingProd] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm/catalogo'; return }
      const { data: comp } = await supabase.from('companies').select('id, name, loja_digital_enabled').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !comp.loja_digital_enabled) { window.location.href = '/painel/crm'; return }
      setCompanyId(comp.id)
      setCompanyName(comp.name)
      await loadAll(comp.id)
      setLoading(false)
    })
  }, [])

  async function loadAll(cid: string) {
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from('loja_categorias').select('*').eq('company_id', cid).order('display_order'),
      supabase.from('loja_produtos').select('*, category:loja_categorias(name)').eq('company_id', cid).order('display_order'),
    ])
    setCategorias(cats || [])
    setProdutos((prods || []) as any)
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function addCategoria() {
    if (!newCatName.trim()) return
    const { data } = await supabase.from('loja_categorias').insert({ company_id: companyId, name: newCatName.trim(), display_order: categorias.length }).select().single()
    if (data) { setCategorias(prev => [...prev, data]); setForm(f => ({ ...f, category_id: data.id })) }
    setNewCatName(''); setShowNewCat(false)
  }

  function openNew() { setForm(emptyForm()); setPhotoFile(null); setView('form') }

  async function openEdit(id: string) {
    const { data } = await supabase
      .from('loja_produtos')
      .select('*, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))')
      .eq('id', id).single()
    if (!data) return
    setForm({
      id: data.id, name: data.name, description: data.description || '', photo_url: data.photo_url,
      category_id: data.category_id || '', cost_price: Number(data.cost_price).toFixed(2).replace('.', ','),
      sale_price: Number(data.sale_price).toFixed(2).replace('.', ','),
      track_stock: data.track_stock, stock_qty: data.stock_qty ?? '', stock_alert_qty: data.stock_alert_qty ?? '',
      restrictDays: !!(data.available_days && data.available_days.length), days: data.available_days || [],
      hasPromo: !!data.promo_type, promo_type: data.promo_type || 'percent', promo_value: data.promo_value ?? '15',
      promo_starts_at: data.promo_starts_at ? data.promo_starts_at.slice(0, 10) : '',
      promo_ends_at: data.promo_ends_at ? data.promo_ends_at.slice(0, 10) : '',
      active: data.active,
      groups: (data.groups || []).map((g: any) => ({
        id: g.id, name: g.name, required: g.required, min_select: g.min_select, max_select: g.max_select, pricing_rule: g.pricing_rule || 'soma',
        options: (g.options || []).map((o: any) => ({ id: o.id, name: o.name, price: o.price, max_qty: o.max_qty, linked_produto_id: o.linked_produto_id })),
      })),
    })
    setPhotoFile(null)
    setView('form')
  }

  function addGroup() { setForm(f => ({ ...f, groups: [...f.groups, { name: 'Novo grupo', required: false, min_select: 0, max_select: 1, pricing_rule: 'soma', options: [] }] })) }
  function removeGroup(gi: number) { setForm(f => ({ ...f, groups: f.groups.filter((_, i) => i !== gi) })) }
  function updateGroup(gi: number, patch: Partial<Grupo>) { setForm(f => ({ ...f, groups: f.groups.map((g, i) => i === gi ? { ...g, ...patch } : g) })) }
  function addOption(gi: number) { updateGroup(gi, { options: [...form.groups[gi].options, { name: 'Nova opção', price: 0, max_qty: 1, linked_produto_id: null }] }) }
  function removeOption(gi: number, oi: number) { updateGroup(gi, { options: form.groups[gi].options.filter((_, i) => i !== oi) }) }
  function updateOption(gi: number, oi: number, patch: Partial<Opcao>) {
    updateGroup(gi, { options: form.groups[gi].options.map((o, i) => i === oi ? { ...o, ...patch } : o) })
  }
  function toggleDay(d: number) { setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] })) }

  async function saveProduto() {
    if (!form.name.trim()) { showToast('Dá um nome pro produto'); return }
    setSavingProd(true)
    let photoUrl = form.photo_url
    if (photoFile) {
      const ext = photoFile.name.split('.').pop()
      const path = `${companyId}/${Date.now()}.${ext}`
      const compressed = await compressImage(photoFile)
      const { data: up, error: upErr } = await supabase.storage.from('loja-produtos').upload(path, compressed, { upsert: true })
      if (upErr) { showToast('Não deu pra trocar a foto: ' + upErr.message); setSavingProd(false); return }
      if (up) photoUrl = supabase.storage.from('loja-produtos').getPublicUrl(path).data.publicUrl
    }
    const payload = {
      company_id: companyId,
      category_id: form.category_id || null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      photo_url: photoUrl,
      cost_price: parsePt(form.cost_price),
      sale_price: parsePt(form.sale_price),
      track_stock: form.track_stock,
      stock_qty: form.track_stock ? (parseInt(String(form.stock_qty)) || 0) : null,
      stock_alert_qty: form.track_stock ? (parseInt(String(form.stock_alert_qty)) || null) : null,
      available_days: form.restrictDays && form.days.length ? form.days : null,
      promo_type: form.hasPromo ? form.promo_type : null,
      promo_value: form.hasPromo ? parsePt(String(form.promo_value)) : null,
      promo_starts_at: form.hasPromo && form.promo_starts_at ? form.promo_starts_at : null,
      promo_ends_at: form.hasPromo && form.promo_ends_at ? form.promo_ends_at : null,
      active: form.active,
      updated_at: new Date().toISOString(),
    }

    let produtoId = form.id
    if (produtoId) {
      await supabase.from('loja_produtos').update(payload).eq('id', produtoId)
      await supabase.from('loja_opcoes_grupo').delete().eq('produto_id', produtoId)
    } else {
      const { data } = await supabase.from('loja_produtos').insert(payload).select('id').single()
      produtoId = data?.id
    }

    for (let gi = 0; gi < form.groups.length; gi++) {
      const g = form.groups[gi]
      const { data: gData } = await supabase.from('loja_opcoes_grupo').insert({
        produto_id: produtoId, name: g.name, required: g.required, min_select: g.min_select, max_select: g.max_select, pricing_rule: g.pricing_rule, display_order: gi,
      }).select('id').single()
      if (!gData) continue
      const optRows = g.options.map((o, oi) => ({
        grupo_id: gData.id, name: o.name, price: o.price, max_qty: o.max_qty || null, linked_produto_id: o.linked_produto_id || null, display_order: oi,
      }))
      if (optRows.length) await supabase.from('loja_opcoes').insert(optRows)
    }

    await loadAll(companyId)
    setSavingProd(false)
    setView('list')
    showToast('Produto salvo!')
  }

  async function toggleActive(p: Produto) {
    await supabase.from('loja_produtos').update({ active: !p.active }).eq('id', p.id)
    setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, active: !p.active } : x))
  }

  async function toggleEsgotado(p: Produto) {
    await supabase.from('loja_produtos').update({ esgotado: !p.esgotado }).eq('id', p.id)
    setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, esgotado: !p.esgotado } : x))
  }

  async function deleteProduto(id: string) {
    if (!confirm('Excluir esse produto? Não dá pra desfazer.')) return
    await supabase.from('loja_produtos').delete().eq('id', id)
    setProdutos(prev => prev.filter(x => x.id !== id))
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#AAA' }}>Carregando...</div>

  const filtered = produtos.filter(p => filterCat === 'all' || p.category_id === filterCat)
  const pctFoto = produtos.length ? Math.round(produtos.filter(p => p.photo_url).length / produtos.length * 100) : 0
  const pctDesc = produtos.length ? Math.round(produtos.filter(p => p.description && p.description.trim()).length / produtos.length * 100) : 0
  const pctPromo = produtos.length ? Math.round(produtos.filter(p => p.promo_type).length / produtos.length * 100) : 0
  const qualidade = produtos.length ? Math.round((pctFoto + pctDesc + pctPromo) / 3) : 0

  return (
    <CrmShell active="catalogo" companyName={companyName}>
    <div className="cg-wrap">
      <style>{`
        .cg-wrap{ max-width:480px; margin:0 auto; min-height:100vh; background:#F7F5F0; font-family:'Inter',sans-serif; font-size:13px; color:#1A1610; padding-bottom:40px; min-width:0; overflow-x:hidden; }
        @media(min-width:768px){
          .cg-wrap{ max-width:none; margin:0; min-height:0; padding-bottom:60px; }
          .cg-head{ padding:28px 32px 16px; position:static; }
          .cg-body{ padding:0 32px; }
          .cg-list-view .cg-body{ display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:14px; align-content:start; }
          .cg-list-view .cg-filters{ grid-column:1/-1; }
          .cg-list-view .cg-quality{ grid-column:1/-1; }
          .cg-list-view .cg-empty-msg{ grid-column:1/-1; }
          .cg-row{ flex-direction:column; align-items:stretch; gap:0; border:1px solid #E6E0D2; border-radius:14px; padding:0; overflow:hidden; background:#fff; }
          .cg-row .cg-photo{ width:100%; height:130px; border-radius:0; font-size:34px; }
          .cg-row .cg-mid{ padding:12px 14px 4px; }
          .cg-row-actions{ padding:0 14px 12px; }
          .cg-fab{ right:32px; }
          .cg-form-view .cg-body{ max-width:640px; margin:0 auto; padding:0 32px; }
        }
        .cg-head{ padding:22px 16px 14px; display:flex; align-items:center; gap:10px; background:#F7F5F0; position:sticky; top:0; z-index:5; }
        .cg-head h1{ font-size:18px; margin:0; flex:1; font-weight:800; }
        .cg-back{ width:32px;height:32px;border-radius:50%;border:1px solid #E6E0D2;background:#fff;font-size:15px;cursor:pointer; }
        .cg-body{ padding:0 16px; }
        .cg-btn{ padding:10px 18px;border-radius:10px;border:none;font-weight:800;font-size:13px;cursor:pointer; }
        .cg-btn-gold{ background:#C9951A;color:#1A1610; }
        .cg-btn-ghost{ background:#fff;border:1px solid #E6E0D2;color:#1A1610; }
        .cg-fab{ position:fixed; right:calc(50% - 240px + 16px); bottom:24px; width:50px;height:50px;border-radius:50%;background:#C9951A;color:#1A1610;border:none;font-size:24px;font-weight:800;box-shadow:0 8px 18px -6px rgba(0,0,0,.35);cursor:pointer; }
        @media(max-width:520px){ .cg-fab{ right:16px; } }
        .cg-quality{ display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #E6E0D2;border-radius:14px;padding:14px;margin-bottom:14px; }
        .cg-quality-num{ font-family:'Bebas Neue',sans-serif;font-size:30px;color:#C9951A;letter-spacing:1px;line-height:1;flex:none; }
        .cg-quality-mid{ flex:1;min-width:0; }
        .cg-quality-title{ font-size:12px;font-weight:800;margin-bottom:6px; }
        .cg-quality-bar{ height:6px;background:#F0EDE8;border-radius:3px;overflow:hidden;margin-bottom:6px; }
        .cg-quality-fill{ height:100%;background:#C9951A;border-radius:3px; }
        .cg-quality-sub{ font-size:10.5px;color:#A79E8B; }
        .cg-filters{ display:flex; gap:6px; overflow-x:auto; padding-bottom:10px; }
        .cg-chip{ flex:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:20px;border:1px solid #E6E0D2;background:#fff;color:#6E6656;cursor:pointer; }
        .cg-chip.active{ background:#1A1610;color:#C9951A;border-color:#1A1610; }
        .cg-row{ display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #E6E0D2;cursor:pointer; }
        .cg-photo{ width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#FBF1DC,#FCFAF5);display:flex;align-items:center;justify-content:center;font-size:20px;flex:none;overflow:hidden; }
        .cg-photo img{ width:100%;height:100%;object-fit:cover; }
        .cg-mid{ flex:1;min-width:0; }
        .cg-row-actions{ display:flex;gap:6px;flex:none; }
        .cg-btn-danger{ background:#FBEAEA;border-color:#F3C6C6; }
        .cg-name{ font-weight:700;font-size:12.5px; }
        .cg-cat{ font-size:10.5px;color:#A79E8B; }
        .cg-price{ font-size:12px;font-weight:800;margin-top:2px; }
        .cg-badge{ font-size:9px;font-weight:800;padding:2px 6px;border-radius:6px;margin-left:6px; }
        .cg-badge.on{ background:#E4F3EC;color:#157A52; }
        .cg-badge.off{ background:#FCFAF5;color:#A79E8B;border:1px solid #E6E0D2; }
        .cg-field{ margin-bottom:12px; }
        .cg-field label{ display:block;font-size:10.5px;font-weight:700;color:#6E6656;margin-bottom:5px; }
        .cg-field input, .cg-field select, .cg-field textarea{ width:100%;padding:9px 11px;border-radius:9px;border:1px solid #E6E0D2;background:#fff;font-size:12.5px;font-family:inherit;color:#1A1610; }
        .cg-row2{ display:grid;grid-template-columns:1fr 1fr;gap:10px; }
        .cg-margin{ font-size:11px;font-weight:700;color:#157A52;margin:-6px 0 12px; }
        .cg-swrow{ display:flex;align-items:center;gap:10px;padding:8px 0; }
        .cg-switch{ width:36px;height:20px;border-radius:11px;background:#E6E0D2;position:relative;cursor:pointer;flex:none; }
        .cg-switch.on{ background:#157A52; }
        .cg-switch .k{ position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s; }
        .cg-switch.on .k{ left:18px; }
        .cg-daychip{ width:32px;height:32px;border-radius:9px;border:1px solid #E6E0D2;background:#fff;color:#6E6656;font-size:10.5px;font-weight:800;cursor:pointer;margin-right:6px; }
        .cg-daychip.active{ background:#C9951A;color:#1A1610;border-color:#C9951A; }
        .cg-subbox{ display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;padding:10px;background:#FCFAF5;border:1px dashed #E6E0D2;border-radius:10px; }
        .cg-group{ border:1px solid #E6E0D2;border-radius:12px;padding:12px;margin-bottom:10px;background:#fff; }
        .cg-group-top{ display:flex;align-items:center;gap:8px;margin-bottom:8px; }
        .cg-group-top input{ flex:1;padding:7px 10px;border-radius:8px;border:1px solid #E6E0D2;font-size:12px;font-family:inherit; }
        .cg-del{ width:26px;height:26px;border-radius:7px;border:none;background:#FBEAEA;color:#C43D3D;cursor:pointer;flex:none; }
        .cg-rule{ display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;font-size:11px;color:#6E6656; }
        .cg-rule input{ width:38px;padding:5px;text-align:center;border-radius:6px;border:1px solid #E6E0D2;font-family:inherit; }
        .cg-opt{ display:flex;gap:6px;align-items:center;margin-bottom:6px; }
        .cg-opt input{ padding:6px 8px;border-radius:7px;border:1px solid #E6E0D2;font-size:11.5px;font-family:inherit; }
        .cg-opt .on{ flex:1;min-width:0; }
        .cg-opt .op{ width:56px;text-align:right; }
        .cg-opt .oq{ width:34px;text-align:center; }
        .cg-opt select{ flex:1; padding:6px; border-radius:7px; border:1px solid #E6E0D2; font-size:11px; }
        .cg-add-inline{ font-size:11px;font-weight:700;color:#8A6410;background:#FBF1DC;border:1px dashed #E6E0D2;border-radius:8px;padding:7px;width:100%;cursor:pointer;margin-top:4px; }
        .cg-add-group{ width:100%;padding:10px;border-radius:10px;border:1.5px dashed #E6E0D2;background:transparent;color:#A79E8B;font-weight:700;font-size:12px;cursor:pointer; }
        .cg-savebar{ position:sticky;bottom:0;padding:12px 0 6px;background:#F7F5F0;display:flex;gap:8px; }
        .cg-savebar .cg-btn{ flex:1; }
        .cg-toast{ position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1A1610;color:#C9951A;padding:11px 18px;border-radius:10px;font-size:12.5px;font-weight:700;z-index:99; }
        .cg-photo-input{ display:flex;align-items:center;gap:12px;margin-bottom:14px; }
        .cg-photo-big{ width:64px;height:64px;border-radius:12px;background:linear-gradient(135deg,#FBF1DC,#FCFAF5);display:flex;align-items:center;justify-content:center;font-size:26px;overflow:hidden;flex:none; }
        .cg-photo-big img{ width:100%;height:100%;object-fit:cover; }
      `}</style>

      {view === 'list' && (
        <div className="cg-list-view">
          <div className="cg-head">
            <a href="/painel/crm" className="cg-back" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#1A1610' }}>‹</a>
            <h1>Catálogo</h1>
          </div>
          <div className="cg-body">
            {produtos.length > 0 && (
              <div className="cg-quality">
                <div className="cg-quality-num">{qualidade}%</div>
                <div className="cg-quality-mid">
                  <div className="cg-quality-title">Qualidade do cardápio</div>
                  <div className="cg-quality-bar"><div className="cg-quality-fill" style={{ width: `${qualidade}%` }} /></div>
                  <div className="cg-quality-sub">{pctFoto}% com foto · {pctDesc}% com descrição · {pctPromo}% em promoção</div>
                </div>
              </div>
            )}
            <div className="cg-filters">
              <button className={`cg-chip ${filterCat === 'all' ? 'active' : ''}`} onClick={() => setFilterCat('all')}>Tudo</button>
              {categorias.map(c => (
                <button key={c.id} className={`cg-chip ${filterCat === c.id ? 'active' : ''}`} onClick={() => setFilterCat(c.id)}>{c.name}</button>
              ))}
            </div>
            {filtered.length === 0 && <div className="cg-empty-msg" style={{ textAlign: 'center', color: '#A79E8B', padding: '40px 0', fontSize: 12.5 }}>Nenhum produto ainda. Toca no + pra criar o primeiro.</div>}
            {filtered.map(p => (
              <div key={p.id} className="cg-row" onClick={() => openEdit(p.id)}>
                <div className="cg-photo">{p.photo_url ? <img src={p.photo_url} alt="" /> : '🍽️'}</div>
                <div className="cg-mid">
                  <div className="cg-name">{p.name}</div>
                  <div className="cg-cat">{p.category?.name || 'Sem categoria'}{p.promo_type ? ' · promoção' : ''}{p.available_days ? ' · dias limitados' : ''}</div>
                  <div className="cg-price">
                    {fmt(Number(p.sale_price))}
                    <span className={`cg-badge ${p.active ? 'on' : 'off'}`}>{p.active ? `${margin(Number(p.cost_price), Number(p.sale_price))}% margem` : 'pausado'}</span>
                    {p.esgotado && <span className="cg-badge off" style={{ background: '#FBEAEA', color: '#C43D3D' }}>esgotado hoje</span>}
                  </div>
                </div>
                <div className="cg-row-actions">
                  <button className={`cg-btn-ghost ${p.esgotado ? 'cg-btn-danger' : ''}`} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 11 }} title="Esgotar hoje" onClick={e => { e.stopPropagation(); toggleEsgotado(p) }}>{p.esgotado ? '🚫' : '🈹'}</button>
                  <button className="cg-btn-ghost" style={{ padding: '6px 10px', borderRadius: 8, fontSize: 11 }} onClick={e => { e.stopPropagation(); toggleActive(p) }}>{p.active ? '⏸' : '▶'}</button>
                  <button className="cg-del" onClick={e => { e.stopPropagation(); deleteProduto(p.id) }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
          <button className="cg-fab" onClick={openNew}>+</button>
        </div>
      )}

      {view === 'form' && (
        <div className="cg-form-view">
          <div className="cg-head">
            <button className="cg-back" onClick={() => setView('list')}>‹</button>
            <h1>{form.id ? 'Editar produto' : 'Novo produto'}</h1>
          </div>
          <div className="cg-body">
            <div className="cg-photo-input">
              <div className="cg-photo-big">
                {photoFile ? <img src={URL.createObjectURL(photoFile)} alt="" /> : form.photo_url ? <img src={form.photo_url} alt="" /> : '🍽️'}
              </div>
              <label className="cg-btn cg-btn-ghost" style={{ cursor: 'pointer' }}>
                Trocar foto
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="cg-field"><label>Nome do produto</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>

            <div className="cg-field">
              <label>Categoria</label>
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">Sem categoria</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!showNewCat
                ? <button className="cg-add-inline" style={{ marginTop: 8 }} onClick={() => setShowNewCat(true)}>+ Nova categoria</button>
                : <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input placeholder="Nome da categoria" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                    <button className="cg-btn cg-btn-gold" style={{ padding: '9px 14px' }} onClick={addCategoria}>OK</button>
                  </div>}
            </div>

            <div className="cg-field"><label>Descrição</label><textarea style={{ minHeight: 56 }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>

            <div className="cg-row2">
              <div className="cg-field"><label>Preço de custo</label><input value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} /></div>
              <div className="cg-field"><label>Preço de venda</label><input value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} /></div>
            </div>
            <div className="cg-margin">{margin(parsePt(form.cost_price), parsePt(form.sale_price))}% de margem</div>

            <div className="cg-swrow"><div className={`cg-switch ${form.restrictDays ? 'on' : ''}`} onClick={() => setForm(f => ({ ...f, restrictDays: !f.restrictDays }))}><div className="k" /></div><span>Disponibilidade limitada por dia</span></div>
            {form.restrictDays && <div style={{ marginBottom: 12 }}>{DAY_LABELS.map((d, i) => <button key={i} type="button" className={`cg-daychip ${form.days.includes(i) ? 'active' : ''}`} onClick={() => toggleDay(i)}>{d}</button>)}</div>}

            <div className="cg-swrow"><div className={`cg-switch ${form.hasPromo ? 'on' : ''}`} onClick={() => setForm(f => ({ ...f, hasPromo: !f.hasPromo }))}><div className="k" /></div><span>Ativar promoção</span></div>
            {form.hasPromo && (
              <div className="cg-subbox">
                <div className="cg-field"><label>Tipo</label><select value={form.promo_type} onChange={e => setForm(f => ({ ...f, promo_type: e.target.value as any }))}><option value="percent">Percentual</option><option value="fixed">Valor fixo</option></select></div>
                <div className="cg-field"><label>Valor</label><input value={String(form.promo_value)} onChange={e => setForm(f => ({ ...f, promo_value: e.target.value as any }))} /></div>
                <div className="cg-field"><label>Início</label><input type="date" value={form.promo_starts_at} onChange={e => setForm(f => ({ ...f, promo_starts_at: e.target.value }))} /></div>
                <div className="cg-field"><label>Fim</label><input type="date" value={form.promo_ends_at} onChange={e => setForm(f => ({ ...f, promo_ends_at: e.target.value }))} /></div>
              </div>
            )}

            <div className="cg-swrow"><div className={`cg-switch ${form.track_stock ? 'on' : ''}`} onClick={() => setForm(f => ({ ...f, track_stock: !f.track_stock }))}><div className="k" /></div><span>Controlar estoque</span></div>
            {form.track_stock && (
              <div className="cg-subbox">
                <div className="cg-field"><label>Quantidade</label><input value={String(form.stock_qty)} onChange={e => setForm(f => ({ ...f, stock_qty: e.target.value as any }))} /></div>
                <div className="cg-field"><label>Avisar quando restar</label><input value={String(form.stock_alert_qty)} onChange={e => setForm(f => ({ ...f, stock_alert_qty: e.target.value as any }))} /></div>
              </div>
            )}

            <div className="cg-swrow"><div className={`cg-switch ${form.active ? 'on' : ''}`} onClick={() => setForm(f => ({ ...f, active: !f.active }))}><div className="k" /></div><span>Ativo no cardápio</span></div>

            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#A79E8B', margin: '16px 2px 8px' }}>Grupos de opção / combo</div>
            {form.groups.map((g, gi) => (
              <div className="cg-group" key={gi}>
                <div className="cg-group-top">
                  <input value={g.name} onChange={e => updateGroup(gi, { name: e.target.value })} />
                  <button className="cg-del" onClick={() => removeGroup(gi)}>🗑</button>
                </div>
                <div className="cg-rule">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={g.required} onChange={e => updateGroup(gi, { required: e.target.checked })} /> Obrigatório</label>
                  <div>mín <input value={g.min_select} onChange={e => updateGroup(gi, { min_select: +e.target.value || 0 })} /></div>
                  <div>máx <input value={g.max_select} onChange={e => updateGroup(gi, { max_select: +e.target.value || 1 })} /></div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    cobrar:
                    <select value={g.pricing_rule} onChange={e => updateGroup(gi, { pricing_rule: e.target.value as any })} style={{ padding: '5px 6px', borderRadius: 6, border: '1px solid #E6E0D2', fontFamily: 'inherit', fontSize: 11 }}>
                      <option value="soma">soma dos itens</option>
                      <option value="maior_valor">o mais caro (ex: pizza meio a meio)</option>
                    </select>
                  </label>
                </div>
                {g.options.map((o, oi) => (
                  <div className="cg-opt" key={oi}>
                    <input className="on" value={o.name} onChange={e => updateOption(gi, oi, { name: e.target.value })} />
                    <input className="op" value={o.price} onChange={e => updateOption(gi, oi, { price: +e.target.value || 0 })} />
                    <input className="oq" placeholder="máx" value={o.max_qty ?? ''} onChange={e => updateOption(gi, oi, { max_qty: +e.target.value || null })} />
                    <select value={o.linked_produto_id || ''} onChange={e => updateOption(gi, oi, { linked_produto_id: e.target.value || null })}>
                      <option value="">avulso</option>
                      {produtos.filter(p => p.id !== form.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button className="cg-del" style={{ width: 22, height: 22 }} onClick={() => removeOption(gi, oi)}>✕</button>
                  </div>
                ))}
                <button className="cg-add-inline" onClick={() => addOption(gi)}>+ Adicionar opção</button>
              </div>
            ))}
            <button className="cg-add-group" onClick={addGroup}>+ Adicionar grupo de opção</button>

            <div className="cg-savebar">
              <button className="cg-btn cg-btn-gold" disabled={savingProd} onClick={saveProduto}>{savingProd ? 'Salvando...' : 'Salvar produto'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="cg-toast">{toast}</div>}
    </div>
    </CrmShell>
  )
}
