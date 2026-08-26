'use client'
import { useState } from 'react'
import CuponsPageClient from '@/components/cupons/CuponsPageClient'
import PromocoesPageClient from '@/components/promocoes/PromocoesPageClient'

type Promotion = {
  id: string; title: string; image_url: string; starts_at: string; expires_at: string
  company: { id: string; name: string; slug: string; category?: { name: string; emoji: string } }
}

// Página unificada de Ofertas (ESPECIFICACAO.md §4.1/§5.1 — cupons e
// promoções viravam duas famílias de nav diferentes, sem unificação;
// aqui viram uma única entrada de menu com abas, sem duplicar a lógica
// de cada seção — cada aba renderiza o client component já existente.
export default function OfertasPageClient({ initialPromos }: { initialPromos: Promotion[] }) {
  const [tab, setTab] = useState<'cupons' | 'promocoes'>('cupons')

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2EC' }}>
      <style>{`
        .of-tabs{position:sticky;top:0;z-index:500;background:#fff;border-bottom:1px solid #E0DDD8;display:flex;gap:4px;padding:10px 16px;max-width:900px;margin:0 auto;}
        .of-tab{flex:1;text-align:center;padding:10px 12px;border-radius:10px;font-size:13.5px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;color:#888;background:transparent;border:none;}
        .of-tab.on{background:#FEF3E2;color:#C9951A;}
      `}</style>
      <div className="of-tabs">
        <button className={`of-tab ${tab === 'cupons' ? 'on' : ''}`} onClick={() => setTab('cupons')}>🎟️ Cupons Relâmpago</button>
        <button className={`of-tab ${tab === 'promocoes' ? 'on' : ''}`} onClick={() => setTab('promocoes')}>🏷️ Promoções da Semana</button>
      </div>
      {tab === 'cupons' ? <CuponsPageClient /> : <PromocoesPageClient initialPromos={initialPromos} />}
    </div>
  )
}
