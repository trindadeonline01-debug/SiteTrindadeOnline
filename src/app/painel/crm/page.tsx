'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
    <div style={wrap}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>🚧</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>{company.name}</div>
      <div style={{ fontSize: 13, color: '#666', textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
        O sistema de Cardápio + Pedidos tá ativo pra sua loja. As telas de catálogo, pedidos e vendas chegam nas próximas atualizações.
      </div>
    </div>
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
