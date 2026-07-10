'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/compressImage'

type Listing = {
  id:string; type:string; title:string; description?:string
  price?:number; price_label?:string; address?:string; subtype?:string
  contact_phone?:string; created_at:string; status:string; user_id:string
  user?:any; photos?:any[]
}

const TYPE_INFO:Record<string,{emoji:string;label:string;slug:string}> = {
  desapega: {emoji:'🏷️',label:'Desapega',slug:'desapega'},
  emprego:  {emoji:'💼',label:'Empregos',slug:'empregos'},
  imovel:   {emoji:'🏠',label:'Imóveis',slug:'imoveis'},
  achado:   {emoji:'🔍',label:'Achados & Perdidos',slug:'achados-perdidos'},
}

const SUBTYPE_COLORS:Record<string,{bg:string;color:string}> = {
  venda:   {bg:'#EAF3DE',color:'#3B6D11'},
  doacao:  {bg:'#EBF4FF',color:'#185FA5'},
  troca:   {bg:'#FEF3E2',color:'#854F0B'},
  perdido: {bg:'#FCEBEB',color:'#A32D2D'},
  achado:  {bg:'#EDFAF3',color:'#0F6E56'},
  aluguel: {bg:'#EEEDFE',color:'#534AB7'},
  clt:     {bg:'#EAF3DE',color:'#3B6D11'},
  freelance:{bg:'#EBF4FF',color:'#185FA5'},
  estagio: {bg:'#FEF3E2',color:'#854F0B'},
  pj:      {bg:'#F0EDE8',color:'#666'},
}

