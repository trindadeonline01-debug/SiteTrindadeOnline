'use client'
import Footer from '@/components/Footer'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Profile = { id: string; name: string; email?: string; phone?: string; neighborhood?: string; created_at: string; user_type: string }
type Listing = { id: string; type: string; title: string; price?: number; subtype?: string; status: string; created_at: string }
type Review  = { id: string; rating: number; text?: string; created_at: string; company?: { name: string; slug: string } }
type Fav     = { id: string; company?: { name: string; slug: string; category?: any } }

const TYPE_EMOJI: Record<string,string> = { desapega:'🏷️', emprego:'💼', imovel:'🏠', achado:'🔍' }
const TYPE_LABEL: Record<string,string> = { desapega:'Desapega', emprego:'Emprego', imovel:'Imóvel', achado:'Achado/Perdido' }

export default function PerfilPage() {
  const [profile, setProfile]   = useState<Profile|null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [reviews, setReviews]   = useState<Review[]>([])
  const [favs, setFavs]         = useState<Fav[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'perfil'|'anuncios'|'avaliacoes'|'favoritos'|'cupons'>('perfil')
  const [myCoupons, setMyCoupons] = useState<any[]>([])
  const [editing, setEditing]   = useState(false)
  const [form, setForm]         = useState({ name:'', phone:'', neighborhood:'' })
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) { window.location.href = '/login'; return }
      loadAll(s.user.id)
    })
  }, [])

  async function loadAll(uid: string) {
    const [
      { data: prof },
      { data: list },
      { data: revs },
      { data: favData }
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('listings').select('id,type,title,price,subtype,status,created_at').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('reviews').select('id,rating,text,created_at,company:companies(name,slug)').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('favorites').select('id,company:companies(name,slug,category:categories(name,emoji))').eq('user_id', uid).eq('entity_type','company').order('created_at', { ascending: false })
    ])

    if (prof) {
      setProfile(prof as Profile)
      setForm({ name: prof.name || '', phone: prof.phone || '', neighborhood: prof.neighborhood || '' })
    }
    setListings((list || []) as Listing[])
    setReviews((revs || []) as any)
    setFavs((favData || []) as any)
    setLoading(false)
  }

  async function saveProfile() {
    if (!profile) return; setSaving(true)
    await supabase.from('profiles').update({ name: form.name, phone: form.phone, neighborhood: form.neighborhood }).eq('id', profile.id)
    setProfile(p => p ? {...p, name: form.name, phone: form.phone, neighborhood: form.neighborhood} : p)
    setSaving(false); setSaved(true); setEditing(false)
    setTimeout(() => setSaved(false), 3000)
  }

  async function deleteListing(id: string) {
    await supabase.from('listings').update({ status: 'deleted' }).eq('id', id)
    setListings(l => l.filter(x => x.id !== id))
  }

  function fmtDate(d: string) { return new Date(d).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) }
  function timeAgo(d: string) { const s = Math.floor((Date.now()-new Date(d).getTime())/1000); if(s<3600)return`${Math.floor(s/60)}min`; if(s<86400)return`${Math.floor(s/3600)}h`; return`${Math.floor(s/86400)}d` }

  useEffect(() => {
    if (tab === 'cupons' && profile?.id) {
      supabase.from('coupon_redemptions')
        .select('*, coupon:coupons(id,title,discount_type,discount_value,expires_at,company:companies(id,name,phone))')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => setMyCoupons(data || []))
    }
  }, [tab, profile?.id])
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'Inter,sans-serif',color:'#AAA'}}>Carregando...</div>
  if (!profile) return null

  const activeListings = listings.filter(l => l.status === 'active' || l.status === 'paused')


  return (
    <>
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
        .bcs{color:#444;font-size:14px;} .bcc{color:#fff;font-weight:700;}

        .hero{background:linear-gradient(160deg,#111,#1a1a1a);padding:28px 24px;border-bottom:2px solid #C9951A;}
        .hi{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:18px;}
        .avatar{width:72px;height:72px;border-radius:50%;background:#C9951A;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:32px;color:#fff;flex-shrink:0;border:3px solid #C9951A;}
        .hname{font-family:'Bebas Neue',sans-serif;font-size:clamp(22px,3vw,32px);color:#fff;letter-spacing:1px;margin-bottom:5px;}
        .hmeta{font-size:15px;color:#666;display:flex;gap:14px;flex-wrap:wrap;}

        .page{max-width:1200px;margin:0 auto;padding:24px 24px 48px;}
        @media(max-width:767px){.page{padding:16px 16px 40px;}}
        .layout{display:block;max-width:860px;margin:0 auto;}

        .card{background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:14px;padding:18px;margin-bottom:14px;}
        .card-title{font-family:'Bebas Neue',sans-serif;font-size:12px;color:#AAA;letter-spacing:1.5px;margin-bottom:14px;}
        .field{margin-bottom:12px;}
        .fl{font-size:13px;font-weight:700;color:#AAA;letter-spacing:.5px;margin-bottom:4px;display:block;}
        .fv{font-size:17px;color:#222;font-weight:500;}
        .fi{width:100%;padding:11px 14px;border:1.5px solid #E0DDD8;border-radius:9px;font-size:16px;font-family:'Inter',sans-serif;outline:none;transition:border .15s;background:#fff;color:#222;}
        .fi:focus{border-color:#C9951A;}
        .btn-edit{width:100%;padding:10px;background:#FEF3E2;color:#C9951A;border:1.5px solid #C9951A;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;}
        .btn-save{width:100%;padding:10px;background:#C9951A;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;margin-bottom:6px;}
        .btn-cancel{width:100%;padding:8px;background:#FAFAF8;color:#888;border:0.5px solid #E0DDD8;border-radius:10px;font-size:12px;cursor:pointer;font-family:'Inter',sans-serif;}
        .ok-msg{background:#EDFAF3;border:1px solid #A8E6C4;border-radius:8px;padding:8px 12px;font-size:12px;color:#0F5C3A;margin-bottom:10px;}

        .stats-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;}
        .stat{background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:10px;padding:12px;text-align:center;text-decoration:none;display:block;transition:all .15s;}
        .stat:hover{border-color:#C9951A;background:#FEF3E2;}
        .stat-n{font-family:'Bebas Neue',sans-serif;font-size:36px;color:#C9951A;line-height:1;}
        .stat-l{font-size:13px;color:#AAA;margin-top:2px;font-weight:500;}

        .tabs{display:flex;gap:4px;margin-bottom:20px;background:#FAFAF8;padding:5px;border-radius:12px;border:0.5px solid #E0DDD8;}
        .tab{flex:1;padding:8px 4px;text-align:center;font-size:12px;font-weight:600;color:#888;cursor:pointer;border-radius:9px;transition:all .15s;font-family:'Inter',sans-serif;}
        .tab.on{background:#fff;color:#C9951A;box-shadow:0 1px 4px rgba(0,0,0,.08);}

        .an-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
        @media(min-width:640px){.an-grid{grid-template-columns:repeat(3,1fr);}}
        .an-card{background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:11px;padding:12px;position:relative;}
        .an-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
        .an-emoji{font-size:22px;flex-shrink:0;}
        .an-title{font-size:12px;font-weight:600;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .an-meta{font-size:10px;color:#AAA;margin-bottom:5px;}
        .an-badge{font-size:9px;padding:2px 7px;border-radius:5px;font-weight:600;}
        .badge-active{background:#EDFAF3;color:#0F6E56;}
        .an-del{position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;color:#DDD;font-size:13px;}
        .an-del:hover{color:#E24B4A;}

        .rv-list{display:flex;flex-direction:column;gap:10px;}
        .rv-item{background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:11px;padding:12px;}
        .rv-empresa{font-size:13px;font-weight:600;color:#C9951A;text-decoration:none;margin-bottom:4px;display:block;}
        .rv-stars{font-size:13px;color:#C9951A;margin-bottom:4px;}
        .rv-txt{font-size:12px;color:#555;line-height:1.6;}
        .rv-date{font-size:10px;color:#AAA;margin-top:5px;}

        .fav-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
        @media(min-width:640px){.fav-grid{grid-template-columns:repeat(3,1fr);}}
        .fav-card{background:#FAFAF8;border:0.5px solid #E0DDD8;border-radius:11px;padding:10px 12px;text-decoration:none;display:flex;align-items:center;gap:8px;transition:all .15s;}
        .fav-card:hover{border-color:#C9951A;background:#FEF3E2;}
        .fav-emoji{font-size:20px;flex-shrink:0;}
        .fav-name{font-size:12px;font-weight:600;color:#222;}
        .fav-cat{font-size:10px;color:#AAA;}

        .empty-tab{text-align:center;padding:32px 20px;color:#AAA;}

        .footer{padding:24px 0 0;text-align:center;font-size:12px;color:#AAA;border-top:0.5px solid #F0EDE8;margin-top:24px;}
        .footer a{color:#C9951A;text-decoration:none;}
      `}</style>

      <div className="topbar">
        <div className="ti">
          <a className="logo" href="/">TRINDADE <span>ONLINE</span></a>
          <div className="bc"><a href="/">Início</a><span className="bcs">›</span><span className="bcc">Meu Perfil</span></div>
          <div/>
        </div>
      </div>

      <div className="hero">
        <div className="hi">
          <div className="avatar">{profile.name?.[0]?.toUpperCase() || '?'}</div>
          <div>
            <div className="hname">{profile.name}</div>
            <div className="hmeta">
              {profile.neighborhood && <span>📍 {profile.neighborhood}</span>}
              <span>🗓️ Membro desde {fmtDate(profile.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="page">
        <div className="layout">

          <div>
            <div className="tabs">
              <div className={`tab ${tab==='perfil'?'on':''}`} onClick={()=>setTab('perfil')}>👤 Perfil</div>
              <div className={`tab ${tab==='anuncios'?'on':''}`} onClick={()=>setTab('anuncios')}>📋 Anúncios ({activeListings.length})</div>
              <div className={`tab ${tab==='avaliacoes'?'on':''}`} onClick={()=>setTab('avaliacoes')}>⭐ Avaliações ({reviews.length})</div>
              <div className={`tab ${tab==='favoritos'?'on':''}`} onClick={()=>setTab('favoritos')}>❤️ Favoritos ({favs.length})</div>
              <div className={`tab ${tab==='cupons'?'on':''}`} onClick={()=>setTab('cupons')}>🎟️ Meus Cupons</div>
            </div>

            {/* ABA PERFIL */}
            {tab === 'perfil' && (
              <div className="card">
                {saved && <div className="ok-msg">✓ Dados atualizados!</div>}
                {editing ? (
                  <>
                    <div className="field"><label className="fl">NOME</label><input className="fi" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
                    <div className="field"><label className="fl">WHATSAPP</label><input className="fi" placeholder="21 99999-9999" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
                    <div className="field"><label className="fl">BAIRRO</label><input className="fi" placeholder="Ex: Trindade" value={form.neighborhood} onChange={e=>setForm(f=>({...f,neighborhood:e.target.value}))}/></div>
                    <button className="btn-save" onClick={saveProfile} disabled={saving}>{saving?'Salvando...':'Salvar alterações'}</button>
                    <button className="btn-cancel" onClick={()=>setEditing(false)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <div className="field"><div className="fl">NOME</div><div className="fv">{profile.name}</div></div>
                    {profile.phone && <div className="field"><div className="fl">WHATSAPP</div><div className="fv">{profile.phone}</div></div>}
                    {profile.neighborhood && <div className="field"><div className="fl">BAIRRO</div><div className="fv">{profile.neighborhood}</div></div>}
                    <button className="btn-edit" onClick={()=>setEditing(true)}>✏️ Editar dados</button>
                  </>
                )}
                <div className="stats-row" style={{marginTop:16}}>
                  <div className="stat" onClick={()=>setTab('favoritos')} style={{cursor:'pointer'}}>
                    <div className="stat-n">{favs.length}</div>
                    <div className="stat-l">Favoritos</div>
                  </div>
                  <div className="stat" onClick={()=>setTab('avaliacoes')} style={{cursor:'pointer'}}>
                    <div className="stat-n">{reviews.length}</div>
                    <div className="stat-l">Avaliações</div>
                  </div>
                  <div className="stat" onClick={()=>setTab('anuncios')} style={{cursor:'pointer'}}>
                    <div className="stat-n">{activeListings.length}</div>
                    <div className="stat-l">Anúncios</div>
                  </div>
                </div>
              </div>
            )}
            {/* ABA ANÚNCIOS */}
            {tab === 'anuncios' && (
              activeListings.length === 0 ? (
                <div className="empty-tab">
                  <div style={{fontSize:40,marginBottom:10}}>📋</div>
                  <div style={{fontSize:14,fontWeight:600,color:'#555',marginBottom:6}}>Nenhum anúncio ativo</div>
                  <div style={{fontSize:12,marginBottom:16}}>Publique no Desapega, Empregos ou Imóveis!</div>
                  <a href="/desapega" style={{color:'#C9951A',fontSize:13,fontWeight:600,textDecoration:'none'}}>+ Criar anúncio →</a>
                </div>
              ) : (
                <div className="an-grid">
                  {activeListings.map(l => (
                    <div key={l.id} className="an-card">
                      <div className="an-top">
                        <div className="an-emoji">{TYPE_EMOJI[l.type]||'📋'}</div>
                        <div className="an-title">{l.title}</div>
                      </div>
                      <div className="an-meta">
                        {TYPE_LABEL[l.type]} · {l.price ? `R$ ${l.price.toLocaleString('pt-BR')}` : 'Grátis'} · {timeAgo(l.created_at)}
                      </div>
                      <span className={`an-badge ${l.status==='paused'?'':'badge-active'}`} style={l.status==='paused'?{background:'#F5F2EC',color:'#888'}:{}}>{l.status==='paused'?'⏸ Pausado':'Ativo'}</span>
                      <button className="an-del" onClick={()=>deleteListing(l.id)} title="Remover">🗑</button>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ABA AVALIAÇÕES */}
            {tab === 'avaliacoes' && (
              reviews.length === 0 ? (
                <div className="empty-tab">
                  <div style={{fontSize:40,marginBottom:10}}>⭐</div>
                  <div style={{fontSize:14,fontWeight:600,color:'#555',marginBottom:6}}>Nenhuma avaliação ainda</div>
                  <div style={{fontSize:12}}>Visite um comércio e deixe sua opinião!</div>
                </div>
              ) : (
                <div className="rv-list">
                  {reviews.map(r => (
                    <div key={r.id} className="rv-item">
                      {r.company && <a className="rv-empresa" href={`/empresa/${r.company.slug}`}>{r.company.name} →</a>}
                      <div className="rv-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
                      {r.text && <div className="rv-txt">{r.text}</div>}
                      <div className="rv-date">{fmtDate(r.created_at)}</div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ABA CUPONS */}
            {tab === 'cupons' && (
              myCoupons.length === 0 ? (
                <div className="empty-tab">
                  <div style={{fontSize:40,marginBottom:10}}>🎟️</div>
                  <div style={{fontSize:14,fontWeight:600,color:'#555',marginBottom:6}}>Nenhum cupom resgatado</div>
                  <div style={{fontSize:12,marginBottom:16}}>Resgate cupons das empresas do bairro!</div>
                  <a href="/cupons" style={{color:'#C9951A',fontSize:13,fontWeight:600,textDecoration:'none'}}>Ver cupons disponíveis →</a>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {myCoupons.map((r:any) => {
                    const used = r.status === 'used'
                    const phone = r.coupon?.company?.phone
                    const msg = encodeURIComponent(`Olá! Quero usar meu cupom *${r.code}* — ${r.coupon?.title}. Pode confirmar?`)
                    const waUrl = phone ? `https://wa.me/55${phone}?text=${msg}` : '#'
                    return (
                      <div key={r.id} style={{background:used?'#F5F2EC':'#fff',border:'0.5px solid #E0DDD8',borderRadius:12,display:'flex',overflow:'hidden',opacity:used?.7:1}}>
                        <div style={{width:60,display:'flex',alignItems:'center',justifyContent:'center',background:used?'#F0EDE8':'#FEF3E2',fontSize:26,flexShrink:0}}>🎟️</div>
                        <div style={{flex:1,padding:'10px 12px',borderLeft:'1px dashed #E0DDD8',minWidth:0,display:'flex',flexDirection:'column',justifyContent:'center',gap:2}}>
                          <div style={{fontSize:11,color:'#888'}}>{r.coupon?.company?.name}</div>
                          <div style={{fontSize:13,fontWeight:500,color:used?'#AAA':'#111',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.coupon?.title}</div>
                          <div style={{fontSize:13,fontWeight:600,color:used?'#BBB':'#C9951A',letterSpacing:2,fontFamily:'monospace'}}>{r.code}</div>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 12px',gap:4,flexShrink:0,borderLeft:'1px dashed #E0DDD8'}}>
                          {used ? (
                            <span style={{fontSize:10,background:'#F5F2EC',color:'#AAA',padding:'3px 10px',borderRadius:8}}>Utilizado</span>
                          ) : (
                            <>
                              <a href={waUrl} target="_blank" style={{padding:'5px 10px',background:'#25D366',color:'#fff',border:'none',borderRadius:7,fontSize:10,fontWeight:500,textDecoration:'none',whiteSpace:'nowrap'}}>WhatsApp</a>
                              <button onClick={()=>navigator.clipboard.writeText(r.code)} style={{padding:'5px 10px',background:'#F5F2EC',color:'#555',border:'none',borderRadius:7,fontSize:10,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap'}}>Copiar</button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
            {/* ABA FAVORITOS */}
            {tab === 'favoritos' && (
              favs.length === 0 ? (
                <div className="empty-tab">
                  <div style={{fontSize:40,marginBottom:10}}>❤️</div>
                  <div style={{fontSize:14,fontWeight:600,color:'#555',marginBottom:6}}>Nenhum favorito ainda</div>
                  <div style={{fontSize:12}}>Salve empresas que você gosta!</div>
                </div>
              ) : (
                <div className="fav-grid">
                  {favs.map(f => f.company && (
                    <a key={f.id} className="fav-card" href={`/empresa/${f.company.slug}`}>
                      <div className="fav-emoji">{f.company.category?.emoji||'🏪'}</div>
                      <div>
                        <div className="fav-name">{f.company.name}</div>
                        <div className="fav-cat">{f.company.category?.name||'—'}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        <div className="footer"><a href="/">← Voltar ao Trindade Online</a></div>
      <Footer/>
      </div>
    </>
  )
}