'use client'
import { useRef, useState } from 'react'
import { isOpenNow } from '@/lib/businessHours'
import { type Produto, fmt, promoPrice, groupContribution, cartStorageKey } from '@/lib/lojaPricing'

type Company = {
  id: string; name: string; slug: string; phone: string | null; address: string | null
  avg_rating: number; total_reviews: number
  flexible_hours?: boolean
  store_paused?: boolean
  category?: { name: string; slug: string } | null
  hours?: any[]
}
type Related = { id: string; name: string; photo_url: string | null; sale_price: number; promo_type: 'percent' | 'fixed' | null; promo_value: number | null; promo_starts_at: string | null; promo_ends_at: string | null }

export default function ProdutoDetailClient({ slug, company, produto, related }: { slug: string; company: Company; produto: Produto; related: Related[] }) {
  const [sel, setSel] = useState<number[][]>(produto.groups.map(() => []))
  const [qty, setQty] = useState(1)
  const [obs, setObs] = useState('')
  const [adding, setAdding] = useState(false)
  const groupRefs = useRef<(HTMLDivElement | null)[]>([])

  const open = isOpenNow(company.hours, company.flexible_hours, company.store_paused)
  const promo = promoPrice(produto)
  const basePrice = promo ?? produto.sale_price
  const unitPrice = basePrice + produto.groups.reduce((s, g, gi) => s + groupContribution(g, sel[gi]), 0)
  const reqMet = produto.groups.every((g, gi) => !g.required || sel[gi].length >= g.min_select)
  const initials = company.name.trim().slice(0, 2).toUpperCase()

  // Grupo com máximo 1 (ex: tamanho) continua radio. Grupos com máximo maior
  // permitem repetir a MESMA opção várias vezes (pedir o mesmo molho 3x, em
  // vez de ser forçado a escolher 3 molhos diferentes).
  function toggleRadio(gi: number, oi: number) {
    setSel(prev => prev.map((s, i) => (i === gi ? (s.includes(oi) ? [] : [oi]) : s)))
  }
  function addOpt(gi: number, oi: number) {
    const g = produto.groups[gi]
    const o = g.options[oi]
    setSel(prev => {
      const cur = prev[gi] || []
      if (cur.length >= g.max_select) return prev
      if (o.max_qty != null && cur.filter(x => x === oi).length >= o.max_qty) return prev
      const next = prev.map((s, i) => (i === gi ? [...s, oi] : s))
      if (next[gi].length === g.max_select && next[gi].length !== cur.length) {
        const nextEl = groupRefs.current[gi + 1]
        if (nextEl) setTimeout(() => nextEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
      }
      return next
    })
  }
  function removeOpt(gi: number, oi: number) {
    setSel(prev => prev.map((s, i) => {
      if (i !== gi) return s
      const idx = s.indexOf(oi)
      if (idx === -1) return s
      const next = [...s]; next.splice(idx, 1); return next
    }))
  }

  function addToCartAndGo() {
    if (!reqMet || adding || !open) return
    setAdding(true)
    const modifiers: { name: string; price: number }[] = []
    produto.groups.forEach((g, gi) => {
      const counts = new Map<number, number>()
      ;(sel[gi] || []).forEach(oi => counts.set(oi, (counts.get(oi) || 0) + 1))
      counts.forEach((qtyN, oi) => {
        const o = g.options[oi]
        modifiers.push({ name: qtyN > 1 ? `${o.name} x${qtyN}` : o.name, price: o.price * qtyN })
      })
    })
    const key = produto.id + '|' + modifiers.map(m => m.name).sort().join('+')
    try {
      localStorage.setItem(cartStorageKey(slug), JSON.stringify({
        cart: [{ key, produtoId: produto.id, name: produto.name, modifiers, unitPrice, qty }],
        deliveryType: 'entrega', cep: '', numero: '', cepData: null, address: '',
        agendarRetirada: false, scheduleDate: '', scheduleTime: '', obs: obs.trim(), payMethod: 'pix',
      }))
    } catch {}
    window.location.href = `/empresa/${slug}/cardapio`
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--concrete)', fontFamily: "'Archivo',sans-serif", paddingBottom: 90 }}>
      <style>{`
        .id-crumb{max-width:760px;margin:0 auto;padding:14px 16px 0;font-size:12px;color:#888;}
        .id-crumb a{color:var(--sign-dark);font-weight:600;text-decoration:none;}
        .id-wrap{max-width:760px;margin:0 auto;padding:14px 16px 24px;}
        .id-photo{width:100%;height:280px;border-radius:14px;overflow:hidden;background:var(--ink);display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Archivo',sans-serif;font-weight:700;font-size:26px;}
        .id-photo img{width:100%;height:100%;object-fit:cover;}
        .id-photo-closed img{filter:grayscale(1);}
        .id-bar-closed{padding:12px 16px;background:#FBEAEA;color:#A83232;font-size:12.5px;font-weight:600;text-align:center;}
        .id-pillrow{display:flex;align-items:center;gap:8px;margin:14px 0 6px;font-size:12px;color:#888;flex-wrap:wrap;}
        .id-open{background:#E6F4EA;color:#1B7A3E;font-weight:700;padding:3px 9px;border-radius:20px;font-size:11.5px;}
        .id-closed{background:#F0EDE8;color:#888;font-weight:700;padding:3px 9px;border-radius:20px;font-size:11.5px;}
        .id-name{font-family:'Archivo',sans-serif;font-weight:700;font-size:22px;color:var(--ink);line-height:1.15;margin:2px 0 8px;}
        .id-price{font-family:'Anton',sans-serif;font-size:32px;color:var(--ink);}
        .id-price-old{font-size:15px;color:#AAA;text-decoration:line-through;margin-left:8px;}
        .id-desc{font-size:13.5px;color:#4A4741;line-height:1.6;margin:12px 0 18px;}
        .id-opts{background:#fff;border:1px solid #E0DDD8;border-radius:12px;overflow:hidden;margin-bottom:14px;}
        .id-opts-h{background:#F5F2EC;padding:10px 14px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px;}
        .id-opts-req{font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;background:var(--ink);color:#fff;padding:2px 7px;border-radius:4px;}
        .id-opt{display:flex;align-items:center;gap:10px;padding:11px 14px;border-top:1px solid #F0EDE8;font-size:13.5px;cursor:pointer;}
        .id-opt-radio{width:18px;height:18px;border-radius:50%;border:1.5px solid #DDD;flex-shrink:0;position:relative;}
        .id-opt-radio.on{border:5px solid var(--sign-dark);}
        .id-opt-plus{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--sign-dark);color:#8A6410;background:#FEF3E2;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .id-opt-plus.disabled{opacity:.35;border-color:#DDD;color:#AAA;background:#F5F2EC;}
        .id-opt-stepper{display:flex;align-items:center;gap:7px;flex-shrink:0;}
        .id-opt-stepper b{min-width:12px;text-align:center;font-size:12.5px;}
        .id-opt-stepper button{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--sign-dark);background:var(--sign-dark);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:pointer;}
        .id-opt-stepper button:disabled{opacity:.35;border-color:#DDD;background:#DDD;cursor:default;}
        .id-opt-name{flex:1;}
        .id-opt-price{font-size:12px;color:#888;font-weight:600;}
        .id-seller{background:#fff;border:1px solid #E0DDD8;border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;margin-bottom:16px;text-decoration:none;color:inherit;}
        .id-seller-av{width:42px;height:42px;border-radius:10px;background:var(--sign-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0;}
        .id-seller-name{font-weight:700;font-size:13.5px;color:var(--ink);}
        .id-seller-m{font-size:11.5px;color:#888;margin-top:2px;}
        .id-seller-go{margin-left:auto;font-size:12px;font-weight:700;color:var(--sign-dark);white-space:nowrap;}
        .id-obs{width:100%;border:1px solid #E0DDD8;border-radius:10px;padding:11px 12px;font-size:13px;font-family:inherit;color:#333;resize:none;margin-bottom:18px;background:#fff;}
        .id-related-h{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#888;margin:0 0 10px;}
        .id-related{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
        @media(min-width:600px){.id-related{grid-template-columns:repeat(4,1fr);}}
        .id-rp{background:#fff;border:1px solid #E0DDD8;border-radius:10px;overflow:hidden;text-decoration:none;color:inherit;}
        .id-rp-im{height:80px;background:var(--ink);display:flex;align-items:center;justify-content:center;}
        .id-rp-im img{width:100%;height:100%;object-fit:cover;}
        .id-rp-b{padding:8px 10px;}
        .id-rp-nm{font-size:11.5px;font-weight:600;line-height:1.25;min-height:28px;}
        .id-rp-pr{font-family:'Anton',sans-serif;font-size:15px;color:var(--ink);margin-top:3px;}
        .id-bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #E0DDD8;padding:10px 16px;display:flex;align-items:center;gap:10px;z-index:40;}
        .id-qty{display:flex;align-items:center;border:1px solid #E0DDD8;border-radius:8px;background:#fff;flex-shrink:0;}
        .id-qty button{border:0;background:transparent;padding:9px 13px;font-size:15px;font-weight:700;cursor:pointer;}
        .id-qty span{padding:0 6px;font-weight:700;font-size:14px;}
        .id-main-btn{flex:1;background:var(--open);color:#fff;border:0;padding:13px;border-radius:9px;font-size:13.5px;font-weight:700;cursor:pointer;}
        .id-main-btn:disabled{opacity:.55;cursor:not-allowed;}
      `}</style>

      <div className="id-crumb">
        <a href="/">Trindade</a>
        {company.category && <> › <a href={`/categoria/${company.category.slug}`}>{company.category.name}</a></>}
        {' '}› <a href={`/empresa/${slug}`}>{company.name}</a> › {produto.name}
      </div>

      <div className="id-wrap">
        <div className={`id-photo ${!open ? 'id-photo-closed' : ''}`}>
          {produto.photo_url ? <img src={produto.photo_url} alt={produto.name} /> : initials}
        </div>

        <div className="id-pillrow">
          <span className={open ? 'id-open' : 'id-closed'}>{open ? '● Aberto agora' : 'Fechado no momento'}</span>
          {company.avg_rating > 0 && <span>★ {company.avg_rating.toFixed(1)} ({company.total_reviews})</span>}
        </div>

        <h1 className="id-name">{produto.name}</h1>
        <div>
          <span className="id-price">{fmt(basePrice)}</span>
          {promo && <span className="id-price-old">{fmt(produto.sale_price)}</span>}
        </div>

        {produto.description && <p className="id-desc">{produto.description}</p>}

        {produto.groups.map((g, gi) => (
          <div className="id-opts" key={g.id} ref={el => { groupRefs.current[gi] = el }}>
            <div className="id-opts-h">
              {g.name}
              {g.required && <span className="id-opts-req">Obrigatório</span>}
            </div>
            {g.options.map((o, oi) => {
              const on = sel[gi].includes(oi)
              const qtyForOpt = sel[gi].filter(x => x === oi).length
              const groupFull = sel[gi].length >= g.max_select
              const optAtMax = o.max_qty != null && qtyForOpt >= o.max_qty
              const canAddMore = !groupFull && !optAtMax
              return (
                <div className="id-opt" key={o.id}
                  onClick={() => { if (g.max_select === 1) toggleRadio(gi, oi); else if (canAddMore) addOpt(gi, oi) }}>
                  {g.max_select === 1
                    ? <span className={`id-opt-radio ${on ? 'on' : ''}`} />
                    : qtyForOpt === 0
                      ? <span className={`id-opt-plus ${canAddMore ? '' : 'disabled'}`}>+</span>
                      : (
                        <span className="id-opt-stepper" onClick={e => e.stopPropagation()}>
                          <button type="button" aria-label={`Tirar um ${o.name}`} onClick={() => removeOpt(gi, oi)}>−</button>
                          <b>{qtyForOpt}</b>
                          <button type="button" aria-label={`Adicionar mais um ${o.name}`} disabled={!canAddMore} onClick={() => canAddMore && addOpt(gi, oi)}>+</button>
                        </span>
                      )}
                  <span className="id-opt-name">{o.name}</span>
                  {o.price > 0 && <span className="id-opt-price">+ {fmt(o.price)}</span>}
                </div>
              )
            })}
          </div>
        ))}

        <a className="id-seller" href={`/empresa/${slug}/cardapio`}>
          <span className="id-seller-av">{initials}</span>
          <span>
            <div className="id-seller-name">{company.name}</div>
            <div className="id-seller-m">{company.category?.name || 'Cardápio'}{company.avg_rating > 0 ? ` · ★ ${company.avg_rating.toFixed(1)}` : ''}</div>
          </span>
          <span className="id-seller-go">Ver cardápio →</span>
        </a>

        <textarea className="id-obs" rows={2} placeholder="Observação (ex: sem cebola)" value={obs} onChange={e => setObs(e.target.value)} />

        {related.length > 0 && (
          <>
            <div className="id-related-h">Também tem</div>
            <div className="id-related">
              {related.map(r => {
                const rPromo = promoPrice(r as any)
                return (
                  <a className="id-rp" key={r.id} href={`/empresa/${slug}/item/${r.id}`}>
                    <div className="id-rp-im">{r.photo_url ? <img src={r.photo_url} alt={r.name} /> : <span style={{ color: '#fff', fontFamily: "'Archivo',sans-serif", fontWeight: 700 }}>{r.name.slice(0, 2).toUpperCase()}</span>}</div>
                    <div className="id-rp-b">
                      <div className="id-rp-nm">{r.name}</div>
                      <div className="id-rp-pr">{fmt(rPromo ?? r.sale_price)}</div>
                    </div>
                  </a>
                )
              })}
            </div>
          </>
        )}
      </div>

      {open ? (
        <div className="id-bar">
          <div className="id-qty">
            <button onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
            <span>{qty}</span>
            <button onClick={() => setQty(q => q + 1)}>+</button>
          </div>
          <button className="id-main-btn" disabled={!reqMet} onClick={addToCartAndGo}>
            {adding ? 'Adicionando...' : `Adicionar · ${fmt(unitPrice * qty)}`}
          </button>
        </div>
      ) : (
        <div className="id-bar id-bar-closed">🔒 {company.store_paused ? 'A loja pausou o recebimento de pedidos no momento.' : 'A loja está fechada no momento.'}</div>
      )}
    </div>
  )
}
