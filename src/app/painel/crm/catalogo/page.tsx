'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/compressImage'
import CrmShell from '@/components/CrmShell'

type Categoria = { id: string; name: string; display_order: number }
type Opcao = { id?: string; name: string; price: string; max_qty: number | null; linked_produto_id: string | null; photo_url?: string | null; _photoFile?: File | null }
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

// Parser de CSV simples que respeita campos entre aspas (com vírgula/quebra
// de linha dentro) — não dependemos de biblioteca externa só pra isso.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f.trim() !== '')) rows.push(row) }
  return rows
}

// Coluna "grupos" do CSV: um ou mais grupos separados por " && ", campos de
// cada grupo separados por " | " (nome | obrigatorio/opcional | min | max |
// soma/maior_valor | opções), opções separadas por " ; " no formato Nome=Preço.
function parseGroupsField(raw: string) {
  if (!raw || !raw.trim()) return [] as { name: string; required: boolean; min_select: number; max_select: number; pricing_rule: 'soma' | 'maior_valor'; options: { name: string; price: number }[] }[]
  return raw.split('&&').map(chunk => {
    const parts = chunk.split('|').map(s => s.trim())
    const [name, reqStr, minStr, maxStr, ruleStr, optsStr] = parts
    const options = (optsStr || '').split(';').map(o => o.trim()).filter(Boolean).map(o => {
      const eq = o.lastIndexOf('=')
      return eq === -1 ? { name: o.trim(), price: 0 } : { name: o.slice(0, eq).trim(), price: parsePt(o.slice(eq + 1)) }
    })
    return {
      name: (name || 'Grupo').trim(),
      required: (reqStr || '').toLowerCase().trim().startsWith('obrig'),
      min_select: parseInt(minStr) || 0,
      max_select: parseInt(maxStr) || 1,
      pricing_rule: (ruleStr || '').toLowerCase().includes('maior') ? 'maior_valor' as const : 'soma' as const,
      options,
    }
  }).filter(g => g.options.length > 0)
}

