'use client'
import { useRef, useState } from 'react'
import Image from 'next/image'
import { isOpenNow } from '@/lib/businessHours'
import { type Produto, fmt, promoPrice, groupContribution, cartStorageKey, checkCartConflict, setActiveCart } from '@/lib/lojaPricing'

type Company = {
  id: string; name: string; slug: string; phone: string | null; address: string | null
  avg_rating: number; total_reviews: number
  flexible_hours?: boolean
  store_paused?: boolean
  store_forced_open?: boolean
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

  const open = isOpenNow(company.hours, company.flexible_hours, company.store_paused, company.store_forced_open)
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
    // Cliente só compra de uma loja por vez — se o carrinho ativo é de
    // outra empresa, confirma antes de esvaziar e trocar.
    const conflict = checkCartConflict(slug)
    if (conflict) {
      const ok = window.confirm(`Seu carrinho tem ${conflict.count} ${conflict.count === 1 ? 'item' : 'itens'} de ${conflict.companyName}. Trocar pro carrinho de ${company.name}? O carrinho anterior será esvaziado.`)
      if (!ok) return
      try { localStorage.removeItem(cartStorageKey(conflict.slug)) } catch {}
    }
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
      // Funde com o que já estiver pendente pra essa mesma loja (ex: item
      // adicionado pelo "+" rápido da home) em vez de sobrescrever.
      let existingCart: any[] = []
      try {
        const saved = localStorage.getItem(cartStorageKey(slug))
        if (saved) existingCart = JSON.parse(saved).cart || []
      } catch {}
      const already = existingCart.find(c => c.key === key)
      if (already) already.qty += qty
      else existingCart.push({ key, produtoId: produto.id, name: produto.name, modifiers, unitPrice, qty })
      localStorage.setItem(cartStorageKey(slug), JSON.stringify({
        cart: existingCart,
        deliveryType: 'entrega', cep: '', numero: '', cepData: null, address: '',
        agendarRetirada: false, scheduleDate: '', scheduleTime: '', obs: obs.trim(), payMethod: 'pix',
      }))
      setActiveCart(slug, company.name, existingCart.reduce((s, c) => s + c.qty, 0), existingCart.reduce((s, c) => s + c.unitPrice * c.qty, 0))
    } catch {}
    window.location.href = `/empresa/${slug}/cardapio`
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--concrete)', fontFamily: "'Archivo',sans-serif", paddingBottom: 90 }}>
      <style>{`
        .id-crumb{max-width:760px;margin:0 auto;padding:14px 16px 0;font-size:12px;color:#888;}
        .id-crumb a{color:var(--sign-dark);font-weight:600;text-decoration:none;}
        .id-wrap{max-width:760px;margin:0 auto;padding:14px 16px 24px;}
        .id-photo{width:100%;height:280px;border-radius:14px;overflow:hidden;background:var(--ink);display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Archivo',sans-serif;font-weight:700;font-size:26px;position:relative;}
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
        .id-opts{border-top:7px solid #F0EDE8;margin:0 -16px 14px;}
        .id-opts-h{background:#FBF1DC;padding:11px 16px;display:flex;align-items:center;gap:8px;}
        .id-opts-mid{flex:1;min-width:0;}
        .id-opts-name{font-weight:800;font-size:13.5px;}
        .id-opts-sub{font-size:10px;color:#8A6410;margin-top:1px;}
        .id-opts-req{flex:none;background:#C43D3D;color:#fff;font-size:9px;font-weight:800;padding:3px 7px;border-radius:6px;letter-spacing:.03em;}
        .id-opts-count{flex:none;background:var(--sign-dark);color:#fff;font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px;font-variant-numeric:tabular-nums;}
        .id-opt{display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:0.5px solid #EDE8E0;cursor:pointer;}
        .id-opt-img{width:42px;height:42px;border-radius:9px;overflow:hidden;flex:none;background:#F0EDE8;position:relative;}
        .id-opt-img img{width:100%;height:100%;object-fit:cover;}
        .id-opt-mid{flex:1;min-width:0;}
        .id-opt-nm{font-size:12.5px;font-weight:700;}
        .id-opt-pr{font-size:11px;color:#555;margin-top:1px;}
        .id-opt-max{font-size:9.5px;color:#AAA;margin-top:1px;}
        .id-opt-radio{width:20px;height:20px;border-radius:50%;border:1.5px solid #D8D2C4;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;}
        .id-opt-radio.on{background:var(--sign-dark);border-color:var(--sign-dark);}
        .id-opt-plus{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--sign-dark);color:#8A6410;background:#FEF3E2;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .id-opt-plus.disabled{opacity:.35;border-color:#D8D2C4;color:#AAA;background:#F5F2EC;}
        .id-opt-stepper{display:flex;align-items:center;gap:8px;flex-shrink:0;}
        .id-opt-stepper span{min-width:14px;text-align:center;font-weight:800;font-size:13px;}
        .id-opt-stepper button{width:24px;height:24px;border-radius:50%;border:1.5px solid var(--sign-dark);background:var(--sign-dark);color:#fff;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:pointer;}
        .id-opt-stepper button:disabled{opacity:.35;border-color:#D8D2C4;background:#D8D2C4;cursor:default;}
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
        .id-rp-im{height:80px;background:var(--ink);display:flex;align-items:center;justify-content:center;position:relative;}
        .id-rp-im img{width:100%;height:100%;object-fit:cover;}
        .id-rp-b{padding:8px 10px;}
        .id-rp-nm{font-size:11.5px;font-weight:600;line-height:1.25;min-height:28px;}
        .id-rp-pr{font-family:'Anton',sans-serif;font-size:15px;color:var(--ink);margin-top:3px;}
        /* bottom:0 ficava embaixo do BottomNav do site (mobile, 64px +
           safe-area) — a barra de "Adicionar" cobria Início/Empresas/
           Ofertas/Comunidade/Mais em vez de ficar por cima deles, mesmo
           bug do carrinho do cardápio (Ricardo, set/2026). */
        .id-bar{position:fixed;left:0;right:0;bottom:calc(64px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #E0DDD8;padding:10px 16px;display:flex;align-items:center;gap:10px;z-index:10000;}
        @media(min-width:768px){ .id-bar{bottom:0;} }
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
          {produto.photo_url ? <Image src={produto.photo_url} alt={produto.name} fill sizes="(min-width: 760px) 760px, 100vw" style={{ objectFit: 'cover' }} priority /> : initials}
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

        {produto.groups.map((g, gi) => {
          const selCount = sel[gi]?.length || 0
          return (
          <div className="id-opts" key={g.id} ref={el => { groupRefs.current[gi] = el }}>
            <div className="id-opts-h">
              <div className="id-opts-mid">
                <div className="id-opts-name">{g.name}</div>
                <div className="id-opts-sub">{g.required ? `Escolha ${g.min_select}${g.max_select > g.min_select ? '-' + g.max_select : ''} ${g.max_select > 1 ? 'itens' : 'item'}` : `Escolha até ${g.max_select} ${g.max_select > 1 ? 'itens' : 'item'}`}</div>
              </div>
              {g.required && <span className="id-opts-req">OBRIGATÓRIO</span>}
              <span className="id-opts-count">{selCount}/{g.max_select}</span>
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
                  {o.photo_url && <div className="id-opt-img"><Image src={o.photo_url} alt="" fill sizes="42px" style={{ objectFit: 'cover' }} /></div>}
                  <div className="id-opt-mid">
                    <div className="id-opt-nm">{o.name}</div>
                    <div className="id-opt-pr">{o.price > 0 ? '+ ' + fmt(o.price) : 'Grátis'}</div>
                    {o.max_qty != null && o.max_qty > 1 && <div className="id-opt-max">Máx {o.max_qty}</div>}
                  </div>
                  {g.max_select === 1
                    ? <span className={`id-opt-radio ${on ? 'on' : ''}`}>{on ? '●' : ''}</span>
                    : qtyForOpt === 0
                      ? <span className={`id-opt-plus ${canAddMore ? '' : 'disabled'}`}>+</span>
                      : (
                        <span className="id-opt-stepper" onClick={e => e.stopPropagation()}>
                          <button type="button" aria-label={`Tirar um ${o.name}`} onClick={() => removeOpt(gi, oi)}>−</button>
                          <span>{qtyForOpt}</span>
                          <button type="button" aria-label={`Adicionar mais um ${o.name}`} disabled={!canAddMore} onClick={() => canAddMore && addOpt(gi, oi)}>+</button>
                        </span>
                      )}
                </div>
              )
            })}
          </div>
          )
        })}

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
                    <div className="id-rp-im">{r.photo_url ? <Image src={r.photo_url} alt={r.name} fill sizes="(min-width: 600px) 25vw, 50vw" style={{ objectFit: 'cover' }} /> : <span style={{ color: '#fff', fontFamily: "'Archivo',sans-serif", fontWeight: 700 }}>{r.name.slice(0, 2).toUpperCase()}</span>}</div>
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
