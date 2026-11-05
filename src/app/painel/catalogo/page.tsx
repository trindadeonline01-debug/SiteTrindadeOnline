'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/compressImage'
import { usePainelShell } from '@/contexts/PainelShellContext'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Categoria = { id: string; name: string; display_order: number }
type Opcao = { id?: string; name: string; price: string; max_qty: number | null; linked_produto_id: string | null; photo_url?: string | null; pausado?: boolean; _photoFile?: File | null }
type Grupo = { id?: string; name: string; required: boolean; min_select: number; max_select: number; pricing_rule: 'soma' | 'maior_valor'; options: Opcao[] }
type Produto = {
  id: string; name: string; description: string | null; photo_url: string | null
  category_id: string | null; cost_price: number; sale_price: number
  track_stock: boolean; stock_qty: number | null; stock_alert_qty: number | null
  available_days: number[] | null
  promo_type: 'percent' | 'fixed' | null; promo_value: number | null
  promo_starts_at: string | null; promo_ends_at: string | null
  active: boolean; esgotado: boolean; display_order: number
  tipo_vitrine: string | null
  sem_cashback?: boolean | null
  canal_delivery?: boolean | null
  canal_pdv?: boolean | null
  canal_mesa?: boolean | null
  ordem_interna?: number | null
  category?: { name: string } | null
}


// Ícones do formulário de produto (traço fino, mesmo estilo em tudo)
const ICO = {
  back: 'M15 6l-6 6 6 6', check: 'M5 12l5 5 9-10', plus: 'M12 5v14M5 12h14', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6',
  trash: 'M4 7h16M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3', pause: 'M9 6v12M15 6v12', play: 'M8 5l11 7-11 7z',
  copy: 'M8 8h10a2 2 0 012 2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V10a2 2 0 012-2zM16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14', image: 'M4 5h16v14H4zM4 15l5-5 5 5 3-3 3 3',
}
function Ico({ d, size = 16, sw = 2 }: { d: string; size?: number; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={d === ICO.play ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}><path d={d} /></svg>
}
function PfSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <label className="pf-sw"><input type="checkbox" checked={checked} aria-label={label} onChange={e => onChange(e.target.checked)} /></label>
}

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const emptyForm = () => ({
  id: '' as string,
  name: '', description: '', photo_url: null as string | null,
  category_id: '', tipo_vitrine: '' as string, cost_price: '0', sale_price: '0',
  track_stock: false, stock_qty: '', stock_alert_qty: '',
  restrictDays: false, days: [] as number[],
  hasPromo: false, promo_value: '', semCashback: false,
  canalDelivery: true, canalPdv: true, canalMesa: true,
  promo_starts_at: '', promo_ends_at: '',
  active: true,
  groups: [] as Grupo[],
})

function fmt(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }
function margin(cost: number, price: number) { return price > 0 ? Math.round(((price - cost) / price) * 100) : 0 }
function parsePt(v: string) { return parseFloat((v || '0').replace(',', '.')) || 0 }

// Organizador de complementos: a ordem dos grupos e das opções vive em
// `display_order` (já existia nas duas tabelas) — o select aninhado do Supabase
// não garante ordem, então sempre ordena aqui ao carregar o produto.
function byDisplayOrder<T extends { display_order?: number | null }>(a: T, b: T) {
  return (a.display_order ?? 0) - (b.display_order ?? 0)
}
type OrdemGrupos = 'free' | 'paid' | 'asc' | 'desc'
type OrdemOpcoes = 'az' | 'asc' | 'desc' | 'free' | 'paid'
function grupoTipo(g: Grupo): 'free' | 'paid' | 'mixed' {
  if (!g.options.length) return 'free'
  const zeros = g.options.filter(o => parsePt(o.price) === 0).length
  return zeros === g.options.length ? 'free' : zeros === 0 ? 'paid' : 'mixed'
}
function grupoMedia(g: Grupo) {
  return g.options.length ? g.options.reduce((s, o) => s + parsePt(o.price), 0) / g.options.length : 0
}
function ordenarGrupos(groups: Grupo[], modo: OrdemGrupos, obrigatoriosNoTopo: boolean): Grupo[] {
  const rank = { free: { free: 0, mixed: 1, paid: 2 }, paid: { paid: 0, mixed: 1, free: 2 } }
  const idx = new Map(groups.map((g, i) => [g, i]))
  return [...groups].sort((a, b) => {
    if (obrigatoriosNoTopo && a.required !== b.required) return a.required ? -1 : 1
    let d = 0
    if (modo === 'free' || modo === 'paid') d = rank[modo][grupoTipo(a)] - rank[modo][grupoTipo(b)]
    else if (modo === 'asc') d = grupoMedia(a) - grupoMedia(b)
    else d = grupoMedia(b) - grupoMedia(a)
    return d || (idx.get(a)! - idx.get(b)!)
  })
}
function ordenarOpcoes(options: Opcao[], modo: OrdemOpcoes): Opcao[] {
  const idx = new Map(options.map((o, i) => [o, i]))
  return [...options].sort((a, b) => {
    let d = 0
    const pa = parsePt(a.price), pb = parsePt(b.price)
    if (modo === 'az') d = a.name.localeCompare(b.name, 'pt-BR')
    else if (modo === 'asc') d = pa - pb
    else if (modo === 'desc') d = pb - pa
    else if (modo === 'free') d = Number(pa > 0) - Number(pb > 0)
    else d = Number(pb > 0) - Number(pa > 0)
    return d || (idx.get(a)! - idx.get(b)!)
  })
}
function moverItem<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const copy = [...arr]
  ;[copy[i], copy[j]] = [copy[j], copy[i]]
  return copy
}

// Converte o promo_value guardado (sempre como desconto, igual já era pro
// tipo 'fixed') pro preço final que o lojista digita na tela — campo direto
// "Preço de promoção" em vez de escolher tipo/valor de desconto. Produto
// antigo com promo_type='percent' continua sendo lido certinho aqui, só
// passa a ser salvo como 'fixed' da próxima vez que for editado.
function promoDisplayPrice(p: Pick<Produto, 'promo_type' | 'promo_value' | 'sale_price'>): string {
  if (!p.promo_type || p.promo_value == null) return ''
  const sale = Number(p.sale_price)
  const preco = p.promo_type === 'percent' ? sale * (1 - Number(p.promo_value) / 100) : sale - Number(p.promo_value)
  return preco.toFixed(2).replace('.', ',')
}

function promoPriceOf(p: Pick<Produto, 'promo_type' | 'promo_value' | 'sale_price' | 'promo_starts_at' | 'promo_ends_at'>): number | null {
  if (!p.promo_type || !p.promo_value) return null
  const now = Date.now()
  if (p.promo_starts_at && now < new Date(p.promo_starts_at).getTime()) return null
  if (p.promo_ends_at && now > new Date(p.promo_ends_at).getTime()) return null
  return p.promo_type === 'percent' ? Number(p.sale_price) * (1 - Number(p.promo_value) / 100) : Number(p.sale_price) - Number(p.promo_value)
}

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

// Pra casar nome de arquivo com nome de produto sem exigir que fiquem
// idênticos byte a byte — minúsculo, sem acento, espaços colapsados.
const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g')
function normalizeName(s: string) {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').replace(/\s+/g, ' ')
}

