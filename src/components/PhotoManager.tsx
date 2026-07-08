'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Photo = { id: string; url: string; order: number }

function SortableItem({ photo, isMain, onDelete }: { photo: Photo; isMain: boolean; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={{
      ...style,
      position:'relative',
      width:'100%',
      aspectRatio:'1/1',
      borderRadius:10,
      overflow:'hidden',
      border: isMain ? '2px solid #C9951A' : '1px solid #E0DDD8',
      cursor:'grab',
    }} {...attributes} {...listeners}>
      <img src={photo.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} draggable={false} />
      {isMain && (
        <div style={{position:'absolute',bottom:4,left:4,background:'#C9951A',color:'#fff',fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,letterSpacing:0.5}}>
          PRINCIPAL
        </div>
      )}
      <button onPointerDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();onDelete()}} style={{
        position:'absolute', top:4, right:4,
        width:24, height:24, borderRadius:12,
        background:'rgba(226,75,74,0.95)',
        color:'#fff', border:'none', fontSize:14, cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontWeight:700,
      }}>×</button>
    </div>
  )
}

export default function PhotoManager({ companyId, onChange }: { companyId: string; onChange?: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const MAX = 5
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => { loadPhotos() }, [companyId])

  async function loadPhotos() {
    setLoading(true)
    const { data } = await supabase.from('company_photos')
      .select('id,url,order').eq('company_id', companyId).order('order', { ascending: true })
    setPhotos(data || [])
    setLoading(false)
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = photos.findIndex(p => p.id === active.id)
    const newIdx = photos.findIndex(p => p.id === over.id)
    const newPhotos = arrayMove(photos, oldIdx, newIdx)
    setPhotos(newPhotos)
    for (let i = 0; i < newPhotos.length; i++) {
      await supabase.from('company_photos').update({ order: i }).eq('id', newPhotos[i].id)
    }
    if (onChange) onChange()
  }

  async function handleDelete(photo: Photo) {
    if (!confirm('Excluir esta foto?')) return
    const parts = (photo.url || '').split('/company-photos/')
    if (parts[1]) await supabase.storage.from('company-photos').remove([parts[1]])
    await supabase.from('company_photos').delete().eq('id', photo.id)
    loadPhotos()
    if (onChange) onChange()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const available = MAX - photos.length
    if (available <= 0) return
    const toUpload = files.slice(0, available)
    setUploading(true)
    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i]
      const ext = file.name.split('.').pop()
      const path = `${companyId}/${photos.length + i}-${Date.now()}.${ext}`
      const { data: up } = await supabase.storage.from('company-photos').upload(path, file, { upsert: true })
      if (up) {
        const { data: urlData } = supabase.storage.from('company-photos').getPublicUrl(path)
        await supabase.from('company_photos').insert({
          company_id: companyId,
          url: urlData.publicUrl,
          order: photos.length + i,
        })
      }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    loadPhotos()
    if (onChange) onChange()
  }

  const canAdd = photos.length < MAX

  if (loading) return <div style={{fontSize:12,color:'#888',padding:12}}>Carregando fotos...</div>

  return (
    <div>
      <div style={{fontSize:12,color:'#666',marginBottom:10}}>
        {photos.length} de {MAX} fotos · Arraste para reordenar · A 1ª foto é a principal
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={photos.map(p => p.id)} strategy={rectSortingStrategy}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
            {photos.map((p, i) => (
              <SortableItem key={p.id} photo={p} isMain={i === 0} onDelete={() => handleDelete(p)} />
            ))}
            {canAdd && (
              <div onClick={() => fileRef.current?.click()} style={{
                aspectRatio:'1/1', border:'2px dashed #C9951A', borderRadius:10,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                cursor:'pointer', background:'#FEF8ED', color:'#C9951A', fontWeight:700,
              }}>
                <div style={{fontSize:28,lineHeight:1}}>+</div>
                <div style={{fontSize:10,marginTop:4,textAlign:'center',padding:'0 4px'}}>
                  {uploading ? 'Enviando...' : 'Adicionar'}
                </div>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={handleUpload} />
    </div>
  )
}
