'use client'
import HomePecaAgora, { PecaGroup } from '@/components/home/HomePecaAgora'
import Footer from '@/components/Footer'

// Página própria da vitrine de delivery (ESPECIFICACAO.md §7) — antes
// embutida inteira na home, agora com endereço fixo (mockup aprovado,
// set/2026). Reaproveita 100% o mesmo componente/lógica que já existia
// (HomePecaAgora), só muda onde ele mora — ele já carrega o próprio
// título/abas/filtros (faixa amarela), então essa página não duplica
// hero nenhum, só dá a moldura (breadcrumb pra voltar + rodapé).
export default function PecaAgoraPageClient({ groups }: { groups: PecaGroup[] }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--concrete)' }}>
      <style>{`
        .pca-bc-wrap { background: var(--ink); padding: 14px 20px; }
        .pca-bc { max-width: 1120px; margin: 0 auto; font-size: 11px; color: #fff; font-weight: 700; }
        .pca-bc a { color: var(--sign); text-decoration: none; }
        .pca-main { max-width: 1120px; margin: 0 auto; padding: 0 20px 40px; }
        .pca-empty { text-align: center; padding: 60px 20px; color: var(--muted); }
        .pca-empty-ico { font-size: 40px; margin-bottom: 10px; }
        .pca-empty-title { font-family: 'Anton', sans-serif; font-size: 20px; color: var(--ink); text-transform: uppercase; margin-bottom: 6px; }
        .pca-empty-sub { font-size: 13px; line-height: 1.6; max-width: 380px; margin: 0 auto 18px; }
        .pca-empty-btn { display: inline-block; background: var(--sign); color: var(--ink); font-weight: 800; font-size: 13px; padding: 11px 20px; border-radius: 10px; text-decoration: none; }
      `}</style>

      <div className="pca-bc-wrap"><div className="pca-bc"><a href="/">Trindade Online</a> › Peça Agora</div></div>

      <div className="pca-main">
        {groups.length > 0 ? (
          <HomePecaAgora groups={groups} />
        ) : (
          <div className="pca-empty">
            <div className="pca-empty-ico">🍽️</div>
            <div className="pca-empty-title">Ainda sem cardápio por aqui</div>
            <div className="pca-empty-sub">Nenhuma empresa com cardápio digital aberta agora. Volta em outro horário ou dá uma olhada nos negócios do bairro.</div>
            <a className="pca-empty-btn" href="/categoria/gastronomia">Ver gastronomia →</a>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}
