'use client'
import { useState } from 'react'
import CuponsPageClient from '@/components/cupons/CuponsPageClient'
import Footer from '@/components/Footer'

// Página de Ofertas (ESPECIFICACAO.md §4.1/§5.1) — mesma linguagem visual
// da página de categoria: hero escuro centralizado com busca sobreposta,
// depois os cupons, reaproveitando o client component já existente em
// modo "embedded" (sem hero/rodapé próprios). Promoções da Semana ficou
// fora daqui a pedido do Ricardo (set/2026) — desligada até segunda
// ordem, sem formato bom ainda; PromocoesPageClient continua existindo,
// é só voltar a renderizar aqui quando tiver um formato aprovado.
export default function OfertasPageClient() {
  const [search, setSearch] = useState('')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--concrete)' }}>
      <style>{`
        .of-hero { background: var(--ink); padding: 32px 24px 28px; text-align: center; border-bottom: 2px solid var(--sign); }
        .of-hero-ico { font-size: 32px; margin-bottom: 6px; }
        .of-hero-title { font-family: 'Anton', sans-serif; font-size: clamp(30px,5vw,44px); color: #fff; letter-spacing: 1px; text-transform: uppercase; line-height: 1; margin-bottom: 6px; }
        .of-hero-title span { color: var(--sign); }
        .of-hero-sub { font-size: 13px; color: #888; font-family: 'Archivo', sans-serif; }
        .of-search-wrap { background: var(--concrete); padding: 0 24px; }
        .of-search-inner { max-width: 640px; margin: 0 auto; transform: translateY(-20px); }
        .of-search { display: flex; align-items: center; gap: 10px; background: var(--sign); border: 2.5px solid var(--ink); border-radius: 14px; padding: 13px 20px; box-shadow: 4px 4px 0 var(--ink); }
        .of-search input { flex: 1; border: none; background: transparent; font-size: 15px; font-family: 'Archivo', sans-serif; font-weight: 500; color: var(--ink); outline: none; }
        .of-search input::placeholder { color: var(--ink-2); opacity: .55; }
        .of-search-btn { background: var(--ink); border: none; border-radius: 10px; padding: 7px 18px; color: var(--sign); font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'Archivo', sans-serif; white-space: nowrap; }
        @media(max-width: 767px) {
          .of-search-inner { max-width: 100%; }
          .of-search { padding: 8px 12px; gap: 6px; }
          .of-search input { font-size: 13px; }
        }
      `}</style>

      <div className="of-hero">
        <div className="of-hero-ico">🎟️</div>
        <div className="of-hero-title">OFERTAS <span>DO BAIRRO</span></div>
        <div className="of-hero-sub">Cupons relâmpago das empresas da Trindade</div>
      </div>
      <div className="of-search-wrap">
        <div className="of-search-inner">
          <div className="of-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Buscar cupom ou empresa..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="of-search-btn" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>
      </div>

      <CuponsPageClient embedded search={search} />
      <Footer />
    </div>
  )
}
