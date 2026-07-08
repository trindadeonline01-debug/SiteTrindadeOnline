'use client'
import { compressImage } from '@/lib/compressImage'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Listing = { id:string; title:string; description?:string; price?:number; price_label?:string; address?:string; subtype?:string; created_at:string; status:string; user?:any; photos?:any[] }

const SUBTYPES:[string,string][] = [['clt','CLT'],['freelance','Freelance'],['estagio','Estágio'],['pj','PJ']]
const EMOJI = '💼'; const TITLE = 'Empregos'

function timeAgo(d:string){const s=Math.floor((Date.now()-new Date(d).getTime())/1000);if(s<60)return'agora';if(s<3600)return`${Math.floor(s/60)}min`;if(s<86400)return`${Math.floor(s/3600)}h`;return`${Math.floor(s/86400)}d`}

export default function EmpregosPage(){
  const [listings,setListings]=useState<Listing[]>([])
  const [filtered,setFiltered]=useState<Listing[]>([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('todos')
  const [userId,setUserId]=useState<string|null>(null)
  const [search,setSearch]=useState('')
  const [showForm,setShowForm]=useState(false)

  useEffect(()=>{supabase.auth.getSession().then(({data:{session:s}})=>{if(s)setUserId(s.user.id)});load()},[])

  async function load(){
    const{data}=await supabase.from('listings').select('id,title,description,price,price_label,address,subtype,created_at,status,user:profiles(name),photos:listing_photos(url,order)').eq('type','emprego').eq('status','active').order('created_at',{ascending:false})
    const list=(data||[]) as Listing[];setListings(list);setFiltered(list);setLoading(false)
  }

  function applyFilter(f:string){setFilter(f);setSearch('');setFiltered(f==='todos'?listings:listings.filter(l=>l.subtype===f))}
  function handleSearch(e:React.ChangeEvent<HTMLInputElement>){const q=e.target.value;setSearch(q);setFilter('todos');setFiltered(!q.trim()?listings:listings.filter(l=>l.title.toLowerCase().includes(q.toLowerCase())||l.address?.toLowerCase().includes(q.toLowerCase())))}
  function getCover(l:Listing){if(!l.photos?.length)return null;return[...l.photos].sort((a,b)=>a.order-b.order)[0]?.url||null}
  function fmtPrice(l:Listing){if(!l.price)return'Grátis';return`R$ ${l.price.toLocaleString('pt-BR')}`}

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
      .bcs{color:#444;}.bcc{color:#fff;font-weight:700;}
      .hero{background:#111;padding:24px;border-bottom:2px solid #C9951A;}
      .hi{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
      .hl{display:flex;align-items:center;gap:16px;}
      .he{font-size:52px;flex-shrink:0;}
      .hn{font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,4vw,44px);color:#fff;letter-spacing:3px;line-height:1;margin-bottom:5px;}
      .hc{font-size:13px;color:#666;} .hc span{color:#C9951A;font-weight:600;}
      .btnp{background:#C9951A;color:#fff;border:none;border-radius:11px;padding:12px 20px;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;}
      .page{max-width:1200px;margin:0 auto;padding:0 24px 48px;}
      .sw{transform:translateY(-20px);}
      .sb{display:flex;align-items:center;gap:10px;background:#fff;border:2px solid #C9951A;border-radius:30px;padding:13px 20px;box-shadow:0 4px 20px rgba(0,0,0,.12);}
      .sb input{flex:1;border:none;background:transparent;font-size:15px;font-family:'Inter',sans-serif;color:#222;outline:none;}
      .sb input::placeholder{color:#BBB;}
      .filters{display:flex;gap:7px;flex-wrap:wrap;padding:4px 0 16px;border-bottom:0.5px solid #F0EDE8;margin-bottom:16px;}
      .chip{padding:7px 14px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #E0DDD8;background:#FAFAF8;color:#666;transition:all .15s;font-family:'Inter',sans-serif;}
      .chip:hover{border-color:#C9951A;background:#FEF3E2;}
      .chip.on{border-color:#C9951A;background:#C9951A;color:#fff;font-weight:600;}
      .rc{font-size:13px;color:#AAA;margin-bottom:14px;} .rc span{color:#111;font-weight:600;}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
      @media(min-width:640px){.grid{grid-template-columns:repeat(3,1fr);}}
      @media(min-width:1024px){.grid{grid-template-columns:repeat(4,1fr);}}
      .card{background:#fff;border:0.5px solid #E0DDD8;border-radius:14px;overflow:hidden;text-decoration:none;display:block;transition:all .18s;}
      .card:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.1);border-color:#C9951A;}
      .ci{height:130px;background:#F5F5F5;display:flex;align-items:center;justify-content:center;font-size:40px;overflow:hidden;position:relative;}
      .ci img{width:100%;height:100%;object-fit:cover;}
      .cb{padding:10px 12px;}
      .ct{font-size:13px;font-weight:600;color:#222;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .cp{font-size:14px;font-weight:700;color:#C9951A;margin-bottom:3px;}
      .cm{font-size:10px;color:#AAA;margin-bottom:4px;}
      .cu{font-size:10px;color:#BBB;}
      .sk{background:linear-gradient(90deg,#F0EDE8 25%,#E8E4DD 50%,#F0EDE8 75%);background-size:200% 100%;animation:sh 1.5s infinite;border-radius:14px;}
      @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
      .empty{text-align:center;padding:48px 20px;color:#AAA;}
      .footer{padding:24px 0 0;text-align:center;font-size:12px;color:#AAA;border-top:0.5px solid #F0EDE8;margin-top:16px;}
      .footer a{color:#C9951A;text-decoration:none;}
      .mbg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;display:flex;align-items:flex-end;justify-content:center;}
      @media(min-width:640px){.mbg{align-items:center;}}
      .modal{background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;padding:24px;max-height:90vh;overflow-y:auto;}
      @media(min-width:640px){.modal{border-radius:20px;}}
      .mt{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#111;letter-spacing:1px;margin-bottom:16px;}
      .fl{font-size:11px;font-weight:700;color:#AAA;letter-spacing:.5px;margin-bottom:5px;display:block;}
      .fi{width:100%;padding:10px 13px;border:1.5px solid #E0DDD8;border-radius:10px;font-size:14px;font-family:'Inter',sans-serif;outline:none;transition:border .15s;background:#fff;color:#222;margin-bottom:12px;}
      .fi:focus{border-color:#C9951A;}
      .fr{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
      .bts{width:100%;padding:13px;background:#C9951A;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;margin-top:4px;}
      .bts:disabled{opacity:.6;cursor:not-allowed;}
      .btc{width:100%;padding:10px;background:#FAFAF8;color:#888;border:1px solid #E0DDD8;border-radius:12px;font-size:14px;font-family:'Inter',sans-serif;cursor:pointer;margin-top:8px;}
    `}</style>

    <div className="topbar"><div className="ti">
      <a className="logo" href="/">TRINDADE <span>ONLINE</span></a>
      <div className="bc"><a href="/">Início</a><span className="bcs">›</span><span className="bcc">Empregos</span></div>
      <div/>
    </div></div>

    <div className="hero"><div className="hi">
      <div className="hl">
        <div className="he">💼</div>
        <div><div className="hn">EMPREGOS</div><div className="hc"><span>{filtered.length}</span> itens disponíveis</div></div>
      </div>
      <button className="btnp" onClick={()=>userId?setShowForm(true):window.location.href='/login'}>+ Publicar vaga</button>
    </div></div>

    <div className="page">
      <div className="sw"><div className="sb">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Buscar no empregos..." value={search} onChange={handleSearch}/>
        {search&&<button onClick={()=>{setSearch('');setFiltered(listings)}} style={{background:'none',border:'none',cursor:'pointer',color:'#AAA',fontSize:18,lineHeight:'1'}}>✕</button>}
      </div></div>

      <div className="filters">
        <div className={`chip ${filter==='todos'?'on':''}`} onClick={()=>applyFilter('todos')}>Todos ({listings.length})</div>
        {SUBTYPES.map(([v,l])=>{const c=listings.filter(x=>x.subtype===v).length;return c>0?<div key={v} className={`chip ${filter===v?'on':''}`} onClick={()=>applyFilter(v)}>{l} ({c})</div>:null})}
      </div>

      {!loading&&<div className="rc">Mostrando <span>{filtered.length}</span> itens</div>}
      {loading&&<div className="grid">{[1,2,3,4,5,6,7,8].map(i=><div key={i} className="sk" style={{height:220}}/>)}</div>}

      {!loading&&filtered.length>0&&(
        <div className="grid">
          {filtered.map(l=>{
            const cover=getCover(l)
            const badge=SUBTYPES.find(([v])=>v===l.subtype)
            return(
              <a key={l.id} className="card" href={`/anuncio/${l.id}`}>
                <div className="ci">{cover?<img src={cover} alt={l.title}/>:<span>💼</span>}
                  {badge&&<div style={{position:'absolute',top:8,left:8,padding:'2px 8px',borderRadius:6,fontSize:9,fontWeight:700,background:'#FEF3E2',color:'#C9951A'}}>{badge[1]}</div>}
                </div>
                <div className="cb">
                  <div className="ct">{l.title}</div>
                  <div className="cp">{fmtPrice(l)}</div>
                  {l.address&&<div className="cm">📍 {l.address} · {timeAgo(l.created_at)}</div>}
                  <div className="cu">👤 {l.user?.name||'Morador'}</div>
                </div>
              </a>
            )
          })}
        </div>
      )}

      {!loading&&filtered.length===0&&(
        <div className="empty">
          <div style={{fontSize:48,marginBottom:12}}>💼</div>
          <div style={{fontSize:16,fontWeight:600,color:'#555',marginBottom:6}}>{search?`Nenhum resultado para "${search}"`:'Nenhum anúncio ainda'}</div>
          <div style={{fontSize:13,color:'#AAA'}}>{search?'Tente outro termo.':'Seja o primeiro a publicar!'}</div>
          {!search&&<button className="btnp" style={{marginTop:16}} onClick={()=>userId?setShowForm(true):window.location.href='/login'}>+ Publicar vaga</button>}
        </div>
      )}

      <div className="footer"><a href="/">← Voltar ao Trindade Online</a></div>
    </div>

    {showForm&&<FormModal subtypes={SUBTYPES} type="emprego" userId={userId!} onClose={()=>setShowForm(false)} onSaved={()=>{setShowForm(false);load()}}/>}
  </>)
}

function FormModal({subtypes,type,userId,onClose,onSaved}:{subtypes:[string,string][];type:string;userId:string;onClose:()=>void;onSaved:()=>void}){
  const [form,setForm]=useState({title:'',description:'',price:'',address:'',subtype:subtypes[0]?.[0]||'',phone:''})
  const [files,setFiles]=useState<File[]>([])
  const [loading,setLoading]=useState(false)

  async function submit(){
    if(!form.title.trim())return;setLoading(true)
    const{data:listing,error}=await supabase.from('listings').insert({type,user_id:userId,title:form.title.trim(),description:form.description||null,price:form.price?parseFloat(form.price):null,address:form.address||null,subtype:form.subtype||null,contact_phone:form.phone||null,status:'active'}).select().single()
    if(error||!listing){setLoading(false);alert('Erro: '+error?.message);return}
    for(let i=0;i<files.length;i++){
      const file=files[i];const ext=file.name.split('.').pop();const path=`listings/${listing.id}/${Date.now()}_${i}.${ext}`
      const compressed=await compressImage(file);const{data:up}=await supabase.storage.from('company-photos').upload(path,compressed)
      if(up){const{data:url}=supabase.storage.from('company-photos').getPublicUrl(path);await supabase.from('listing_photos').insert({listing_id:listing.id,url:url.publicUrl,order:i})}
    }
    setLoading(false);onSaved()
  }

  return(
    <div className="mbg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="mt">Novo anúncio — Empregos</div>
        {subtypes.length>0&&(<><label className="fl">TIPO</label><select className="fi" value={form.subtype} onChange={e=>setForm(f=>({...f,subtype:e.target.value}))}>{subtypes.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></>)}
        <label className="fl">TÍTULO *</label><input className="fi" placeholder="Ex: Sofá 3 lugares azul" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
        <label className="fl">DESCRIÇÃO</label><textarea className="fi" placeholder="Estado, medidas, motivo da venda..." value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3}/>
        <div className="fr">
          <div><label className="fl">VALOR (R$)</label><input className="fi" type="number" placeholder="Deixe vazio = Grátis" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/></div>
          <div><label className="fl">BAIRRO</label><input className="fi" placeholder="Trindade" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
        </div>
        <label className="fl">SEU WHATSAPP</label><input className="fi" placeholder="21 99999-9999" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
        <label className="fl">FOTOS (até 5)</label><input className="fi" type="file" accept="image/*" multiple onChange={e=>setFiles(Array.from(e.target.files||[]).slice(0,5))}/>
        <button className="bts" onClick={submit} disabled={loading||!form.title.trim()}>{loading?'Publicando...':'Publicar anúncio'}</button>
        <button className="btc" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}