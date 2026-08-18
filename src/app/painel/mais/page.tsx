'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Company = { id: string; name: string; slug: string; loja_digital_enabled: boolean; crm_whatsapp_enabled: boolean; plan: string }

export default function MaisPage() {
  const [company, setCompany] = useState<Company | null>(null)
  const [avaliacoesBadge, setAvaliacoesBadge] = useState(0)
  const [clientesCount, setClientesCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/mais'; return }
      const { data: comp } = await supabase
        .from('companies').select('id, name, slug, loja_digital_enabled, crm_whatsapp_enabled, plan')
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

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#AAA' }}>Carregando...</div>
  if (!company) return null

  const initials = company.name.trim().slice(0, 2).toUpperCase()

  return (
    <div className="mais-page">
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;font-family:'Inter',sans-serif;background:#F7F5F0;}
        .mais-page{min-height:100vh;padding-bottom:90px;}
        .mais-head{background:#fff;border-bottom:1px solid #EDE8E0;padding:16px 18px;display:flex;align-items:center;gap:10px;}
        .mais-head-title{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.5px;color:#111;}
        .mais-body{padding:16px 18px;max-width:600px;margin:0 auto;}
        .company-card{background:#111;border-radius:16px;padding:16px;display:flex;align-items:center;gap:12px;margin-bottom:20px;text-decoration:none;}
        .company-avatar{width:46px;height:46px;border-radius:12px;background:#C9951A;color:#1A1610;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex:none;}
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
        .item-badge{background:#C9951A;color:#1A1610;font-size:10px;font-weight:800;padding:2px 7px;border-radius:8px;margin-right:6px;}
        .item-chev{color:#C9C4B5;font-size:15px;}
        .item.danger{cursor:pointer;border:none;width:100%;text-align:left;background:none;font-family:inherit;}
        .item.danger .item-lbl{color:#C43D3D;}
        @media(min-width:768px){.mais-page{display:none;}}
      `}</style>

      <div className="mais-head"><div className="mais-head-title">Mais</div></div>

      <div className="mais-body">
        <a className="company-card" href={`/empresa/${company.slug}`}>
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

        {company.loja_digital_enabled && (
          <>
            <div className="sectlbl">Cardápio &amp; vendas</div>
            <div className="list">
              <a className="item" href="/painel/crm"><span className="item-ico">🔗</span><span className="item-lbl">Compartilhar cardápio</span><span className="item-chev">›</span></a>
              <a className="item" href="/painel/crm/catalogo"><span className="item-ico">📋</span><span className="item-lbl">Catálogo</span><span className="item-chev">›</span></a>
              <a className="item" href="/painel/crm/pedidos"><span className="item-ico">🧾</span><span className="item-lbl">Pedidos</span><span className="item-chev">›</span></a>
              <a className="item" href="/painel/crm/cozinha"><span className="item-ico">🍳</span><span className="item-lbl">Cozinha</span><span className="item-chev">›</span></a>
              {company.crm_whatsapp_enabled && (
                <a className="item" href="/painel/crm/clientes"><span className="item-ico">👥</span><span className="item-lbl">Clientes</span>{clientesCount > 0 && <span className="item-badge">{clientesCount}</span>}<span className="item-chev">›</span></a>
              )}
            </div>
          </>
        )}

        <div className="sectlbl">Marketing</div>
        <div className="list">
          <a className="item" href="/painel?tab=cupons"><span className="item-ico">🎟️</span><span className="item-lbl">Cupons</span><span className="item-chev">›</span></a>
          <a className="item" href="/painel?tab=promocoes"><span className="item-ico">🏷️</span><span className="item-lbl">Promoções</span><span className="item-chev">›</span></a>
          <a className="item" href="/painel?tab=plano"><span className="item-ico">💳</span><span className="item-lbl">Plano</span><span className="item-chev">›</span></a>
        </div>

        <div className="sectlbl">Conta</div>
        <div className="list">
          <a className="item" href="/empresa/cadastrar"><span className="item-ico">🔁</span><span className="item-lbl">Cadastrar outra empresa</span><span className="item-chev">›</span></a>
          <a className="item" href="/"><span className="item-ico">🧭</span><span className="item-lbl">Modo Explorar (bairro)</span><span className="item-chev">›</span></a>
          <a className="item" href="/perfil"><span className="item-ico">👤</span><span className="item-lbl">Meu perfil pessoal</span><span className="item-chev">›</span></a>
          <button className="item danger" onClick={signOut}><span className="item-ico">🚪</span><span className="item-lbl">Sair</span></button>
        </div>
      </div>
    </div>
  )
}
