'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

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

  function fmtPrice(l:Listing){if(!l.price)return'Grátis';return`R$ ${l.price.toLocaleString('pt-BR')}${l.price_label?` /${l.price_label}`:''}`}
  function fmtDate(d:string){return new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',color:'#AAA'}}>Carregando...</div>
  if(!listing) return <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',padding:24}}><div style={{fontSize:48,marginBottom:12}}>🔍</div><div style={{fontSize:18,fontWeight:700,marginBottom:16}}>Anúncio não encontrado</div><a href="/" style={{color:'#C9951A'}}>← Voltar ao início</a></div>

  const info = TYPE_INFO[listing.type] || TYPE_INFO.desapega
  const photos = (listing.photos||[]).sort((a,b)=>a.order-b.order)
  const subtypeStyle = listing.subtype ? SUBTYPE_COLORS[listing.subtype] : null
  const isOwner = userId === listing.user_id

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