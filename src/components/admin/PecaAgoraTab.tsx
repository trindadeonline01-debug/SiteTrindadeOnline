'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Tipo = { id: string; value: string; label: string; emoji: string; display_order: number; active: boolean }

const s: Record<string, any> = {
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 16 },
  cardHd: { padding: '15px 20px', borderBottom: '1px solid #F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { fontSize: 12.5, fontWeight: 800, color: '#111' },
  cardHint: { fontSize: 11, color: '#999', marginTop: 2 },
  cardBody: { padding: 18 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #F0EDE8' },
  handle: { flex: 'none', width: 26, height: 26, border: 'none', background: 'transparent', color: '#A79E8B', fontSize: 16, lineHeight: 1, cursor: 'grab', touchAction: 'none', borderRadius: 6 },
  emoji: { flex: 'none', width: 32, fontSize: 18, textAlign: 'center' as const },
  label: { flex: 1, fontSize: 13, fontWeight: 700, color: '#111' },
  count: { fontSize: 11, color: '#999', flex: 'none', whiteSpace: 'nowrap' as const },
  input: { border: '1.5px solid #E0DDD8', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, fontFamily: 'inherit' },
  btnSave: { background: 'var(--sign)', color: 'var(--ink)', border: 'none', padding: '9px 18px', borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  btnGhost: { background: '#fff', color: '#111', border: '1.5px solid #E0DDD8', padding: '7px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' },
  btnDel: { background: 'none', border: 'none', color: '#C43D3D', fontSize: 15, cursor: 'pointer', padding: '2px 6px' },
  addRow: { display: 'flex', gap: 8, marginTop: 14 },
  msg: { fontSize: 12, color: '#0F8050', fontWeight: 700 },
}

function SortableTipoRow({ tipo, count, onToggleActive, onSaveEdit, onDelete }: {
  tipo: Tipo; count: number
  onToggleActive: () => void
  onSaveEdit: (label: string, emoji: string) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tipo.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(tipo.label)
  const [emoji, setEmoji] = useState(tipo.emoji)

  return (
    <div style={{ ...s.row, ...style, opacity: (style.opacity as number) * (tipo.active ? 1 : 0.45) }} ref={setNodeRef}>
      <button style={s.handle} {...attributes} {...listeners} aria-label="Arrastar pra reordenar">⠿</button>
      {editing ? (
        <>
          <input style={{ ...s.input, width: 44, textAlign: 'center' }} value={emoji} onChange={e => setEmoji(e.target.value)} />
          <input style={{ ...s.input, flex: 1 }} value={label} onChange={e => setLabel(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && (onSaveEdit(label, emoji), setEditing(false))} />
          <button style={s.btnSave} onClick={() => { onSaveEdit(label, emoji); setEditing(false) }}>OK</button>
          <button style={s.btnGhost} onClick={() => { setLabel(tipo.label); setEmoji(tipo.emoji); setEditing(false) }}>✕</button>
        </>
      ) : (
        <>
          <span style={s.emoji}>{tipo.emoji}</span>
          <span style={s.label}>{tipo.label}</span>
          <span style={s.count}>{count} produto{count !== 1 ? 's' : ''}</span>
          <button style={s.btnGhost} onClick={onToggleActive}>{tipo.active ? 'Ativo' : 'Oculto'}</button>
          <button style={s.btnGhost} onClick={() => setEditing(true)}>✏️</button>
          <button style={s.btnDel} onClick={onDelete}>🗑</button>
        </>
      )}
    </div>
  )
}

// Painel pra estruturar a vitrine "Peça agora" da home antes de ligar pra
// valer — Ricardo pediu depois de ver que os tipos genéricos (Hambúrguer,
// Bolos...) não organizavam bem os produtos reais. Aqui ele define quais
// tipos existem, o emoji/nome de cada um, a ordem, e liga/desliga a seção
// inteira sem precisar mexer em código ou SQL.
export default function PecaAgoraTab() {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [tipos, setTipos] = useState<Tipo[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState('🍽️')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => { load() }, [])

  function showMsg(m: string) { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  async function load() {
    setLoading(true)
    const [{ data: settingsData }, { data: tiposData }, { data: produtosData }] = await Promise.all([
      supabase.from('site_settings').select('key,value').eq('key', 'peca_agora_enabled').maybeSingle(),
      supabase.from('vitrine_tipos').select('*').order('display_order'),
      supabase.from('loja_produtos').select('tipo_vitrine').eq('active', true).not('tipo_vitrine', 'is', null),
    ])
    setEnabled(settingsData?.value === 'true')
    setTipos(tiposData || [])
    const cnt: Record<string, number> = {}
    ;(produtosData || []).forEach((p: any) => { if (p.tipo_vitrine) cnt[p.tipo_vitrine] = (cnt[p.tipo_vitrine] || 0) + 1 })
    setCounts(cnt)
    setLoading(false)
  }

  async function toggleEnabled() {
    const nv = !enabled
    setEnabled(nv)
    await supabase.from('site_settings').upsert({ key: 'peca_agora_enabled', value: String(nv), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    showMsg(nv ? 'Peça agora ativado na home!' : 'Peça agora desativado.')
  }

  async function addTipo() {
    if (!newLabel.trim()) return
    setSaving(true)
    const { error } = await supabase.from('vitrine_tipos').insert({
      value: newLabel.trim(), label: newLabel.trim(), emoji: newEmoji.trim() || '🍽️', display_order: tipos.length,
    })
    setSaving(false)
    if (error) { showMsg(error.code === '23505' ? 'Já existe um tipo com esse nome' : 'Erro ao criar: ' + error.message); return }
    setNewLabel(''); setNewEmoji('🍽️')
    load()
  }

  async function toggleActive(t: Tipo) {
    setTipos(prev => prev.map(x => x.id === t.id ? { ...x, active: !x.active } : x))
    await supabase.from('vitrine_tipos').update({ active: !t.active }).eq('id', t.id)
  }

  async function saveEdit(t: Tipo, label: string, emoji: string) {
    setTipos(prev => prev.map(x => x.id === t.id ? { ...x, label, emoji } : x))
    await supabase.from('vitrine_tipos').update({ label: label.trim() || t.label, emoji: emoji.trim() || t.emoji }).eq('id', t.id)
  }

  async function deleteTipo(t: Tipo) {
    const n = counts[t.value] || 0
    if (n > 0 && !confirm(`${n} produto${n !== 1 ? 's' : ''} usa${n !== 1 ? 'm' : ''} esse tipo — eles ficam sem tipo se você apagar. Continuar?`)) return
    setTipos(prev => prev.filter(x => x.id !== t.id))
    await supabase.from('vitrine_tipos').delete().eq('id', t.id)
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = tipos.findIndex(t => t.id === active.id)
    const newIdx = tipos.findIndex(t => t.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reindexed = arrayMove(tipos, oldIdx, newIdx).map((t, i) => ({ ...t, display_order: i }))
    setTipos(reindexed)
    await Promise.all(reindexed.map(t => supabase.from('vitrine_tipos').update({ display_order: t.display_order }).eq('id', t.id)))
  }

  if (loading) return <div style={{ padding: 20, fontSize: 13, color: '#999' }}>Carregando...</div>

  return (
    <div>
      <div style={s.card}>
        <div style={s.cardHd}>
          <div>
            <div style={s.cardTitle}>🍔 Seção "Peça agora" na home</div>
            <div style={s.cardHint}>Vitrine com produtos de todas as empresas com cardápio digital, logo abaixo das categorias.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: enabled ? '#0F8050' : '#E24B4A' }}>{enabled ? 'Ativo' : 'Inativo'}</span>
            <div onClick={toggleEnabled}
              style={{ width: 44, height: 24, borderRadius: 12, background: enabled ? '#0F8050' : '#E0DDD8', cursor: 'pointer', position: 'relative', transition: 'background .2s' }}>
              <div style={{ position: 'absolute', top: 2, left: enabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.2)', transition: 'left .2s' }} />
            </div>
          </div>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.cardHd}>
          <div>
            <div style={s.cardTitle}>Tipos de produto</div>
            <div style={s.cardHint}>Cada aba da vitrine é um desses tipos — arraste pelo ⠿ pra decidir a ordem. "Oculto" some da home sem apagar os dados.</div>
          </div>
          {!!msg && <span style={s.msg}>{msg}</span>}
        </div>
        <div style={s.cardBody}>
          {tipos.length === 0 && <div style={{ fontSize: 12, color: '#A79E8B', padding: '8px 0' }}>Nenhum tipo cadastrado ainda.</div>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tipos.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {tipos.map(t => (
                <SortableTipoRow
                  key={t.id}
                  tipo={t}
                  count={counts[t.value] || 0}
                  onToggleActive={() => toggleActive(t)}
                  onSaveEdit={(label, emoji) => saveEdit(t, label, emoji)}
                  onDelete={() => deleteTipo(t)}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div style={s.addRow}>
            <input style={{ ...s.input, width: 50, textAlign: 'center' }} placeholder="🍔" value={newEmoji} onChange={e => setNewEmoji(e.target.value)} />
            <input style={{ ...s.input, flex: 1 }} placeholder="Nome do tipo (ex: Espetinho)" value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTipo()} />
            <button style={s.btnSave} disabled={saving} onClick={addTipo}>+ Adicionar</button>
          </div>
        </div>
      </div>

      <div style={{ ...s.card, background: '#FFFBF0' }}>
        <div style={{ ...s.cardBody, fontSize: 12, color: '#6F6C67', lineHeight: 1.6 }}>
          💡 Cada produto recebe um desses tipos no cadastro do cardápio (painel do lojista → Cardápio → editar produto → "Tipo do produto"). Quem não tiver nenhum tipo marcado aparece só na aba "Todas" da vitrine.
        </div>
      </div>
    </div>
  )
}
