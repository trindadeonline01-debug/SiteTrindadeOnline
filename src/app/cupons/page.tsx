'use client'
import { useState, useEffect } from 'react'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'

type Coupon = {
  id: string; title: string; discount_type: string; discount_value: number
  total_qty: number; qty_per_person: number; expires_at: string; active: boolean
  company: { id: string; name: string; phone?: string; category?: { name: string; emoji: string } }
}

type RankingItem = {
  company_id: string; company_name: string; category_name: string; total: number
}

const RANKING_CATS = ['Comércios','Serviços','Gastronomia']
const CAT_EMOJI: Record<string,string> = { Comércios:'🏪', Serviços:'🔧', Gastronomia:'🍕' }

export default function CuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string|null>(null)
  const [filter, setFilter] = useState('todos')
  const [redeeming, setRedeeming] = useState<string|null>(null)
  const [redeemModal, setRedeemModal] = useState<{code:string,coupon:Coupon}|null>(null)
  const [myRedemptions, setMyRedemptions] = useState<string[]>([])
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [rankingCat, setRankingCat] = useState('Comércios')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setUserId(session.user.id); loadMyRedemptions(session.user.id) }
    })
    loadCoupons()
    loadRanking()
  }, [])

  async function loadCoupons() {
    const { data } = await supabase.from('coupons')
      .select('*, company:companies(id,name,phone,category:categories(name,emoji))')
      .eq('active', true).gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    setCoupons(data || []); setLoading(false)
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
  const filtered = filter === 'todos' ? coupons : coupons.filter(c => c.company?.category?.name === filter)
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
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;min-height:100vh;}
        .hero{background:#111;}
        .hero-inner{max-width:1100px;margin:0 auto;padding:20px 20px 22px;}
        .hero-title{font-family:'Bebas Neue',sans-serif;font-size:28px;color:#fff;letter-spacing:2px;margin-bottom:4px;}
        .hero-title span{color:#C9951A;}
        .hero-sub{font-size:12px;color:rgba(255,255,255,0.45);margin-bottom:16px;}
        .filters{display:flex;gap:8px;flex-wrap:wrap;}
        .filter-btn{padding:6px 16px;border-radius:20px;font-size:12px;font-weight:500;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);background:transparent;cursor:pointer;}
        .filter-btn.on{background:#C9951A;color:#111;border-color:#C9951A;}
        .body{padding:16px 20px;max-width:1200px;margin:0 auto;}
        .not-logged{background:#FEF3E2;border:1px solid #F5C77A;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px;margin-bottom:16px;}
        .not-logged-text{font-size:13px;color:#854F0B;flex:1;}
        .not-logged-btn{padding:7px 16px;background:#C9951A;color:#111;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;text-decoration:none;}
        .sec-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.8px;font-weight:500;margin-bottom:10px;}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
        @media(max-width:640px){.grid{grid-template-columns:1fr;}}
        .coupon{background:#fff;border-radius:12px;border:0.5px solid #E0DDD8;display:flex;overflow:hidden;height:80px;}@media(max-width:640px){.coupon{height:96px;}}
        .coupon-left{width:68px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:30px;background:#FEF3E2;}
        .coupon-body{flex:1;padding:10px 12px;border-left:1px dashed #E0DDD8;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px;overflow:hidden;}
        .coupon-empresa{font-size:10px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .coupon-title{font-size:13px;font-weight:500;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .coupon-tags{display:flex;gap:4px;flex-wrap:wrap;}
        .coupon-tag{font-size:9px;padding:2px 7px;border-radius:8px;white-space:nowrap;}
        .coupon-right{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 12px;gap:4px;flex-shrink:0;border-left:1px dashed #E0DDD8;}
        .coupon-valor{font-size:17px;font-weight:600;color:#C9951A;white-space:nowrap;}
        .coupon-btn{padding:5px 12px;border:none;border-radius:8px;font-size:11px;font-weight:500;cursor:pointer;white-space:nowrap;}
        .empty{text-align:center;padding:40px 20px;color:#888;font-size:14px;}

        /* RANKING */
        .rk-wrap{padding:16px 20px 0;max-width:1200px;margin:0 auto;}
        .rk-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
        .rk-title{font-family:'Bebas Neue',sans-serif;font-size:18px;color:#111;letter-spacing:2px;}
        .rk-sub{font-size:11px;color:#888;margin-top:2px;}
        .rk-premio{background:#111;border:1px solid rgba(201,149,26,0.3);border-radius:8px;padding:6px 12px;text-align:center;flex-shrink:0;}
        .rk-premio-label{font-size:9px;color:#C9951A;font-weight:700;letter-spacing:1px;}
        .rk-premio-val{font-size:10px;color:#fff;font-weight:600;}
        .rk-premio-sub{font-size:9px;color:#555;}

        /* DESKTOP: 3 colunas */
        .rk-desktop{display:none;}
        @media(min-width:768px){.rk-desktop{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px;}}
        .rk-col{background:#111;border-radius:12px;overflow:hidden;}
        .rk-col-hdr{padding:10px 12px;border-bottom:1px solid #1A1A1A;display:flex;align-items:center;gap:6px;}
        .rk-col-title{font-family:'Bebas Neue',sans-serif;font-size:14px;color:#C9951A;letter-spacing:1px;}
        .rk-col-body{padding:8px 10px;display:flex;flex-direction:column;gap:6px;}
        .rk-item{display:flex;align-items:center;gap:8px;border-radius:8px;padding:8px 10px;}
        .rk-item-1{background:#1A1A1A;border:1px solid rgba(201,149,26,0.3);}
        .rk-item-2,.rk-item-3{background:#161616;border:1px solid #222;}
        .rk-pos{font-family:'Bebas Neue',sans-serif;font-size:22px;width:18px;flex-shrink:0;}
        .rk-pos-1{color:#C9951A;}
        .rk-pos-2{color:#888;}
        .rk-pos-3{color:#7a4500;}
        .rk-name{font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .rk-name-1{color:#fff;}
        .rk-name-2,.rk-name-3{color:#888;}
        .rk-count{font-size:9px;color:#555;margin-top:1px;}
        .rk-badge{font-size:9px;background:rgba(201,149,26,0.2);border:1px solid rgba(201,149,26,0.4);border-radius:5px;padding:2px 6px;color:#C9951A;white-space:nowrap;flex-shrink:0;}
        .rk-empty{text-align:center;padding:16px 8px;font-size:10px;color:#444;line-height:1.6;}
        .rk-footer{text-align:center;font-size:10px;color:#333;padding:4px 0 10px;}

        /* MOBILE: abas */
        .rk-mobile{display:block;margin-bottom:20px;}
        @media(min-width:768px){.rk-mobile{display:none;}}
        .rk-mobile-box{background:#111;border-radius:14px;overflow:hidden;}
        .rk-tabs{display:flex;border-bottom:1px solid #1A1A1A;}
        .rk-tab{flex:1;padding:9px 4px;text-align:center;font-size:11px;font-weight:600;color:#555;cursor:pointer;border:none;background:transparent;border-bottom:2px solid transparent;font-family:'Inter',sans-serif;}
        .rk-tab.on{color:#C9951A;border-bottom-color:#C9951A;}
        .rk-mob-body{padding:10px 12px;display:flex;flex-direction:column;gap:6px;}
        .rk-mob-item{display:flex;align-items:center;gap:10px;border-radius:10px;padding:10px 12px;}
        .rk-mob-item-1{background:#1A1A1A;border:1px solid rgba(201,149,26,0.3);}
        .rk-mob-item-2,.rk-mob-item-3{background:#161616;border:1px solid #222;}
        .rk-mob-pos{font-family:'Bebas Neue',sans-serif;font-size:24px;width:22px;flex-shrink:0;}
        .rk-mob-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .rk-mob-name-1{color:#fff;}
        .rk-mob-name-2,.rk-mob-name-3{color:#888;}
      `}</style>

      <div className="hero"><div className="hero-inner">
        <div className="hero-title">🎟️ CUPONS <span>RELÂMPAGO</span></div>
        <div className="hero-sub">Descontos exclusivos das empresas do bairro · Quantidade limitada</div>
        <div className="filters">
          <button className={`filter-btn ${filter==='todos'?'on':''}`} onClick={()=>setFilter('todos')}>Todos ({coupons.length})</button>
          {categories.map(cat => (
            <button key={cat} className={`filter-btn ${filter===cat?'on':''}`} onClick={()=>setFilter(cat||'')}>{cat}</button>
          ))}
        </div>
      </div></div>

      {/* RANKING */}
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
                const emoji = EMOJIS[c.company?.category?.name||''||'🏪']
                return (
                  <div key={c.id} className="coupon" style={already?{opacity:.7}:{}}>
                    <div className="coupon-left">{emoji||'🏪'}</div>
                    <div className="coupon-body">
                      <div className="coupon-empresa">{c.company?.name}</div>
                      <div className="coupon-title">{c.title}</div>
                      <div className="coupon-tags">
                        <span className="coupon-tag" style={{background:'#FCEBEB',color:'#A32D2D'}}>⏱ {timeLeft(c.expires_at)}</span>
                        <span className="coupon-tag" style={{background:'#F5F2EC',color:'#666'}}>{c.total_qty} cupons</span>
                      </div>
                    </div>
                    <div className="coupon-right">
                      <div className="coupon-valor">{fmtDiscount(c)}</div>
                      {already ? (
                        <a href="/perfil?tab=cupons" className="coupon-btn" style={{background:'#EAF3DE',color:'#3B6D11',textDecoration:'none'}}>Ver código</a>
                      ) : (
                        <button className="coupon-btn" style={{background:'#111',color:'#C9951A'}} onClick={()=>redeem(c)} disabled={redeeming===c.id}>
                          {redeeming===c.id?'...Aguarde':'Resgatar'}
                        </button>
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
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#111',letterSpacing:1,marginBottom:4}}>CUPOM RESGATADO!</div>
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
      <Footer/>
    </>
  )
}