export default function AnuncioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [listing, setListing]   = useState<Listing|null>(null)
  const [loading, setLoading]   = useState(true)
  const [userId, setUserId]     = useState<string|null>(null)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportSent, setReportSent] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({title:'',description:'',price:'',address:'',phone:''})
  const [editPhotos, setEditPhotos] = useState<any[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [removingPhoto, setRemovingPhoto] = useState<string|null>(null)

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session:s}})=>{if(s)setUserId(s.user.id)})
    load()
  },[])

  async function load(){
    const{data}=await supabase.from('listings').select('*,user:profiles(name),photos:listing_photos(url,order)').eq('id',id).maybeSingle()
    setListing(data as Listing); setLoading(false)
  }

  async function sendReport(){
    if(!reportReason.trim()||!userId||!listing)return
    await supabase.from('listing_reports').insert({listing_id:listing.id,user_id:userId,reason:reportReason})
    setReportSent(true); setShowReport(false)
  }

  async function markResolved(){
    if(!listing)return; setResolving(true)
    await supabase.from('listings').update({status:'resolved',resolved_at:new Date().toISOString()}).eq('id',listing.id)
    setResolving(false); window.location.href='/achados-perdidos'
  }

  function openEdit(){
    if(!listing)return
    setEditForm({title:listing.title||'',description:listing.description||'',price:listing.price?String(listing.price):'',address:listing.address||'',phone:listing.contact_phone||''})
    setEditPhotos(listing.photos||[])
    setNewFiles([])
    setShowEdit(true)
  }
  async function removeEditPhoto(photo: any){
    setRemovingPhoto(photo.id)
    const path = photo.url.split('/company-photos/')[1]
    if(path) await supabase.storage.from('company-photos').remove([path])
    await supabase.from('listing_photos').delete().eq('id', photo.id)
    setEditPhotos(p => p.filter(x => x.id !== photo.id))
    setRemovingPhoto(null)
  }
  async function saveEdit(){
    if(!listing||!editForm.title.trim())return; setActionLoading(true)
    await supabase.from('listings').update({title:editForm.title.trim(),description:editForm.description||null,price:editForm.price?parseFloat(editForm.price):null,address:editForm.address||null,contact_phone:editForm.phone||null}).eq('id',listing.id)
    for(let i=0;i<newFiles.length;i++){
      const file=newFiles[i];const ext=file.name.split('.').pop();const path=`listings/${listing.id}/${Date.now()}_${i}.${ext}`
      const compressed=await compressImage(file);const{data:up}=await supabase.storage.from('company-photos').upload(path,compressed,{upsert:true})
      if(up){const{data:url}=supabase.storage.from('company-photos').getPublicUrl(path);await supabase.from('listing_photos').insert({listing_id:listing.id,url:url.publicUrl,order:editPhotos.length+i})}
    }
    setShowEdit(false); setActionLoading(false); load()
  }
  async function pauseListing(){
    if(!listing)return; setActionLoading(true)
    const newStatus = listing.status === 'active' ? 'paused' : 'active'
    await supabase.from('listings').update({status:newStatus}).eq('id',listing.id)
    setListing({...listing, status:newStatus}); setActionLoading(false)
  }
  async function deleteListing(){
    if(!listing||!confirm('Excluir este anúncio? Esta ação é irreversível.'))return
    setActionLoading(true)
    await supabase.from('listings').update({status:'deleted'}).eq('id',listing.id)
    window.location.href = '/' + (TYPE_INFO[listing.type]?.slug || '')
  }
  function fmtPrice(l:Listing){if(!l.price)return'Grátis';return`R$ ${l.price.toLocaleString('pt-BR')}${l.price_label?` /${l.price_label}`:''}`}
  function fmtDate(d:string){return new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',color:'#AAA'}}>Carregando...</div>
  if(!listing) return <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',padding:24}}><div style={{fontSize:48,marginBottom:12}}>🔍</div><div style={{fontSize:18,fontWeight:700,marginBottom:16}}>Anúncio não encontrado</div><a href="/" style={{color:'#C9951A'}}>← Voltar ao início</a></div>

  const info = TYPE_INFO[listing.type] || TYPE_INFO.desapega
  const photos = (listing.photos||[]).sort((a,b)=>a.order-b.order)
  const subtypeStyle = listing.subtype ? SUBTYPE_COLORS[listing.subtype] : null
  const isOwner = userId === listing.user_id
  if(listing.status === 'paused' && !isOwner) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',padding:24}}>
      <div style={{fontSize:48,marginBottom:12}}>⏸</div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Anúncio pausado</div>
      <div style={{fontSize:14,color:'#AAA',marginBottom:24}}>Este anúncio está temporariamente indisponível.</div>
      <a href="/" style={{color:'#C9951A',fontWeight:600,textDecoration:'none'}}>← Voltar ao início</a>
    </div>
  )
  if(listing.status === 'deleted') return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',padding:24}}>
      <div style={{fontSize:48,marginBottom:12}}>🗑</div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Anúncio removido</div>
      <a href="/" style={{color:'#C9951A',fontWeight:600,textDecoration:'none'}}>← Voltar ao início</a>
    </div>
  )

  return(<>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Inter',sans-serif;background:#fff;}
      .topbar{background:#111;position:sticky;top:0;z-index:50;}
      .ti{max-width:1200px;margin:0 auto;padding:13px 24px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;}
      .logo{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:2px;text-decoration:none;}
      .logo span{color:#C9951A;}
      .bc{display:flex;align-items:center;gap:7px;font-size:13px;}
      .bc a{color:#C9951A;font-weight:700;text-decoration:none;}
      .bcs{color:#444;}.bcc{color:#fff;font-weight:700;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .page{max-width:1100px;margin:0 auto;padding:28px 24px 48px;}
      @media(max-width:767px){.page{padding:16px 16px 40px;}}
      .layout{display:grid;grid-template-columns:1fr 320px;gap:28px;}
      @media(max-width:767px){.layout{grid-template-columns:1fr;}}
      .gallery{border-radius:14px;overflow:hidden;margin-bottom:0;}
      .gal-main{height:340px;background:#F5F5F5;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:72px;margin-bottom:8px;position:relative;}
      .gal-main img{width:100%;height:100%;object-fit:cover;}
      .gal-nav{position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;padding:3px 10px;border-radius:12px;}
      .gal-thumbs{display:flex;gap:6px;overflow-x:auto;}
      .gal-thumb{width:56px;height:56px;border-radius:8px;overflow:hidden;flex-shrink:0;cursor:pointer;border:2px solid transparent;}
      .gal-thumb.on{border-color:#C9951A;}
      .gal-thumb img{width:100%;height:100%;object-fit:cover;}
      .title{font-family:'Bebas Neue',sans-serif;font-size:clamp(24px,3vw,36px);color:#111;letter-spacing:1px;margin-bottom:10px;}
      .tags{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;}
      .tag{font-size:11px;padding:3px 10px;border-radius:7px;font-weight:600;}
      .desc-section{margin-top:20px;padding-top:20px;border-top:0.5px solid #F0EDE8;}
      .sec-lbl{font-family:'Bebas Neue',sans-serif;font-size:11px;color:#AAA;letter-spacing:1.5px;margin-bottom:8px;}
      .desc-txt{font-size:14px;color:#555;line-height:1.8;}
      .right{position:sticky;top:80px;}
      .price-card{background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:14px;padding:16px;margin-bottom:12px;}
      .price-big{font-family:'Bebas Neue',sans-serif;font-size:36px;color:#C9951A;letter-spacing:1px;margin-bottom:4px;}
      .price-sub{font-size:12px;color:#AAA;margin-bottom:14px;}
      .btn-wa{width:100%;padding:12px;background:#25D366;color:#fff;border:none;border-radius:11px;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:8px;}
      .addr-box{display:flex;align-items:flex-start;gap:8px;background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:12px;padding:11px 13px;margin-bottom:12px;}
      .addr-txt{font-size:13px;color:#555;line-height:1.5;}
      .user-box{display:flex;align-items:center;gap:10px;background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:12px;padding:11px 13px;margin-bottom:12px;}
      .user-av{width:36px;height:36px;border-radius:50%;background:#C9951A;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:14px;color:#fff;flex-shrink:0;}
      .user-name{font-size:13px;font-weight:600;color:#222;}
      .user-date{font-size:11px;color:#AAA;}
      .btn-report{width:100%;padding:9px;background:#FAFAF8;color:#E24B4A;border:0.5px solid #F0C0C0;border-radius:10px;font-size:12px;font-family:'Inter',sans-serif;cursor:pointer;}
      .btn-resolve{width:100%;padding:11px;background:#EAF3DE;color:#3B6D11;border:1px solid #A8D88A;border-radius:11px;font-size:13px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;margin-bottom:8px;}
      .ok-msg{background:#EDFAF3;border:1px solid #A8E6C4;border-radius:10px;padding:10px 14px;font-size:13px;color:#0F5C3A;margin-bottom:12px;}
      .mbg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;display:flex;align-items:center;justify-content:center;}
      .modal{background:#fff;border-radius:16px;width:90%;max-width:440px;padding:22px;}
      .mt{font-size:17px;font-weight:700;color:#111;margin-bottom:12px;}
      .fi{width:100%;padding:10px 13px;border:1.5px solid #E0DDD8;border-radius:10px;font-size:14px;font-family:'Inter',sans-serif;outline:none;resize:vertical;}
      .fi:focus{border-color:#C9951A;}
      .btn-send{width:100%;padding:11px;background:#E24B4A;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;margin-top:10px;}
      .btn-cancel-r{width:100%;padding:9px;background:#FAFAF8;color:#888;border:1px solid #E0DDD8;border-radius:10px;font-size:13px;font-family:'Inter',sans-serif;cursor:pointer;margin-top:6px;}
      .footer{padding:24px 0 0;text-align:center;font-size:12px;color:#AAA;border-top:0.5px solid #F0EDE8;margin-top:28px;}
      .footer a{color:#C9951A;text-decoration:none;}
    `}</style>

    <div className="topbar"><div className="ti">
      <a className="logo" href="/">TRINDADE <span>ONLINE</span></a>
      <div className="bc">
        <a href="/">Início</a>
        <span className="bcs">›</span>
        <a href={`/${info.slug}`}>{info.label}</a>
        <span className="bcs">›</span>
        <span className="bcc">{listing.title}</span>
      </div>
      <div/>
    </div></div>

    <div className="page">
      <div className="layout">
        <div>
          <div className="gallery">
            <div className="gal-main">
              {photos[photoIdx] ? <img src={photos[photoIdx].url} alt={listing.title}/> : <span>{info.emoji}</span>}
              {photos.length>1&&<div className="gal-nav">{photoIdx+1}/{photos.length}</div>}
            </div>
            {photos.length>1&&(
              <div className="gal-thumbs">
                {photos.map((p,i)=>(
                  <div key={i} className={`gal-thumb ${i===photoIdx?'on':''}`} onClick={()=>setPhotoIdx(i)}>
                    <img src={p.url} alt=""/>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{marginTop:photos.length>1?20:0,paddingTop:photos.length>1?0:16}}>
            <div className="tags">
              <span className="tag" style={{background:'#F0EDE8',color:'#666'}}>{info.emoji} {info.label}</span>
              {listing.subtype&&subtypeStyle&&<span className="tag" style={{background:subtypeStyle.bg,color:subtypeStyle.color}}>{listing.subtype.charAt(0).toUpperCase()+listing.subtype.slice(1)}</span>}
            </div>
            <div className="title">{listing.title}</div>
            {listing.description&&(
              <div className="desc-section">
                <div className="sec-lbl">DESCRIÇÃO</div>
                <div className="desc-txt">{listing.description}</div>
              </div>
            )}
          </div>
        </div>

        <div className="right">
          <div className="price-card">
            <div className="price-big">{fmtPrice(listing)}</div>
            <div className="price-sub">Publicado em {fmtDate(listing.created_at)}</div>
            {listing.contact_phone&&(
              <button className="btn-wa" onClick={()=>window.open(`https://wa.me/55${listing.contact_phone!.replace(/\D/g,'')}?text=Olá! Vi seu anúncio "${listing.title}" no Trindade Online.`,'_blank')}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                Entrar em contato
              </button>
            )}
          </div>

          {listing.address&&(
            <div className="addr-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0,marginTop:2}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <div className="addr-txt">{listing.address}</div>
            </div>
          )}

          <div className="user-box">
            <div className="user-av">{listing.user?.name?.[0]||'?'}</div>
            <div>
              <div className="user-name">{listing.user?.name||'Morador'}</div>
              <div className="user-date">{fmtDate(listing.created_at)}</div>
            </div>
          </div>

          {isOwner && (
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
              <button onClick={pauseListing} disabled={actionLoading}
                style={{padding:'9px 16px',borderRadius:10,border:'1.5px solid #E0DDD8',background:'#fff',color:'#555',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                {listing.status==='active'?'⏸ Pausar':'▶ Reativar'}
              </button>
              <button onClick={openEdit}
                style={{padding:'9px 16px',borderRadius:10,border:'1.5px solid #C9951A',background:'#FEF3E2',color:'#854F0B',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                ✏️ Editar
              </button>
              <button onClick={deleteListing} disabled={actionLoading}
                style={{padding:'9px 16px',borderRadius:10,border:'1.5px solid #E24B4A',background:'#FEF0F0',color:'#E24B4A',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                🗑 Excluir
              </button>
            </div>
          )}
          {isOwner&&listing.type==='achado'&&listing.status==='active'&&(
            <button className="btn-resolve" onClick={markResolved} disabled={resolving}>
              {resolving?'Marcando...':'✓ Marcar como resolvido'}
            </button>
          )}

          {reportSent&&<div className="ok-msg">✓ Denúncia enviada. Obrigado!</div>}

          {userId&&!isOwner&&!reportSent&&(
            <button className="btn-report" onClick={()=>setShowReport(true)}>🚩 Denunciar anúncio</button>
          )}
        </div>
      </div>

      <div className="footer"><a href={`/${info.slug}`}>← Voltar a {info.label}</a></div>
    </div>

    {showEdit&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>e.target===e.currentTarget&&setShowEdit(false)}>
        <div style={{background:'#fff',borderRadius:20,padding:24,width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto'}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#111',letterSpacing:1,marginBottom:16}}>EDITAR ANÚNCIO</div>
          <label style={{fontSize:11,fontWeight:700,color:'#AAA',letterSpacing:.5,marginBottom:5,display:'block'}}>TÍTULO *</label>
          <input value={editForm.title} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))} style={{width:'100%',padding:'10px 13px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:14,fontFamily:'Inter,sans-serif',outline:'none',marginBottom:12,boxSizing:'border-box'}}/>
          <label style={{fontSize:11,fontWeight:700,color:'#AAA',letterSpacing:.5,marginBottom:5,display:'block'}}>DESCRIÇÃO</label>
          <textarea value={editForm.description} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))} rows={3} style={{width:'100%',padding:'10px 13px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:14,fontFamily:'Inter,sans-serif',outline:'none',marginBottom:12,resize:'none',boxSizing:'border-box'}}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'#AAA',letterSpacing:.5,marginBottom:5,display:'block'}}>VALOR (R$)</label>
              <input type="number" value={editForm.price} onChange={e=>setEditForm(f=>({...f,price:e.target.value}))} placeholder="Grátis" style={{width:'100%',padding:'10px 13px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:14,fontFamily:'Inter,sans-serif',outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'#AAA',letterSpacing:.5,marginBottom:5,display:'block'}}>BAIRRO</label>
              <input value={editForm.address} onChange={e=>setEditForm(f=>({...f,address:e.target.value}))} placeholder="Trindade" style={{width:'100%',padding:'10px 13px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:14,fontFamily:'Inter,sans-serif',outline:'none',boxSizing:'border-box'}}/>
            </div>
          </div>
          <label style={{fontSize:11,fontWeight:700,color:'#AAA',letterSpacing:.5,marginBottom:8,display:'block'}}>FOTOS ATUAIS</label>
          {editPhotos.length > 0 && (
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
              {editPhotos.map((p:any)=>(
                <div key={p.id} style={{position:'relative',width:72,height:72}}>
                  <img src={p.url} style={{width:72,height:72,objectFit:'cover',borderRadius:8,border:'1px solid #E0DDD8'}}/>
                  <button onClick={()=>removeEditPhoto(p)} disabled={removingPhoto===p.id}
                    style={{position:'absolute',top:-6,right:-6,width:20,height:20,borderRadius:10,background:'#E24B4A',border:'2px solid #fff',color:'#fff',fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
          )}
          <label style={{fontSize:11,fontWeight:700,color:'#AAA',letterSpacing:.5,marginBottom:5,display:'block'}}>ADICIONAR FOTOS</label>
          <input type="file" accept="image/*" multiple onChange={e=>setNewFiles(Array.from(e.target.files||[]).slice(0,5-editPhotos.length))} style={{width:'100%',padding:'10px 13px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Inter,sans-serif',marginBottom:12,boxSizing:'border-box'}}/>
          <label style={{fontSize:11,fontWeight:700,color:'#AAA',letterSpacing:.5,marginBottom:5,display:'block'}}>WHATSAPP</label>
          <input value={editForm.phone} onChange={e=>setEditForm(f=>({...f,phone:e.target.value}))} placeholder="21 99999-9999" style={{width:'100%',padding:'10px 13px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:14,fontFamily:'Inter,sans-serif',outline:'none',marginBottom:16,boxSizing:'border-box'}}/>
          <button onClick={saveEdit} disabled={actionLoading||!editForm.title.trim()} style={{width:'100%',padding:13,background:'#C9951A',color:'#fff',border:'none',borderRadius:12,fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:8}}>{actionLoading?'Salvando...':'Salvar alterações'}</button>
          <button onClick={()=>setShowEdit(false)} style={{width:'100%',padding:10,background:'#FAFAF8',color:'#888',border:'1px solid #E0DDD8',borderRadius:12,fontSize:14,fontFamily:'Inter,sans-serif',cursor:'pointer'}}>Cancelar</button>
        </div>
      </div>
    )}
    {showReport&&(
      <div className="mbg" onClick={e=>e.target===e.currentTarget&&setShowReport(false)}>
        <div className="modal">
          <div className="mt">🚩 Denunciar este anúncio</div>
          <textarea className="fi" rows={4} placeholder="Descreva o motivo da denúncia..." value={reportReason} onChange={e=>setReportReason(e.target.value)}/>
          <button className="btn-send" onClick={sendReport} disabled={!reportReason.trim()}>Enviar denúncia</button>
          <button className="btn-cancel-r" onClick={()=>setShowReport(false)}>Cancelar</button>
        </div>
      </div>
    )}
  </>)
}