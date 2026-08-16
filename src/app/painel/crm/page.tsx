'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CrmShell from '@/components/CrmShell'

type Company = { id: string; name: string; loja_digital_enabled: boolean }

export default function CrmPage() {
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<Company | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm'; return }
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      if (profile?.user_type !== 'company') { window.location.href = '/'; return }
      const { data: comp } = await supabase
        .from('companies')
        .select('id, name, loja_digital_enabled')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      setCompany(comp as Company | null)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div style={wrap}><div style={{ color: '#AAA', fontSize: 13 }}>Carregando...</div></div>
  }

  if (!company) {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🏪</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Nenhuma empresa encontrada</div>
        <a href="/empresa/cadastrar" style={btn}>Cadastrar minha empresa</a>
      </div>
    )
  }

  if (!company.loja_digital_enabled) {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🧾</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>Cardápio + Pedidos</div>
        <div style={{ fontSize: 13, color: '#666', textAlign: 'center', maxWidth: 300, lineHeight: 1.6, marginBottom: 20 }}>
          Catálogo com opcionais e combos, cardápio digital pros seus clientes comprarem, e um painel de pedidos com tela pra cozinha. Ainda não está ativo pra {company.name}.
        </div>
        <a href="/empresa/planos" style={btn}>Saiba mais</a>
      </div>
    )
  }

  return (
    <CrmShell active="inicio" companyName={company.name}>
      <div className="crm-hub-content">
        <style>{`
          .crm-hub-content{padding:24px 16px 80px;}
          @media(min-width:768px){.crm-hub-content{padding:28px 32px;}}
          .crm-hub-title{font-size:17px;font-weight:800;margin-bottom:20px;text-align:center;}
          @media(min-width:768px){.crm-hub-title{display:none;}}
          .crm-hub-grid{display:flex;flex-direction:column;gap:12px;width:100%;max-width:320px;margin:0 auto;}
          @media(min-width:768px){.crm-hub-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;max-width:none;margin:0;}}
        `}</style>
        <div className="crm-hub-title">{company.name}</div>
        <div className="crm-hub-grid">
          <a href="/painel/crm/pedidos" style={hubCard}><span style={{ fontSize: 26 }}>🧾</span><div><div style={hubTitle}>Pedidos</div><div style={hubSub}>Ver e gerenciar pedidos recebidos</div></div></a>
          <a href="/painel/crm/cozinha" style={hubCard}><span style={{ fontSize: 26 }}>🍳</span><div><div style={hubTitle}>Cozinha</div><div style={hubSub}>Painel pra deixar aberto na tela da cozinha</div></div></a>
          <a href="/painel/crm/catalogo" style={hubCard}><span style={{ fontSize: 26 }}>📋</span><div><div style={hubTitle}>Catálogo</div><div style={hubSub}>Produtos, categorias e combos</div></div></a>
        </div>
      </div>
    </CrmShell>
  )
}

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh', padding: 24, fontFamily: 'Inter,sans-serif', background: '#F0EDE8', textAlign: 'center'
}
const btn: React.CSSProperties = {
  background: '#C9951A', color: '#fff', padding: '11px 24px', borderRadius: 10,
  textDecoration: 'none', fontWeight: 700, fontSize: 13
}
const hubCard: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #EDE8E0',
  borderRadius: 14, padding: '16px 18px', textDecoration: 'none', color: '#1A1610', textAlign: 'left'
}
const hubTitle: React.CSSProperties = { fontWeight: 800, fontSize: 14 }
const hubSub: React.CSSProperties = { fontSize: 11.5, color: '#888', marginTop: 2 }