// Cada produto da lista pode ser arrastado pelo ⠿ (a alça é passada pro filho,
// que a coloca onde quiser dentro do cartão). Serve pra lista vertical do
// celular e pra grade do desktop (rectSortingStrategy).
function SortableProdItem({ id, disabled, children }: { id: string; disabled: boolean; children: (handle: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1, zIndex: isDragging ? 5 : undefined }
  return <div ref={setNodeRef} style={style} className="cg-sortitem">{children({ ...attributes, ...listeners } as React.ButtonHTMLAttributes<HTMLButtonElement>)}</div>
}

// Ordem que o DONO vê na lista: se ele guardou uma ordem só interna
// (`ordem_interna`), vale ela (produto novo, sem ordem interna, vai pro fim);
// senão, a ordem do cardápio (`display_order`).
function ordenarParaDono(arr: Produto[]): Produto[] {
  const interna = arr.some(p => p.ordem_interna != null)
  return [...arr].sort((a, b) => interna
    ? (a.ordem_interna ?? 1e9 + a.display_order) - (b.ordem_interna ?? 1e9 + b.display_order)
    : a.display_order - b.display_order)
}

// Linha de categoria arrastável (drag handle) no gerenciador — clicar e
// arrastar pelo ⠿ reordena a seção no cardápio público, sem precisar de
// setinha de subir/descer.
function SortableCatRow({ cat, count, isEditing, editName, onEditNameChange, onSaveName, onCancelEdit, onStartEdit, onDelete }: {
  cat: { id: string; name: string }
  count: number
  isEditing: boolean
  editName: string
  onEditNameChange: (v: string) => void
  onSaveName: () => void
  onCancelEdit: () => void
  onStartEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div className="cg-cat-row" ref={setNodeRef} style={style}>
      {isEditing ? (
        <>
          <input value={editName} onChange={e => onEditNameChange(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && onSaveName()} />
          <button className="cg-btn cg-btn-gold" style={{ padding: '7px 12px' }} onClick={onSaveName}>OK</button>
          <button className="cg-btn-ghost" style={{ padding: '7px 10px', borderRadius: 8 }} onClick={onCancelEdit} aria-label="Cancelar edição" title="Cancelar edição">✕</button>
        </>
      ) : (
        <>
          <button className="cg-drag-handle" {...attributes} {...listeners} aria-label="Arrastar pra reordenar">⠿</button>
          <span className="cg-cat-row-name">{cat.name}</span>
          <span className="cg-cat-row-count">{count} produto{count !== 1 ? 's' : ''}</span>
          <button className="cg-btn-ghost" style={{ padding: '6px 9px', borderRadius: 8, fontSize: 11 }} onClick={onStartEdit} aria-label="Editar categoria" title="Editar categoria">✏️</button>
          <button className="cg-del" onClick={onDelete} aria-label="Excluir categoria" title="Excluir categoria">🗑</button>
        </>
      )}
    </div>
  )
}

// Extrai o caminho dentro do bucket a partir da URL pública, pra poder
// apagar o arquivo do Storage (a URL pública não serve de argumento pro remove()).
function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = '/loja-produtos/'
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

export default function CatalogoPage() {
  const { company, loading: shellLoading, isAdminMode } = usePainelShell()
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [crmEnabled, setCrmEnabled] = useState(false)
  const [entregaEnabled, setEntregaEnabled] = useState(false)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [tiposVitrine, setTiposVitrine] = useState<{ value: string; label: string; emoji: string }[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [view, setView] = useState<'list' | 'form' | 'bulk'>('list')
  const [filterCat, setFilterCat] = useState('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyForm())
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null)
  const [savingProd, setSavingProd] = useState(false)
  const [fechados, setFechados] = useState<Set<number>>(new Set())
  const [formSnap, setFormSnap] = useState('')
  const fotoPreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])
  const [newCatName, setNewCatName] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [toast, setToast] = useState('')
  const [showImportMenu, setShowImportMenu] = useState(false)
  const [showCatManager, setShowCatManager] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)
  const [mgrNewCatName, setMgrNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState('')
  const [editCatName, setEditCatName] = useState('')
  const [bulkRows, setBulkRows] = useState(() => Array.from({ length: 5 }, () => ({ name: '', category_id: '', cost_price: '', sale_price: '' })))
  const [savingBulk, setSavingBulk] = useState(false)
  const [showDupGroup, setShowDupGroup] = useState(false)
  const [dupSourceId, setDupSourceId] = useState('')
  const [dupGroups, setDupGroups] = useState<Grupo[]>([])
  const [dupLoading, setDupLoading] = useState(false)
  // Organizador de complementos
  const [ordemGrupos, setOrdemGrupos] = useState<OrdemGrupos | 'manual'>('manual')
  const [obrigNoTopo, setObrigNoTopo] = useState(true)
  const [showApplyOrder, setShowApplyOrder] = useState(false)
  const [applySel, setApplySel] = useState<string[]>([])
  const [applyBusy, setApplyBusy] = useState(false)
  const [showCopyPhoto, setShowCopyPhoto] = useState(false)
  const [copyPhotoSearch, setCopyPhotoSearch] = useState('')
  const [showImportCsv, setShowImportCsv] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importPaused, setImportPaused] = useState(false)
  const importPausedRef = useRef(false)
  const importCancelledRef = useRef(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })
  const [importResults, setImportResults] = useState<{ ok: number; updated: number; skipped: number; errors: string[]; photoWarnings: string[]; cancelled: boolean } | null>(null)
  const [importUpdateMode, setImportUpdateMode] = useState(false)
  // Só traz produto cujo nome ainda não existe no catálogo; quem já existe é ignorado (nada é alterado).
  const [importOnlyNew, setImportOnlyNew] = useState(false)
  const [lastImportBatch, setLastImportBatch] = useState<{ id: string; count: number } | null>(null)
  const [deletingLastImport, setDeletingLastImport] = useState(false)
  const [showImportPhotos, setShowImportPhotos] = useState(false)
  const [importingPhotos, setImportingPhotos] = useState(false)
  const [photoImportProgress, setPhotoImportProgress] = useState({ done: 0, total: 0 })
  const [photoImportResults, setPhotoImportResults] = useState<{ matched: number; unmatched: string[] } | null>(null)
  const [showImportIA, setShowImportIA] = useState(false)
  const [importIAStep, setImportIAStep] = useState<'choose' | 'loading' | 'preview' | 'error'>('choose')
  const [importIASource, setImportIASource] = useState<'url' | 'pdf' | 'fotos'>('url')
  const [importIAUrl, setImportIAUrl] = useState('')
  const [importIAError, setImportIAError] = useState('')
  const [importIAPreview, setImportIAPreview] = useState<{ categorias: number; produtos: number; imagens: number; grupos: number; classificados: number; csv: string } | null>(null)
  // Organizar a ordem dos produtos (arrastar ou botões); ao salvar, escolhe: cardápio do cliente ou só organização interna
  const [draftIds, setDraftIds] = useState<string[] | null>(null)
  const [reorderSaving, setReorderSaving] = useState(false)
  const [showSaveOrder, setShowSaveOrder] = useState(false)
  const catSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (shellLoading) return
    if (!company || !company.loja_digital_enabled) { window.location.href = '/painel/compartilhar'; return }
    setCompanyId(company.id)
    setCompanyName(company.name)
    setCrmEnabled(company.crm_whatsapp_enabled)
    setEntregaEnabled(company.entrega_enabled)
    ;(async () => {
      await loadAll(company.id)
      await loadLastImportBatch(company.id)
      setLoading(false)
    })()
  }, [shellLoading, company?.id, company?.loja_digital_enabled])

  async function loadAll(cid: string) {
    const [{ data: cats }, { data: prods }, { data: tipos }] = await Promise.all([
      supabase.from('loja_categorias').select('*').eq('company_id', cid).order('display_order'),
      supabase.from('loja_produtos').select('*, category:loja_categorias(name)').eq('company_id', cid).order('display_order'),
      supabase.from('vitrine_tipos').select('value,label,emoji').eq('active', true).order('display_order'),
    ])
    setCategorias(cats || [])
    setProdutos(ordenarParaDono((prods || []) as any))
    setTiposVitrine(tipos || [])
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

  // Casa cada arquivo pelo nome (sem extensão) com o produto de mesmo nome
  // no catálogo e sobe a foto — tudo local, sem precisar buscar de outro
  // site, então não esbarra em bloqueio de CDN como o link direto esbarrava.
  async function handleImportPhotos(files: FileList) {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!fileArr.length) { showToast('Nenhuma imagem selecionada'); return }
    setPhotoImportResults(null)
    setImportingPhotos(true)
    setPhotoImportProgress({ done: 0, total: fileArr.length })
    let matched = 0
    const unmatched: string[] = []

    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i]
      const baseName = file.name.replace(/\.[^.]+$/, '')
      const prod = produtos.find(p => normalizeName(p.name) === normalizeName(baseName))
      if (!prod) {
        unmatched.push(file.name)
      } else {
        try {
          const ext = file.name.split('.').pop() || 'jpg'
          const path = `${companyId}/${Date.now()}_${i}.${ext}`
          const compressed = await compressImage(file, 1.5)
          const { data: up, error: upErr } = await supabase.storage.from('loja-produtos').upload(path, compressed, { upsert: true })
          if (upErr || !up) throw new Error(upErr?.message || 'falha no upload')
          const photoUrl = supabase.storage.from('loja-produtos').getPublicUrl(path).data.publicUrl
          await supabase.from('loja_produtos').update({ photo_url: photoUrl }).eq('id', prod.id)
          matched++
        } catch {
          unmatched.push(`${file.name} (falhou no upload)`)
        }
      }
      setPhotoImportProgress(p => ({ ...p, done: p.done + 1 }))
    }

    await loadAll(companyId)
    setImportingPhotos(false)
    setPhotoImportResults({ matched, unmatched })
  }

  // A Vercel rejeita corpo de requisição grande demais (~4,5MB) devolvendo
  // texto puro ("Request Entity Too Large"), não JSON — `res.json()` direto
  // nisso quebra com "Unexpected token 'R'..." (achado real do Ricardo,
  // set/2026, ao importar fotos de cardápio). Lê como texto primeiro e só
  // faz JSON.parse depois, com mensagem amigável se não der.
  async function readImportIAResponse(res: Response): Promise<any> {
    const text = await res.text()
    try { return JSON.parse(text) } catch {
      return { error: /entity too large/i.test(text) || res.status === 413
        ? 'Arquivo grande demais pro servidor aceitar de uma vez. Tenta menos fotos por vez, ou fotos em resolução menor.'
        : `Erro inesperado do servidor (${res.status}). Tenta de novo.` }
    }
  }

  function csvFieldClient(v: string): string {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) return '"' + v.replace(/"/g, '""') + '"'
    return v
  }

  function openImportIA() {
    setShowImportIA(true)
    setImportIAStep('choose')
    setImportIASource('url')
    setImportIAUrl('')
    setImportIAError('')
    setImportIAPreview(null)
  }

  // Importador universal — a mesma IA que já uso manualmente pra ler
  // cardápio de outros sites (ver docs/KNOWLEDGE_BASE.md), só que chamada
  // direto pela API em vez de rodar na mão via extensão. Lê link, PDF ou
  // fotos e devolve um CSV no mesmo formato que "Importar de um CSV" já
  // consome — por isso a confirmação reaproveita handleImportCsv inteiro
  // (undo, atualizar existentes, progresso, importação de foto etc).
  async function runImportIAUrl() {
    if (!importIAUrl.trim()) { setImportIAError('Cola o link do cardápio'); setImportIAStep('error'); return }
    setImportIAStep('loading')
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/painel/importar-ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: session?.access_token, company_id: companyId, source: 'url', url: importIAUrl.trim() }),
      })
      const data = await readImportIAResponse(res)
      if (!res.ok) { setImportIAError(data.error || 'não deu pra ler esse cardápio'); setImportIAStep('error'); return }
      setImportIAPreview(data)
      setImportIAStep('preview')
    } catch (err: any) {
      setImportIAError(err?.message || 'falha ao ler o cardápio'); setImportIAStep('error')
    }
  }

  async function runImportIAPdf(file: File) {
    setImportIAStep('loading')
    const { data: { session } } = await supabase.auth.getSession()
    let tmpPath = ''
    try {
      // Mesmo ajuste feito nas fotos (ver runImportIAFotos): manda a URL do
      // Storage em vez do PDF em base64 no corpo do POST, senão o mesmo
      // teto de ~4,5MB da Vercel estoura de novo pra PDF grande — foi
      // exatamente o que aconteceu (achado real do Ricardo, set/2026).
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      tmpPath = `${companyId}/import-ia-tmp/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('loja-produtos').upload(tmpPath, file, { upsert: true, contentType: 'application/pdf' })
      if (upErr) throw new Error('Falha ao enviar o PDF. Tenta de novo.')
      const pdf_url = supabase.storage.from('loja-produtos').getPublicUrl(tmpPath).data.publicUrl
      const res = await fetch('/api/painel/importar-ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: session?.access_token, company_id: companyId, source: 'pdf', pdf_url }),
      })
      const data = await readImportIAResponse(res)
      if (!res.ok) { setImportIAError(data.error || 'não deu pra ler esse PDF'); setImportIAStep('error'); return }
      setImportIAPreview(data)
      setImportIAStep('preview')
    } catch (err: any) {
      setImportIAError(err?.message || 'falha ao ler o cardápio'); setImportIAStep('error')
    } finally {
      if (tmpPath) supabase.storage.from('loja-produtos').remove([tmpPath]).catch(() => {})
    }
  }

  async function runImportIAFotos(files: FileList) {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 8)
    if (!fileArr.length) { setImportIAError('Escolhe pelo menos uma foto'); setImportIAStep('error'); return }
    setImportIAStep('loading')
    const { data: { session } } = await supabase.auth.getSession()
    const tmpPaths: string[] = []
    try {
      // Sobe cada foto pro Storage e manda só a URL — não mais a foto em
      // base64 dentro do corpo do POST. O corpo de uma função da Vercel
      // tem teto de ~4,5MB, e algumas fotos de cardápio (mesmo já
      // comprimidas) já estouravam isso sozinhas, fazendo a Vercel
      // recusar o corpo ANTES do código da rota rodar — devolvia "Request
      // Entity Too Large" em texto puro, e o `res.json()` de então quebrava
      // com "Unexpected token 'R'..." (achado real do Ricardo, set/2026).
      // São arquivos temporários — apagados no `finally` abaixo, dê certo
      // ou não a importação.
      const foto_urls = await Promise.all(fileArr.map(async (f, i) => {
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${companyId}/import-ia-tmp/${Date.now()}_${i}.${ext}`
        const compressed = await compressImage(f, 1.2)
        const { error: upErr } = await supabase.storage.from('loja-produtos').upload(path, compressed, { upsert: true })
        if (upErr) throw new Error('Falha ao enviar uma das fotos. Tenta de novo.')
        tmpPaths.push(path)
        return supabase.storage.from('loja-produtos').getPublicUrl(path).data.publicUrl
      }))
      const res = await fetch('/api/painel/importar-ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: session?.access_token, company_id: companyId, source: 'fotos', foto_urls }),
      })
      const data = await readImportIAResponse(res)
      if (!res.ok) { setImportIAError(data.error || 'não deu pra ler essas fotos'); setImportIAStep('error'); return }
      setImportIAPreview(data)
      setImportIAStep('preview')
    } catch (err: any) {
      setImportIAError(err?.message || 'falha ao ler o cardápio'); setImportIAStep('error')
    } finally {
      if (tmpPaths.length) supabase.storage.from('loja-produtos').remove(tmpPaths).catch(() => {})
    }
  }

  function confirmImportIA() {
    if (!importIAPreview) return
    const file = new File([importIAPreview.csv], 'cardapio-importado-ia.csv', { type: 'text/csv' })
    setShowImportIA(false)
    setShowImportCsv(true)
    setImportResults(null)
    setImportUpdateMode(false)
    handleImportCsv(file)
  }

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

  // Ordem das categorias aqui é a mesma ordem das seções no cardápio
  // público (/cardapio/[slug] já busca por display_order) —
  // arrastar aqui move a seção de verdade pro cliente. Renumera tudo do
  // zero a cada troca em vez de só trocar os dois valores, pra nunca
  // depender de display_order já estar sem furo/duplicata.
  async function handleDragEndCat(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = categorias.findIndex(c => c.id === active.id)
    const newIdx = categorias.findIndex(c => c.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reindexed = arrayMove(categorias, oldIdx, newIdx).map((c, i) => ({ ...c, display_order: i }))
    setCategorias(reindexed)
    await Promise.all(reindexed.map(c => supabase.from('loja_categorias').update({ display_order: c.display_order }).eq('id', c.id)))
  }

  // ---------- Organizar a ordem dos produtos ----------
  // Dois destinos ao salvar:
  //  - cardápio do cliente: grava `loja_produtos.display_order` (o cardápio público,
  //    o PDV, as Mesas e os Pedidos leem por ela; vale dentro de cada categoria) e
  //    apaga a ordem interna, pra lista do painel ficar igual;
  //  - só organização interna: grava `ordem_interna`, que só muda a lista aqui no
  //    painel. O cliente continua vendo a ordem de antes.
  // Com filtro/busca ligado, só os produtos visíveis trocam de lugar entre si.
  type OrdemProdutos = 'az' | 'za' | 'menor' | 'maior' | 'promo' | 'categoria' | 'foto'
  function produtoVisivel(p: Produto) {
    const term = search.trim().toLowerCase()
    return (filterCat === 'all' || (filterCat === 'sem-foto' ? !p.photo_url : p.category_id === filterCat))
      && (!term || p.name.toLowerCase().includes(term))
  }
  function aplicarNaVisivel(novaOrdem: string[]) {
    const conjunto = new Set(novaOrdem)
    setDraftIds(prev => { let k = 0; return (prev ?? produtos.map(p => p.id)).map(id => conjunto.has(id) ? novaOrdem[k++] : id) })
  }
  function ordenarProdutos(modo: OrdemProdutos) {
    const mapa = new Map(produtos.map(p => [p.id, p]))
    const atual = (draftIds ?? produtos.map(p => p.id)).filter(id => { const p = mapa.get(id); return !!p && produtoVisivel(p) })
    const pos = new Map(atual.map((id, i) => [id, i]))
    const preco = (p: Produto) => promoPriceOf(p) ?? Number(p.sale_price)
    const catIdx = new Map(categorias.map((c, i) => [c.id, i]))
    const ordenado = [...atual].sort((x, y) => {
      const a = mapa.get(x)!, b = mapa.get(y)!
      let d = 0
      if (modo === 'az') d = a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
      else if (modo === 'za') d = b.name.localeCompare(a.name, 'pt-BR', { sensitivity: 'base' })
      else if (modo === 'menor') d = preco(a) - preco(b)
      else if (modo === 'maior') d = preco(b) - preco(a)
      else if (modo === 'promo') d = Number(promoPriceOf(b) != null) - Number(promoPriceOf(a) != null)
      else if (modo === 'foto') d = Number(!!b.photo_url) - Number(!!a.photo_url)
      else d = (catIdx.get(a.category_id || '') ?? 9999) - (catIdx.get(b.category_id || '') ?? 9999)
      return d || (pos.get(x)! - pos.get(y)!)
    })
    aplicarNaVisivel(ordenado)
  }
  function handleDragEndProd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const mapa = new Map(produtos.map(p => [p.id, p]))
    const atual = (draftIds ?? produtos.map(p => p.id)).filter(id => { const p = mapa.get(id); return !!p && produtoVisivel(p) })
    const o = atual.indexOf(String(active.id)), n = atual.indexOf(String(over.id))
    if (o < 0 || n < 0) return
    aplicarNaVisivel(arrayMove(atual, o, n))
  }
  function descartarOrdem() { setDraftIds(null); setShowSaveOrder(false) }
  async function salvarOrdem(destino: 'cliente' | 'interna') {
    if (!draftIds) return
    setReorderSaving(true)
    const mapa = new Map(produtos.map(p => [p.id, p]))
    const campo = destino === 'cliente' ? 'display_order' : 'ordem_interna'
    const mudou = draftIds.map((id, i) => ({ id, i })).filter(x => { const p = mapa.get(x.id); return p && (destino === 'cliente' ? p.display_order !== x.i || p.ordem_interna != null : p.ordem_interna !== x.i) })
    let falhou = false
    for (let k = 0; k < mudou.length; k += 20) {
      const res = await Promise.all(mudou.slice(k, k + 20).map(x =>
        supabase.from('loja_produtos').update(destino === 'cliente' ? { display_order: x.i, ordem_interna: null } : { [campo]: x.i }).eq('id', x.id)))
      if (res.some(r => r.error)) { falhou = true; break }
    }
    setReorderSaving(false)
    if (falhou) { showToast('Não consegui salvar a ordem. Tenta de novo.'); return }
    setProdutos(draftIds.map((id, i) => {
      const p = mapa.get(id)!
      return destino === 'cliente' ? { ...p, display_order: i, ordem_interna: null } : { ...p, ordem_interna: i }
    }).filter(p => p.id))
    setDraftIds(null); setShowSaveOrder(false)
    showToast(destino === 'cliente' ? 'Ordem salva no cardápio do cliente.' : 'Ordem salva só para você, no painel.')
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
    const iTipo = header.indexOf('tipo_vitrine')
    if (iNome === -1) { showToast('O CSV precisa ter uma coluna "nome"'); return }
    const tiposValidos = new Set(tiposVitrine.map(t => t.value))

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
    let updatedCount = 0
    let skippedCount = 0
    let ok = 0
    let cancelled = false
    let localCats = [...categorias]
    let localProdutos = [...produtos]

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
          // Modo "só produtos novos": pula quem já tem o mesmo nome no catálogo
          // ANTES de criar categoria ou baixar foto — não mexe em nada do que existe.
          if (importOnlyNew && localProdutos.some(p => p.name.trim().toLowerCase() === nome.toLowerCase())) {
            skippedCount++
            setImportProgress(p => ({ ...p, done: p.done + 1 }))
            continue
          }
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

          // Modo "atualizar existentes" (ligado pelo usuário): casa por nome
          // (sem diferenciar maiúscula/minúscula) com o que já tá cadastrado
          // pra essa empresa, em vez de criar tudo de novo duplicado — é o
          // que permite reimportar o mesmo CSV depois de um tempo só pra
          // sincronizar preço/descrição/foto, sem virar catálogo duplicado.
          const existing = importUpdateMode ? localProdutos.find(p => p.name.trim().toLowerCase() === nome.toLowerCase()) : null
          const groups = iGrupos >= 0 ? parseGroupsField(r[iGrupos] || '') : []
          // Só aceita valor que bata com um tipo cadastrado (vitrine_tipos) —
          // uma coluna vazia ou um valor que a IA inventou não deve virar
          // "classificação" nenhuma, fica null (mesmo que "— não classificar —"
          // manual).
          const tipoRaw = iTipo >= 0 ? (r[iTipo] || '').trim() : ''
          const tipoVitrine = tipoRaw && tiposValidos.has(tipoRaw) ? tipoRaw : null
          let produtoId: string

          if (existing) {
            const updatePayload: Record<string, any> = { sale_price: iPreco >= 0 ? parsePt(r[iPreco]) : existing.sale_price }
            if (iDesc >= 0 && (r[iDesc] || '').trim()) updatePayload.description = (r[iDesc] || '').trim()
            if (catName) updatePayload.category_id = categoryId
            if (tipoVitrine) updatePayload.tipo_vitrine = tipoVitrine
            if (photoUrl) updatePayload.photo_url = photoUrl // sem foto_url na linha, mantém a foto que já tinha
            const { error: updErr } = await supabase.from('loja_produtos').update(updatePayload).eq('id', existing.id)
            if (updErr) throw new Error(updErr.message)
            produtoId = existing.id
            if (groups.length > 0) await supabase.from('loja_opcoes_grupo').delete().eq('produto_id', produtoId)
            updatedCount++
          } else {
            const { data: prod, error: prodErr } = await supabase.from('loja_produtos').insert({
              company_id: companyId, category_id: categoryId, name: nome,
              description: iDesc >= 0 ? ((r[iDesc] || '').trim() || null) : null,
              photo_url: photoUrl, tipo_vitrine: tipoVitrine,
              cost_price: 0, sale_price: iPreco >= 0 ? parsePt(r[iPreco]) : 0,
              track_stock: false, esgotado: false, active: true, display_order: produtos.length + i,
              import_batch_id: batchId,
            }).select('id').single()
            if (prodErr || !prod) throw new Error(prodErr?.message || 'falha ao criar produto')
            produtoId = prod.id
            localProdutos.push({ id: prod.id, name: nome } as Produto)
            createdCount++
          }

          // Grupos de opcionais só são recriados quando a linha do CSV traz
          // algo em "grupos" — coluna vazia num produto já existente não
          // apaga complementos configurados manualmente por engano.
          if (!existing || groups.length > 0) {
            for (let gi = 0; gi < groups.length; gi++) {
              const g = groups[gi]
              const { data: gData } = await supabase.from('loja_opcoes_grupo').insert({
                produto_id: produtoId, name: g.name, required: g.required, min_select: g.min_select, max_select: g.max_select || 1, pricing_rule: g.pricing_rule, display_order: gi,
              }).select('id').single()
              if (!gData) continue
              if (g.options.length) {
                await supabase.from('loja_opcoes').insert(g.options.map((o, oi) => ({
                  grupo_id: gData.id, name: o.name || 'Opção', price: o.price, display_order: oi,
                })))
              }
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
    setImportResults({ ok, updated: updatedCount, skipped: skippedCount, errors, photoWarnings, cancelled })
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
    const { data } = await supabase
      .from('loja_produtos')
      .select('photo_url, groups:loja_opcoes_grupo(options:loja_opcoes(photo_url))')
      .eq('company_id', companyId).eq('import_batch_id', lastImportBatch.id)
    const paths = (data || []).flatMap(p => [
      storagePathFromUrl(p.photo_url),
      ...(((p.groups as any[]) || []).flatMap(g => (g.options || []).map((o: any) => storagePathFromUrl(o.photo_url)))),
    ]).filter((p): p is string => !!p)
    await supabase.from('loja_produtos').delete().eq('company_id', companyId).eq('import_batch_id', lastImportBatch.id)
    if (paths.length) await supabase.storage.from('loja-produtos').remove(paths)
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
      id: data.id, name: data.name, description: data.description || '', photo_url: data.photo_url || null,
      category_id: data.category_id || '', tipo_vitrine: data.tipo_vitrine || '', cost_price: Number(data.cost_price).toFixed(2).replace('.', ','),
      sale_price: Number(data.sale_price).toFixed(2).replace('.', ','),
      track_stock: data.track_stock, stock_qty: data.stock_qty ?? '', stock_alert_qty: data.stock_alert_qty ?? '',
      restrictDays: !!(data.available_days && data.available_days.length), days: data.available_days || [],
      hasPromo: !!data.promo_type, promo_value: promoDisplayPrice(data), semCashback: !!data.sem_cashback,
      canalDelivery: data.canal_delivery !== false, canalPdv: data.canal_pdv !== false, canalMesa: data.canal_mesa !== false,
      promo_starts_at: data.promo_starts_at ? data.promo_starts_at.slice(0, 10) : '',
      promo_ends_at: data.promo_ends_at ? data.promo_ends_at.slice(0, 10) : '',
      active: data.active,
      groups: [...(data.groups || [])].sort(byDisplayOrder).map((g: any) => ({
        id: g.id, name: g.name, required: g.required, min_select: g.min_select, max_select: g.max_select, pricing_rule: g.pricing_rule || 'soma',
        options: [...(g.options || [])].sort(byDisplayOrder).map((o: any) => ({ id: o.id, name: o.name, price: Number(o.price || 0).toFixed(2).replace('.', ','), max_qty: o.max_qty, linked_produto_id: o.linked_produto_id, photo_url: o.photo_url || null, pausado: !!o.pausado, _photoFile: null })),
      })),
    })
    setPhotoFile(null)
    setView('form')
  }

  // Duplicar o produto inteiro (não só um grupo de opção) — pedido do
  // Ricardo, set/2026: pra criar uma variação de um produto que já existe
  // (ex: mesma pizza noutro tamanho) sem digitar tudo de novo. Carrega os
  // dados completos + grupos/opções no formulário como se fosse um produto
  // NOVO (form.id vazio) — nada é salvo até o lojista revisar e clicar em
  // "Salvar produto", igual o "Duplicar de outro produto" já faz pra grupos.
  async function duplicateProduto(id: string) {
    const { data } = await supabase
      .from('loja_produtos')
      .select('*, groups:loja_opcoes_grupo(*, options:loja_opcoes(*))')
      .eq('id', id).single()
    if (!data) return
    setForm({
      id: '', name: `${data.name} (cópia)`, description: data.description || '', photo_url: data.photo_url || null,
      category_id: data.category_id || '', tipo_vitrine: data.tipo_vitrine || '', cost_price: Number(data.cost_price).toFixed(2).replace('.', ','),
      sale_price: Number(data.sale_price).toFixed(2).replace('.', ','),
      track_stock: data.track_stock, stock_qty: data.stock_qty ?? '', stock_alert_qty: data.stock_alert_qty ?? '',
      restrictDays: !!(data.available_days && data.available_days.length), days: data.available_days || [],
      hasPromo: !!data.promo_type, promo_value: promoDisplayPrice(data), semCashback: !!data.sem_cashback,
      canalDelivery: data.canal_delivery !== false, canalPdv: data.canal_pdv !== false, canalMesa: data.canal_mesa !== false,
      promo_starts_at: data.promo_starts_at ? data.promo_starts_at.slice(0, 10) : '',
      promo_ends_at: data.promo_ends_at ? data.promo_ends_at.slice(0, 10) : '',
      active: data.active,
      groups: [...(data.groups || [])].sort(byDisplayOrder).map((g: any) => ({
        name: g.name, required: g.required, min_select: g.min_select, max_select: g.max_select, pricing_rule: g.pricing_rule || 'soma',
        options: [...(g.options || [])].sort(byDisplayOrder).map((o: any) => ({ name: o.name, price: Number(o.price || 0).toFixed(2).replace('.', ','), max_qty: o.max_qty, linked_produto_id: o.linked_produto_id, photo_url: o.photo_url || null, pausado: !!o.pausado, _photoFile: null })),
      })),
    })
    setPhotoFile(null)
    setView('form')
    showToast(`"${data.name}" duplicado — revisa e toca em "Salvar produto"`)
  }

  function addGroup() { setForm(f => ({ ...f, groups: [...f.groups, { name: '', required: false, min_select: 0, max_select: 1, pricing_rule: 'soma', options: [] }] })) }
  function removeGroup(gi: number) { setForm(f => ({ ...f, groups: f.groups.filter((_, i) => i !== gi) })) }

  function aplicarOrdemGrupos(modo: OrdemGrupos) {
    setOrdemGrupos(modo)
    setForm(f => ({ ...f, groups: ordenarGrupos(f.groups, modo, obrigNoTopo) }))
  }
  function alternarObrigNoTopo() {
    const novo = !obrigNoTopo
    setObrigNoTopo(novo)
    if (ordemGrupos !== 'manual') setForm(f => ({ ...f, groups: ordenarGrupos(f.groups, ordemGrupos, novo) }))
  }
  function moverGrupo(gi: number, dir: -1 | 1) {
    setOrdemGrupos('manual')
    setForm(f => ({ ...f, groups: moverItem(f.groups, gi, dir) }))
  }
  function ordenarOpcoesDoGrupo(gi: number, modo: OrdemOpcoes) {
    setForm(f => ({ ...f, groups: f.groups.map((g, i) => i === gi ? { ...g, options: ordenarOpcoes(g.options, modo) } : g) }))
  }
  // Pausa/volta um complemento em TODOS os produtos da loja que tenham um com o
  // mesmo nome (sem diferenciar maiúscula/minúscula) — na hora, sem precisar
  // salvar o produto. A RLS garante que só o dono (ou admin) altera.
  async function pausarComplemento(gi: number, oi: number) {
    const op = form.groups[gi]?.options[oi]
    if (!op || !op.name.trim() || !companyId) return
    const novo = !op.pausado
    const nome = op.name.trim().toLowerCase()
    const { data, error } = await supabase.rpc('pausar_complemento', { p_company_id: companyId, p_name: op.name, p_pausado: novo })
    if (error) { showToast('Não consegui pausar. Tenta de novo.'); return }
    setForm(f => ({ ...f, groups: f.groups.map(g => ({ ...g, options: g.options.map(o => o.name.trim().toLowerCase() === nome ? { ...o, pausado: novo } : o) })) }))
    // produtos de dentro do próprio formulário ainda não salvos não contam no total do banco
    const total = Number(data) || 0
    showToast(novo
      ? `"${op.name.trim()}" pausado${total > 0 ? ` em ${total} ${total === 1 ? 'lugar' : 'lugares'}` : ''} — some do cardápio até você reativar`
      : `"${op.name.trim()}" voltou${total > 0 ? ` em ${total} ${total === 1 ? 'lugar' : 'lugares'}` : ''}`)
  }
  function moverOpcao(gi: number, oi: number, dir: -1 | 1) {
    setForm(f => ({ ...f, groups: f.groups.map((g, i) => i === gi ? { ...g, options: moverItem(g.options, oi, dir) } : g) }))
  }

  // Copia a ordem dos grupos que está na tela para outros produtos, casando
  // pelo NOME do grupo (sem diferenciar maiúscula/minúscula). Grupo que o outro
  // produto não tem é ignorado; o que ele tem a mais vai pro fim, na ordem de
  // antes. Só mexe em display_order dos grupos — nada de nome, regra ou opção.
  async function aplicarOrdemEmOutros() {
    if (!applySel.length) return
    setApplyBusy(true)
    try {
      const norm = (s: string) => s.trim().toLowerCase()
      const posicao = new Map<string, number>()
      form.groups.forEach((g, i) => { if (!posicao.has(norm(g.name))) posicao.set(norm(g.name), i) })
      let mexidos = 0
      for (const pid of applySel) {
        const { data } = await supabase.from('loja_opcoes_grupo').select('id, name, display_order').eq('produto_id', pid)
        const grupos = [...(data || [])].sort(byDisplayOrder)
        if (grupos.length < 2) continue
        const antes = new Map(grupos.map((g, i) => [g.id, i]))
        const novos = [...grupos].sort((a, b) => {
          const pa = posicao.get(norm(a.name)), pb = posicao.get(norm(b.name))
          if (pa !== undefined && pb !== undefined) return pa - pb
          if (pa !== undefined) return -1
          if (pb !== undefined) return 1
          return antes.get(a.id)! - antes.get(b.id)!
        })
        await Promise.all(novos.map((g, i) => supabase.from('loja_opcoes_grupo').update({ display_order: i }).eq('id', g.id)))
        mexidos++
      }
      setShowApplyOrder(false)
      setApplySel([])
      showToast(`Ordem aplicada em ${mexidos} produto${mexidos === 1 ? '' : 's'}`)
    } catch {
      showToast('Não consegui aplicar a ordem. Tenta de novo.')
    }
    setApplyBusy(false)
  }

  function openDupGroup() { setShowDupGroup(true); setDupSourceId(''); setDupGroups([]) }

  async function loadDupGroups(produtoId: string) {
    setDupSourceId(produtoId)
    setDupGroups([])
    if (!produtoId) return
    setDupLoading(true)
    const { data } = await supabase.from('loja_opcoes_grupo').select('*, options:loja_opcoes(*)').eq('produto_id', produtoId).order('display_order')
    setDupGroups((data || []).map((g: any) => ({
      name: g.name, required: g.required, min_select: g.min_select, max_select: g.max_select, pricing_rule: g.pricing_rule || 'soma',
      options: [...(g.options || [])].sort(byDisplayOrder).map((o: any) => ({ name: o.name, price: Number(o.price || 0).toFixed(2).replace('.', ','), max_qty: o.max_qty, linked_produto_id: o.linked_produto_id, photo_url: o.photo_url || null, pausado: !!o.pausado, _photoFile: null })),
    })))
    setDupLoading(false)
  }

  function copyGroup(g: Grupo) {
    setForm(f => ({ ...f, groups: [...f.groups, { ...g, options: g.options.map(o => ({ ...o })) }] }))
    setShowDupGroup(false)
    showToast(`Grupo "${g.name}" copiado — dá uma revisada e ajusta o que precisar`)
  }

  function openCopyPhoto() { setShowCopyPhoto(true); setCopyPhotoSearch('') }
  // Reaproveita a mesma foto já hospedada (mesma URL, sem duplicar arquivo no
  // Storage) — pedido do Ricardo, set/2026: produtos parecidos (ex: variações
  // do mesmo peixe) não precisam de foto nova cada vez, só aproveitar a que
  // já existe. Salvar nunca apaga a foto antiga do Storage (ver
  // saveProdutoInner), então os dois produtos podem apontar pra mesma URL sem
  // risco de um sumir a foto do outro.
  function applyCopiedPhoto(url: string) {
    setForm(f => ({ ...f, photo_url: url }))
    setPhotoFile(null)
    setShowCopyPhoto(false)
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
    if (company?.mesas_enabled && !form.canalDelivery && !form.canalPdv && !form.canalMesa) { showToast('Escolha pelo menos um lugar onde o produto aparece'); return }
    if (form.hasPromo) {
      const promoNum = parsePt(form.promo_value)
      if (promoNum <= 0) { showToast('Preenche o preço de promoção ou desativa a promoção'); return }
      if (promoNum >= parsePt(form.sale_price)) { showToast('O preço de promoção precisa ser menor que o preço de venda'); return }
    }
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
      const compressed = await compressImage(photoFile, 1.5)
      const { data: up, error: upErr } = await supabase.storage.from('loja-produtos').upload(path, compressed, { upsert: true })
      if (upErr) throw new Error('foto do produto: ' + upErr.message)
      if (up) photoUrl = supabase.storage.from('loja-produtos').getPublicUrl(path).data.publicUrl
    }
    const payload = {
      company_id: companyId,
      category_id: form.category_id || null,
      tipo_vitrine: form.tipo_vitrine || null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      photo_url: photoUrl,
      cost_price: parsePt(form.cost_price),
      sale_price: parsePt(form.sale_price),
      track_stock: form.track_stock,
      stock_qty: form.track_stock ? (parseInt(String(form.stock_qty)) || 0) : null,
      stock_alert_qty: form.track_stock ? (parseInt(String(form.stock_alert_qty)) || null) : null,
      available_days: form.restrictDays && form.days.length ? form.days : null,
      // Lojista digita o preço final de promoção; guarda como desconto fixo
      // (sale_price - preço digitado) pra reaproveitar o mesmo promo_type
      // 'fixed' que promoPrice() já sabe calcular em todo lugar (cardápio,
      // vitrine, IA de atendimento) — sem precisar de coluna nova.
      promo_type: form.hasPromo ? 'fixed' : null,
      promo_value: form.hasPromo ? Number((parsePt(form.sale_price) - parsePt(String(form.promo_value))).toFixed(2)) : null,
      promo_starts_at: form.hasPromo && form.promo_starts_at ? form.promo_starts_at : null,
      promo_ends_at: form.hasPromo && form.promo_ends_at ? form.promo_ends_at : null,
      // Produto em promoção pode ficar de fora do cashback; sem promoção, sempre gera.
      sem_cashback: form.semCashback,
      // Onde o produto aparece: só é controlado quando a loja tem Mesas liberado (PDV + Mesas + Delivery).
      // Sem isso, o produto continua aparecendo em tudo, como sempre foi.
      ...(company?.mesas_enabled ? { canal_delivery: form.canalDelivery, canal_pdv: form.canalPdv, canal_mesa: form.canalMesa } : {}),
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
            const compressed = await compressImage(o._photoFile, 1.5)
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
          grupo_id: gData.id, name: o.name.trim() || 'Opção', price: parsePt(o.price), max_qty: o.max_qty || null, linked_produto_id: o.linked_produto_id || null, photo_url: optPhotoUrl, pausado: !!o.pausado, display_order: oi,
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

  async function deleteProduto(id: string): Promise<boolean> {
    if (!confirm('Excluir esse produto? Não dá pra desfazer.')) return false
    const { data } = await supabase
      .from('loja_produtos')
      .select('photo_url, groups:loja_opcoes_grupo(options:loja_opcoes(photo_url))')
      .eq('id', id).single()
    const paths = [
      storagePathFromUrl(data?.photo_url),
      ...(((data?.groups as any[]) || []).flatMap(g => (g.options || []).map((o: any) => storagePathFromUrl(o.photo_url)))),
    ].filter((p): p is string => !!p)
    await supabase.from('loja_produtos').delete().eq('id', id)
    if (paths.length) await supabase.storage.from('loja-produtos').remove(paths)
    setProdutos(prev => prev.filter(x => x.id !== id))
    return true
  }

  function toggleSelectMode() {
    setSelectMode(v => !v)
    setSelectedIds(new Set())
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`Excluir ${ids.length} produto${ids.length > 1 ? 's' : ''}? Não dá pra desfazer.`)) return
    setBulkActing(true)
    const { data } = await supabase
      .from('loja_produtos')
      .select('id, photo_url, groups:loja_opcoes_grupo(options:loja_opcoes(photo_url))')
      .in('id', ids)
    const paths = ((data as any[]) || []).flatMap(p => [
      storagePathFromUrl(p.photo_url),
      ...((p.groups || []).flatMap((g: any) => (g.options || []).map((o: any) => storagePathFromUrl(o.photo_url)))),
    ]).filter((p): p is string => !!p)
    await supabase.from('loja_produtos').delete().in('id', ids)
    if (paths.length) await supabase.storage.from('loja-produtos').remove(paths)
    setProdutos(prev => prev.filter(x => !selectedIds.has(x.id)))
    showToast(`${ids.length} produto${ids.length > 1 ? 's excluídos' : ' excluído'}`)
    setBulkActing(false)
    exitSelectMode()
  }

  async function bulkSetActive(active: boolean) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkActing(true)
    await supabase.from('loja_produtos').update({ active }).in('id', ids)
    setProdutos(prev => prev.map(x => selectedIds.has(x.id) ? { ...x, active } : x))
    showToast(`${ids.length} produto${ids.length > 1 ? 's' : ''} ${active ? 'reativado' + (ids.length > 1 ? 's' : '') : 'pausado' + (ids.length > 1 ? 's' : '')}`)
    setBulkActing(false)
    exitSelectMode()
  }

  async function bulkSetEsgotado(esgotado: boolean) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkActing(true)
    await supabase.from('loja_produtos').update({ esgotado }).in('id', ids)
    setProdutos(prev => prev.map(x => selectedIds.has(x.id) ? { ...x, esgotado } : x))
    showToast(`${ids.length} produto${ids.length > 1 ? 's' : ''} marcado${ids.length > 1 ? 's' : ''} como ${esgotado ? 'esgotado' : 'disponível'}`)
    setBulkActing(false)
    exitSelectMode()
  }

  async function bulkSetTipoVitrine(tipoVitrine: string) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkActing(true)
    await supabase.from('loja_produtos').update({ tipo_vitrine: tipoVitrine || null }).in('id', ids)
    setProdutos(prev => prev.map(x => selectedIds.has(x.id) ? { ...x, tipo_vitrine: tipoVitrine || null } : x))
    const tipo = tiposVitrine.find(t => t.value === tipoVitrine)
    showToast(`${ids.length} produto${ids.length > 1 ? 's' : ''} classificado${ids.length > 1 ? 's' : ''} como ${tipo ? `${tipo.emoji} ${tipo.label}` : '— não classificar —'}`)
    setBulkActing(false)
    exitSelectMode()
  }

  // "Alterações não salvas": foto da tela de edição de produto. A impressão digital do formulário
  // (sem os arquivos de foto) é guardada quando a tela abre e comparada a cada mudança.
  const snapDe = (f: typeof form, pf: File | null) => JSON.stringify({ ...f, _pf: !!pf, groups: f.groups.map(g => ({ ...g, options: g.options.map(({ _photoFile, ...o }) => ({ ...o, _f: !!_photoFile })) })) })
  useEffect(() => {
    if (view === 'form') { setFormSnap(snapDe(form, photoFile)); setFechados(new Set()) } else setFormSnap('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, form.id])
  const dirty = view === 'form' && formSnap !== '' && snapDe(form, photoFile) !== formSnap

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#AAA' }}>Carregando...</div>

  const searchTerm = search.trim().toLowerCase()
  const mapaProd = new Map(produtos.map(p => [p.id, p]))
  // Produto criado enquanto há ordem não salva (ex.: voltou do cadastro) entra no fim da lista.
  const baseLista = draftIds
    ? [...draftIds.map(id => mapaProd.get(id)).filter((p): p is Produto => !!p), ...produtos.filter(p => !draftIds.includes(p.id))]
    : produtos
  const filtered = baseLista
    .filter(p => filterCat === 'all' || (filterCat === 'sem-foto' ? !p.photo_url : p.category_id === filterCat))
    .filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm))
  const semFotoCount = produtos.filter(p => !p.photo_url).length
  const pctFoto = produtos.length ? Math.round(produtos.filter(p => p.photo_url).length / produtos.length * 100) : 0
  const pctDesc = produtos.length ? Math.round(produtos.filter(p => p.description && p.description.trim()).length / produtos.length * 100) : 0
  const pctPromo = produtos.length ? Math.round(produtos.filter(p => p.promo_type).length / produtos.length * 100) : 0
  const qualidade = produtos.length ? Math.round((pctFoto + pctDesc + pctPromo) / 3) : 0

  return (
    <>
    <div className="cg-wrap">
      <style>{`
        /* Sem tampa de 480px — travava a tela numa coluna de celular mesmo
           em tablet, sobrando margem vazia dos dois lados (achado do
           Ricardo, set/2026, testando no tablet). Fluido até o breakpoint
           de desktop, que troca pra outro layout de qualquer forma. */
        .cg-wrap{ width:100%; max-width:100%; margin:0 auto; min-height:100vh; background:var(--concrete); font-family:'Archivo',sans-serif; font-size:13px; color:var(--ink); padding-bottom:40px; min-width:0; overflow-x:hidden; }
        .cg-import-desktop{ display:none; }
        @media(min-width:768px){
          .cg-wrap{ max-width:none; margin:0; min-height:0; padding-bottom:60px; }
          .cg-head{ padding:28px 32px 16px; position:static; flex-wrap:wrap; }
          .cg-head-actions{ display:flex; align-items:center; gap:8px; }
          .cg-import-desktop{ display:block; position:relative; }
          .cg-import-mobile{ display:none; }
          .cg-body{ padding:0 32px; }
          .cg-list-view .cg-body{ display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:14px; align-content:start; }
          .cg-list-view .cg-search-wrap{ grid-column:1/-1; }
          .cg-list-view .cg-filters{ grid-column:1/-1; }
          .cg-list-view .cg-quality{ grid-column:1/-1; }
          .cg-list-view .cg-empty-msg{ grid-column:1/-1; }
          .cg-row{ flex-direction:column; align-items:stretch; gap:0; border:1px solid #B9AE97; border-radius:14px; padding:0; overflow:hidden; background:#fff; position:relative; }
          .cg-row .cg-photo{ width:100%; height:130px; border-radius:0; font-size:34px; }
          .cg-row .cg-mid{ padding:12px 14px 4px; }
          .cg-row-actions{ padding:0 14px 12px; }
          .cg-row .cg-checkbox{ position:absolute; top:8px; left:8px; z-index:2; background:#fff; box-shadow:0 1px 6px rgba(0,0,0,.2); }
          .cg-fab{ right:32px; }
          .cg-form-view .cg-body{ max-width:640px; margin:0 auto; padding:0 32px; }
          /* Cabeçalho do form de produto continua fixo no desktop também —
             a regra geral de ".cg-head" acima trava em position:static a
             partir daqui, então precisa reafirmar sticky com uma seletor
             mais específico (pedido do Ricardo, set/2026: Salvar/Cancelar
             sempre visíveis, não só lá embaixo do formulário). */
          .cg-head.cg-head-centered{ position:sticky; top:0; z-index:5; }
        }
        .cg-head{ padding:22px 16px 14px; display:flex; align-items:center; gap:10px; background:#F7F5F0; position:sticky; top:0; z-index:5; flex-wrap:wrap; }
        .cg-head h1{ min-width:80px; }
        .cg-head-actions{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .cg-head h1{ font-size:18px; margin:0; flex:1; font-weight:800; }
        /* Cabeçalho do form de produto: Salvar/Cancelar centralizados na
           barra (não encostados num canto) — 3 colunas (voltar+título |
           botões | vazio), a 3ª coluna equilibra o peso da 1ª pra o grupo
           ficar centralizado de verdade. Só nesse cabeçalho (classe extra
           .cg-head-centered) — lista e cadastro rápido continuam com o
           layout de sempre. Mockup aprovado, set/2026.
           minmax(0,1fr) em vez de só "1fr": sem isso, no iPhone (achado
           real do Ricardo, set/2026) a barra toda sumia — as colunas de
           1fr não aceitavam ficar menor que o conteúdo (título + botões),
           a grade toda "estourava" mais larga que a tela, e o
           overflow-x:hidden do .cg-wrap recortava a barra inteira em vez
           de só a sobra. Com minmax(0,1fr) a coluna do título pode
           encolher até truncar (title já tem ellipsis) e a barra nunca
           mais passa da largura da tela. */
        .cg-head.cg-head-centered{ display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); }
        .cg-head-left{ display:flex; align-items:center; gap:10px; min-width:0; }
        .cg-head-left h1{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cg-head-center{ display:flex; gap:6px; justify-content:center; flex-wrap:wrap; }
        .cg-btn-sm{ padding:8px 13px; font-size:12px; }
        .cg-back{ width:32px;height:32px;border-radius:50%;border:1px solid #B9AE97;background:#fff;font-size:15px;cursor:pointer; }
        .cg-body{ padding:0 16px; }
        .cg-btn{ padding:10px 18px;border-radius:10px;border:none;font-weight:800;font-size:13px;cursor:pointer; }
        .cg-btn-gold{ background:var(--sign);color:var(--ink); }
        .cg-btn-ghost{ background:#fff;border:1px solid #B9AE97;color:#1A1610; }
        .cg-fab{ position:fixed; right:calc(50% - 240px + 16px); bottom:24px; width:50px;height:50px;border-radius:50%;background:var(--sign);color:var(--ink);border:none;font-size:24px;font-weight:800;box-shadow:0 8px 18px -6px rgba(0,0,0,.35);cursor:pointer; }
        /* No mobile ele ficava meio escondido embaixo da barra de navegação
           fixa (.es-tabbar, ~60px de altura) — centraliza e sobe pra cima
           dela (Ricardo, set/2026). */
        @media(max-width:520px){ .cg-fab{ left:50%; right:auto; transform:translateX(-50%); bottom:calc(74px + env(safe-area-inset-bottom)); } }
        .cg-search-wrap{ margin-bottom:10px; }
        .cg-search{ width:100%;padding:10px 14px;border-radius:10px;border:1px solid #B9AE97;background:#fff;font-size:13px;font-family:inherit;box-sizing:border-box; }
        .cg-quality{ display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #B9AE97;border-radius:14px;padding:14px;margin-bottom:14px; }
        .cg-quality-num{ font-family:'Anton',sans-serif;font-size:30px;color:var(--sign-dark);letter-spacing:1px;line-height:1;flex:none; }
        .cg-quality-mid{ flex:1;min-width:0; }
        .cg-quality-title{ font-size:12px;font-weight:800;margin-bottom:6px; }
        .cg-quality-bar{ height:6px;background:#F0EDE8;border-radius:3px;overflow:hidden;margin-bottom:6px; }
        .cg-quality-fill{ height:100%;background:var(--sign-dark);border-radius:3px; }
        .cg-quality-sub{ font-size:10.5px;color:#A79E8B; }
        .cg-filters{ display:flex; gap:6px; overflow-x:auto; padding-bottom:10px; }
        .cg-chip{ flex:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:20px;border:1px solid #B9AE97;background:#fff;color:#6E6656;cursor:pointer; }
        .cg-chip.active{ background:var(--ink);color:var(--sign);border-color:var(--ink); }
        .cg-row{ display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #B9AE97;cursor:pointer;position:relative; }
        .cg-row.selecting{ cursor:default; }
        .cg-row.selected{ background:#FBF1DC; }
        @media(min-width:768px){ .cg-row.selected{ outline:2px solid var(--sign); outline-offset:-2px; } }
        .cg-checkbox{ flex:none;width:24px;height:24px;border-radius:7px;border:2px solid #D8CFBB;background:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#fff;cursor:pointer; }
        .cg-checkbox.on{ background:var(--ink);border-color:var(--ink); }
        .cg-photo{ width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#FBF1DC,#FCFAF5);display:flex;align-items:center;justify-content:center;font-size:20px;flex:none;overflow:hidden; }
        .cg-photo img{ width:100%;height:100%;object-fit:cover; }
        .cg-mid{ flex:1;min-width:0; }
        .cg-row-actions{ display:flex;gap:8px;flex:none; }
        .cg-btn-danger{ background:#FBEAEA;border-color:#F3C6C6; }
        .cg-icon-btn{ width:38px;height:38px;border-radius:10px;border:1.5px solid #B9AE97;background:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;cursor:pointer;flex:none;color:#1A1610;line-height:1; }
        .cg-icon-btn.esgotar{ border-color:#F3C6C6;color:#C43D3D;font-weight:900; }
        .cg-icon-btn.esgotar.on{ background:#C43D3D;border-color:#C43D3D;color:#fff; }
        .cg-icon-btn.pausar.on-pause{ color:#8A6410; }
        .cg-icon-btn.pausar.on-play{ background:#E4F3EC;border-color:#BFE3D2;color:#157A52; }
        .cg-icon-btn.duplicar{ font-size:15px; }
        .cg-icon-btn.excluir{ background:#FBEAEA;border-color:#F3C6C6;color:#C43D3D; }
        .cg-name{ font-weight:700;font-size:12.5px; }
        .cg-cat{ font-size:10.5px;color:#A79E8B; }
        .cg-price{ font-size:12px;font-weight:800;margin-top:2px; }
        .cg-badge{ font-size:9px;font-weight:800;padding:2px 6px;border-radius:6px;margin-left:6px; }
        .cg-badge.on{ background:#E4F3EC;color:#157A52; }
        .cg-badge.off{ background:#FCFAF5;color:#A79E8B;border:1px solid #B9AE97; }
        .cg-field{ margin-bottom:12px; }
        .cg-field label{ display:block;font-size:10.5px;font-weight:700;color:#6E6656;margin-bottom:5px; }
        .cg-field input, .cg-field select, .cg-field textarea{ width:100%;padding:9px 11px;border-radius:9px;border:1px solid #B9AE97;background:#fff;font-size:12.5px;font-family:inherit;color:#1A1610; }
        .cg-row2{ display:grid;grid-template-columns:1fr 1fr;gap:10px; }
        .cg-row3{ display:grid;grid-template-columns:repeat(4,1fr);gap:10px;align-items:start; }
        @media(max-width:560px){ .cg-row3{ grid-template-columns:1fr 1fr; } }
        .cg-field.cb .cb-box{ box-sizing:border-box;width:100%;display:flex;align-items:center;gap:8px;padding:6.5px 11px;border:1px solid #B9AE97;border-radius:9px;background:#fff;cursor:pointer;white-space:nowrap;font-size:12.5px;font-weight:600;color:#1A1610; }
        .cg-field.promo input{ border-color:#D6392B;background:#FDF5F4; }
        .cg-field.promo label{ display:flex;align-items:center;gap:6px; }
        .cg-field.promo .tag{ font-size:8.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#fff;background:#D6392B;padding:1px 6px;border-radius:99px; }
        .cg-margin{ font-size:11px;font-weight:700;color:#157A52;margin:-6px 0 12px; }
        .cg-canais{ margin:4px 0 14px;padding:10px 12px;border:1.5px solid #B9AE97;border-radius:12px;background:#FCFAF5; }
        .cg-canais label{ display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6F6C67;margin-bottom:8px; }
        .cg-canais .row{ display:flex;gap:8px;flex-wrap:wrap; }
        .cg-canais button{ min-height:42px;padding:0 14px;border-radius:10px;border:1.5px solid #B9AE97;background:#fff;font-weight:700;cursor:pointer;font-size:13px; }
        .cg-canais button.on{ background:#151210;color:#FFC531;border-color:#151210; }
        .cg-swrow{ display:flex;align-items:center;gap:10px;padding:8px 0; }
        .cg-switch{ width:36px;height:20px;border-radius:11px;background:#B9AE97;position:relative;cursor:pointer;flex:none; }
        .cg-switch.on{ background:#157A52; }
        .cg-switch .k{ position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s; }
        .cg-switch.on .k{ left:18px; }
        .cg-daychip{ width:32px;height:32px;border-radius:9px;border:1px solid #B9AE97;background:#fff;color:#6E6656;font-size:10.5px;font-weight:800;cursor:pointer;margin-right:6px; }
        .cg-daychip.active{ background:var(--sign);color:var(--ink);border-color:var(--sign); }
        .cg-subbox{ display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;padding:10px;background:#FCFAF5;border:1px dashed #B9AE97;border-radius:10px; }
        .cg-group{ border:1px solid #B9AE97;border-radius:12px;padding:12px;margin-bottom:10px;background:#fff; }
        .cg-group-top{ display:flex;align-items:center;gap:8px;margin-bottom:8px; }
        .cg-group-top input{ flex:1;padding:7px 10px;border-radius:8px;border:1px solid #B9AE97;font-size:12px;font-family:inherit; }
        .cg-del{ width:26px;height:26px;border-radius:7px;border:none;background:#FBEAEA;color:#C43D3D;cursor:pointer;flex:none; }
        .cg-rule{ display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;font-size:11px;color:#6E6656; }
        .cg-rule input{ width:38px;padding:5px;text-align:center;border-radius:6px;border:1px solid #B9AE97;font-family:inherit; }
        .cg-rule-cobrar{ display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:11px;color:#6E6656; }
        .cg-rule-cobrar select{ flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid #B9AE97;font-family:inherit;font-size:11px; }
        .cg-opt{ border:1px solid #B9AE97;border-radius:9px;padding:8px;margin-bottom:6px;background:#FCFAF5; }
        .cg-opt-top{ display:flex;gap:8px;align-items:center;margin-bottom:6px; }
        .cg-opt-photo{ flex:none;width:36px;height:36px;border-radius:8px;background:#fff;border:1px solid #B9AE97;display:flex;align-items:center;justify-content:center;font-size:14px;color:#A79E8B;overflow:hidden;cursor:pointer; }
        .cg-opt-photo img{ width:100%;height:100%;object-fit:cover; }
        .cg-opt-name{ flex:1;min-width:0;padding:7px 9px;border-radius:7px;border:1px solid #B9AE97;font-size:12px;font-family:inherit;box-sizing:border-box; }
        .cg-opt-fields{ display:grid;grid-template-columns:1fr 1fr;gap:8px; }
        .cg-opt-field-full{ grid-column:1/-1; }
        .cg-opt-field label{ display:block;font-size:10px;font-weight:700;color:#6E6656;margin-bottom:4px; }
        .cg-opt-field input, .cg-opt-field select{ width:100%;padding:7px 9px;border-radius:7px;border:1px solid #B9AE97;font-size:11.5px;font-family:inherit;box-sizing:border-box; }
        .cg-org{ border:1px solid #B9AE97;border-radius:12px;padding:12px;margin-bottom:10px;background:#FCFAF5; }
        .cg-org-lbl{ font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6E6656;margin-bottom:6px; }
        .cg-org-seg{ display:flex;flex-wrap:wrap;gap:6px; }
        .cg-org-seg button{ border:1.5px solid #B9AE97;background:#fff;border-radius:9px;padding:8px 11px;min-height:38px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;color:#1A1610; }
        .cg-org-seg button.on{ background:#1A1610;color:#fff;border-color:#1A1610; }
        .cg-org-row{ display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:12px; }
        .cg-org-row label{ display:flex;align-items:center;gap:6px;cursor:pointer; }
        .cg-org-link{ background:none;border:0;text-decoration:underline;font-weight:700;font-size:12px;cursor:pointer;padding:6px 2px;color:#1A1610;font-family:inherit; }
        .cg-org-hint{ font-size:11px;color:#6E6656;margin-top:6px; }
        .cg-pos{ flex:none;width:20px;text-align:center;font-weight:800;color:#A79E8B;font-size:13px; }
        .cg-tipo{ flex:none;font-size:10px;font-weight:700;border-radius:99px;padding:3px 8px;white-space:nowrap; }
        .cg-tipo.free{ background:#E3F3EA;color:#0F8A57; } .cg-tipo.paid{ background:#FFF1D6;color:#A56500; } .cg-tipo.mixed{ background:#E6EEF8;color:#2A4E7A; }
        .cg-mv{ flex:none;display:inline-flex;flex-direction:column;gap:2px; }
        .cg-mv button{ width:28px;height:20px;border:1px solid #B9AE97;background:#fff;border-radius:5px;font-size:9px;line-height:1;cursor:pointer;padding:0;color:#1A1610; }
        .cg-mv button:disabled{ opacity:.3;cursor:default; }
        .cg-opt.paused{ background:#F3EFE6; }
        .cg-opt.paused .cg-opt-name{ text-decoration:line-through;color:#8A8372; }
        .cg-pause{ flex:none;border:1px solid #B9AE97;background:#fff;color:#1A1610;border-radius:7px;padding:0 9px;height:26px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap; }
        .cg-pause.on{ background:#FFF1D6;color:#A56500;border-color:#A56500; }
        .cg-ord{ margin-bottom:12px;border:1px solid #B9AE97;border-radius:12px;background:#FCFAF5;padding:10px 12px;display:grid;gap:6px; }
        .cg-ord-chips{ display:flex;flex-wrap:wrap;gap:6px;align-items:center; }
        .cg-ord-lbl{ font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6E6656;margin-right:2px; }
        .cg-ord-chips > button{ border:1.5px solid #B9AE97;background:#fff;border-radius:9px;padding:8px 11px;min-height:38px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;color:#1A1610; }
        .cg-ord-chips > button:hover{ background:#FBF1DC; }
        .cg-ord-save{ margin-left:auto;display:inline-flex;gap:6px;align-items:center; }
        .cg-ord-save button{ border-radius:9px;padding:8px 14px;min-height:38px;font-size:12px;font-weight:800;font-family:inherit;border:1.5px solid transparent; }
        .cg-ord-undo{ background:#fff;border-color:#B9AE97 !important;color:#1A1610;cursor:pointer; }
        .cg-save-ord{ background:#E3E1DA;color:#8A8372;cursor:not-allowed; }
        .cg-save-ord.on{ background:#0F8A57;color:#fff;cursor:pointer; }
        .cg-ord-hint{ margin:0;font-size:11.5px;color:#6E6656; }
        .cg-ord-opt{ text-align:left;display:grid;gap:3px;padding:12px 14px;border-radius:12px;border:1.5px solid #B9AE97;background:#fff;cursor:pointer;font-family:inherit;color:#1A1610; }
        .cg-ord-opt:hover{ background:#FBF1DC; }
        .cg-ord-opt b{ font-size:13.5px; } .cg-ord-opt span{ font-size:12px;color:#6E6656;line-height:1.35; }
        .cg-sortitem{ min-width:0;display:flex;flex-direction:column; }
        .cg-sortitem > .cg-row{ flex:1; }
        .cg-rowhandle{ flex:none;width:28px;height:36px;border:none;background:transparent;color:#A79E8B;font-size:18px;line-height:1;cursor:grab;touch-action:none;border-radius:6px; }
        .cg-rowhandle:active{ cursor:grabbing;background:#F0EDE8; }
        @media(min-width:768px){ .cg-row .cg-rowhandle{ position:absolute;top:8px;right:8px;z-index:2;width:32px;height:32px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.2); } }
        .cg-add-inline{ font-size:11px;font-weight:700;color:#8A6410;background:#FBF1DC;border:1px dashed #B9AE97;border-radius:8px;padding:7px;width:100%;cursor:pointer;margin-top:4px; }
        .cg-add-group{ width:100%;padding:10px;border-radius:10px;border:1.5px dashed #B9AE97;background:transparent;color:#A79E8B;font-weight:700;font-size:12px;cursor:pointer; }
        .cg-import-menu{ position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid #DDD5C4;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.1);z-index:10;overflow:hidden; }
        .cg-import-menu button{ display:block;width:100%;text-align:left;padding:11px 14px;border:0;border-bottom:1px solid #F0EDE8;background:#fff;color:#1A1610;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit; }
        .cg-import-menu button:last-child{ border-bottom:0; }
        .cg-import-menu button:hover{ background:#FBF1DC; }
        .cg-savebar{ position:sticky;bottom:0;padding:12px 0 6px;background:#F7F5F0;display:flex;gap:8px; }
        .cg-savebar .cg-btn{ flex:1; }
        .cg-toast{ position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--sign);padding:11px 18px;border-radius:10px;font-size:12.5px;font-weight:700;z-index:99; }
        .cg-selbar{ position:sticky;top:0;z-index:20;background:var(--ink);color:#fff;border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap; }
        @media(min-width:768px){ .cg-selbar{ grid-column:1/-1; top:0; } }
        .cg-selbar-count{ font-size:12.5px;font-weight:800;color:var(--sign);flex:1;min-width:120px; }
        .cg-selbar-btn{ display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap; }
        .cg-selbar-btn:disabled{ opacity:.4;cursor:default; }
        .cg-selbar-btn.danger{ background:#C43D3D;border-color:#C43D3D; }
        .cg-selbar-btn.cancel{ background:transparent;border-color:transparent;color:#C9BFA6; }
        .cg-selbar-select{ padding:8px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap; }
        .cg-selbar-select:disabled{ opacity:.4;cursor:default; }
        .cg-selbar-select option{ color:#151210; }
        .cg-photo-input{ display:flex;align-items:center;gap:12px;margin-bottom:14px; }
        .cg-photo-big{ width:64px;height:64px;border-radius:12px;background:linear-gradient(135deg,#FBF1DC,#FCFAF5);display:flex;align-items:center;justify-content:center;font-size:26px;overflow:hidden;flex:none; }
        .cg-photo-big img{ width:100%;height:100%;object-fit:cover; }
        .cg-photo-lightbox{ position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out; }
        .cg-photo-lightbox img{ max-width:100%;max-height:100%;border-radius:12px;object-fit:contain;cursor:default; }
        .cg-cat-overlay{ position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60;display:flex;align-items:flex-end;justify-content:center; }
        .cg-cat-modal{ background:#F7F5F0;width:100%;max-width:480px;max-height:80vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden; }
        @media(min-width:768px){
          .cg-cat-overlay{ align-items:center;padding:24px; }
          .cg-cat-modal{ border-radius:16px;max-height:min(640px,85vh); }
        }
        .cg-cat-modal-head{ padding:16px;border-bottom:1px solid #DDD5C4;display:flex;justify-content:space-between;align-items:center;background:#fff; }
        .cg-close{ width:28px;height:28px;border-radius:50%;border:1px solid #B9AE97;background:#fff;cursor:pointer; }
        .cg-cat-modal-body{ flex:1;overflow-y:auto;padding:6px 16px; }
        .cg-cat-row{ display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #DDD5C4; }
        .cg-cat-row input{ flex:1;min-width:0;padding:7px 10px;border-radius:8px;border:1px solid #B9AE97;font-size:12.5px;font-family:inherit; }
        .cg-cat-row-name{ flex:1;min-width:0;font-weight:700;font-size:12.5px; }
        .cg-cat-row-count{ font-size:10.5px;color:#A79E8B;flex:none;white-space:nowrap; }
        .cg-copy-photo-thumb{ width:36px;height:36px;border-radius:8px;overflow:hidden;flex:none;background:#F0EDE8; }
        .cg-copy-photo-thumb img{ width:100%;height:100%;object-fit:cover; }
        .cg-drag-handle{ flex:none;width:26px;height:26px;border:none;background:transparent;color:#A79E8B;font-size:16px;line-height:1;cursor:grab;touch-action:none;border-radius:6px; }
        .cg-drag-handle:active{ cursor:grabbing;background:#F0EDE8; }
        .cg-cat-modal-foot{ padding:12px 16px 16px;border-top:1px solid #DDD5C4;background:#fff;display:flex;gap:8px; }
        .cg-cat-modal-foot input{ flex:1;min-width:0;padding:9px 11px;border-radius:9px;border:1px solid #B9AE97;font-size:12.5px;font-family:inherit; }
        .cg-bulk-hint{ font-size:11.5px;color:#A79E8B;margin-bottom:12px;line-height:1.5; }
        .cg-bulk-row{ border:1px solid #B9AE97;border-radius:10px;padding:8px;margin-bottom:8px;background:#fff; }
        .cg-bulk-name{ width:100%;padding:8px 10px;border-radius:8px;border:1px solid #B9AE97;font-size:12.5px;font-family:inherit;margin-bottom:6px;box-sizing:border-box; }
        .cg-bulk-line2{ display:flex;gap:6px; }
        .cg-bulk-line2 select{ flex:1.4;min-width:0;padding:7px 6px;border-radius:8px;border:1px solid #B9AE97;font-size:11.5px;font-family:inherit; }
        .cg-bulk-price{ flex:1;min-width:0;padding:7px 8px;border-radius:8px;border:1px solid #B9AE97;font-size:11.5px;font-family:inherit; }
        /* ===== Editar produto (redesenho, nov/2026) — classes pf-* ===== */
        .pf{ --pf-ink:#151210; --pf-line:#C2BEB0; --pf-line2:#D9D5C8; --pf-mut:#5E5B56; --pf-ok:#0B5B38; --pf-okbg:#DDF1E7; --pf-bad:#B3261A; }
        .pf *{ box-sizing:border-box; }
        .pf{ background:#D5D1C5; min-height:100vh; }
        .cg-wrap:has(.pf){ background:#D5D1C5; }
        .pf-head.cg-head.cg-head-centered{ box-shadow:0 1px 0 rgba(21,18,16,.12); display:flex; align-items:center; gap:12px; flex-wrap:nowrap; padding:12px 16px; background:#fff; border-bottom:1px solid var(--pf-line); }
        @media(min-width:768px){ .pf-head.cg-head.cg-head-centered{ padding:14px 32px; min-height:76px; } }
        .pf-title{ display:flex; flex-direction:column; gap:1px; min-width:0; }
        .pf-title h1{ margin:0; flex:none; font-size:19px; font-weight:800; letter-spacing:-.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; max-width:46vw; }
        @media(min-width:768px){ .pf-title h1{ font-size:22px; max-width:34vw; } }
        .pf-eyebrow{ font-size:11px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--pf-mut); }
        .pf-grow{ flex:1; min-width:0; }
        .pf-badge{ display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 10px; border-radius:12px; font-size:12px; font-weight:700; white-space:nowrap; flex:none; }
        .pf-badge i{ width:7px; height:7px; border-radius:50%; background:currentColor; }
        .pf-badge.ok{ background:var(--pf-okbg); color:var(--pf-ok); }
        .pf-badge.off{ background:#ECEDE8; color:#3D3A36; }
        @media(max-width:560px){ .pf-badge{ display:none; } }
        .pf-dirty{ display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:#6B4A00; white-space:nowrap; }
        .pf-dirty i{ width:8px; height:8px; border-radius:50%; background:#E0A100; }
        @media(max-width:1000px){ .pf-dirty{ font-size:0; gap:0; } .pf-dirty i{ width:10px; height:10px; } }
        .pf-btn{ display:inline-flex; align-items:center; justify-content:center; gap:8px; height:42px; padding:0 18px; border-radius:8px; border:1px solid #807C70; background:#fff; color:var(--pf-ink); font:inherit; font-size:14px; font-weight:600; cursor:pointer; white-space:nowrap; }
        .pf-btn:hover:not(:disabled){ background:#F5F6F2; }
        .pf-btn.pri{ background:var(--sign,#FFC531); border-color:var(--pf-ink); font-weight:700; }
        .pf-btn.pri:hover:not(:disabled){ background:#F5B800; }
        .pf-btn.sm{ height:36px; padding:0 12px; font-size:13px; }
        .pf-btn.dng{ color:var(--pf-bad); border-color:#E7B7B2; }
        .pf-btn:disabled{ opacity:.55; cursor:default; }
        .pf-btn:focus-visible,.pf-ib:focus-visible,.pf-chip:focus-visible,.pf-day:focus-visible,.pf-link:focus-visible{ outline:2px solid var(--pf-ink); outline-offset:2px; }
        .pf-ib{ display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:8px; border:1px solid transparent; background:transparent; color:#4A453F; cursor:pointer; padding:0; flex:none; }
        .pf-ib:hover:not(:disabled){ background:#F5F6F2; border-color:var(--pf-line); }
        .pf-ib:disabled{ opacity:.3; cursor:default; }
        .pf-ib.dng{ color:var(--pf-bad); }
        .pf-ib.ok{ color:var(--pf-ok); }
        .pf-back{ width:40px; height:40px; border-color:var(--pf-line); }
        .pf-link{ border:0; background:transparent; padding:0; font:inherit; font-size:13px; font-weight:600; color:#7A5400; cursor:pointer; text-decoration:none; }
        .pf-link:hover{ text-decoration:underline; }
        .pf-only-m{ display:none; }
        @media(max-width:767px){ .pf-only-d{ display:none !important; } .pf-only-m{ display:grid; } }

        .pf-grid{ display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:20px; align-items:start; padding:20px 32px 40px; }
        .pf-main,.pf-side{ display:flex; flex-direction:column; gap:20px; min-width:0; }
        @media(max-width:1180px){
          .pf-grid{ grid-template-columns:minmax(0,1fr); gap:14px; padding:14px 16px 90px; }
          .pf-main,.pf-side{ display:contents; }
          .pf-o1{order:1} .pf-o2{order:2} .pf-o3{order:3} .pf-o4{order:4} .pf-o5{order:5} .pf-o6{order:6} .pf-o7{order:7} .pf-o9{order:9}
        }
        .pf-card{ background:#fff; border:1px solid #9C988B; border-radius:12px; min-width:0; overflow:hidden; box-shadow:0 1px 0 rgba(21,18,16,.08),0 10px 22px -12px rgba(21,18,16,.35); }
        .pf-card-h{ display:flex; align-items:center; justify-content:space-between; gap:14px; padding:15px 20px; border-bottom:1px solid var(--pf-line); background:#EDEADF; }
        .pf-card-h h2{ margin:0; font-size:15.5px; font-weight:800; color:var(--pf-ink); }
        .pf-card-h p{ margin:2px 0 0; font-size:12.5px; color:#4A453F; }
        .pf-card-h.pf-wrap{ flex-wrap:wrap; }
        .pf-hl{ display:flex; align-items:center; gap:10px; min-width:0; }
        .pf-actions{ display:flex; gap:8px; flex-wrap:wrap; }
        .pf-card-b{ padding:20px; }
        @media(max-width:560px){ .pf-card-h{ padding:13px 14px; } .pf-card-b{ padding:14px; } }
        .pf-stack{ display:flex; flex-direction:column; gap:18px; }
        .pf-g2{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 20px; }
        .pf-g2.tight{ gap:10px; }
        .pf-span2{ grid-column:1 / -1; }
        .pf-g4{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px 20px; align-items:end; }
        .pf-g2b{ display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:16px; align-items:start; }
        @media(max-width:900px){ .pf-g4{ grid-template-columns:repeat(2,minmax(0,1fr)); } .pf-g2b{ grid-template-columns:minmax(0,1fr); } }
        @media(max-width:480px){ .pf-g2:not(.tight){ grid-template-columns:minmax(0,1fr); } .pf-g2.tight{ grid-template-columns:minmax(0,1fr); } }
        .pf-lab{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; font-size:12px; font-weight:600; color:#3D3A36; }
        .pf-count{ font-size:12px; font-weight:500; color:var(--pf-mut); font-variant-numeric:tabular-nums; }
        .pf-opt{ font-weight:500; color:var(--pf-mut); }
        .pf-inp{ width:100%; height:42px; border:1px solid #807C70; border-radius:8px; padding:0 12px; font:inherit; font-size:14px; color:var(--pf-ink); background:#fff; }
        .pf-inp:focus{ outline:2px solid var(--sign,#FFC531); border-color:var(--pf-ink); }
        .pf-inp.sm{ height:38px; font-size:13.5px; padding:0 10px; }
        .pf-inp:disabled{ background:#F5F6F2; color:#6F6C67; border-color:var(--pf-line); }
        .pf-inp.pf-ta,textarea.pf-inp{ height:92px; padding:10px 12px; resize:vertical; line-height:1.45; }
        .pf-inp.pf-num{ width:68px; text-align:center; }
        .pf-tab{ font-variant-numeric:tabular-nums; }
        select.pf-inp{ padding-right:8px; }
        @media(max-width:767px){ .pf-inp{ font-size:16px; height:46px; } .pf-inp.sm{ height:44px; font-size:15px; } }
        .pf-money{ position:relative; }
        .pf-money > span{ position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:13.5px; font-weight:600; color:var(--pf-mut); pointer-events:none; }
        .pf-money .pf-inp{ padding-left:38px; font-variant-numeric:tabular-nums; }
        .pf-money.sm > span{ left:10px; font-size:12.5px; }
        .pf-money.sm .pf-inp{ padding-left:32px; }
        .pf-inline{ display:flex; gap:8px; margin-top:8px; }
        .pf-pill{ display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:11px; font-size:11.5px; font-weight:700; background:#ECEDE8; color:#3D3A36; white-space:nowrap; flex:none; }
        .pf-pill.ok{ background:var(--pf-okbg); color:var(--pf-ok); }
        .pf-pill.warn{ background:#FFF1C9; color:#6B4A00; }
        .pf-margin{ min-height:42px; border-radius:8px; background:#F5F6F2; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:0 14px; font-size:12.5px; font-weight:600; color:var(--pf-mut); line-height:1.2; }
        .pf-margin small{ display:block; font-size:11.5px; font-weight:500; opacity:.9; }
        .pf-margin b{ font-family:'Anton',sans-serif; font-weight:400; font-size:26px; line-height:1; font-variant-numeric:tabular-nums; }
        .pf-margin.ok{ background:var(--pf-okbg); color:var(--pf-ok); }
        .pf-margin.bad{ background:#FBEAEA; color:var(--pf-bad); }
        .pf-err{ font-size:12.5px; font-weight:600; color:var(--pf-bad); margin-top:8px; }
        .pf-box{ border:1px solid var(--pf-line); border-radius:10px; padding:14px 16px; background:#F3F1E8; display:flex; flex-direction:column; gap:14px; }
        .pf-rowsw{ display:flex; align-items:flex-start; gap:12px; }
        .pf-rowsw.tight{ align-items:center; height:38px; }
        .pf-rowsw b{ display:block; font-size:14px; font-weight:600; }
        .pf-rowsw small{ display:block; font-size:12.5px; color:var(--pf-mut); margin-top:1px; }
        .pf-sw{ position:relative; display:inline-block; width:40px; height:24px; flex:none; }
        .pf-sw input{ appearance:none; -webkit-appearance:none; position:absolute; inset:0; margin:0; border-radius:12px; background:#8B8A84; cursor:pointer; }
        .pf-sw input:checked{ background:#0B7347; }
        .pf-sw input::after{ content:''; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%; background:#fff; transition:left .15s; }
        .pf-sw input:checked::after{ left:19px; }
        .pf-sw input:focus-visible{ outline:2px solid var(--pf-ink); outline-offset:2px; }
        .pf-sep{ border-top:1px solid var(--pf-line2); }
        .pf-mb8{ margin-bottom:8px; }
        .pf-chips{ display:flex; gap:8px; flex-wrap:wrap; }
        .pf-chip{ display:inline-flex; align-items:center; justify-content:center; gap:6px; height:36px; padding:0 14px; border-radius:8px; border:1px solid #807C70; background:#fff; color:var(--pf-ink); font:inherit; font-size:13px; font-weight:600; cursor:pointer; }
        .pf-chip.on{ background:var(--pf-ink); border-color:var(--pf-ink); color:#fff; }
        @media(max-width:767px){ .pf-chip{ flex:1; height:44px; } }
        .pf-days{ display:flex; gap:6px; flex-wrap:wrap; }
        .pf-day{ display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; border:1px solid #807C70; background:#fff; font:inherit; font-size:12.5px; font-weight:700; color:var(--pf-ink); cursor:pointer; padding:0; }
        .pf-day.on{ background:var(--sign,#FFC531); border-color:var(--pf-ink); }
        .pf-stock{ border-radius:8px; padding:10px 14px; font-size:13px; font-weight:700; }
        .pf-stock.ok{ background:var(--pf-okbg); color:var(--pf-ok); }
        .pf-stock.warn{ background:#FFF1C9; color:#6B4A00; }
        .pf-stock.bad{ background:#FBEAEA; color:var(--pf-bad); }
        .pf-hint{ margin:0; font-size:12.5px; color:var(--pf-mut); }
        .pf-photo-big{ display:block; width:100%; aspect-ratio:1 / 1; border-radius:10px; border:1px dashed #807C70; background:#F5F6F2; padding:0; overflow:hidden; cursor:default; color:var(--pf-mut); }
        .pf-photo-big.has{ border-style:solid; cursor:zoom-in; }
        .pf-photo-big img{ width:100%; height:100%; object-fit:cover; display:block; }
        .pf-photo-big > span{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; height:100%; font-size:13px; font-weight:600; }
        .pf-photo-big:focus-visible{ outline:2px solid var(--pf-ink); outline-offset:2px; }
        .pf-prev{ display:flex; gap:14px; padding:12px; border:1px solid var(--pf-line2); border-radius:10px; background:#F3F1E8; }
        .pf-prev-t{ flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
        .pf-prev-t b{ font-size:14.5px; }
        .pf-prev-t > span{ font-size:12.5px; color:var(--pf-mut); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .pf-prev-p{ display:flex; align-items:baseline; gap:8px; margin-top:4px; }
        .pf-prev-p strong{ font-family:'Anton',sans-serif; font-weight:400; font-size:22px; line-height:1; color:var(--pf-ok); font-variant-numeric:tabular-nums; }
        .pf-prev-p s{ font-size:13px; color:#6F6C67; }
        .pf-prev-img{ width:84px; height:84px; border-radius:8px; background:#ECEDE8; flex:none; overflow:hidden; display:flex; align-items:center; justify-content:center; color:var(--pf-mut); }
        .pf-prev-img img{ width:100%; height:100%; object-fit:cover; }

        .pf-empty{ padding:18px; border:1px dashed #807C70; border-radius:10px; font-size:13.5px; color:var(--pf-mut); text-align:center; }
        .pf-org{ display:flex; align-items:center; gap:10px 14px; flex-wrap:wrap; padding:10px 12px; border:1px solid var(--pf-line2); border-radius:10px; background:#F3F1E8; }
        .pf-seg{ display:inline-flex; flex-wrap:wrap; border:1px solid #807C70; border-radius:8px; overflow:hidden; background:#fff; }
        .pf-seg button{ height:34px; padding:0 12px; border:0; border-right:1px solid var(--pf-line); background:#fff; font:inherit; font-size:12.5px; font-weight:600; color:var(--pf-ink); cursor:pointer; }
        .pf-seg button:last-child{ border-right:0; }
        .pf-seg button.on{ background:var(--pf-ink); color:#fff; }
        .pf-chk{ display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; }
        .pf-chk input{ width:16px; height:16px; accent-color:var(--pf-ink); }
        .pf-grp{ border:1px solid var(--pf-line); border-radius:10px; background:#fff; overflow:hidden; }
        .pf-grp-h{ display:flex; align-items:center; gap:10px; padding:10px 12px; background:#F3F1E8; }
        .pf-pos{ display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:var(--pf-ink); color:#fff; font-size:12.5px; font-weight:700; flex:none; }
        .pf-grp-name{ max-width:300px; font-weight:700 !important; }
        .pf-grp-sum{ display:flex; flex-direction:column; align-items:flex-start; gap:1px; border:0; background:transparent; padding:0; font:inherit; text-align:left; cursor:pointer; min-width:0; }
        .pf-grp-sum b{ font-size:14.5px; }
        .pf-grp-sum span{ font-size:12.5px; color:var(--pf-mut); }
        @media(max-width:700px){ .pf-hide-s{ display:none !important; } .pf-grp-h{ flex-wrap:wrap; } .pf-grp-name{ max-width:none; flex:1 1 140px; } }
        .pf-rules{ display:flex; align-items:flex-end; gap:14px 20px; flex-wrap:wrap; padding:14px; border-top:1px solid var(--pf-line2); border-bottom:1px solid var(--pf-line2); }
        .pf-f{ display:flex; flex-direction:column; gap:5px; }
        .pf-f > span{ font-size:11.5px; font-weight:600; color:#4A453F; }
        .pf-f.wide{ min-width:210px; flex:1 1 210px; max-width:300px; }
        .pf-opts{ display:flex; flex-direction:column; }
        .pf-orow{ display:grid; grid-template-columns:26px 44px minmax(120px,1.4fr) 120px 110px minmax(150px,1fr) 80px; gap:10px; align-items:center; padding:8px 12px; border-bottom:1px solid var(--pf-line2); }
        .pf-ohead{ padding-top:8px; padding-bottom:8px; background:#F3F1E8; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--pf-mut); }
        .pf-orow.paused .pf-c-nm input{ color:#6F6C67; text-decoration:line-through; background:#F5F6F2; }
        .pf-mlab{ display:none; font-size:11.5px; font-weight:600; color:#4A453F; margin-bottom:4px; }
        .pf-mv{ display:flex; flex-direction:column; gap:2px; }
        .pf-mv button{ width:22px; height:18px; border:0; border-radius:4px; background:transparent; color:#6F6C67; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; }
        .pf-mv button:hover:not(:disabled){ background:#ECEDE8; }
        .pf-mv button:disabled{ opacity:.25; cursor:default; }
        .pf-thumb{ width:44px; height:44px; border-radius:8px; background:#F5F6F2; border:1px dashed #807C70; display:inline-flex; align-items:center; justify-content:center; color:#6F6C67; cursor:pointer; overflow:hidden; flex:none; }
        .pf-thumb.has{ border-style:solid; }
        .pf-thumb img{ width:100%; height:100%; object-fit:cover; }
        .pf-c-ac{ display:flex; justify-content:flex-end; gap:2px; }
        .pf-grp-f{ padding:10px 12px; }
        @media(max-width:900px){
          .pf-ohead{ display:none; }
          .pf-orow{ display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px; padding:12px; }
          .pf-mv{ display:none; }
          .pf-thumb{ order:1; }
          .pf-c-nm{ order:2; flex:1 1 140px; min-width:0; align-self:center; }
          .pf-c-ac{ order:3; align-self:center; }
          .pf-c-pr{ order:4; flex:1 1 120px; }
          .pf-c-mx{ order:5; flex:1 1 110px; }
          .pf-c-lk{ order:6; flex:1 1 100%; }
          .pf-mlab{ display:block; }
        }
        .pf-foot{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:4px 0; }
        .pf-foot-r{ display:flex; gap:10px; }
        .pf-mbar{ position:sticky; bottom:0; z-index:6; grid-template-columns:1fr 1.6fr; gap:10px; padding:12px 16px calc(14px + env(safe-area-inset-bottom)); background:#fff; border-top:1px solid var(--pf-line); }
        .pf-mbar .pf-btn{ height:46px; font-size:15px; }
        @media(min-width:768px){ .pf-mbar{ display:none; } }
      `}</style>

      {view === 'list' && (
        <div className="cg-list-view">
          <div className="cg-head">
            <a href={isAdminMode ? `/painel/compartilhar?empresa=${company?.id}` : '/painel/compartilhar'} className="cg-back" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#1A1610' }}>‹</a>
            <h1>Catálogo</h1>
            <div className="cg-head-actions">
              <button className={`cg-btn-ghost ${selectMode ? 'cg-btn-danger' : ''}`} style={{ padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }} onClick={toggleSelectMode}>
                {selectMode ? '✕ Cancelar' : '☑️ Selecionar'}
              </button>
              <button className="cg-btn-ghost" style={{ padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700 }} onClick={() => setShowCatManager(true)}>🏷️ Categorias</button>
              {/* No desktop o "Importar" sai da faixa gigante acima da lista e
                  vem pra cá, do lado de Categorias — é ação de setup, não
                  precisa de destaque toda vez que a tela abre. No mobile
                  continua no lugar de sempre (cg-import-mobile abaixo). */}
              <div className="cg-import-desktop">
                <button className="cg-btn-ghost" style={{ padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700 }} onClick={() => setShowImportMenu(v => !v)}>📥 Importar ▾</button>
                {showImportMenu && (
                  <div className="cg-import-menu" style={{ right: 0, left: 'auto', minWidth: 280 }}>
                    <button onClick={() => { setShowImportMenu(false); openImportIA() }}>🤖 Importar cardápio com IA — link, PDF ou fotos</button>
                    <button onClick={() => { setShowImportMenu(false); openBulk() }}>⚡ Cadastro rápido — vários produtos de uma vez</button>
                    <button onClick={() => { setShowImportMenu(false); setShowImportCsv(true); setImportResults(null); setImportUpdateMode(false) }}>📥 Importar de um CSV</button>
                    <button onClick={() => { setShowImportMenu(false); setShowImportPhotos(true); setPhotoImportResults(null) }}>🖼️ Importar fotos pelo nome do produto</button>
                  </div>
                )}
              </div>
            </div>
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
            <div className="cg-search-wrap">
              <input className="cg-search" placeholder="Buscar produto pelo nome..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="cg-filters">
              <button className={`cg-chip ${filterCat === 'all' ? 'active' : ''}`} onClick={() => setFilterCat('all')}>Tudo</button>
              {semFotoCount > 0 && (
                <button className={`cg-chip ${filterCat === 'sem-foto' ? 'active' : ''}`} onClick={() => setFilterCat('sem-foto')}>📷 Sem foto ({semFotoCount})</button>
              )}
              {categorias.map(c => (
                <button key={c.id} className={`cg-chip ${filterCat === c.id ? 'active' : ''}`} onClick={() => setFilterCat(c.id)}>{c.name}</button>
              ))}
            </div>
            {/* No mobile o "Importar" continua aqui, faixa única (era 3
                antes) — ação de setup, feita uma vez (ESPECIFICACAO.md
                §10.8, §12 #12). No desktop essa faixa some: o botão
                equivalente foi pro cabeçalho, do lado de Categorias. */}
            <div className="cg-import-wrap cg-import-mobile" style={{ position: 'relative', marginBottom: 14 }}>
              <button className="cg-add-group" onClick={() => setShowImportMenu(v => !v)}>Importar ▾</button>
              {showImportMenu && (
                <div className="cg-import-menu">
                  <button onClick={() => { setShowImportMenu(false); openImportIA() }}>🤖 Importar cardápio com IA — link, PDF ou fotos</button>
                  <button onClick={() => { setShowImportMenu(false); openBulk() }}>⚡ Cadastro rápido — vários produtos de uma vez</button>
                  <button onClick={() => { setShowImportMenu(false); setShowImportCsv(true); setImportResults(null); setImportUpdateMode(false) }}>📥 Importar de um CSV</button>
                  <button onClick={() => { setShowImportMenu(false); setShowImportPhotos(true); setPhotoImportResults(null) }}>🖼️ Importar fotos pelo nome do produto</button>
                </div>
              )}
            </div>
            {produtos.length > 1 && (() => {
              const sujo = !!draftIds && draftIds.some((id, i) => produtos[i]?.id !== id)
              const nVis = produtos.filter(produtoVisivel).length
              return (
                <div className="cg-ord">
                  <div className="cg-ord-chips" role="group" aria-label="Ordenar produtos">
                    <span className="cg-ord-lbl">Ordenar:</span>
                    <button onClick={() => ordenarProdutos('az')}>A → Z</button>
                    <button onClick={() => ordenarProdutos('za')}>Z → A</button>
                    <button onClick={() => ordenarProdutos('menor')}>Menor preço</button>
                    <button onClick={() => ordenarProdutos('maior')}>Maior preço</button>
                    <button onClick={() => ordenarProdutos('promo')}>Promoções primeiro</button>
                    <button onClick={() => ordenarProdutos('foto')}>Com foto primeiro</button>
                    <button onClick={() => ordenarProdutos('categoria')}>Pela ordem das categorias</button>
                    <span className="cg-ord-save">
                      {sujo && <button className="cg-ord-undo" onClick={descartarOrdem} disabled={reorderSaving}>Desfazer</button>}
                      <button className={`cg-save-ord ${sujo ? 'on' : ''}`} disabled={!sujo || reorderSaving} onClick={() => setShowSaveOrder(true)}>Salvar ordem</button>
                    </span>
                  </div>
                  <p className="cg-ord-hint">Ou arraste um produto pelo ⠿ para a posição que quiser.{nVis < produtos.length ? ` Com o filtro ligado, só os ${nVis} visíveis trocam de lugar entre si.` : ''}</p>
                </div>
              )
            })()}
            {selectMode && (
              <div className="cg-selbar">
                <span className="cg-selbar-count">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
                <button className="cg-selbar-btn" disabled={selectedIds.size === 0} onClick={() => setSelectedIds(new Set(filtered.map(p => p.id)))}>Selecionar tudo</button>
                <button className="cg-selbar-btn" disabled={selectedIds.size === 0 || bulkActing} onClick={() => bulkSetActive(false)}>⏸ Pausar</button>
                <button className="cg-selbar-btn" disabled={selectedIds.size === 0 || bulkActing} onClick={() => bulkSetEsgotado(true)}>✕ Esgotar</button>
                <select
                  className="cg-selbar-select"
                  disabled={selectedIds.size === 0 || bulkActing}
                  value="__placeholder__"
                  onChange={e => bulkSetTipoVitrine(e.target.value === '__clear__' ? '' : e.target.value)}
                >
                  <option value="__placeholder__" disabled>🏷️ Tipo do produto...</option>
                  <option value="__clear__">— não classificar —</option>
                  {tiposVitrine.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                </select>
                <button className="cg-selbar-btn danger" disabled={selectedIds.size === 0 || bulkActing} onClick={bulkDelete}>🗑 Excluir</button>
                <button className="cg-selbar-btn cancel" onClick={exitSelectMode}>Cancelar</button>
              </div>
            )}
            {filtered.length === 0 && (
              <div className="cg-empty-msg" style={{ textAlign: 'center', color: '#A79E8B', padding: '40px 0', fontSize: 12.5 }}>
                {searchTerm ? `Nenhum produto encontrado pra "${search.trim()}".` : 'Nenhum produto ainda. Toca no + pra criar o primeiro.'}
              </div>
            )}
            <DndContext sensors={catSensors} collisionDetection={closestCenter} onDragEnd={handleDragEndProd}>
            <SortableContext items={filtered.map(p => p.id)} strategy={rectSortingStrategy}>
            {filtered.map(p => (
              <SortableProdItem key={p.id} id={p.id} disabled={selectMode}>
              {handle => (
              <div
                className={`cg-row ${selectMode ? 'selecting' : ''} ${selectedIds.has(p.id) ? 'selected' : ''}`}
                onClick={() => selectMode ? toggleSelected(p.id) : openEdit(p.id)}
              >
                {!selectMode && <button type="button" className="cg-rowhandle" {...handle} onClick={e => e.stopPropagation()} aria-label={`Arrastar ${p.name} para outra posição`}>⠿</button>}
                {selectMode && (
                  <span className={`cg-checkbox ${selectedIds.has(p.id) ? 'on' : ''}`} onClick={e => { e.stopPropagation(); toggleSelected(p.id) }}>{selectedIds.has(p.id) ? '✓' : ''}</span>
                )}
                <div className="cg-photo">{p.photo_url ? <img src={p.photo_url} alt="" /> : '🍽️'}</div>
                <div className="cg-mid">
                  <div className="cg-name">{p.name}</div>
                  <div className="cg-cat">{p.category?.name || 'Sem categoria'}{p.available_days ? ' · dias limitados' : ''}</div>
                  <div className="cg-price">
                    {(() => {
                      const promo = promoPriceOf(p)
                      return promo != null ? (
                        <>
                          <span style={{ textDecoration: 'line-through', color: '#A79E8B', fontWeight: 600, marginRight: 6 }}>{fmt(Number(p.sale_price))}</span>
                          <span style={{ color: '#D6392B' }}>{fmt(promo)}</span>
                          <span className="cg-badge" style={{ background: '#D6392B', color: '#fff' }}>promoção</span>
                        </>
                      ) : fmt(Number(p.sale_price))
                    })()}
                    {p.active ? (
                      // Sem custo cadastrado não dá pra saber a margem de verdade — mostrar
                      // "100% margem" nesse caso seria um dado falso, não um dado ausente.
                      Number(p.cost_price) > 0 && <span className="cg-badge on">{margin(Number(p.cost_price), Number(p.sale_price))}% margem</span>
                    ) : (
                      <span className="cg-badge off">pausado</span>
                    )}
                    {p.esgotado && <span className="cg-badge off" style={{ background: '#FBEAEA', color: '#C43D3D' }}>esgotado hoje</span>}
                  </div>
                </div>
                {!selectMode && (
                  <div className="cg-row-actions">
                    <button className={`cg-icon-btn esgotar ${p.esgotado ? 'on' : ''}`} title={p.esgotado ? 'Esgotado hoje — toca pra voltar' : 'Marcar esgotado hoje'} onClick={e => { e.stopPropagation(); toggleEsgotado(p) }}>✕</button>
                    <button className={`cg-icon-btn pausar ${p.active ? 'on-pause' : 'on-play'}`} title={p.active ? 'Pausar produto' : 'Produto pausado — toca pra reativar'} onClick={e => { e.stopPropagation(); toggleActive(p) }}>{p.active ? '⏸' : '▶'}</button>
                    <button className="cg-icon-btn duplicar" title="Duplicar produto" onClick={e => { e.stopPropagation(); duplicateProduto(p.id) }}>⧉</button>
                    <button className="cg-icon-btn excluir" title="Excluir produto" onClick={e => { e.stopPropagation(); deleteProduto(p.id) }}>🗑</button>
                  </div>
                )}
              </div>
              )}
              </SortableProdItem>
            ))}
            </SortableContext>
            </DndContext>
          </div>
          <button className="cg-fab" onClick={openNew}>+</button>
        </div>
      )}

      {view === 'form' && (() => {
        const venda = parsePt(form.sale_price)
        const custo = parsePt(form.cost_price)
        const promo = parsePt(form.promo_value)
        const promoValida = form.hasPromo && promo > 0 && promo < venda
        const precoEfetivo = promoValida ? promo : venda
        const margemOk = custo > 0 && precoEfetivo > 0
        const lucro = precoEfetivo - custo
        const qtdEstoque = parseInt(String(form.stock_qty)) || 0
        const alertaEstoque = parseInt(String(form.stock_alert_qty)) || 0
        const fotoSrc = fotoPreview || form.photo_url
        const nenhumCanal = !form.canalDelivery && !form.canalPdv && !form.canalMesa
        const voltar = () => { if (dirty && !confirm('Descartar as alterações deste produto?')) return; setView('list') }
        const toggleGrp = (gi: number) => setFechados(s0 => { const n = new Set(s0); if (n.has(gi)) n.delete(gi); else n.add(gi); return n })
        const moveGrp = (gi: number, dir: -1 | 1) => {
          moverGrupo(gi, dir)
          setFechados(s0 => { const n = new Set<number>(); s0.forEach(i => n.add(i === gi ? gi + dir : i === gi + dir ? gi : i)); return n })
        }
        const delGrp = (gi: number) => {
          removeGroup(gi)
          setFechados(s0 => { const n = new Set<number>(); s0.forEach(i => { if (i < gi) n.add(i); else if (i > gi) n.add(i - 1) }); return n })
        }
        const excluirDoForm = async () => { if (form.id && await deleteProduto(form.id)) setView('list') }
        const resumoGrupo = (g: Grupo) => `${g.required ? 'Obrigatório' : 'Opcional'} · ${g.max_select > 0 ? `até ${g.max_select}` : 'sem limite'} · ${g.options.length} ${g.options.length === 1 ? 'opção' : 'opções'}`
        return (
        <div className="cg-form-view pf">
          <div className="cg-head cg-head-centered pf-head">
            <button type="button" className="pf-ib pf-back" aria-label="Voltar para o catálogo" onClick={voltar}><Ico d={ICO.back} size={18} sw={2.2} /></button>
            <div className="pf-title">
              <span className="pf-eyebrow">{form.id ? 'Editar produto' : 'Novo produto'}</span>
              <h1>{form.name.trim() || 'Produto sem nome'}</h1>
            </div>
            <span className={`pf-badge ${form.active ? 'ok' : 'off'}`}><i />{form.active ? 'Ativo no cardápio' : 'Pausado'}</span>
            <div className="pf-grow" />
            {dirty && <span className="pf-dirty"><i />Alterações não salvas</span>}
            <button type="button" className="pf-btn pf-only-d" onClick={voltar}>Cancelar</button>
            <button type="button" className="pf-btn pri pf-only-d" disabled={savingProd} onClick={saveProduto}><Ico d={ICO.check} size={16} sw={2.4} />{savingProd ? 'Salvando...' : 'Salvar produto'}</button>
          </div>

          <div className="pf-grid">
            <div className="pf-main">

              {/* Informações */}
              <section className="pf-card pf-o2">
                <div className="pf-card-h"><div><h2>Informações</h2><p>O que o cliente lê antes de pedir.</p></div></div>
                <div className="pf-card-b pf-g2">
                  <div className="pf-span2">
                    <label className="pf-lab" htmlFor="pf-nome">Nome do produto</label>
                    <input id="pf-nome" className="pf-inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="pf-lab" htmlFor="pf-cat"><span>Categoria</span>{!showNewCat && <button type="button" className="pf-link" onClick={() => setShowNewCat(true)}>+ Nova categoria</button>}</label>
                    <select id="pf-cat" className="pf-inp" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                      <option value="">Sem categoria</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {showNewCat && (
                      <div className="pf-inline">
                        <input className="pf-inp" aria-label="Nome da nova categoria" placeholder="Nome da categoria" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                        <button type="button" className="pf-btn pri" onClick={addCategoria}>OK</button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="pf-lab" htmlFor="pf-tipo"><span>Tipo na home</span></label>
                    <select id="pf-tipo" className="pf-inp" value={form.tipo_vitrine} onChange={e => setForm(f => ({ ...f, tipo_vitrine: e.target.value }))}>
                      <option value="">— não classificar —</option>
                      {tiposVitrine.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                    </select>
                  </div>
                  <div className="pf-span2">
                    <label className="pf-lab" htmlFor="pf-desc"><span>Descrição</span><span className="pf-count">{form.description.length} / 240</span></label>
                    <textarea id="pf-desc" className="pf-inp pf-ta" maxLength={240} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                </div>
              </section>

              {/* Preços */}
              <section className="pf-card pf-o3">
                <div className="pf-card-h"><div><h2>Preços</h2><p>A margem é calculada na hora, só você vê.</p></div></div>
                <div className="pf-card-b pf-stack">
                  <div className="pf-g4">
                    <div>
                      <label className="pf-lab" htmlFor="pf-custo">Preço de custo</label>
                      <div className="pf-money"><span>R$</span><input id="pf-custo" className="pf-inp" inputMode="decimal" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} /></div>
                    </div>
                    <div>
                      <label className="pf-lab" htmlFor="pf-venda">Preço de venda</label>
                      <div className="pf-money"><span>R$</span><input id="pf-venda" className="pf-inp" inputMode="decimal" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} /></div>
                    </div>
                    <div>
                      <label className="pf-lab" htmlFor="pf-promo"><span>Preço promocional</span>{form.hasPromo && <span className="pf-pill warn">ativa</span>}</label>
                      <div className="pf-money"><span>R$</span><input id="pf-promo" className="pf-inp" inputMode="decimal" placeholder="0,00" disabled={!form.hasPromo} value={form.promo_value} onChange={e => setForm(f => ({ ...f, promo_value: e.target.value }))} /></div>
                    </div>
                    <div className={`pf-margin ${margemOk ? (lucro >= 0 ? 'ok' : 'bad') : ''}`}>
                      {margemOk ? (
                        <><span>{promoValida ? 'Margem na promoção' : 'Margem'}<small>{lucro >= 0 ? 'lucro' : 'prejuízo'} de {fmt(Math.abs(lucro))}</small></span><b>{margin(custo, precoEfetivo)}%</b></>
                      ) : (
                        <span>Informe o custo para ver a margem</span>
                      )}
                    </div>
                  </div>
                  {form.hasPromo && promo > 0 && promo >= venda && <div className="pf-err">O preço promocional precisa ser menor que o preço de venda.</div>}

                  <div className="pf-g2b">
                    <div className="pf-box">
                      <div className="pf-rowsw">
                        <PfSwitch checked={form.hasPromo} onChange={v => setForm(f => ({ ...f, hasPromo: v }))} label="Promoção ativa" />
                        <div><b>Promoção ativa</b><small>Aparece com o preço antigo riscado no cardápio.</small></div>
                      </div>
                      {form.hasPromo && (
                        <div className="pf-g2">
                          <div><label className="pf-lab" htmlFor="pf-ini">Início <span className="pf-opt">opcional</span></label><input id="pf-ini" className="pf-inp sm" type="date" value={form.promo_starts_at} onChange={e => setForm(f => ({ ...f, promo_starts_at: e.target.value }))} /></div>
                          <div><label className="pf-lab" htmlFor="pf-fim">Fim <span className="pf-opt">opcional</span></label><input id="pf-fim" className="pf-inp sm" type="date" value={form.promo_ends_at} onChange={e => setForm(f => ({ ...f, promo_ends_at: e.target.value }))} /></div>
                        </div>
                      )}
                    </div>
                    <div className="pf-box">
                      <div className="pf-rowsw">
                        <PfSwitch checked={form.semCashback} onChange={v => setForm(f => ({ ...f, semCashback: v }))} label="Não gerar cashback" />
                        <div><b>Não gerar cashback</b><small>O cliente não ganha cashback ao comprar este produto.</small></div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Opções e complementos */}
              <section className="pf-card pf-o6">
                <div className="pf-card-h pf-wrap">
                  <div className="pf-hl"><div><h2>Opções e complementos</h2><p>Molhos, acompanhamentos, tamanhos, meio a meio…</p></div>{form.groups.length > 0 && <span className="pf-pill">{form.groups.length} {form.groups.length === 1 ? 'grupo' : 'grupos'}</span>}</div>
                  <div className="pf-actions">
                    <button type="button" className="pf-btn sm" onClick={openDupGroup}><Ico d={ICO.copy} size={15} />Copiar de outro produto</button>
                    <button type="button" className="pf-btn sm pri" onClick={addGroup}><Ico d={ICO.plus} size={15} sw={2.4} />Novo grupo</button>
                  </div>
                </div>
                <div className="pf-card-b pf-stack">
                  {form.groups.length === 0 && (
                    <div className="pf-empty">Este produto não tem opções. Use <b>Novo grupo</b> para criar molhos, tamanhos ou acompanhamentos.</div>
                  )}
                  {form.groups.length > 1 && (
                    <div className="pf-org">
                      <span className="pf-eyebrow">Ordem dos grupos</span>
                      <div className="pf-seg">
                        {([['free', 'Gratuitos primeiro'], ['paid', 'Pagos primeiro'], ['asc', 'Menor preço'], ['desc', 'Maior preço']] as [OrdemGrupos, string][]).map(([m, label]) => (
                          <button key={m} type="button" className={ordemGrupos === m ? 'on' : ''} onClick={() => { aplicarOrdemGrupos(m); setFechados(new Set()) }}>{label}</button>
                        ))}
                      </div>
                      <label className="pf-chk"><input type="checkbox" checked={obrigNoTopo} onChange={alternarObrigNoTopo} />Obrigatórios sempre no topo</label>
                      <div className="pf-grow" />
                      {form.groups.some(g => g.name.trim()) && <button type="button" className="pf-link" onClick={() => { setApplySel([]); setShowApplyOrder(true) }}>Aplicar esta ordem em outros produtos…</button>}
                      <button type="button" className="pf-link" onClick={() => setFechados(fechados.size ? new Set() : new Set(form.groups.map((_, i) => i)))}>{fechados.size ? 'Expandir todos' : 'Recolher todos'}</button>
                    </div>
                  )}

                  {form.groups.map((g, gi) => {
                    const fechado = fechados.has(gi)
                    const tipo = grupoTipo(g)
                    return (
                      <div className="pf-grp" key={gi}>
                        <div className="pf-grp-h">
                          <span className="pf-pos">{gi + 1}</span>
                          {fechado ? (
                            <button type="button" className="pf-grp-sum" onClick={() => toggleGrp(gi)} aria-expanded="false">
                              <b>{g.name.trim() || 'Grupo sem nome'}</b>
                              <span>{resumoGrupo(g)}</span>
                            </button>
                          ) : (
                            <input className="pf-inp sm pf-grp-name" placeholder="Nome do grupo (ex: Molho, Tamanho…)" aria-label="Nome do grupo" value={g.name} onChange={e => updateGroup(gi, { name: e.target.value })} />
                          )}
                          {!fechado && <span className={`pf-pill ${g.required ? 'ok' : ''}`}>{g.required ? 'Obrigatório' : 'Opcional'}</span>}
                          {g.options.length > 0 && <span className={`pf-pill ${tipo === 'mixed' ? 'warn' : ''} pf-hide-s`}>{tipo === 'free' ? 'Grátis' : tipo === 'paid' ? 'Pago' : 'Grátis + pago'}</span>}
                          {!fechado && <span className="pf-count pf-hide-s">{g.options.length} {g.options.length === 1 ? 'opção' : 'opções'}</span>}
                          <div className="pf-grow" />
                          {form.groups.length > 1 && (
                            <>
                              <button type="button" className="pf-ib" aria-label="Subir grupo" disabled={gi === 0} onClick={() => moveGrp(gi, -1)}><Ico d={ICO.up} size={16} sw={2.2} /></button>
                              <button type="button" className="pf-ib" aria-label="Descer grupo" disabled={gi === form.groups.length - 1} onClick={() => moveGrp(gi, 1)}><Ico d={ICO.down} size={16} sw={2.2} /></button>
                            </>
                          )}
                          <button type="button" className="pf-ib" aria-label={fechado ? 'Expandir grupo' : 'Recolher grupo'} aria-expanded={!fechado} onClick={() => toggleGrp(gi)}><Ico d={fechado ? ICO.down : ICO.up} size={16} sw={2.2} /></button>
                          <button type="button" className="pf-ib dng" aria-label="Excluir grupo" onClick={() => delGrp(gi)}><Ico d={ICO.trash} size={16} /></button>
                        </div>

                        {!fechado && (
                          <>
                            <div className="pf-rules">
                              <div className="pf-f"><span>Cliente precisa escolher</span>
                                <div className="pf-rowsw tight"><PfSwitch checked={g.required} onChange={v => updateGroup(gi, { required: v })} label="Obrigatório" /><b>{g.required ? 'Sim' : 'Não'}</b></div>
                              </div>
                              <div className="pf-f"><span>Mínimo</span><input className="pf-inp sm pf-num" inputMode="numeric" aria-label="Mínimo" value={g.min_select} onChange={e => updateGroup(gi, { min_select: +e.target.value || 0 })} /></div>
                              <div className="pf-f"><span>Máximo</span><input className="pf-inp sm pf-num" inputMode="numeric" aria-label="Máximo" value={g.max_select} onChange={e => updateGroup(gi, { max_select: +e.target.value || 0 })} /></div>
                              <div className="pf-f wide"><span>Como cobrar</span>
                                <select className="pf-inp sm" aria-label="Como cobrar" value={g.pricing_rule} onChange={e => updateGroup(gi, { pricing_rule: e.target.value as any })}>
                                  <option value="soma">Soma dos itens escolhidos</option>
                                  <option value="maior_valor">O mais caro (ex: pizza meio a meio)</option>
                                </select>
                              </div>
                              {g.options.length > 1 && (
                                <div className="pf-f wide"><span>Ordenar opções</span>
                                  <select className="pf-inp sm" aria-label="Ordenar opções" value="" onChange={e => { if (e.target.value) ordenarOpcoesDoGrupo(gi, e.target.value as OrdemOpcoes) }}>
                                    <option value="">Escolher (ou use as setas)…</option>
                                    <option value="az">A → Z</option>
                                    <option value="asc">Menor preço</option>
                                    <option value="desc">Maior preço</option>
                                    <option value="free">Gratuitas primeiro</option>
                                    <option value="paid">Pagas primeiro</option>
                                  </select>
                                </div>
                              )}
                            </div>

                            {g.options.length > 0 && (
                              <div className="pf-opts">
                                <div className="pf-orow pf-ohead" aria-hidden="true">
                                  <span /><span /><span>Nome da opção</span><span>Preço</span><span>Máx. por pedido</span><span>Vincular a produto</span><span />
                                </div>
                                {g.options.map((o, oi) => (
                                  <div className={`pf-orow${o.pausado ? ' paused' : ''}`} key={oi}>
                                    <span className="pf-mv">
                                      {g.options.length > 1 && (
                                        <>
                                          <button type="button" aria-label="Subir opção" disabled={oi === 0} onClick={() => moverOpcao(gi, oi, -1)}><Ico d={ICO.up} size={13} sw={2.4} /></button>
                                          <button type="button" aria-label="Descer opção" disabled={oi === g.options.length - 1} onClick={() => moverOpcao(gi, oi, 1)}><Ico d={ICO.down} size={13} sw={2.4} /></button>
                                        </>
                                      )}
                                    </span>
                                    <label className={`pf-thumb${o._photoFile || o.photo_url ? ' has' : ''}`} title="Foto da opção">
                                      {o._photoFile ? <img src={URL.createObjectURL(o._photoFile)} alt="" /> : o.photo_url ? <img src={o.photo_url} alt="" /> : <Ico d={ICO.plus} size={16} sw={2} />}
                                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => updateOption(gi, oi, { _photoFile: e.target.files?.[0] || null })} />
                                    </label>
                                    <div className="pf-c-nm"><input className="pf-inp sm" aria-label="Nome da opção" placeholder="Nome da opção" value={o.name} onChange={e => updateOption(gi, oi, { name: e.target.value })} /></div>
                                    <div className="pf-c-pr"><span className="pf-mlab">Preço</span><div className="pf-money sm"><span>R$</span><input className="pf-inp sm" inputMode="decimal" aria-label="Preço da opção" value={o.price} onChange={e => updateOption(gi, oi, { price: e.target.value })} /></div></div>
                                    <div className="pf-c-mx"><span className="pf-mlab">Máx. por pedido</span><input className="pf-inp sm" inputMode="numeric" aria-label="Quantidade máxima desta opção" placeholder="Sem limite" value={o.max_qty ?? ''} onChange={e => updateOption(gi, oi, { max_qty: +e.target.value || null })} /></div>
                                    <div className="pf-c-lk"><span className="pf-mlab">Vincular a produto</span>
                                      <select className="pf-inp sm" aria-label="Vincular a um produto do catálogo" value={o.linked_produto_id || ''} onChange={e => updateOption(gi, oi, { linked_produto_id: e.target.value || null })}>
                                        <option value="">Nenhum — opção avulsa</option>
                                        {produtos.filter(p => p.id !== form.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                      </select>
                                    </div>
                                    <div className="pf-c-ac">
                                      <button type="button" className={`pf-ib${o.pausado ? ' ok' : ''}`} aria-label={o.pausado ? 'Voltar a vender esta opção' : 'Pausar esta opção em todos os produtos'} title="Pausa este complemento em todos os produtos que tiverem ele" onClick={() => pausarComplemento(gi, oi)}><Ico d={o.pausado ? ICO.play : ICO.pause} size={16} sw={2.2} /></button>
                                      <button type="button" className="pf-ib dng" aria-label="Excluir opção" onClick={() => removeOption(gi, oi)}><Ico d={ICO.trash} size={16} /></button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="pf-grp-f"><button type="button" className="pf-btn sm" onClick={() => addOption(gi)}><Ico d={ICO.plus} size={15} sw={2.4} />Adicionar opção</button></div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              <div className="pf-foot pf-o9">
                {form.id ? <button type="button" className="pf-btn dng" onClick={excluirDoForm}><Ico d={ICO.trash} size={16} />Excluir produto</button> : <span />}
                <div className="pf-only-d pf-foot-r">
                  <button type="button" className="pf-btn" onClick={voltar}>Cancelar</button>
                  <button type="button" className="pf-btn pri" disabled={savingProd} onClick={saveProduto}>{savingProd ? 'Salvando...' : 'Salvar produto'}</button>
                </div>
              </div>
            </div>

            <aside className="pf-side">
              {/* Foto */}
              <section className="pf-card pf-o1">
                <div className="pf-card-h"><h2>Foto</h2><span className="pf-count">Quadrada, mín. 800 px</span></div>
                <div className="pf-card-b pf-stack pf-photo">
                  <button type="button" className={`pf-photo-big${fotoSrc ? ' has' : ''}`} onClick={() => { if (fotoSrc) setPhotoLightbox(fotoSrc) }} aria-label={fotoSrc ? 'Ampliar foto' : 'Sem foto'} disabled={!fotoSrc}>
                    {fotoSrc ? <img src={fotoSrc} alt="Foto do produto" /> : <span><Ico d={ICO.image} size={34} sw={1.6} />Sem foto ainda</span>}
                  </button>
                  <div className="pf-g2 tight">
                    <label className="pf-btn sm" style={{ cursor: 'pointer' }}>
                      <Ico d={ICO.upload} size={15} />{fotoSrc ? 'Trocar foto' : 'Carregar foto'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
                    </label>
                    <button type="button" className="pf-btn sm" onClick={openCopyPhoto}><Ico d={ICO.copy} size={15} />Copiar de outro</button>
                  </div>
                </div>
              </section>

              {/* Visibilidade */}
              <section className="pf-card pf-o4">
                <div className="pf-card-h"><div><h2>Visibilidade</h2><p>Onde e quando o cliente vê este produto.</p></div></div>
                <div className="pf-card-b pf-stack">
                  <div className="pf-rowsw">
                    <PfSwitch checked={form.active} onChange={v => setForm(f => ({ ...f, active: v }))} label="Ativo no cardápio" />
                    <div><b>Ativo no cardápio</b><small>Desligue para pausar sem apagar.</small></div>
                  </div>
                  {company?.mesas_enabled && (
                    <div>
                      <div className="pf-eyebrow pf-mb8">Onde aparece</div>
                      <div className="pf-chips">
                        {([['canalDelivery', 'Delivery'], ['canalPdv', 'PDV'], ['canalMesa', 'Mesas']] as const).map(([k, nome]) => (
                          <button key={k} type="button" className={`pf-chip${form[k] ? ' on' : ''}`} aria-pressed={form[k]} onClick={() => setForm(f => ({ ...f, [k]: !f[k] }))}>{form[k] && <Ico d={ICO.check} size={15} sw={2.4} />}{nome}</button>
                        ))}
                      </div>
                      {nenhumCanal && <div className="pf-err">Escolha pelo menos um lugar, senão o produto não aparece em lugar nenhum.</div>}
                    </div>
                  )}
                  <div className="pf-sep" />
                  <div className="pf-rowsw">
                    <PfSwitch checked={form.restrictDays} onChange={v => setForm(f => ({ ...f, restrictDays: v }))} label="Só em alguns dias da semana" />
                    <div><b>Só em alguns dias da semana</b><small>Fora desses dias aparece como indisponível.</small></div>
                  </div>
                  {form.restrictDays && (
                    <div className="pf-days">{DAY_LABELS.map((d, i) => <button key={i} type="button" aria-pressed={form.days.includes(i)} aria-label={['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][i]} className={`pf-day${form.days.includes(i) ? ' on' : ''}`} onClick={() => toggleDay(i)}>{d}</button>)}</div>
                  )}
                </div>
              </section>

              {/* Estoque */}
              <section className="pf-card pf-o5">
                <div className="pf-card-h">
                  <div><h2>Estoque</h2><p>{form.track_stock ? 'Desconta a cada venda. Zerou, sai do cardápio.' : 'Sem controle: vende sem limite.'}</p></div>
                  <PfSwitch checked={form.track_stock} onChange={v => setForm(f => ({ ...f, track_stock: v }))} label="Controlar estoque" />
                </div>
                {form.track_stock && (
                  <div className="pf-card-b pf-stack">
                    <div className="pf-g2">
                      <div><label className="pf-lab" htmlFor="pf-qtd">Quantidade</label><input id="pf-qtd" className="pf-inp pf-tab" inputMode="numeric" value={String(form.stock_qty)} onChange={e => setForm(f => ({ ...f, stock_qty: e.target.value as any }))} /></div>
                      <div><label className="pf-lab" htmlFor="pf-alerta">Avisar quando restar</label><input id="pf-alerta" className="pf-inp pf-tab" inputMode="numeric" value={String(form.stock_alert_qty)} onChange={e => setForm(f => ({ ...f, stock_alert_qty: e.target.value as any }))} /></div>
                    </div>
                    <div className={`pf-stock ${qtdEstoque <= 0 ? 'bad' : alertaEstoque > 0 && qtdEstoque <= alertaEstoque ? 'warn' : 'ok'}`}>
                      {qtdEstoque <= 0 ? 'Zerado — o produto sai do cardápio' : alertaEstoque > 0 && qtdEstoque <= alertaEstoque ? `Estoque baixo — ${qtdEstoque} restantes` : `${qtdEstoque} em estoque`}
                    </div>
                    <p className="pf-hint">Vendido por peso ou sem limite? Deixe o controle desligado.</p>
                  </div>
                )}
              </section>

              {/* Prévia */}
              <section className="pf-card pf-o7">
                <div className="pf-card-h"><h2>Prévia no cardápio</h2></div>
                <div className="pf-card-b">
                  <div className="pf-prev">
                    <div className="pf-prev-t">
                      <b>{form.name.trim() || 'Nome do produto'}</b>
                      {form.description.trim() && <span>{form.description}</span>}
                      <div className="pf-prev-p">
                        <strong>{fmt(precoEfetivo)}</strong>
                        {promoValida && <s>{fmt(venda)}</s>}
                      </div>
                    </div>
                    <div className="pf-prev-img">{fotoSrc ? <img src={fotoSrc} alt="" /> : <Ico d={ICO.image} size={22} sw={1.6} />}</div>
                  </div>
                </div>
              </section>
            </aside>
          </div>

          <div className="pf-mbar pf-only-m">
            <button type="button" className="pf-btn" onClick={voltar}>Cancelar</button>
            <button type="button" className="pf-btn pri" disabled={savingProd} onClick={saveProduto}>{savingProd ? 'Salvando...' : 'Salvar produto'}</button>
          </div>
        </div>
        )
      })()}

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
              {categorias.length > 1 && (
                <div style={{ fontSize: 11, color: '#A79E8B', padding: '0 0 8px' }}>Arraste pelo ⠿ pra decidir a ordem das seções no cardápio — quem vê primeiro é o que sobe aqui.</div>
              )}
              <DndContext sensors={catSensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCat}>
                <SortableContext items={categorias.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  {categorias.map(c => (
                    <SortableCatRow
                      key={c.id}
                      cat={c}
                      count={produtos.filter(p => p.category_id === c.id).length}
                      isEditing={editingCatId === c.id}
                      editName={editCatName}
                      onEditNameChange={setEditCatName}
                      onSaveName={() => saveCategoriaName(c.id)}
                      onCancelEdit={() => setEditingCatId('')}
                      onStartEdit={() => { setEditingCatId(c.id); setEditCatName(c.name) }}
                      onDelete={() => deleteCategoria(c.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
            <div className="cg-cat-modal-foot">
              <input placeholder="Nova categoria" value={mgrNewCatName} onChange={e => setMgrNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategoriaFromManager()} />
              <button className="cg-btn cg-btn-gold" onClick={addCategoriaFromManager}>+ Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {showApplyOrder && (
        <div className="cg-cat-overlay" onClick={() => !applyBusy && setShowApplyOrder(false)}>
          <div className="cg-cat-modal" onClick={e => e.stopPropagation()}>
            <div className="cg-cat-modal-head">
              <b>Aplicar ordem em outros produtos</b>
              <button className="cg-close" onClick={() => !applyBusy && setShowApplyOrder(false)}>✕</button>
            </div>
            <div className="cg-cat-modal-body">
              <div style={{ fontSize: 12, color: '#6E6656', padding: '10px 0' }}>
                A ordem dos grupos que está na tela é copiada pelo <b>nome do grupo</b>. Grupo que o outro produto não tem é ignorado; o que ele tem a mais fica no fim. Só muda a ordem — nomes, regras e opções não são tocados.
              </div>
              {produtos.filter(p => p.id !== form.id).map(p => (
                <label className="cg-cat-row" key={p.id} style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={applySel.includes(p.id)} onChange={e => setApplySel(s => e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id))} />
                  <span className="cg-cat-row-name">{p.name}</span>
                </label>
              ))}
              <button className="cg-btn cg-btn-gold" style={{ marginTop: 12, width: '100%' }} disabled={!applySel.length || applyBusy} onClick={aplicarOrdemEmOutros}>
                {applyBusy ? 'Aplicando...' : `Aplicar em ${applySel.length} produto${applySel.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveOrder && (
        <div className="cg-cat-overlay" onClick={() => !reorderSaving && setShowSaveOrder(false)}>
          <div className="cg-cat-modal" onClick={e => e.stopPropagation()}>
            <div className="cg-cat-modal-head">
              <b>Salvar esta ordem para quê?</b>
              <button className="cg-close" onClick={() => !reorderSaving && setShowSaveOrder(false)}>✕</button>
            </div>
            <div className="cg-cat-modal-body" style={{ display: 'grid', gap: 10, paddingTop: 12 }}>
              <button className="cg-ord-opt" disabled={reorderSaving} onClick={() => salvarOrdem('cliente')}>
                <b>Para o cardápio do cliente</b>
                <span>O cliente passa a ver os produtos nessa ordem, dentro de cada categoria. Vale também no PDV e nas mesas.</span>
              </button>
              <button className="cg-ord-opt" disabled={reorderSaving} onClick={() => salvarOrdem('interna')}>
                <b>Só organização interna</b>
                <span>Muda só a lista aqui no painel, para você. O cardápio do cliente continua como está.</span>
              </button>
              <button className="cg-btn-ghost" style={{ padding: '10px 14px', borderRadius: 10, fontWeight: 700 }} disabled={reorderSaving} onClick={() => setShowSaveOrder(false)}>{reorderSaving ? 'Salvando...' : 'Voltar'}</button>
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

      {showCopyPhoto && (
        <div className="cg-cat-overlay" onClick={() => setShowCopyPhoto(false)}>
          <div className="cg-cat-modal" onClick={e => e.stopPropagation()}>
            <div className="cg-cat-modal-head">
              <b>Copiar foto de outro produto</b>
              <button className="cg-close" onClick={() => setShowCopyPhoto(false)}>✕</button>
            </div>
            <div className="cg-cat-modal-body">
              <div className="cg-field" style={{ marginTop: 10 }}>
                <input placeholder="Buscar produto..." autoFocus value={copyPhotoSearch} onChange={e => setCopyPhotoSearch(e.target.value)} />
              </div>
              {(() => {
                const term = copyPhotoSearch.trim().toLowerCase()
                const opcoes = produtos
                  .filter(p => p.id !== form.id && p.photo_url)
                  .filter(p => !term || p.name.toLowerCase().includes(term))
                if (opcoes.length === 0) {
                  return <div style={{ fontSize: 12, color: '#A79E8B', padding: '8px 0' }}>Nenhum produto com foto encontrado.</div>
                }
                return opcoes.map(p => (
                  <div key={p.id} className="cg-cat-row" style={{ cursor: 'pointer' }} onClick={() => applyCopiedPhoto(p.photo_url!)}>
                    <div className="cg-copy-photo-thumb"><img src={p.photo_url!} alt="" /></div>
                    <span className="cg-cat-row-name">{p.name}</span>
                  </div>
                ))
              })()}
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
                    <span style={{ fontFamily: 'monospace', fontSize: 10.5, display: 'block', background: '#FCFAF5', border: '1px solid #B9AE97', borderRadius: 8, padding: 8, marginTop: 6, wordBreak: 'break-word' }}>
                      Sabores | obrigatorio | 1 | 2 | maior_valor | Calabresa=39.90 ; Mussarela=35.90
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#444', marginBottom: 14, cursor: 'pointer', lineHeight: 1.5 }}>
                    <input type="checkbox" checked={importUpdateMode} onChange={e => { setImportUpdateMode(e.target.checked); if (e.target.checked) setImportOnlyNew(false) }} style={{ marginTop: 2 }} />
                    <span>🔄 Atualizar quem já existe (por nome) em vez de duplicar — bom pra reimportar o mesmo cardápio depois de um tempo só pra atualizar preço/descrição/foto. Produto novo continua sendo criado normal.</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#444', marginBottom: 14, cursor: 'pointer', lineHeight: 1.5 }}>
                    <input type="checkbox" checked={importOnlyNew} onChange={e => { setImportOnlyNew(e.target.checked); if (e.target.checked) setImportUpdateMode(false) }} style={{ marginTop: 2 }} />
                    <span>➕ Importar só os produtos que ainda não estão no cardápio (por nome) — quem já existe é ignorado e não é alterado em nada.</span>
                  </label>
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
                    {importResults.updated > 0
                      ? <>{importResults.ok - importResults.updated} novo{(importResults.ok - importResults.updated) !== 1 ? 's' : ''} · {importResults.updated} atualizado{importResults.updated !== 1 ? 's' : ''}!</>
                      : <>{importResults.ok} produto{importResults.ok !== 1 ? 's' : ''} importado{importResults.ok !== 1 ? 's' : ''}!</>}
                    {importResults.skipped > 0 && <span style={{ color: '#6E6656', fontWeight: 600 }}> · {importResults.skipped} já existia{importResults.skipped !== 1 ? 'm' : ''} no cardápio e {importResults.skipped !== 1 ? 'foram ignorados' : 'foi ignorado'}.</span>}
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

      {showImportPhotos && (
        <div className="cg-cat-overlay" onClick={() => !importingPhotos && setShowImportPhotos(false)}>
          <div className="cg-cat-modal" onClick={e => e.stopPropagation()}>
            <div className="cg-cat-modal-head">
              <b>Importar fotos pelo nome</b>
              {!importingPhotos && <button className="cg-close" onClick={() => setShowImportPhotos(false)}>✕</button>}
            </div>
            <div className="cg-cat-modal-body">
              {!importingPhotos && !photoImportResults && (
                <>
                  <div style={{ fontSize: 11.5, color: '#6E6656', lineHeight: 1.6, padding: '10px 0' }}>
                    Escolhe várias imagens de uma vez — cada arquivo tem que se chamar exatamente igual ao nome do produto no catálogo (a extensão não conta). Ex: um produto chamado <b>Pizza Grande 35cm</b> casa com o arquivo <b>Pizza Grande 35cm.jpg</b>.
                  </div>
                  <label className="cg-btn cg-btn-gold" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', marginBottom: 6 }}>
                    Escolher fotos
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleImportPhotos(e.target.files) }} />
                  </label>
                </>
              )}
              {importingPhotos && (
                <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, fontWeight: 700 }}>
                  Importando {photoImportProgress.done}/{photoImportProgress.total}...
                </div>
              )}
              {photoImportResults && (
                <div style={{ padding: '10px 0' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{photoImportResults.matched} foto{photoImportResults.matched !== 1 ? 's' : ''} aplicada{photoImportResults.matched !== 1 ? 's' : ''}!</div>
                  {photoImportResults.unmatched.length > 0 && (
                    <>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#C43D3D', marginBottom: 4 }}>{photoImportResults.unmatched.length} sem produto correspondente:</div>
                      {photoImportResults.unmatched.map((e, i) => <div key={i} style={{ fontSize: 11, color: '#C43D3D', marginBottom: 2 }}>{e}</div>)}
                    </>
                  )}
                  <button className="cg-btn cg-btn-gold" style={{ width: '100%', marginTop: 14 }} onClick={() => { setShowImportPhotos(false); setPhotoImportResults(null) }}>Fechar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showImportIA && (
        <div className="cg-cat-overlay" onClick={() => importIAStep !== 'loading' && setShowImportIA(false)}>
          <div className="cg-cat-modal" onClick={e => e.stopPropagation()}>
            <div className="cg-cat-modal-head">
              <b>🤖 Importar cardápio com IA</b>
              {importIAStep !== 'loading' && <button className="cg-close" onClick={() => setShowImportIA(false)}>✕</button>}
            </div>
            <div className="cg-cat-modal-body">
              {importIAStep === 'choose' && (
                <>
                  <div style={{ fontSize: 11.5, color: '#6E6656', lineHeight: 1.6, padding: '10px 0' }}>
                    De onde vem seu cardápio hoje (iFood, Anota Aí, Cardápio Web, Goomer, outro site, PDF ou fotos de um cardápio físico)? A IA lê e monta a lista pra você revisar antes de importar de verdade.
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button className={`cg-chip ${importIASource === 'url' ? 'active' : ''}`} onClick={() => setImportIASource('url')}>🔗 Link</button>
                    <button className={`cg-chip ${importIASource === 'pdf' ? 'active' : ''}`} onClick={() => setImportIASource('pdf')}>📄 PDF</button>
                    <button className={`cg-chip ${importIASource === 'fotos' ? 'active' : ''}`} onClick={() => setImportIASource('fotos')}>📷 Fotos</button>
                  </div>
                  {importIASource === 'url' && (
                    <>
                      <input placeholder="Cola aqui o link do seu cardápio" value={importIAUrl} onChange={e => setImportIAUrl(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #B9AE97', fontSize: 13, marginBottom: 10 }} />
                      <div style={{ fontSize: 10.5, color: '#A79E8B', marginBottom: 10 }}>Sites que carregam o cardápio inteiro por JavaScript (comum no app do iFood/Anota Aí) podem não trazer conteúdo suficiente — nesse caso, tenta por PDF ou fotos.</div>
                      <button className="cg-btn cg-btn-gold" style={{ width: '100%' }} onClick={runImportIAUrl}>Ler cardápio</button>
                    </>
                  )}
                  {importIASource === 'pdf' && (
                    <label className="cg-btn cg-btn-gold" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
                      Escolher PDF
                      <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) runImportIAPdf(f) }} />
                    </label>
                  )}
                  {importIASource === 'fotos' && (
                    <>
                      <div style={{ fontSize: 10.5, color: '#A79E8B', marginBottom: 10 }}>Até 8 fotos por vez — pode ser cardápio impresso, quadro, o que tiver.</div>
                      <label className="cg-btn cg-btn-gold" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
                        Escolher fotos
                        <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) runImportIAFotos(e.target.files) }} />
                      </label>
                    </>
                  )}
                </>
              )}
              {importIAStep === 'loading' && (
                <div style={{ textAlign: 'center', padding: '30px 0', fontSize: 13, fontWeight: 700 }}>
                  Lendo seu cardápio com IA...
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#A79E8B', marginTop: 6 }}>Pode levar até um minuto num cardápio grande.</div>
                </div>
              )}
              {importIAStep === 'error' && (
                <div style={{ padding: '10px 0' }}>
                  <div style={{ fontSize: 12.5, color: '#C43D3D', marginBottom: 14, lineHeight: 1.5 }}>{importIAError}</div>
                  <button className="cg-btn cg-btn-gold" style={{ width: '100%' }} onClick={() => setImportIAStep('choose')}>Tentar de novo</button>
                </div>
              )}
              {importIAStep === 'preview' && importIAPreview && (
                <div style={{ padding: '10px 0' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Encontrei no seu cardápio:</div>
                  <div style={{ fontSize: 12.5, lineHeight: 2 }}>
                    🏷️ {importIAPreview.categorias} categoria{importIAPreview.categorias !== 1 ? 's' : ''}<br />
                    🍽️ {importIAPreview.produtos} produto{importIAPreview.produtos !== 1 ? 's' : ''}<br />
                    🖼️ {importIAPreview.imagens} imagem{importIAPreview.imagens !== 1 ? 'ns' : ''}<br />
                    🧩 {importIAPreview.grupos} grupo{importIAPreview.grupos !== 1 ? 's' : ''} de complemento<br />
                    🛍️ {importIAPreview.classificados} produto{importIAPreview.classificados !== 1 ? 's' : ''} classificado{importIAPreview.classificados !== 1 ? 's' : ''} pra home
                  </div>
                  <div style={{ fontSize: 11, color: '#A79E8B', margin: '10px 0 14px' }}>Confere se bate com o que você esperava antes de importar — depois dá pra revisar/corrigir cada produto normalmente no catálogo.</div>
                  <button className="cg-btn cg-btn-gold" style={{ width: '100%', marginBottom: 8 }} onClick={confirmImportIA}>Importar {importIAPreview.produtos} produtos</button>
                  <button className="cg-btn-ghost" style={{ width: '100%', padding: 10, borderRadius: 10 }} onClick={() => setImportIAStep('choose')}>Cancelar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {photoLightbox && (
        <div className="cg-photo-lightbox" onClick={() => setPhotoLightbox(null)}>
          <button className="cg-close" style={{ position: 'absolute', top: 16, right: 16 }} onClick={() => setPhotoLightbox(null)}>✕</button>
          <img src={photoLightbox} alt="" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {toast && <div className="cg-toast">{toast}</div>}
    </div>
    </>
  )
}
