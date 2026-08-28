'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import ShareButton from '@/components/ShareButton'

type Coupon = {
  id: string; title: string; discount_type: string; discount_value: number
  total_qty: number; qty_per_person: number; expires_at: string; active: boolean; min_purchase?: number
  company: { id: string; name: string; slug: string; phone?: string; category?: { name: string; emoji: string }; photos?: { url: string; order: number }[] }
}

type RankingItem = {
  company_id: string; company_name: string; category_name: string; total: number
}

const RANKING_CATS = ['Comércios','Serviços','Gastronomia']
const CAT_EMOJI: Record<string,string> = { Comércios:'🏪', Serviços:'🔧', Gastronomia:'🍕' }

export default function CuponsPageClient({ embedded, search }: { embedded?: boolean; search?: string } = {}) {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string|null>(null)
  const [userType, setUserType] = useState<string|null>(null)
  const [editModal, setEditModal] = useState<Coupon|null>(null)
  const [editForm, setEditForm] = useState({title:'',discount_value:'',expires_at:'',min_purchase:''})
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('todos')
  const [redeeming, setRedeeming] = useState<string|null>(null)
  const [redeemModal, setRedeemModal] = useState<{code:string,coupon:Coupon}|null>(null)
  const [myRedemptions, setMyRedemptions] = useState<string[]>([])
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [rankingCat, setRankingCat] = useState('Comércios')
  const [showRanking, setShowRanking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async({ data: { session } }) => {
      if (session) { setUserId(session.user.id); loadMyRedemptions(session.user.id); const{data:p}=await supabase.from('profiles').select('user_type').eq('id',session.user.id).single(); if(p) setUserType(p.user_type) }
    })
    loadCoupons()
    loadRanking()
    supabase.from('feature_flags').select('enabled').eq('key', 'cupons_ranking').maybeSingle()
      .then(({ data }) => { if (data) setShowRanking(data.enabled) })
  }, [])

  async function loadCoupons() {
    const { data } = await supabase.from('coupons')
      .select('*, company:companies(id,name,slug,phone,category:categories(name,emoji),photos:company_photos(url,order))')
      .eq('active', true).gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    setCoupons((data || []) as Coupon[]); setLoading(false)
  }

  function getCover(photos?: { url: string; order: number }[]): string | null {
    if (!photos?.length) return null
    return [...photos].sort((a, b) => a.order - b.order)[0]?.url || null
  }

  async function loadRanking() {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
    const { data } = await supabase
      .from('coupon_redemptions')
      .select('coupon:coupons(company:companies(id,name,category:categories(name)))')
      .eq('status', 'used')
      .gte('used_at', firstDay)
      .lte('used_at', lastDay)
    if (!data) return
    const counts: Record<string, RankingItem> = {}
    data.forEach((r: any) => {
      const co = r.coupon?.company
      if (!co) return
      const catName = co.category?.name || ''
      if (!RANKING_CATS.includes(catName)) return
      const key = co.id
      if (!counts[key]) counts[key] = { company_id: co.id, company_name: co.name, category_name: catName, total: 0 }
      counts[key].total++
    })
    setRanking(Object.values(counts).sort((a,b) => b.total - a.total))
  }

  async function loadMyRedemptions(uid: string) {
    const { data } = await supabase.from('coupon_redemptions').select('coupon_id').eq('user_id', uid)
    setMyRedemptions((data || []).map((r: any) => r.coupon_id))
  }

  async function redeem(coupon: Coupon) {
    if (!userId) { window.location.href = '/login'; return }
    setRedeeming(coupon.id)
    const code = 'TRD-' + Math.random().toString(36).substring(2, 6).toUpperCase()
    const { error } = await supabase.from('coupon_redemptions').insert({ coupon_id: coupon.id, user_id: userId, code, status: 'active' })
    if (error) { alert('Erro: ' + error.message); setRedeeming(null); return }
    setMyRedemptions(prev => [...prev, coupon.id])
    setRedeeming(null)
    setRedeemModal({ code, coupon })
  }

  function timeLeft(expires: string) {
    const diff = new Date(expires).getTime() - Date.now()
    if (diff <= 0) return 'Expirado'
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    if (h > 24) return `${Math.floor(h/24)}d restantes`
    if (h > 0) return `${h}h restantes`
    return `${m}min restantes`
  }

  function fmtDiscount(c: Coupon) {
    return c.discount_type === 'fixed' ? `R$ ${c.discount_value.toFixed(2).replace('.',',')}` : `${c.discount_value}%`
  }

  function mesAtual() {
    return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  function proximoMes() {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
  }

  const EMOJIS: Record<string,string> = { Gastronomia:'🍕', Serviços:'🔧', Comércios:'🏪', Igrejas:'⛪', Imóveis:'🏠', Empregos:'💼', Desapega:'🏷️' }
  const searchTerm = (search || '').trim().toLowerCase()
  const filtered = coupons
    .filter(c => filter === 'todos' || c.company?.category?.name === filter)
    .filter(c => !searchTerm || c.title.toLowerCase().includes(searchTerm) || (c.company?.name || '').toLowerCase().includes(searchTerm))
  const categories = [...new Set(coupons.map(c => c.company?.category?.name).filter(Boolean))]
  const rankingPorCat = (cat: string) => ranking.filter(r => r.category_name === cat).slice(0, 3)

  function RankingCol({ cat }: { cat: string }) {
    const items = rankingPorCat(cat)
    return (
      <div className="rk-col">
        <div className="rk-col-hdr">
          <span>{CAT_EMOJI[cat]}</span>
          <span className="rk-col-title">{cat.toUpperCase()}</span>
        </div>
        <div className="rk-col-body">
          {items.length === 0 ? (
            <div className="rk-empty">Nenhum confirmado ainda<br/>este mês 🎯</div>
          ) : items.map((r, i) => (
            <div key={r.company_id} className={`rk-item rk-item-${i+1}`}>
              <div className={`rk-pos rk-pos-${i+1}`}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div className={`rk-name rk-name-${i+1}`}>{r.company_name}</div>
                <div className="rk-count">{r.total} confirmado{r.total!==1?'s':''}</div>
              </div>
              {i === 0 && <div className="rk-badge">🎬 Reel</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Archivo',sans-serif;background:var(--concrete);min-height:100vh;}
        .hero{background:var(--ink);}
        .hero-inner{max-width:1100px;margin:0 auto;padding:20px 20px 22px;}
        .hero-title{font-family:'Anton',sans-serif;font-size:28px;color:#fff;letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px;}
        .hero-title span{color:var(--sign);}
        .hero-sub{font-size:12px;color:rgba(255,255,255,0.45);}

        /* SEGMENTOS — chips pequenos deslizando na horizontal, mesma
           linguagem das subcategorias da página de categoria. */
        .seg-wrap{padding:14px 20px 0;max-width:1200px;margin:0 auto;}
        .seg-row{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 6px;}
        .seg-row::-webkit-scrollbar{display:none;}
        .seg-chip{flex:0 0 auto;width:60px;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;text-align:center;}
        .seg-ico{width:44px;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--paper);display:flex;align-items:center;justify-content:center;font-size:19px;transition:all .15s;}
        .seg-chip:hover .seg-ico{border-color:var(--sign-dark);}
        .seg-chip.on .seg-ico{border-color:var(--sign-dark);background:var(--concrete-2);}
        .seg-label{font-size:10px;font-weight:500;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;}
        .seg-chip.on .seg-label{color:var(--sign-dark);font-weight:700;}

        .body{padding:16px 20px;max-width:1200px;margin:0 auto;}
        .not-logged{background:var(--concrete-2);border:1px solid #F5C77A;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px;margin-bottom:16px;}
        .not-logged-text{font-size:13px;color:#854F0B;flex:1;}
        .not-logged-btn{padding:7px 16px;background:var(--sign);color:var(--ink);border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;text-decoration:none;}
        .sec-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.8px;font-weight:500;margin-bottom:10px;}
        .empty{text-align:center;padding:40px 20px;color:#888;font-size:14px;}

        /* CARDS — mesmo formato "OFERTAS DO BAIRRO" da home. */
        .grid{display:grid;grid-template-columns:1fr;gap:12px;}
        @media(min-width:640px){.grid{grid-template-columns:repeat(2,1fr);}}
        @media(min-width:1024px){.grid{grid-template-columns:repeat(3,1fr);}}
        .of-card{background:var(--paper);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;}
        .of-tag{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:6px 12px;color:#fff;background:var(--alert);}
        .of-body{padding:13px;flex:1;display:flex;gap:10px;align-items:flex-start;}
        .of-img{width:44px;height:44px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--concrete-2);display:flex;align-items:center;justify-content:center;font-size:18px;position:relative;}
        .of-img img{width:100%;height:100%;object-fit:cover;}
        .of-text{flex:1;min-width:0;}
        .of-who{font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;}
        .of-title{font-family:'Anton',sans-serif;font-size:17px;margin:0 0 4px;line-height:1.1;text-transform:uppercase;color:var(--ink);}
        .of-ft{padding:10px 13px;border-top:1px dashed var(--line);display:flex;justify-content:space-between;align-items:center;font-size:11.5px;}
        .of-ft .l{color:var(--muted);font-weight:600;}
        .of-ft .g{font-weight:700;color:var(--sign-dark);}
        .of-actions{padding:0 13px 13px;display:flex;align-items:center;gap:6px;}
        .of-btn{flex:1;padding:9px 12px;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;text-align:center;text-decoration:none;font-family:'Archivo',sans-serif;}

        /* RANKING */
        .rk-wrap{padding:16px 20px 0;max-width:1200px;margin:0 auto;}
        .rk-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
        .rk-title{font-family:'Anton',sans-serif;font-size:18px;color:var(--ink);letter-spacing:.5px;text-transform:uppercase;}
        .rk-sub{font-size:11px;color:#888;margin-top:2px;}
        .rk-premio{background:var(--ink);border:1px solid rgba(255,197,49,0.3);border-radius:8px;padding:6px 12px;text-align:center;flex-shrink:0;}
        .rk-premio-label{font-size:9px;color:var(--sign);font-weight:700;letter-spacing:1px;}
        .rk-premio-val{font-size:10px;color:#fff;font-weight:600;}
        .rk-premio-sub{font-size:9px;color:#555;}

        /* DESKTOP: 3 colunas */
        .rk-desktop{display:none;}
        @media(min-width:768px){.rk-desktop{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px;}}
        .rk-col{background:var(--ink);border-radius:12px;overflow:hidden;}
        .rk-col-hdr{padding:10px 12px;border-bottom:1px solid #1A1A1A;display:flex;align-items:center;gap:6px;}
        .rk-col-title{font-family:'Archivo',sans-serif;font-weight:800;font-size:12px;color:var(--sign);letter-spacing:.06em;text-transform:uppercase;}
        .rk-col-body{padding:8px 10px;display:flex;flex-direction:column;gap:6px;}
        .rk-item{display:flex;align-items:center;gap:8px;border-radius:8px;padding:8px 10px;}
        .rk-item-1{background:#1A1A1A;border:1px solid rgba(255,197,49,0.3);}
        .rk-item-2,.rk-item-3{background:#161616;border:1px solid #222;}
        .rk-pos{font-family:'Anton',sans-serif;font-size:22px;width:18px;flex-shrink:0;}
        .rk-pos-1{color:var(--sign);}
        .rk-pos-2{color:#888;}
        .rk-pos-3{color:#7a4500;}
        .rk-name{font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Archivo',sans-serif;}
        .rk-name-1{color:#fff;}
        .rk-name-2,.rk-name-3{color:#888;}
        .rk-count{font-size:9px;color:#555;margin-top:1px;}
        .rk-badge{font-size:9px;background:rgba(255,197,49,0.2);border:1px solid rgba(255,197,49,0.4);border-radius:5px;padding:2px 6px;color:var(--sign);white-space:nowrap;flex-shrink:0;}
        .rk-empty{text-align:center;padding:16px 8px;font-size:10px;color:#444;line-height:1.6;}
        .rk-footer{text-align:center;font-size:10px;color:#333;padding:4px 0 10px;}

        /* MOBILE: abas */
        .rk-mobile{display:block;margin-bottom:20px;}
        @media(min-width:768px){.rk-mobile{display:none;}}
        .rk-mobile-box{background:var(--ink);border-radius:14px;overflow:hidden;}
        .rk-tabs{display:flex;border-bottom:1px solid #1A1A1A;}
        .rk-tab{flex:1;padding:9px 4px;text-align:center;font-size:11px;font-weight:600;color:#555;cursor:pointer;border:none;background:transparent;border-bottom:2px solid transparent;font-family:'Archivo',sans-serif;}
        .rk-tab.on{color:var(--sign);border-bottom-color:var(--sign);}
        .rk-mob-body{padding:10px 12px;display:flex;flex-direction:column;gap:6px;}
        .rk-mob-item{display:flex;align-items:center;gap:10px;border-radius:10px;padding:10px 12px;}
        .rk-mob-item-1{background:#1A1A1A;border:1px solid rgba(255,197,49,0.3);}
        .rk-mob-item-2,.rk-mob-item-3{background:#161616;border:1px solid #222;}
        .rk-mob-pos{font-family:'Anton',sans-serif;font-size:24px;width:22px;flex-shrink:0;}
        .rk-mob-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Archivo',sans-serif;}
        .rk-mob-name-1{color:#fff;}
        .rk-mob-name-2,.rk-mob-name-3{color:#888;}
      `}</style>

      {!embedded && (
        <div className="hero"><div className="hero-inner">
          <div className="hero-title">🎟️ CUPONS <span>RELÂMPAGO</span></div>
          <div className="hero-sub">Descontos exclusivos das empresas do bairro · Quantidade limitada</div>
        </div></div>
      )}
      {categories.length > 0 && (
        <div className="seg-wrap">
          <div className="seg-row">
            <div className={`seg-chip ${filter==='todos'?'on':''}`} onClick={()=>setFilter('todos')}>
              <span className="seg-ico">🎟️</span><span className="seg-label">Todos</span>
            </div>
            {categories.map(cat => (
              <div key={cat} className={`seg-chip ${filter===cat?'on':''}`} onClick={()=>setFilter(cat||'')}>
                <span className="seg-ico">{EMOJIS[cat||'']||'🏪'}</span><span className="seg-label">{cat}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RANKING */}
      {showRanking && (
      <div className="rk-wrap">
        <div className="rk-header">
          <div>
            <div className="rk-title">🏆 RANKING DO MÊS</div>
            <div className="rk-sub">{mesAtual()} · Cupons confirmados · Top 3 por categoria</div>
          </div>
          <div className="rk-premio">
            <div className="rk-premio-label">PRÊMIO 1º LUGAR</div>
            <div className="rk-premio-val">Reel no Instagram</div>
            <div className="rk-premio-sub">@trindade.online</div>
          </div>
        </div>

        {/* DESKTOP — 3 colunas fixas */}
        <div className="rk-desktop">
          {RANKING_CATS.map(cat => <RankingCol key={cat} cat={cat} />)}
        </div>
        <div className="rk-footer" style={{display:'none'}} id="rk-footer-desktop">Reinicia em {proximoMes()}</div>

        {/* MOBILE — abas */}
        <div className="rk-mobile">
          <div className="rk-mobile-box">
            <div className="rk-tabs">
              {RANKING_CATS.map(cat => (
                <button key={cat} className={`rk-tab ${rankingCat===cat?'on':''}`} onClick={()=>setRankingCat(cat)}>
                  {CAT_EMOJI[cat]} {cat}
                </button>
              ))}
            </div>
            <div className="rk-mob-body">
              {rankingPorCat(rankingCat).length === 0 ? (
                <div className="rk-empty">Nenhum confirmado ainda este mês 🎯</div>
              ) : rankingPorCat(rankingCat).map((r, i) => (
                <div key={r.company_id} className={`rk-mob-item rk-mob-item-${i+1}`}>
                  <div className={`rk-mob-pos rk-pos-${i+1}`}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div className={`rk-mob-name rk-mob-name-${i+1}`}>{r.company_name}</div>
                    <div className="rk-count">{r.total} confirmado{r.total!==1?'s':''}</div>
                  </div>
                  {i === 0 && <div className="rk-badge">🎬 Reel</div>}
                </div>
              ))}
              <div className="rk-footer">Reinicia em {proximoMes()}</div>
            </div>
          </div>
        </div>
      </div>
      )}

      <div className="body" style={{minHeight:"calc(100vh - 300px)"}}>
        {!userId && (
          <div className="not-logged">
            <span style={{fontSize:18}}>🔒</span>
            <div className="not-logged-text">Faça login para resgatar cupons e garantir seu desconto</div>
            <a className="not-logged-btn" href="/login">Entrar</a>
          </div>
        )}
        {loading ? (
          <div className="empty">Carregando cupons...</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum cupom disponível no momento</div>
        ) : (
          <>
            <div className="sec-label">{filtered.length} cupons disponíveis</div>
            <div className="grid">
              {filtered.map(c => {
                const already = myRedemptions.includes(c.id)
                const cover = getCover(c.company?.photos)
                return (
                  <div key={c.id} className="of-card" style={already?{opacity:.7}:{}}>
                    <span className="of-tag">🎟️ CUPOM RELÂMPAGO</span>
                    <div className="of-body">
                      <div className="of-img">
                        {cover ? <Image src={cover} alt="" fill sizes="44px" unoptimized style={{objectFit:'cover'}} /> : '🎟️'}
                      </div>
                      <div className="of-text">
                        <div className="of-who">{c.company?.name}</div>
                        <div className="of-title">{c.title}</div>
                      </div>
                    </div>
                    <div className="of-ft">
                      <span className="l">⏱ {timeLeft(c.expires_at)} · {c.total_qty} cupons</span>
                      <span className="g">{fmtDiscount(c)}</span>
                    </div>
                    <div className="of-actions">
                      {already ? (
                        <a href="/perfil?tab=cupons" className="of-btn" style={{background:'#EAF3DE',color:'#3B6D11'}}>Ver código</a>
                      ) : (
                        <button className="of-btn" style={{background:'#157A52',color:'#fff'}} onClick={()=>redeem(c)} disabled={redeeming===c.id}>
                          {redeeming===c.id?'...Aguarde':'Resgatar'}
                        </button>
                      )}
                      {c.company?.slug && (
                        <a href={`/empresa/${c.company.slug}`} className="of-btn" style={{background:'var(--concrete-2)',color:'var(--ink)'}}>Ver loja</a>
                      )}
                      <ShareButton title={c.title} text={`🎟️ Cupom ${c.title} — ${c.company?.name} no Trindade Online!`} url={`${typeof window!=='undefined'?window.location.origin:''}/cupons`} label="" fullWidth={false}/>
                      {userType==='admin' && (
                        <>
                          <button onClick={()=>{setEditModal(c);setEditForm({title:c.title,discount_value:String(c.discount_value),expires_at:c.expires_at.slice(0,16),min_purchase:c.min_purchase?String(c.min_purchase):''})}} style={{padding:'6px 8px',background:'#FEF3E2',color:'#854F0B',border:'1px solid #F5C77A',borderRadius:6,fontSize:10,cursor:'pointer',fontWeight:600}}>✏️</button>
                          <button onClick={async()=>{if(confirm('Deletar cupom?')){await fetch('/api/coupons/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({coupon_id:c.id})});loadCoupons()}}} style={{padding:'6px 8px',background:'#FCEBEB',color:'#E24B4A',border:'1px solid #F7C1C1',borderRadius:6,fontSize:10,cursor:'pointer',fontWeight:600}}>🗑</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {redeemModal && (
        <div onClick={()=>setRedeemModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:20,padding:28,width:'100%',maxWidth:420,textAlign:'center'}}>
            <div style={{fontSize:40,marginBottom:8}}>🎟️</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:'var(--ink)',letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>CUPOM RESGATADO!</div>
            <div style={{fontSize:13,color:'#888',marginBottom:20}}>{redeemModal.coupon.title}</div>
            <div style={{background:'#F5F2EC',borderRadius:12,padding:'16px 20px',marginBottom:20}}>
              <div style={{fontSize:11,color:'#888',marginBottom:6,textTransform:'uppercase',letterSpacing:.6}}>Seu código</div>
              <div style={{fontSize:32,fontWeight:700,color:'#111',letterSpacing:6,fontFamily:'monospace'}}>{redeemModal.code}</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{fontSize:12,color:'#555',marginBottom:4}}>Apresente este código ao lojista ou envie pelo WhatsApp</div>
              {redeemModal.coupon.company?.phone && (
                <a href={`https://wa.me/55${redeemModal.coupon.company.phone}?text=${encodeURIComponent(`Olá! Quero usar meu cupom *${redeemModal.code}* — ${redeemModal.coupon.title}. Pode confirmar?`)}`} target="_blank"
                  style={{padding:'12px',background:'#25D366',color:'#fff',border:'none',borderRadius:12,fontSize:14,fontWeight:600,textDecoration:'none',display:'block'}}>
                  💬 Enviar pelo WhatsApp
                </a>
              )}
              <button onClick={()=>setRedeemModal(null)}
                style={{padding:'12px',background:'#F5F2EC',color:'#555',border:'none',borderRadius:12,fontSize:13,cursor:'pointer'}}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {editModal && (
        <div onClick={()=>setEditModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,padding:28,width:"100%",maxWidth:420}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:20,color:"var(--ink)",letterSpacing:1,textTransform:'uppercase',marginBottom:16}}>✏️ EDITAR CUPOM</div>
            <div style={{marginBottom:10}}><label style={{fontSize:12,fontWeight:600,color:"#444",display:"block",marginBottom:4}}>TÍTULO</label><input value={editForm.title} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #E0DDD8",borderRadius:8,fontSize:13,fontFamily:"Archivo,sans-serif",outline:"none"}}/></div>
            <div style={{marginBottom:10}}><label style={{fontSize:12,fontWeight:600,color:"#444",display:"block",marginBottom:4}}>VALOR DO DESCONTO</label><input type="number" value={editForm.discount_value} onChange={e=>setEditForm(f=>({...f,discount_value:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #E0DDD8",borderRadius:8,fontSize:13,fontFamily:"Archivo,sans-serif",outline:"none"}}/></div>
            <div style={{marginBottom:10}}><label style={{fontSize:12,fontWeight:600,color:"#444",display:"block",marginBottom:4}}>COMPRA MÍNIMA (R$)</label><input type="number" value={editForm.min_purchase} onChange={e=>setEditForm(f=>({...f,min_purchase:e.target.value}))} placeholder="0 = sem mínimo" style={{width:"100%",padding:"9px 12px",border:"1.5px solid #E0DDD8",borderRadius:8,fontSize:13,fontFamily:"Archivo,sans-serif",outline:"none"}}/></div>
            <div style={{marginBottom:16}}><label style={{fontSize:12,fontWeight:600,color:"#444",display:"block",marginBottom:4}}>VALIDADE</label><input type="datetime-local" value={editForm.expires_at} onChange={e=>setEditForm(f=>({...f,expires_at:e.target.value}))} style={{width:"100%",padding:"9px 12px",border:"1.5px solid #E0DDD8",borderRadius:8,fontSize:13,fontFamily:"Archivo,sans-serif",outline:"none"}}/></div>
            <button onClick={async()=>{if(!editModal)return;setSaving(true);await fetch("/api/coupons/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({coupon_id:editModal.id,updates:{title:editForm.title,discount_value:Number(editForm.discount_value),expires_at:new Date(editForm.expires_at).toISOString(),min_purchase:editForm.min_purchase?Number(editForm.min_purchase):0}})});setSaving(false);setEditModal(null);loadCoupons()}} style={{width:"100%",padding:12,background:"var(--sign)",color:"var(--ink)",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"Archivo,sans-serif",marginBottom:8}}>{saving?"Salvando...":"Salvar alterações"}</button>
            <button onClick={()=>setEditModal(null)} style={{width:"100%",padding:10,background:"#F5F2EC",color:"#888",border:"none",borderRadius:10,fontSize:13,cursor:"pointer",fontFamily:"Archivo,sans-serif"}}>Cancelar</button>
          </div>
        </div>
      )}
      {!embedded && <Footer/>}
    </>
  )
}
