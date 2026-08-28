'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { moduleActive } from '@/lib/modules'
import EmpresaShell, { type EmpresaNavKey } from '@/components/EmpresaShell'

type Profile = { id: string; name: string; email?: string; phone?: string; neighborhood?: string; created_at: string; user_type: string }
type Listing = { id: string; type: string; title: string; price?: number; subtype?: string; status: string; created_at: string }
type Review  = { id: string; rating: number; text?: string; created_at: string; company?: { name: string; slug: string } }
type Fav     = { id: string; company?: { name: string; slug: string; category?: any } }
type PedidoItem = { id: string; product_name: string; unit_price: number; qty: number; selected_options: { name: string; price: number }[] }
type Pedido = { id: string; status: string; total: number; created_at: string; delivery_type: string; company?: { name: string; slug: string }; itens?: PedidoItem[] }
type Entrega = { pedido_id: string; status: string; delivery_code: string; motoboy_name: string | null }

const ENTREGA_STATUS_LABEL: Record<string, string> = { buscando_motoboy: 'Chamando motoboy', a_caminho: 'Motoboy a caminho', entregue: 'Entregue', cancelada: 'Cancelada', sem_credito: 'Aguardando loja' }
const TYPE_EMOJI: Record<string,string> = { desapega:'🏷️', emprego:'💼', imovel:'🏠', achado:'🔍' }
const TYPE_LABEL: Record<string,string> = { desapega:'Desapega', emprego:'Emprego', imovel:'Imóvel', achado:'Achado/Perdido' }
const PEDIDO_STATUS_LABEL: Record<string,string> = { recebido:'Recebido', em_preparo:'Em preparo', pronto:'Pronto', saiu_entrega:'Saiu p/ entrega', entregue:'Entregue', cancelado:'Cancelado' }
const PEDIDO_STATUS_COLOR: Record<string,{bg:string;fg:string}> = {
  recebido:{bg:'#FEF0E0',fg:'#B5690C'}, em_preparo:{bg:'#FEF6DC',fg:'#8A6410'},
  pronto:{bg:'#E4F3EC',fg:'#157A52'}, saiu_entrega:{bg:'#E8F0FE',fg:'#1A56B0'},
  entregue:{bg:'#F0EDE8',fg:'#6E6656'}, cancelado:{bg:'#FBEAEA',fg:'#C43D3D'},
}
function fmtMoney(n: number) { return 'R$ ' + n.toFixed(2).replace('.', ',') }

const VALID_TABS = ['perfil','anuncios','avaliacoes','favoritos','cupons','pedidos'] as const
type Tab = typeof VALID_TABS[number]
const TAB_KEY: Record<Tab, EmpresaNavKey> = {
  perfil: 'pessoal-perfil', anuncios: 'pessoal-anuncios', avaliacoes: 'pessoal-avaliacoes',
  favoritos: 'pessoal-favoritos', cupons: 'pessoal-cupons', pedidos: 'pessoal-pedidos',
}

// Mesmas telas de /perfil (perfil, favoritos, avaliações, pedidos, anúncios,
// cupons), só que dentro do shell do painel — pro dono de negócio não
// precisar sair do "modo empresa" pra ver o próprio lado de morador.
// /perfil continua existindo do jeito que está pra quem não tem negócio.
export default function PainelPessoalPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--concrete)' }} />}>
      <PainelPessoalInner />
    </Suspense>
  )
}