export default function CatalogoPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [view, setView] = useState<'list' | 'form' | 'bulk'>('list')
  const [filterCat, setFilterCat] = useState('all')
  const [form, setForm] = useState(emptyForm())
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [savingProd, setSavingProd] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [toast, setToast] = useState('')
  const [showCatManager, setShowCatManager] = useState(false)
  const [mgrNewCatName, setMgrNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState('')
  const [editCatName, setEditCatName] = useState('')
  const [bulkRows, setBulkRows] = useState(() => Array.from({ length: 5 }, () => ({ name: '', category_id: '', cost_price: '', sale_price: '' })))
  const [savingBulk, setSavingBulk] = useState(false)
  const [showDupGroup, setShowDupGroup] = useState(false)
  const [dupSourceId, setDupSourceId] = useState('')
  const [dupGroups, setDupGroups] = useState<Grupo[]>([])
  const [dupLoading, setDupLoading] = useState(false)
  const [showImportCsv, setShowImportCsv] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importPaused, setImportPaused] = useState(false)
  const importPausedRef = useRef(false)
  const importCancelledRef = useRef(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })
  const [importResults, setImportResults] = useState<{ ok: number; errors: string[]; photoWarnings: string[]; cancelled: boolean } | null>(null)
  const [lastImportBatch, setLastImportBatch] = useState<{ id: string; count: number } | null>(null)
  const [deletingLastImport, setDeletingLastImport] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm/catalogo'; return }
      const { data: comp } = await supabase.from('companies').select('id, name, loja_digital_enabled').eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp || !comp.loja_digital_enabled) { window.location.href = '/painel/crm'; return }
      setCompanyId(comp.id)
      setCompanyName(comp.name)
      await loadAll(comp.id)
      await loadLastImportBatch(comp.id)
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

  // Guardado no banco (não só em memória) pra o botão "excluir última
  // importação" continuar disponível mesmo depois de recarregar a página,
  // fechar e voltar — o Ricardo só decide excluir depois de abrir vários
  // produtos e conferir se tá tudo certo, não na hora.
  async function loadLastImportBatch(cid: string) {
    const { data } = await supabase.from('loja_produtos').select('import_batch_id, created_at').eq('company_id', cid).not('import_batch_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!data?.import_batch_id) { setLastImportBatch(null); return }
    const { count } = await supabase.from('loja_produtos').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('import_batch_id', data.import_batch_id)
    setLastImportBatch({ id: data.import_batch_id, count: count || 0 })
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function addCategoria() {
    if (!newCatName.trim()) return
    const { data } = await supabase.from('loja_categorias').insert({ company_id: companyId, name: newCatName.trim(), display_order: categorias.length }).select().single()
    if (data) { setCategorias(prev => [...prev, data]); setForm(f => ({ ...f, category_id: data.id })) }
    setNewCatName(''); setShowNewCat(false)
  }

  async function addCategoriaFromManager() {
    if (!mgrNewCatName.trim()) return
    const { data } = await supabase.from('loja_categorias').insert({ company_id: companyId, name: mgrNewCatName.trim(), display_order: categorias.length }).select().single()
    if (data) setCategorias(prev => [...prev, data])
    setMgrNewCatName('')
  }

  async function saveCategoriaName(id: string) {
    if (!editCatName.trim()) { setEditingCatId(''); return }
    const name = editCatName.trim()
    await supabase.from('loja_categorias').update({ name }).eq('id', id)
    setCategorias(prev => prev.map(c => c.id === id ? { ...c, name } : c))
    setProdutos(prev => prev.map(p => p.category_id === id ? { ...p, category: { name } } : p))
    setEditingCatId('')
  }

  async function deleteCategoria(id: string) {
    const emUso = produtos.filter(p => p.category_id === id).length
    const msg = emUso > 0
      ? `Essa categoria tem ${emUso} produto${emUso > 1 ? 's' : ''}. Eles ficam como "Sem categoria" — não são excluídos. Apagar a categoria mesmo assim?`
      : 'Apagar essa categoria?'
    if (!confirm(msg)) return
    if (emUso > 0) await supabase.from('loja_produtos').update({ category_id: null }).eq('category_id', id)
    await supabase.from('loja_categorias').delete().eq('id', id)
    setCategorias(prev => prev.filter(c => c.id !== id))
    setProdutos(prev => prev.map(p => p.category_id === id ? { ...p, category_id: null, category: null } : p))
    if (filterCat === id) setFilterCat('all')
    showToast('Categoria apagada')
  }

  function openNew() { setForm(emptyForm()); setPhotoFile(null); setView('form') }

  function openBulk() { setView('bulk') }
  function updateBulkRow(i: number, patch: Partial<{ name: string; category_id: string; cost_price: string; sale_price: string }>) {
    setBulkRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function addBulkRow() {
    setBulkRows(prev => [...prev, { name: '', category_id: prev[prev.length - 1]?.category_id || '', cost_price: '', sale_price: '' }])
  }
  function removeBulkRow(i: number) { setBulkRows(prev => prev.filter((_, idx) => idx !== i)) }

  async function saveBulkRows() {
    const valid = bulkRows.filter(r => r.name.trim())
    if (!valid.length) { showToast('Preenche pelo menos o nome de um produto'); return }
    setSavingBulk(true)
    const payload = valid.map((r, idx) => ({
      company_id: companyId,
      category_id: r.category_id || null,
      name: r.name.trim(),
      cost_price: parsePt(r.cost_price),
      sale_price: parsePt(r.sale_price),
      active: true,
      track_stock: false,
      esgotado: false,
      display_order: produtos.length + idx,
    }))
    await supabase.from('loja_produtos').insert(payload)
    await loadAll(companyId)
    setBulkRows(Array.from({ length: 5 }, () => ({ name: '', category_id: valid[valid.length - 1].category_id, cost_price: '', sale_price: '' })))
    setSavingBulk(false)
    showToast(`${valid.length} produto${valid.length > 1 ? 's' : ''} criado${valid.length > 1 ? 's' : ''}!`)
  }

  async function handleImportCsv(file: File) {
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) { showToast('CSV vazio ou sem produtos'); return }
    const header = rows[0].map(h => h.trim().toLowerCase())
    const iNome = header.indexOf('nome')
    const iCat = header.indexOf('categoria')
    const iDesc = header.indexOf('descricao')
    const iPreco = header.indexOf('preco')
    const iGrupos = header.indexOf('grupos')
    const iFoto = header.indexOf('foto_url')
    if (iNome === -1) { showToast('O CSV precisa ter uma coluna "nome"'); return }

    const dataRows = rows.slice(1)
    const batchId = crypto.randomUUID()
    setImportResults(null)
    setImporting(true)
    setImportPaused(false)
    importPausedRef.current = false
    importCancelledRef.current = false
    setImportProgress({ done: 0, total: dataRows.length })
    const errors: string[] = []
    const photoWarnings: string[] = []
    let createdCount = 0
    let ok = 0
    let cancelled = false
    let localCats = [...categorias]

    for (let i = 0; i < dataRows.length; i++) {
      if (importCancelledRef.current) { cancelled = true; break }
      while (importPausedRef.current) {
        await new Promise(r => setTimeout(r, 250))
        if (importCancelledRef.current) break
      }
      if (importCancelledRef.current) { cancelled = true; break }

      const r = dataRows[i]
      const nome = (r[iNome] || '').trim()
      if (nome) {
        try {
          let categoryId: string | null = null
          const catName = iCat >= 0 ? (r[iCat] || '').trim() : ''
          if (catName) {
            const found = localCats.find(c => c.name.toLowerCase() === catName.toLowerCase())
            if (found) categoryId = found.id
            else {
              const { data } = await supabase.from('loja_categorias').insert({ company_id: companyId, name: catName, display_order: localCats.length }).select().single()
              if (data) { localCats.push(data); categoryId = data.id }
            }
          }

          let photoUrl: string | null = null
          const fotoSrc = iFoto >= 0 ? (r[iFoto] || '').trim() : ''
          if (fotoSrc) {
            try {
              // Busca a sessão de novo a cada foto (em vez de uma vez só no
              // início) — em importações longas o SDK pode renovar o token
              // sozinho no meio do caminho, e uma cópia antiga capturada lá
              // atrás vira inválida mesmo os inserts continuando funcionando.
              const { data: { session: freshSession } } = await supabase.auth.getSession()
              const freshToken = freshSession?.access_token
              if (!freshToken) throw new Error('sem sessão ativa')
              const res = await fetch('/api/loja/importar-foto', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: freshToken, company_id: companyId, image_url: fotoSrc }),
              })
              const data = await res.json()
              if (res.ok && data.photo_url) photoUrl = data.photo_url
              else photoWarnings.push(`${nome}: ${data.error || 'foto não importada'}`)
            } catch (err: any) {
              photoWarnings.push(`${nome}: ${err?.message || 'foto não importada'}`)
            }
          }

          const { data: prod, error: prodErr } = await supabase.from('loja_produtos').insert({
            company_id: companyId, category_id: categoryId, name: nome,
            description: iDesc >= 0 ? ((r[iDesc] || '').trim() || null) : null,
            photo_url: photoUrl,
            cost_price: 0, sale_price: iPreco >= 0 ? parsePt(r[iPreco]) : 0,
            track_stock: false, esgotado: false, active: true, display_order: produtos.length + i,
            import_batch_id: batchId,
          }).select('id').single()
          if (prodErr || !prod) throw new Error(prodErr?.message || 'falha ao criar produto')
          createdCount++

          const groups = iGrupos >= 0 ? parseGroupsField(r[iGrupos] || '') : []
          for (let gi = 0; gi < groups.length; gi++) {
            const g = groups[gi]
            const { data: gData } = await supabase.from('loja_opcoes_grupo').insert({
              produto_id: prod.id, name: g.name, required: g.required, min_select: g.min_select, max_select: g.max_select || 1, pricing_rule: g.pricing_rule, display_order: gi,
            }).select('id').single()
            if (!gData) continue
            if (g.options.length) {
              await supabase.from('loja_opcoes').insert(g.options.map((o, oi) => ({
                grupo_id: gData.id, name: o.name || 'Opção', price: o.price, display_order: oi,
              })))
            }
          }
          ok++
        } catch (err: any) {
          errors.push(`${nome}: ${err?.message || 'erro desconhecido'}`)
        }
      }
      setImportProgress(p => ({ ...p, done: p.done + 1 }))
    }

    setCategorias(localCats)
    await loadAll(companyId)
    setImporting(false)
    setImportPaused(false)
    if (createdCount > 0) setLastImportBatch({ id: batchId, count: createdCount })
    setImportResults({ ok, errors, photoWarnings, cancelled })
  }

  function togglePauseImport() {
    importPausedRef.current = !importPausedRef.current
    setImportPaused(importPausedRef.current)
  }

  function cancelImport() {
    importCancelledRef.current = true
    importPausedRef.current = false
    setImportPaused(false)
  }

  async function deleteLastImport() {
    if (!lastImportBatch) return
    if (!confirm(`Excluir os ${lastImportBatch.count} produtos da última importação? Não dá pra desfazer.`)) return
    setDeletingLastImport(true)
    await supabase.from('loja_produtos').delete().eq('company_id', companyId).eq('import_batch_id', lastImportBatch.id)
    await loadAll(companyId)
    setLastImportBatch(null)
    setDeletingLastImport(false)
    setImportResults(null)
    setShowImportCsv(false)
    showToast('Importação desfeita')
  }

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
        options: (g.options || []).map((o: any) => ({ id: o.id, name: o.name, price: Number(o.price || 0).toFixed(2).replace('.', ','), max_qty: o.max_qty, linked_produto_id: o.linked_produto_id, photo_url: o.photo_url || null, _photoFile: null })),
      })),
    })
    setPhotoFile(null)
    setView('form')
  }

  function addGroup() { setForm(f => ({ ...f, groups: [...f.groups, { name: '', required: false, min_select: 0, max_select: 1, pricing_rule: 'soma', options: [] }] })) }
  function removeGroup(gi: number) { setForm(f => ({ ...f, groups: f.groups.filter((_, i) => i !== gi) })) }

  function openDupGroup() { setShowDupGroup(true); setDupSourceId(''); setDupGroups([]) }

  async function loadDupGroups(produtoId: string) {
    setDupSourceId(produtoId)
    setDupGroups([])
    if (!produtoId) return
    setDupLoading(true)
    const { data } = await supabase.from('loja_opcoes_grupo').select('*, options:loja_opcoes(*)').eq('produto_id', produtoId).order('display_order')
    setDupGroups((data || []).map((g: any) => ({
      name: g.name, required: g.required, min_select: g.min_select, max_select: g.max_select, pricing_rule: g.pricing_rule || 'soma',
      options: (g.options || []).map((o: any) => ({ name: o.name, price: Number(o.price || 0).toFixed(2).replace('.', ','), max_qty: o.max_qty, linked_produto_id: o.linked_produto_id, photo_url: o.photo_url || null, _photoFile: null })),
    })))
    setDupLoading(false)
  }

  function copyGroup(g: Grupo) {
    setForm(f => ({ ...f, groups: [...f.groups, { ...g, options: g.options.map(o => ({ ...o })) }] }))
    setShowDupGroup(false)
    showToast(`Grupo "${g.name}" copiado — dá uma revisada e ajusta o que precisar`)
  }
  function updateGroup(gi: number, patch: Partial<Grupo>) { setForm(f => ({ ...f, groups: f.groups.map((g, i) => i === gi ? { ...g, ...patch } : g) })) }
  function addOption(gi: number) { updateGroup(gi, { options: [...form.groups[gi].options, { name: '', price: '0', max_qty: 1, linked_produto_id: null, photo_url: null, _photoFile: null }] }) }
  function removeOption(gi: number, oi: number) { updateGroup(gi, { options: form.groups[gi].options.filter((_, i) => i !== oi) }) }
  function updateOption(gi: number, oi: number, patch: Partial<Opcao>) {
    updateGroup(gi, { options: form.groups[gi].options.map((o, i) => i === oi ? { ...o, ...patch } : o) })
  }
  function toggleDay(d: number) { setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] })) }

  async function saveProduto() {
    if (!form.name.trim()) { showToast('Dá um nome pro produto'); return }
    setSavingProd(true)
    try {
      await saveProdutoInner()
      setView('list')
      showToast('Produto salvo!')
    } catch (err: any) {
      showToast('Não deu pra salvar: ' + (err?.message || 'erro desconhecido'))
    } finally {
      setSavingProd(false)
    }
  }

  async function saveProdutoInner() {
    let photoUrl = form.photo_url
    if (photoFile) {
      const ext = photoFile.name.split('.').pop()
      const path = `${companyId}/${Date.now()}.${ext}`
      const compressed = await compressImage(photoFile)
      const { data: up, error: upErr } = await supabase.storage.from('loja-produtos').upload(path, compressed, { upsert: true })
      if (upErr) throw new Error('foto do produto: ' + upErr.message)
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
        produto_id: produtoId, name: g.name.trim() || 'Grupo', required: g.required, min_select: g.min_select, max_select: g.max_select || 1, pricing_rule: g.pricing_rule, display_order: gi,
      }).select('id').single()
      if (!gData) continue
      const optRows = []
      for (let oi = 0; oi < g.options.length; oi++) {
        const o = g.options[oi]
        let optPhotoUrl = o.photo_url || null
        if (o._photoFile) {
          try {
            const ext = o._photoFile.name.split('.').pop()
            const path = `${companyId}/opcoes/${Date.now()}_${gi}_${oi}.${ext}`
            const compressed = await compressImage(o._photoFile)
            const { data: up, error: upErr } = await supabase.storage.from('loja-produtos').upload(path, compressed, { upsert: true })
            if (upErr) throw upErr
            if (up) optPhotoUrl = supabase.storage.from('loja-produtos').getPublicUrl(path).data.publicUrl
          } catch {
            // Não deixa a foto de UMA opção travar o produto inteiro — salva
            // a opção sem foto e avisa depois, em vez de perder tudo.
            showToast(`Salvou, mas a foto de "${o.name || 'uma opção'}" falhou — tenta outra imagem`)
          }
        }
        optRows.push({
          grupo_id: gData.id, name: o.name.trim() || 'Opção', price: parsePt(o.price), max_qty: o.max_qty || null, linked_produto_id: o.linked_produto_id || null, photo_url: optPhotoUrl, display_order: oi,
        })
      }
      if (optRows.length) await supabase.from('loja_opcoes').insert(optRows)
    }

    await loadAll(companyId)
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
        .cg-wrap{ width:100%; max-width:480px; margin:0 auto; min-height:100vh; background:#F7F5F0; font-family:'Inter',sans-serif; font-size:13px; color:#1A1610; padding-bottom:40px; min-width:0; overflow-x:hidden; }
        @media(min-width:768px){
          .cg-wrap{ max-width:none; margin:0; min-height:0; padding-bottom:60px; }
          .cg-head{ padding:28px 32px 16px; position:static; }
          .cg-body{ padding:0 32px; }
          .cg-list-view .cg-body{ display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:14px; align-content:start; }
          .cg-list-view .cg-filters{ grid-column:1/-1; }
          .cg-list-view .cg-quality{ grid-column:1/-1; }
          .cg-list-view .cg-empty-msg{ grid-column:1/-1; }
          .cg-list-view .cg-bulk-cta{ grid-column:1/-1; }
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
        .cg-rule-cobrar{ display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:11px;color:#6E6656; }
        .cg-rule-cobrar select{ flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid #E6E0D2;font-family:inherit;font-size:11px; }
        .cg-opt{ border:1px solid #E6E0D2;border-radius:9px;padding:8px;margin-bottom:6px;background:#FCFAF5; }
        .cg-opt-top{ display:flex;gap:8px;align-items:center;margin-bottom:6px; }
        .cg-opt-photo{ flex:none;width:36px;height:36px;border-radius:8px;background:#fff;border:1px solid #E6E0D2;display:flex;align-items:center;justify-content:center;font-size:14px;color:#A79E8B;overflow:hidden;cursor:pointer; }
        .cg-opt-photo img{ width:100%;height:100%;object-fit:cover; }
        .cg-opt-name{ flex:1;min-width:0;padding:7px 9px;border-radius:7px;border:1px solid #E6E0D2;font-size:12px;font-family:inherit;box-sizing:border-box; }
        .cg-opt-fields{ display:grid;grid-template-columns:1fr 1fr;gap:8px; }
        .cg-opt-field-full{ grid-column:1/-1; }
        .cg-opt-field label{ display:block;font-size:10px;font-weight:700;color:#6E6656;margin-bottom:4px; }
        .cg-opt-field input, .cg-opt-field select{ width:100%;padding:7px 9px;border-radius:7px;border:1px solid #E6E0D2;font-size:11.5px;font-family:inherit;box-sizing:border-box; }
        .cg-add-inline{ font-size:11px;font-weight:700;color:#8A6410;background:#FBF1DC;border:1px dashed #E6E0D2;border-radius:8px;padding:7px;width:100%;cursor:pointer;margin-top:4px; }
        .cg-add-group{ width:100%;padding:10px;border-radius:10px;border:1.5px dashed #E6E0D2;background:transparent;color:#A79E8B;font-weight:700;font-size:12px;cursor:pointer; }
        .cg-savebar{ position:sticky;bottom:0;padding:12px 0 6px;background:#F7F5F0;display:flex;gap:8px; }
        .cg-savebar .cg-btn{ flex:1; }
        .cg-toast{ position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1A1610;color:#C9951A;padding:11px 18px;border-radius:10px;font-size:12.5px;font-weight:700;z-index:99; }
        .cg-photo-input{ display:flex;align-items:center;gap:12px;margin-bottom:14px; }
        .cg-photo-big{ width:64px;height:64px;border-radius:12px;background:linear-gradient(135deg,#FBF1DC,#FCFAF5);display:flex;align-items:center;justify-content:center;font-size:26px;overflow:hidden;flex:none; }
        .cg-photo-big img{ width:100%;height:100%;object-fit:cover; }
        .cg-cat-overlay{ position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60;display:flex;align-items:flex-end;justify-content:center; }
        .cg-cat-modal{ background:#F7F5F0;width:100%;max-width:480px;max-height:80vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden; }
        @media(min-width:768px){
          .cg-cat-overlay{ align-items:center;padding:24px; }
          .cg-cat-modal{ border-radius:16px;max-height:min(640px,85vh); }
        }
        .cg-cat-modal-head{ padding:16px;border-bottom:1px solid #EDE8E0;display:flex;justify-content:space-between;align-items:center;background:#fff; }
        .cg-close{ width:28px;height:28px;border-radius:50%;border:1px solid #E6E0D2;background:#fff;cursor:pointer; }
        .cg-cat-modal-body{ flex:1;overflow-y:auto;padding:6px 16px; }
        .cg-cat-row{ display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #EDE8E0; }
        .cg-cat-row input{ flex:1;min-width:0;padding:7px 10px;border-radius:8px;border:1px solid #E6E0D2;font-size:12.5px;font-family:inherit; }
        .cg-cat-row-name{ flex:1;min-width:0;font-weight:700;font-size:12.5px; }
        .cg-cat-row-count{ font-size:10.5px;color:#A79E8B;flex:none;white-space:nowrap; }
        .cg-cat-modal-foot{ padding:12px 16px 16px;border-top:1px solid #EDE8E0;background:#fff;display:flex;gap:8px; }
        .cg-cat-modal-foot input{ flex:1;min-width:0;padding:9px 11px;border-radius:9px;border:1px solid #E6E0D2;font-size:12.5px;font-family:inherit; }
        .cg-bulk-hint{ font-size:11.5px;color:#A79E8B;margin-bottom:12px;line-height:1.5; }
        .cg-bulk-row{ border:1px solid #E6E0D2;border-radius:10px;padding:8px;margin-bottom:8px;background:#fff; }
        .cg-bulk-name{ width:100%;padding:8px 10px;border-radius:8px;border:1px solid #E6E0D2;font-size:12.5px;font-family:inherit;margin-bottom:6px;box-sizing:border-box; }
        .cg-bulk-line2{ display:flex;gap:6px; }
        .cg-bulk-line2 select{ flex:1.4;min-width:0;padding:7px 6px;border-radius:8px;border:1px solid #E6E0D2;font-size:11.5px;font-family:inherit; }
        .cg-bulk-price{ flex:1;min-width:0;padding:7px 8px;border-radius:8px;border:1px solid #E6E0D2;font-size:11.5px;font-family:inherit; }
      `}</style>

      {view === 'list' && (
        <div className="cg-list-view">
          <div className="cg-head">
            <a href="/painel/crm" className="cg-back" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#1A1610' }}>‹</a>
            <h1>Catálogo</h1>
            <button className="cg-btn-ghost" style={{ padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700 }} onClick={() => setShowCatManager(true)}>🏷️ Categorias</button>
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
            <button className="cg-add-group cg-bulk-cta" style={{ marginBottom: 8 }} onClick={openBulk}>⚡ Cadastro rápido — vários produtos de uma vez</button>
            <button className="cg-add-group cg-bulk-cta" style={{ marginBottom: 14 }} onClick={() => { setShowImportCsv(true); setImportResults(null) }}>📥 Importar de um CSV</button>
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
                  <input placeholder="Nome do grupo (ex: Sabores, Tamanho...)" value={g.name} onChange={e => updateGroup(gi, { name: e.target.value })} />
                  <button className="cg-del" onClick={() => removeGroup(gi)}>🗑</button>
                </div>
                <div className="cg-rule">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={g.required} onChange={e => updateGroup(gi, { required: e.target.checked })} /> Obrigatório</label>
                  <div>mín <input value={g.min_select} onChange={e => updateGroup(gi, { min_select: +e.target.value || 0 })} /></div>
                  <div>máx <input value={g.max_select} onChange={e => updateGroup(gi, { max_select: +e.target.value || 0 })} /></div>
                </div>
                <div className="cg-rule-cobrar">
                  <span>cobrar:</span>
                  <select value={g.pricing_rule} onChange={e => updateGroup(gi, { pricing_rule: e.target.value as any })}>
                    <option value="soma">soma dos itens</option>
                    <option value="maior_valor">o mais caro (ex: pizza meio a meio)</option>
                  </select>
                </div>
                {g.options.map((o, oi) => (
                  <div className="cg-opt" key={oi}>
                    <div className="cg-opt-top">
                      <label className="cg-opt-photo">
                        {o._photoFile ? <img src={URL.createObjectURL(o._photoFile)} alt="" /> : o.photo_url ? <img src={o.photo_url} alt="" /> : '🍽️'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => updateOption(gi, oi, { _photoFile: e.target.files?.[0] || null })} />
                      </label>
                      <input className="cg-opt-name" placeholder="Nome da opção" value={o.name} onChange={e => updateOption(gi, oi, { name: e.target.value })} />
                      <button className="cg-del" style={{ width: 26, height: 26 }} onClick={() => removeOption(gi, oi)}>🗑</button>
                    </div>
                    <div className="cg-opt-fields">
                      <div className="cg-opt-field">
                        <label>Preço (R$)</label>
                        <input value={o.price} onChange={e => updateOption(gi, oi, { price: e.target.value })} />
                      </div>
                      <div className="cg-opt-field">
                        <label>Qtd. máx. dessa opção</label>
                        <input placeholder="sem limite" value={o.max_qty ?? ''} onChange={e => updateOption(gi, oi, { max_qty: +e.target.value || null })} />
                      </div>
                      <div className="cg-opt-field cg-opt-field-full">
                        <label>Vincular a um produto do catálogo (opcional)</label>
                        <select value={o.linked_produto_id || ''} onChange={e => updateOption(gi, oi, { linked_produto_id: e.target.value || null })}>
                          <option value="">Nenhum — é só uma opção avulsa</option>
                          {produtos.filter(p => p.id !== form.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
                <button className="cg-add-inline" onClick={() => addOption(gi)}>+ Adicionar opção</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="cg-add-group" style={{ flex: 1 }} onClick={addGroup}>+ Adicionar grupo de opção</button>
              <button className="cg-add-group" style={{ flex: 1 }} onClick={openDupGroup}>📋 Duplicar de outro produto</button>
            </div>

            <div className="cg-savebar">
              <button className="cg-btn cg-btn-gold" disabled={savingProd} onClick={saveProduto}>{savingProd ? 'Salvando...' : 'Salvar produto'}</button>
            </div>
          </div>
        </div>
      )}

      {view === 'bulk' && (
        <div className="cg-form-view">
          <div className="cg-head">
            <button className="cg-back" onClick={() => setView('list')}>‹</button>
            <h1>Cadastro rápido</h1>
            <button className="cg-btn-ghost" style={{ padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700 }} onClick={() => setShowCatManager(true)}>🏷️ Categorias</button>
          </div>
          <div className="cg-body">
            <div className="cg-bulk-hint">Nome, categoria e preços de vários produtos de uma vez. Foto e descrição você adiciona depois, abrindo cada um na lista.</div>
            {bulkRows.map((r, i) => (
              <div className="cg-bulk-row" key={i}>
                <input className="cg-bulk-name" placeholder="Nome do produto" value={r.name} onChange={e => updateBulkRow(i, { name: e.target.value })} />
                <div className="cg-bulk-line2">
                  <select value={r.category_id} onChange={e => updateBulkRow(i, { category_id: e.target.value })}>
                    <option value="">Sem categoria</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input className="cg-bulk-price" placeholder="Custo" value={r.cost_price} onChange={e => updateBulkRow(i, { cost_price: e.target.value })} />
                  <input className="cg-bulk-price" placeholder="Venda" value={r.sale_price} onChange={e => updateBulkRow(i, { sale_price: e.target.value })} />
                  <button className="cg-del" style={{ width: 26, height: 26 }} onClick={() => removeBulkRow(i)}>✕</button>
                </div>
              </div>
            ))}
            <button className="cg-add-inline" onClick={addBulkRow}>+ Adicionar linha</button>

            <div className="cg-savebar">
              <button className="cg-btn cg-btn-gold" disabled={savingBulk} onClick={saveBulkRows}>{savingBulk ? 'Salvando...' : 'Salvar todos'}</button>
            </div>
          </div>
        </div>
      )}

      {showCatManager && (
        <div className="cg-cat-overlay" onClick={() => { setShowCatManager(false); setEditingCatId('') }}>
          <div className="cg-cat-modal" onClick={e => e.stopPropagation()}>
            <div className="cg-cat-modal-head">
              <b>Categorias do cardápio</b>
              <button className="cg-close" onClick={() => { setShowCatManager(false); setEditingCatId('') }}>✕</button>
            </div>
            <div className="cg-cat-modal-body">
              {categorias.length === 0 && <div style={{ fontSize: 12, color: '#A79E8B', padding: '12px 0' }}>Nenhuma categoria ainda.</div>}
              {categorias.map(c => (
                <div className="cg-cat-row" key={c.id}>
                  {editingCatId === c.id ? (
                    <>
                      <input value={editCatName} onChange={e => setEditCatName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && saveCategoriaName(c.id)} />
                      <button className="cg-btn cg-btn-gold" style={{ padding: '7px 12px' }} onClick={() => saveCategoriaName(c.id)}>OK</button>
                      <button className="cg-btn-ghost" style={{ padding: '7px 10px', borderRadius: 8 }} onClick={() => setEditingCatId('')}>✕</button>
                    </>
                  ) : (
                    <>
                      <span className="cg-cat-row-name">{c.name}</span>
                      <span className="cg-cat-row-count">{produtos.filter(p => p.category_id === c.id).length} produto{produtos.filter(p => p.category_id === c.id).length !== 1 ? 's' : ''}</span>
                      <button className="cg-btn-ghost" style={{ padding: '6px 9px', borderRadius: 8, fontSize: 11 }} onClick={() => { setEditingCatId(c.id); setEditCatName(c.name) }}>✏️</button>
                      <button className="cg-del" onClick={() => deleteCategoria(c.id)}>🗑</button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="cg-cat-modal-foot">
              <input placeholder="Nova categoria" value={mgrNewCatName} onChange={e => setMgrNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategoriaFromManager()} />
              <button className="cg-btn cg-btn-gold" onClick={addCategoriaFromManager}>+ Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {showDupGroup && (
        <div className="cg-cat-overlay" onClick={() => setShowDupGroup(false)}>
          <div className="cg-cat-modal" onClick={e => e.stopPropagation()}>
            <div className="cg-cat-modal-head">
              <b>Duplicar grupo de outro produto</b>
              <button className="cg-close" onClick={() => setShowDupGroup(false)}>✕</button>
            </div>
            <div className="cg-cat-modal-body">
              <div className="cg-field" style={{ marginTop: 10 }}>
                <label>De qual produto?</label>
                <select value={dupSourceId} onChange={e => loadDupGroups(e.target.value)}>
                  <option value="">Selecionar produto...</option>
                  {produtos.filter(p => p.id !== form.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {dupLoading && <div style={{ fontSize: 12, color: '#A79E8B', padding: '8px 0' }}>Carregando...</div>}
              {!dupLoading && dupSourceId && dupGroups.length === 0 && (
                <div style={{ fontSize: 12, color: '#A79E8B', padding: '8px 0' }}>Esse produto não tem grupo de opção.</div>
              )}
              {dupGroups.map((g, i) => (
                <div className="cg-cat-row" key={i}>
                  <span className="cg-cat-row-name">{g.name}</span>
                  <span className="cg-cat-row-count">{g.options.length} opç{g.options.length !== 1 ? 'ões' : 'ão'}</span>
                  <button className="cg-btn cg-btn-gold" style={{ padding: '7px 12px', fontSize: 11 }} onClick={() => copyGroup(g)}>Copiar</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showImportCsv && (
        <div className="cg-cat-overlay" onClick={() => !importing && setShowImportCsv(false)}>
          <div className="cg-cat-modal" onClick={e => e.stopPropagation()}>
            <div className="cg-cat-modal-head">
              <b>Importar de um CSV</b>
              {!importing && <button className="cg-close" onClick={() => setShowImportCsv(false)}>✕</button>}
            </div>
            <div className="cg-cat-modal-body">
              {!importing && !importResults && (
                <>
                  <div style={{ fontSize: 11.5, color: '#6E6656', lineHeight: 1.6, padding: '10px 0' }}>
                    Colunas do arquivo: <b>nome, categoria, descricao, preco, grupos, foto_url</b> (só nome é obrigatório). Categoria que não existir ainda é criada automaticamente. Se vier <b>foto_url</b> (link direto da imagem), a gente baixa e já sobe pro seu catálogo.
                    <br /><br />
                    Formato da coluna <b>grupos</b> (só quando o produto tem variação, tipo sabores): cada grupo separado por <code>&&</code>, campos separados por <code>|</code>, opções separadas por <code>;</code> no formato <code>Nome=Preço</code>.
                    <br />
                    <span style={{ fontFamily: 'monospace', fontSize: 10.5, display: 'block', background: '#FCFAF5', border: '1px solid #E6E0D2', borderRadius: 8, padding: 8, marginTop: 6, wordBreak: 'break-word' }}>
                      Sabores | obrigatorio | 1 | 2 | maior_valor | Calabresa=39.90 ; Mussarela=35.90
                    </span>
                  </div>
                  <label className="cg-btn cg-btn-gold" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', marginBottom: lastImportBatch ? 10 : 16 }}>
                    Escolher arquivo CSV
                    <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCsv(f) }} />
                  </label>
                  {lastImportBatch && (
                    <button className="cg-btn-ghost cg-btn-danger" style={{ width: '100%', padding: 10, borderRadius: 10, marginBottom: 6 }} disabled={deletingLastImport} onClick={deleteLastImport}>
                      {deletingLastImport ? 'Excluindo...' : `🗑 Excluir última importação (${lastImportBatch.count} produtos)`}
                    </button>
                  )}
                </>
              )}
              {importing && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
                    {importPaused ? 'Pausado' : 'Importando'} {importProgress.done}/{importProgress.total}...
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="cg-btn cg-btn-gold" style={{ flex: 1 }} onClick={togglePauseImport}>{importPaused ? '▶ Continuar' : '⏸ Pausar'}</button>
                    <button className="cg-btn-ghost cg-btn-danger" style={{ flex: 1, borderRadius: 10 }} onClick={cancelImport}>✕ Cancelar</button>
                  </div>
                </div>
              )}
              {importResults && (
                <div style={{ padding: '10px 0' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                    {importResults.cancelled && <span style={{ color: '#C43D3D' }}>Importação cancelada. </span>}
                    {importResults.ok} produto{importResults.ok !== 1 ? 's' : ''} importado{importResults.ok !== 1 ? 's' : ''}!
                  </div>
                  {importResults.errors.length > 0 && (
                    <>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#C43D3D', marginBottom: 4 }}>{importResults.errors.length} com erro:</div>
                      {importResults.errors.map((e, i) => <div key={i} style={{ fontSize: 11, color: '#C43D3D', marginBottom: 2 }}>{e}</div>)}
                    </>
                  )}
                  {importResults.photoWarnings.length > 0 && (
                    <>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8A6410', marginTop: 10, marginBottom: 4 }}>{importResults.photoWarnings.length} foto{importResults.photoWarnings.length !== 1 ? 's' : ''} não importada{importResults.photoWarnings.length !== 1 ? 's' : ''} (produto foi criado normal, só a foto que falhou):</div>
                      {importResults.photoWarnings.map((e, i) => <div key={i} style={{ fontSize: 11, color: '#8A6410', marginBottom: 2 }}>{e}</div>)}
                    </>
                  )}
                  {lastImportBatch && (
                    <button className="cg-btn-ghost cg-btn-danger" style={{ width: '100%', padding: 10, borderRadius: 10, marginTop: 12 }} disabled={deletingLastImport} onClick={deleteLastImport}>
                      {deletingLastImport ? 'Excluindo...' : `🗑 Excluir essa importação (${lastImportBatch.count} produtos)`}
                    </button>
                  )}
                  <button className="cg-btn cg-btn-gold" style={{ width: '100%', marginTop: 8 }} onClick={() => { setShowImportCsv(false); setImportResults(null) }}>Fechar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="cg-toast">{toast}</div>}
    </div>
    </CrmShell>
  )
}
