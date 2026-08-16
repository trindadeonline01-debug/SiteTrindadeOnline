'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CrmShell from '@/components/CrmShell'
import QRCode from 'qrcode'

type Company = { id: string; name: string; slug: string; loja_digital_enabled: boolean }

export default function CrmPage() {
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<Company | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm'; return }
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', session.user.id).single()
      if (profile?.user_type !== 'company') { window.location.href = '/'; return }
      const { data: comp } = await supabase
        .from('companies')
        .select('id, name, slug, loja_digital_enabled')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      setCompany(comp as Company | null)
      setLoading(false)
    })
  }, [])

  const cardapioLink = company ? `https://trindadeonline.com.br/empresa/${company.slug}/cardapio` : ''

  useEffect(() => {
    if (!cardapioLink) return
    QRCode.toDataURL(cardapioLink, { width: 200, margin: 1, color: { dark: '#1A1610', light: '#FFFFFF' } })
      .then(setQrDataUrl).catch(() => {})
  }, [cardapioLink])

  function copyLink() {
    navigator.clipboard.writeText(cardapioLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

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
          .crm-share-card{margin:20px auto 0;max-width:320px;background:#fff;border:1px solid #EDE8E0;border-radius:14px;padding:18px;text-align:center;}
          @media(min-width:768px){.crm-share-card{max-width:280px;margin:24px 0 0;}}
          .crm-share-title{font-weight:800;font-size:13.5px;margin-bottom:12px;}
          .crm-share-qr{width:160px;height:160px;margin:0 auto 12px;border-radius:10px;overflow:hidden;background:#F0EDE8;}
          .crm-share-qr img{width:100%;height:100%;}
          .crm-share-link{font-size:10.5px;color:#888;word-break:break-all;margin-bottom:10px;}
          .crm-share-btn{width:100%;padding:9px;border-radius:9px;border:none;background:#C9951A;color:#1A1610;font-weight:700;font-size:12px;cursor:pointer;}
        `}</style>
        <div className="crm-hub-title">{company.name}</div>
        <div className="crm-hub-grid">
          <a href="/painel/crm/pedidos" style={hubCard}><span style={{ fontSize: 26 }}>🧾</span><div><div style={hubTitle}>Pedidos</div><div style={hubSub}>Ver e gerenciar pedidos recebidos</div></div></a>
          <a href="/painel/crm/cozinha" style={hubCard}><span style={{ fontSize: 26 }}>🍳</span><div><div style={hubTitle}>Cozinha</div><div style={hubSub}>Painel pra deixar aberto na tela da cozinha</div></div></a>
          <a href="/painel/crm/catalogo" style={hubCard}><span style={{ fontSize: 26 }}>📋</span><div><div style={hubTitle}>Catálogo</div><div style={hubSub}>Produtos, categorias e combos</div></div></a>
        </div>
        <div className="crm-share-card">
          <div className="crm-share-title">📲 Compartilhar cardápio</div>
          <div className="crm-share-qr">{qrDataUrl && <img src={qrDataUrl} alt="QR Code do cardápio" />}</div>
          <div className="crm-share-link">{cardapioLink}</div>
          <button className="crm-share-btn" onClick={copyLink}>{copied ? 'Link copiado!' : 'Copiar link'}</button>
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
