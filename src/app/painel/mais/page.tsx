'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { moduleActive } from '@/lib/modules'

type Company = { id: string; name: string; slug: string; loja_digital_enabled: boolean; crm_whatsapp_enabled: boolean; entrega_enabled: boolean; trial_modules_until: string | null; plan: string }

// Mesma regra da sidebar desktop (EmpresaShell) — função sem módulo ativo
// não some, fica trancada e leva pra venda do plano (ESPECIFICACAO.md §4.3).
function Item({ href, icon, label, locked, badge }: { href: string; icon: string; label: string; locked?: boolean; badge?: number }) {
  return (
    <a className="item" href={locked ? '/painel?tab=plano' : href} style={locked ? { opacity: 0.5 } : undefined}>
      <span className="item-ico">{locked ? '🔒' : icon}</span>
      <span className="item-lbl">{label}</span>
      {!locked && !!badge && <span className="item-badge">{badge}</span>}
      <span className="item-chev">›</span>
    </a>
  )
}

export default function MaisPage() {
  const [company, setCompany] = useState<Company | null>(null)
  const [avaliacoesBadge, setAvaliacoesBadge] = useState(0)
  const [clientesCount, setClientesCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/mais'; return }
      const { data: comp } = await supabase
        .from('companies').select('id, name, slug, loja_digital_enabled, crm_whatsapp_enabled, entrega_enabled, trial_modules_until, plan')
        .eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp) { window.location.href = '/painel'; return }
      setCompany(comp as Company)
      const [{ count: revCount }, { count: cliCount }] = await Promise.all([
        supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('company_id', comp.id),
        supabase.from('crm_contacts').select('id', { count: 'exact', head: true }).eq('company_id', comp.id).not('last_message_at', 'is', null),
      ])
      setAvaliacoesBadge(revCount || 0)
      setClientesCount(cliCount || 0)
      setLoading(false)
    })
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo,sans-serif', color: '#AAA' }}>Carregando...</div>
  if (!company) return null

  const initials = company.name.trim().slice(0, 2).toUpperCase()

  return (
    <div className="mais-page">
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;font-family:'Archivo',sans-serif;background:var(--concrete);}
        .mais-page{min-height:100vh;padding-bottom:90px;}
        .mais-body{padding:20px 18px 16px;max-width:600px;margin:0 auto;}
        .company-card{background:#111;border-radius:16px;padding:16px;display:flex;align-items:center;gap:12px;margin-bottom:20px;text-decoration:none;}
        .company-avatar{width:46px;height:46px;border-radius:12px;background:var(--sign-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex:none;}
        .company-name{color:#fff;font-weight:800;font-size:14px;}
        .company-sub{color:rgba(255,255,255,.55);font-size:11px;margin-top:2px;}
        .company-arrow{color:rgba(255,255,255,.4);font-size:18px;margin-left:auto;}
        .sectlbl{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#A79E8B;margin:20px 2px 8px;}
        .sectlbl:first-of-type{margin-top:0;}
        .list{background:#fff;border:1px solid #EDE8E0;border-radius:14px;overflow:hidden;}
        .item{display:flex;align-items:center;gap:12px;padding:13px 14px;border-bottom:1px solid #F0EDE8;text-decoration:none;color:inherit;}
        .item:last-child{border-bottom:none;}
        .item-ico{font-size:17px;width:22px;text-align:center;flex:none;}
        .item-lbl{flex:1;font-size:13px;font-weight:600;color:#1A1610;}
        .item-badge{background:var(--sign);color:var(--ink);font-size:10px;font-weight:800;padding:2px 7px;border-radius:8px;margin-right:6px;}
        .item-chev{color:#C9C4B5;font-size:15px;}
        .item.danger{cursor:pointer;border:none;width:100%;text-align:left;background:none;font-family:inherit;}
        .item.danger .item-lbl{color:#C43D3D;}
        @media(min-width:768px){.mais-page{display:none;}}
      `}</style>

      <div className="mais-body">
        <a className="company-card" href={`/empresa/${company.slug}`} target="_blank" rel="noopener noreferrer">
          <div className="company-avatar">{initials}</div>
          <div>
            <div className="company-name">{company.name}</div>
            <div className="company-sub">Ver como o cliente vê →</div>
          </div>
          <div className="company-arrow">›</div>
        </a>

        <div className="sectlbl">Minha loja</div>
        <div className="list">
          <a className="item" href="/painel?tab=perfil"><span className="item-ico">✏️</span><span className="item-lbl">Perfil e fotos</span><span className="item-chev">›</span></a>
          <a className="item" href="/painel?tab=avaliacoes"><span className="item-ico">⭐</span><span className="item-lbl">Avaliações</span>{avaliacoesBadge > 0 && <span className="item-badge">{avaliacoesBadge}</span>}<span className="item-chev">›</span></a>
          <a className="item" href="/painel?tab=destaques"><span className="item-ico">🌟</span><span className="item-lbl">Destaques</span><span className="item-chev">›</span></a>
          <a className="item" href="/painel?tab=banners"><span className="item-ico">🖼️</span><span className="item-lbl">Banners</span><span className="item-chev">›</span></a>
        </div>

        <div className="sectlbl">Cardápio &amp; vendas</div>
        <div className="list">
          <Item href="/painel/compartilhar" icon="🔗" label="Compartilhar cardápio" locked={!moduleActive(company.loja_digital_enabled, company.trial_modules_until)} />
          <Item href="/painel/catalogo" icon="📋" label="Catálogo" locked={!moduleActive(company.loja_digital_enabled, company.trial_modules_until)} />
          <Item href="/painel/pedidos" icon="🧾" label="Pedidos" locked={!moduleActive(company.loja_digital_enabled, company.trial_modules_until)} />
          <Item href="/painel/interesses" icon="🔔" label="Interesses" locked={!moduleActive(company.loja_digital_enabled, company.trial_modules_until)} />
          <Item href="/painel/cozinha" icon="🍳" label="Cozinha" locked={!moduleActive(company.loja_digital_enabled, company.trial_modules_until)} />
        </div>

        <div className="sectlbl">Entrega</div>
        <div className="list">
          <Item href="/painel/entrega" icon="🏍️" label="Entrega" locked={!moduleActive(company.entrega_enabled, company.trial_modules_until)} />
        </div>

        <div className="sectlbl">Relacionamento</div>
        <div className="list">
          <Item href="/painel/clientes" icon="👥" label="Clientes" badge={clientesCount} locked={!moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)} />
        </div>

        <div className="sectlbl">Marketing</div>
        <div className="list">
          <a className="item" href="/painel?tab=cupons"><span className="item-ico">🎟️</span><span className="item-lbl">Cupons</span><span className="item-chev">›</span></a>
          <a className="item" href="/painel?tab=promocoes"><span className="item-ico">🏷️</span><span className="item-lbl">Promoções</span><span className="item-chev">›</span></a>
          <a className="item" href="/painel?tab=plano"><span className="item-ico">💳</span><span className="item-lbl">Plano</span><span className="item-chev">›</span></a>
        </div>

        <div className="sectlbl">Conta</div>
        <div className="list">
          <a className="item" href="/anunciar"><span className="item-ico">🔁</span><span className="item-lbl">Cadastrar outra empresa</span><span className="item-chev">›</span></a>
          <a className="item" href="/"><span className="item-ico">🧭</span><span className="item-lbl">Modo Explorar (bairro)</span><span className="item-chev">›</span></a>
          <a className="item" href="/perfil"><span className="item-ico">👤</span><span className="item-lbl">Meu perfil pessoal</span><span className="item-chev">›</span></a>
          <button className="item danger" onClick={signOut}><span className="item-ico">🚪</span><span className="item-lbl">Sair</span></button>
        </div>
      </div>
    </div>
  )
}