function PainelPessoalInner() {
  const searchParams = useSearchParams()
  const tab = (VALID_TABS.includes(searchParams.get('tab') as any) ? searchParams.get('tab') : 'perfil') as Tab

  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [lojaDigitalEnabled, setLojaDigitalEnabled] = useState(false)
  const [crmEnabled, setCrmEnabled] = useState(false)
  const [entregaEnabled, setEntregaEnabled] = useState(false)

  const [profile, setProfile]   = useState<Profile|null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [reviews, setReviews]   = useState<Review[]>([])
  const [favs, setFavs]         = useState<Fav[]>([])
  const [myCoupons, setMyCoupons] = useState<any[]>([])
  const [myPedidos, setMyPedidos] = useState<Pedido[]>([])
  const [entregas, setEntregas] = useState<Record<string, Entrega>>({})
  const [editing, setEditing]   = useState(false)
  const [form, setForm]         = useState({ name:'', phone:'', neighborhood:'' })
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/pessoal'; return }
      const uid = session.user.id

      // Empresa é opcional aqui — só alimenta o cartão "negócio" do switcher.
      // Quem não tem negócio nenhum ainda pode acabar nessa URL e só vê o
      // cartão Pessoal.
      const { data: comp } = await supabase
        .from('companies').select('name, loja_digital_enabled, crm_whatsapp_enabled, entrega_enabled, trial_modules_until')
        .eq('owner_id', uid).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (comp) {
        setCompanyName(comp.name)
        setLojaDigitalEnabled(moduleActive(comp.loja_digital_enabled, comp.trial_modules_until))
        setCrmEnabled(moduleActive(comp.crm_whatsapp_enabled, comp.trial_modules_until))
        setEntregaEnabled(moduleActive(comp.entrega_enabled, comp.trial_modules_until))
      }

      await loadAll(uid)
      setLoading(false)
    })
  }, [])

  async function loadAll(uid: string) {
    const [{ data: prof }, { data: list }, { data: revs }, { data: favData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('listings').select('id,type,title,price,subtype,status,created_at').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('reviews').select('id,rating,text,created_at,company:companies(name,slug)').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('favorites').select('id,company:companies(name,slug,category:categories(name,emoji))').eq('user_id', uid).eq('entity_type','company').order('created_at', { ascending: false }),
    ])
    if (prof) {
      setProfile(prof as Profile)
      setForm({ name: prof.name || '', phone: prof.phone || '', neighborhood: prof.neighborhood || '' })
    }
    setListings((list || []) as Listing[])
    setReviews((revs || []) as any)
    setFavs((favData || []) as any)
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
    if (!profile?.id) return
    if (tab === 'cupons') {
      supabase.from('coupon_redemptions')
        .select('*, coupon:coupons(id,title,discount_type,discount_value,expires_at,company:companies(id,name,phone))')
        .eq('user_id', profile.id).order('created_at', { ascending: false })
        .then(({ data }) => setMyCoupons(data || []))
    }
    if (tab === 'pedidos') {
      supabase.from('loja_pedidos')
        .select('id, status, total, created_at, delivery_type, company:companies(name,slug), itens:loja_pedido_itens(*)')
        .eq('customer_id', profile.id).order('created_at', { ascending: false })
        .then(async ({ data }) => {
          const pedidos = (data || []) as any as Pedido[]
          setMyPedidos(pedidos)
          const ids = pedidos.filter(p => p.delivery_type === 'entrega').map(p => p.id)
          if (ids.length === 0) { setEntregas({}); return }
          const { data: dEntregas } = await supabase.from('delivery_orders').select('pedido_id, status, delivery_code, motoboy_name').in('pedido_id', ids)
          const map: Record<string, Entrega> = {}
          for (const e of dEntregas || []) map[e.pedido_id] = e as Entrega
          setEntregas(map)
        })
    }
  }, [tab, profile?.id])

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#AAA' }}>Carregando...</div>
  if (!profile) return null

  const activeListings = listings.filter(l => l.status === 'active' || l.status === 'paused')

  return (
    <EmpresaShell active={TAB_KEY[tab]} companyName={companyName} lojaDigitalEnabled={lojaDigitalEnabled} crmEnabled={crmEnabled} entregaEnabled={entregaEnabled}>
      <div className="pp-wrap">
        <style>{`
          .pp-wrap{ padding:20px 16px 40px; max-width:760px; }
          @media(min-width:768px){ .pp-wrap{ padding:28px 32px 48px; } }
          .pp-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:14px;}
          .pp-field{margin-bottom:12px;}
          .pp-fl{font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px;display:block;}
          .pp-fv{font-size:15px;color:var(--ink);font-weight:500;}
          .pp-fi{width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:9px;font-size:14px;font-family:'Archivo',sans-serif;outline:none;}
          .pp-fi:focus{border-color:var(--sign-dark);}
          .pp-btn-edit{padding:9px 16px;background:#FEF3E2;color:var(--sign-dark);border:1.5px solid var(--sign-dark);border-radius:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Archivo',sans-serif;}
          .pp-btn-save{padding:9px 16px;background:var(--sign);color:var(--ink);border:none;border-radius:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Archivo',sans-serif;margin-right:8px;}
          .pp-btn-cancel{padding:9px 16px;background:none;color:var(--muted);border:1px solid var(--line);border-radius:9px;font-size:12.5px;cursor:pointer;font-family:'Archivo',sans-serif;}
          .pp-ok{background:#EDFAF3;border:1px solid #A8E6C4;border-radius:8px;padding:8px 12px;font-size:12px;color:#0F5C3A;margin-bottom:12px;}
          .pp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px;}
          .pp-stat{background:var(--concrete-2);border:1px solid var(--line);border-radius:10px;padding:12px;text-align:center;cursor:pointer;}
          .pp-stat:hover{border-color:var(--sign-dark);background:#FEF3E2;}
          .pp-stat-n{font-family:'Anton',sans-serif;font-size:28px;color:var(--sign-dark);line-height:1;}
          .pp-stat-l{font-size:11.5px;color:var(--muted);margin-top:2px;}
          .pp-empty{text-align:center;padding:36px 20px;color:var(--muted);}
          .pp-an-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
          @media(min-width:640px){.pp-an-grid{grid-template-columns:repeat(3,1fr);}}
          .pp-an-card{background:#fff;border:1px solid var(--line);border-radius:11px;padding:12px;position:relative;}
          .pp-an-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
          .pp-an-title{font-size:12px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          .pp-an-meta{font-size:10px;color:var(--muted);margin-bottom:5px;}
          .pp-an-badge{font-size:9px;padding:2px 7px;border-radius:5px;font-weight:600;background:#EDFAF3;color:#0F6E56;}
          .pp-an-del{position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;color:#DDD;font-size:13px;}
          .pp-an-del:hover{color:var(--alert);}
          .pp-list{display:flex;flex-direction:column;gap:10px;}
          .pp-item{background:#fff;border:1px solid var(--line);border-radius:11px;padding:12px;}
          .pp-item-empresa{font-size:13px;font-weight:600;color:var(--sign-dark);text-decoration:none;margin-bottom:4px;display:block;}
          .pp-stars{font-size:13px;color:var(--sign-dark);margin-bottom:4px;}
          .pp-txt{font-size:12px;color:#555;line-height:1.6;}
          .pp-date{font-size:10px;color:var(--muted);margin-top:5px;}
          .pp-fav-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
          @media(min-width:640px){.pp-fav-grid{grid-template-columns:repeat(3,1fr);}}
          .pp-fav-card{background:#fff;border:1px solid var(--line);border-radius:11px;padding:10px 12px;text-decoration:none;display:flex;align-items:center;gap:8px;}
          .pp-fav-card:hover{border-color:var(--sign-dark);background:#FEF3E2;}
          .pp-fav-name{font-size:12px;font-weight:600;color:var(--ink);}
          .pp-fav-cat{font-size:10px;color:var(--muted);}
        `}</style>

        {tab === 'perfil' && (
          <div className="pp-card">
            {saved && <div className="pp-ok">✓ Dados atualizados!</div>}
            {editing ? (
              <>
                <div className="pp-field"><label className="pp-fl">NOME</label><input className="pp-fi" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
                <div className="pp-field"><label className="pp-fl">WHATSAPP</label><input className="pp-fi" placeholder="21 99999-9999" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
                <div className="pp-field"><label className="pp-fl">BAIRRO</label><input className="pp-fi" placeholder="Ex: Trindade" value={form.neighborhood} onChange={e=>setForm(f=>({...f,neighborhood:e.target.value}))}/></div>
                <button className="pp-btn-save" onClick={saveProfile} disabled={saving}>{saving?'Salvando...':'Salvar alterações'}</button>
                <button className="pp-btn-cancel" onClick={()=>setEditing(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <div className="pp-field"><div className="pp-fl">NOME</div><div className="pp-fv">{profile.name}</div></div>
                {profile.phone && <div className="pp-field"><div className="pp-fl">WHATSAPP</div><div className="pp-fv">{profile.phone}</div></div>}
                {profile.neighborhood && <div className="pp-field"><div className="pp-fl">BAIRRO</div><div className="pp-fv">{profile.neighborhood}</div></div>}
                <button className="pp-btn-edit" onClick={()=>setEditing(true)}>✏️ Editar dados</button>
              </>
            )}
            <div className="pp-stats">
              <a className="pp-stat" href="/painel/pessoal?tab=favoritos"><div className="pp-stat-n">{favs.length}</div><div className="pp-stat-l">Favoritos</div></a>
              <a className="pp-stat" href="/painel/pessoal?tab=avaliacoes"><div className="pp-stat-n">{reviews.length}</div><div className="pp-stat-l">Avaliações</div></a>
              <a className="pp-stat" href="/painel/pessoal?tab=anuncios"><div className="pp-stat-n">{activeListings.length}</div><div className="pp-stat-l">Anúncios</div></a>
            </div>
          </div>
        )}

        {tab === 'anuncios' && (
          activeListings.length === 0 ? (
            <div className="pp-empty">
              <div style={{fontSize:40,marginBottom:10}}>📋</div>
              <div style={{fontSize:14,fontWeight:600,color:'#555',marginBottom:6}}>Nenhum anúncio ativo</div>
              <div style={{fontSize:12,marginBottom:16}}>Publique no Desapega, Empregos ou Imóveis!</div>
              <a href="/desapega" style={{color:'var(--sign-dark)',fontSize:13,fontWeight:600,textDecoration:'none'}}>+ Criar anúncio →</a>
            </div>
          ) : (
            <div className="pp-an-grid">
              {activeListings.map(l => (
                <div key={l.id} className="pp-an-card">
                  <div className="pp-an-top">
                    <span style={{fontSize:22}}>{TYPE_EMOJI[l.type]||'📋'}</span>
                    <div className="pp-an-title">{l.title}</div>
                  </div>
                  <div className="pp-an-meta">{TYPE_LABEL[l.type]} · {l.price ? `R$ ${l.price.toLocaleString('pt-BR')}` : 'Grátis'} · {timeAgo(l.created_at)}</div>
                  <span className="pp-an-badge" style={l.status==='paused'?{background:'var(--concrete-2)',color:'#888'}:{}}>{l.status==='paused'?'⏸ Pausado':'Ativo'}</span>
                  <button className="pp-an-del" onClick={()=>deleteListing(l.id)} title="Remover">🗑</button>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'avaliacoes' && (
          reviews.length === 0 ? (
            <div className="pp-empty">
              <div style={{fontSize:40,marginBottom:10}}>⭐</div>
              <div style={{fontSize:14,fontWeight:600,color:'#555',marginBottom:6}}>Nenhuma avaliação ainda</div>
              <div style={{fontSize:12}}>Visite um comércio e deixe sua opinião!</div>
            </div>
          ) : (
            <div className="pp-list">
              {reviews.map(r => (
                <div key={r.id} className="pp-item">
                  {r.company && <a className="pp-item-empresa" href={`/empresa/${r.company.slug}`}>{r.company.name} →</a>}
                  <div className="pp-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
                  {r.text && <div className="pp-txt">{r.text}</div>}
                  <div className="pp-date">{fmtDate(r.created_at)}</div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'cupons' && (
          myCoupons.length === 0 ? (
            <div className="pp-empty">
              <div style={{fontSize:40,marginBottom:10}}>🎟️</div>
              <div style={{fontSize:14,fontWeight:600,color:'#555',marginBottom:6}}>Nenhum cupom resgatado</div>
              <div style={{fontSize:12,marginBottom:16}}>Resgate cupons das empresas do bairro!</div>
              <a href="/cupons" style={{color:'var(--sign-dark)',fontSize:13,fontWeight:600,textDecoration:'none'}}>Ver cupons disponíveis →</a>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {myCoupons.map((r:any) => {
                const used = r.status === 'used'
                const phone = r.coupon?.company?.phone
                const msg = encodeURIComponent(`Olá! Quero usar meu cupom *${r.code}* — ${r.coupon?.title}. Pode confirmar?`)
                const waUrl = phone ? `https://wa.me/55${phone}?text=${msg}` : '#'
                return (
                  <div key={r.id} style={{background:used?'var(--concrete-2)':'#fff',border:'1px solid var(--line)',borderRadius:12,display:'flex',overflow:'hidden',opacity:used?.7:1}}>
                    <div style={{width:60,display:'flex',alignItems:'center',justifyContent:'center',background:used?'#F0EDE8':'#FEF3E2',fontSize:26,flexShrink:0}}>🎟️</div>
                    <div style={{flex:1,padding:'10px 12px',borderLeft:'1px dashed var(--line)',minWidth:0,display:'flex',flexDirection:'column',justifyContent:'center',gap:2}}>
                      <div style={{fontSize:11,color:'#888'}}>{r.coupon?.company?.name}</div>
                      <div style={{fontSize:13,fontWeight:500,color:used?'#AAA':'#111',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.coupon?.title}</div>
                      <div style={{fontSize:13,fontWeight:600,color:used?'#BBB':'var(--sign-dark)',letterSpacing:2,fontFamily:'monospace'}}>{r.code}</div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 12px',gap:4,flexShrink:0,borderLeft:'1px dashed var(--line)'}}>
                      {used ? (
                        <span style={{fontSize:10,background:'var(--concrete-2)',color:'#AAA',padding:'3px 10px',borderRadius:8}}>Utilizado</span>
                      ) : (
                        <>
                          <a href={waUrl} target="_blank" style={{padding:'5px 10px',background:'#25D366',color:'#fff',border:'none',borderRadius:7,fontSize:10,fontWeight:500,textDecoration:'none',whiteSpace:'nowrap'}}>WhatsApp</a>
                          <button onClick={()=>navigator.clipboard.writeText(r.code)} style={{padding:'5px 10px',background:'var(--concrete-2)',color:'#555',border:'none',borderRadius:7,fontSize:10,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap'}}>Copiar</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {tab === 'pedidos' && (
          myPedidos.length === 0 ? (
            <div className="pp-empty">
              <div style={{fontSize:40,marginBottom:10}}>🧾</div>
              <div style={{fontSize:14,fontWeight:600,color:'#555',marginBottom:6}}>Nenhum pedido ainda</div>
              <div style={{fontSize:12}}>Peça pelo cardápio de uma empresa do bairro!</div>
            </div>
          ) : (
            <div className="pp-list">
              {myPedidos.map(p => {
                const c = PEDIDO_STATUS_COLOR[p.status] || PEDIDO_STATUS_COLOR.recebido
                return (
                  <div key={p.id} className="pp-item">
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                      {p.company ? <a className="pp-item-empresa" style={{marginBottom:0}} href={`/empresa/${p.company.slug}`}>{p.company.name} →</a> : <span/>}
                      <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:7,background:c.bg,color:c.fg,whiteSpace:'nowrap'}}>{PEDIDO_STATUS_LABEL[p.status] || p.status}</span>
                    </div>
                    {p.itens?.map(it => (
                      <div key={it.id} style={{fontSize:12,color:'#555',padding:'2px 0'}}>
                        {it.qty}x {it.product_name}
                        {it.selected_options?.length > 0 && <span style={{color:'#AAA'}}> · {it.selected_options.map(o=>o.name).join(', ')}</span>}
                      </div>
                    ))}
                    {p.delivery_type === 'entrega' && entregas[p.id] && (
                      <div style={{marginTop:8,background:'#1A1610',borderRadius:10,padding:'10px 12px'}}>
                        <div style={{fontSize:10.5,fontWeight:700,color:'var(--sign)',letterSpacing:'.04em',textTransform:'uppercase'}}>
                          🏍️ {ENTREGA_STATUS_LABEL[entregas[p.id].status] || entregas[p.id].status}
                        </div>
                        {entregas[p.id].status === 'a_caminho' && (
                          <>
                            {entregas[p.id].motoboy_name && <div style={{fontSize:11.5,color:'#F0EDE8',marginTop:3}}>{entregas[p.id].motoboy_name} está a caminho</div>}
                            <div style={{fontSize:10,color:'var(--sign)',marginTop:6}}>Seu código de entrega</div>
                            <div style={{fontFamily:'Anton,sans-serif',fontSize:26,letterSpacing:8,color:'#fff'}}>{entregas[p.id].delivery_code}</div>
                            <div style={{fontSize:10,color:'#b6ab97',lineHeight:1.5}}>Mostre esses números pro motoboy na entrega.</div>
                          </>
                        )}
                      </div>
                    )}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6}}>
                      <div className="pp-date" style={{marginTop:0}}>{fmtDate(p.created_at)}</div>
                      <div style={{fontSize:13,fontWeight:700,color:'#111'}}>{fmtMoney(p.total)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {tab === 'favoritos' && (
          favs.length === 0 ? (
            <div className="pp-empty">
              <div style={{fontSize:40,marginBottom:10}}>❤️</div>
              <div style={{fontSize:14,fontWeight:600,color:'#555',marginBottom:6}}>Nenhum favorito ainda</div>
              <div style={{fontSize:12}}>Salve empresas que você gosta!</div>
            </div>
          ) : (
            <div className="pp-fav-grid">
              {favs.map(f => f.company && (
                <a key={f.id} className="pp-fav-card" href={`/empresa/${f.company.slug}`}>
                  <span style={{fontSize:20}}>{f.company.category?.emoji||'🏪'}</span>
                  <div>
                    <div className="pp-fav-name">{f.company.name}</div>
                    <div className="pp-fav-cat">{f.company.category?.name||'—'}</div>
                  </div>
                </a>
              ))}
            </div>
          )
        )}
      </div>
    </EmpresaShell>
  )
}
