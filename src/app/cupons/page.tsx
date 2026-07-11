'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Coupon = {
  id: string; title: string; discount_type: string; discount_value: number
  total_qty: number; qty_per_person: number; expires_at: string; active: boolean
  company: { id: string; name: string; phone?: string; category?: { name: string; emoji: string } }
}

export default function CuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string|null>(null)
  const [filter, setFilter] = useState('todos')
  const [redeeming, setRedeeming] = useState<string|null>(null)
  const [myRedemptions, setMyRedemptions] = useState<string[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setUserId(session.user.id); loadMyRedemptions(session.user.id) }
    })
    loadCoupons()
  }, [])

  async function loadCoupons() {
    const { data } = await supabase.from('coupons')
      .select('*, company:companies(id,name,phone,category:categories(name,emoji))')
      .eq('active', true).gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    setCoupons(data || []); setLoading(false)
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
    window.location.href = '/perfil?tab=cupons'
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

  const EMOJIS: Record<string,string> = { Gastronomia:'🍕', Serviços:'🔧', Comércios:'🏪', Igrejas:'⛪', Imóveis:'🏠', Empregos:'💼', Desapega:'🏷️' }
  const filtered = filter === 'todos' ? coupons : coupons.filter(c => c.company?.category?.name === filter)
  const categories = [...new Set(coupons.map(c => c.company?.category?.name).filter(Boolean))]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'Inter',sans-serif;background:#F0EDE8;}
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
        .coupon{background:#fff;border-radius:12px;border:0.5px solid #E0DDD8;display:flex;overflow:hidden;height:80px;}
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
      <div className="body">
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
    </>
  )
}
