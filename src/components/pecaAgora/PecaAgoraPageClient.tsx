'use client'
import HomePecaAgora, { PecaGroup } from '@/components/home/HomePecaAgora'
import HomeSearchBox from '@/components/home/HomeSearchBox'
import Footer from '@/components/Footer'

// Página própria da vitrine de delivery (ESPECIFICACAO.md §7) — antes
// embutida inteira na home, agora com endereço fixo (mockup aprovado,
// set/2026). Reaproveita 100% o mesmo componente/lógica que já existia
// (HomePecaAgora), só muda onde ele mora — ele já carrega o próprio
// título/abas/filtros (faixa amarela), então essa página não duplica
// hero nenhum, só dá a moldura (breadcrumb + busca + rodapé).
export default function PecaAgoraPageClient({ groups }: { groups: PecaGroup[] }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--concrete)' }}>
      <style>{`
        /* O espaço entre a barra de breadcrumb e a faixa amarela ficava
           vazio — pedido do Ricardo, set/2026 (mockup aprovado, opção
           "preto"): a barra preta cresce e absorve a busca, virando um
           bloco só até a faixa amarela começar, em vez de sobrar espaço
           em branco à toa. Mesmo campo de busca da home (HomeSearchBox),
           classes .hero-search-* duplicadas aqui de propósito — mesmo
           padrão já usado em HomePecaAgora.tsx, pra essa página funcionar
           sozinha sem depender do <style> de src/app/page.tsx. */
        .pca-top { background: var(--ink); padding: 14px 20px 22px; }
        .pca-bc { max-width: 1120px; margin: 0 auto 16px; font-size: 11px; color: #fff; font-weight: 700; }
        .pca-bc a { color: var(--sign); text-decoration: none; }
        .pca-top-search { max-width: 1120px; margin: 0 auto; }
        .hero-search-wrap { display: flex; max-width: 600px; margin: 0 auto; align-items: center; gap: 8px; background: var(--sign); border: 2.5px solid var(--ink); border-radius: 14px; padding: 6px 6px 6px 16px; box-shadow: 4px 4px 0 rgba(0,0,0,.35); }
        .hero-search-wrap input { flex: 1; border: none; background: transparent; font-size: 15px; font-family: 'Archivo', sans-serif; font-weight: 500; color: var(--ink); outline: none; }
        .hero-search-wrap input::placeholder { color: var(--ink-2); opacity: .55; }
        .hero-search-btn { background: var(--ink); border: none; border-radius: 10px; padding: 9px 16px; color: var(--sign); font-size: 13px; font-weight: 700; font-family: 'Archivo', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
        .search-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: var(--paper); border: 2px solid var(--ink); border-radius: 12px; margin-top: 8px; box-shadow: 4px 4px 0 rgba(21,18,16,.25); z-index: 100; overflow: hidden; }
        .sug-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer; transition: background .12s; border-bottom: .5px solid var(--line); }
        .sug-item:last-child { border-bottom: none; }
        .sug-item:hover { background: var(--concrete-2); }
        .sug-ico { font-size: 14px; flex-shrink: 0; }
        .sug-label { font-size: 13px; font-weight: 600; color: var(--ink); text-align: left; font-family: 'Archivo', sans-serif; }
        .sug-sub { font-size: 11px; color: var(--muted); margin-top: 1px; text-align: left; }
        @media(min-width: 768px) {
          .pca-top { padding: 18px 20px 30px; }
          .hero-search-wrap { padding: 6px 6px 6px 20px; box-shadow: 5px 5px 0 rgba(0,0,0,.35); }
          .hero-search-wrap input { font-size: 16px; }
          .hero-search-btn { padding: 10px 24px; font-size: 14px; }
        }
        .pca-main { max-width: 1120px; margin: 0 auto; padding: 0 20px 40px; }
        .pca-main .pa-wrap { margin-top: 0; }
        .pca-empty { text-align: center; padding: 60px 20px; color: var(--muted); }
        .pca-empty-ico { font-size: 40px; margin-bottom: 10px; }
        .pca-empty-title { font-family: 'Anton', sans-serif; font-size: 20px; color: var(--ink); text-transform: uppercase; margin-bottom: 6px; }
        .pca-empty-sub { font-size: 13px; line-height: 1.6; max-width: 380px; margin: 0 auto 18px; }
        .pca-empty-btn { display: inline-block; background: var(--sign); color: var(--ink); font-weight: 800; font-size: 13px; padding: 11px 20px; border-radius: 10px; text-decoration: none; }
      `}</style>

      <div className="pca-top">
        <div className="pca-bc"><a href="/">Trindade Online</a> › Peça Agora</div>
        <div className="pca-top-search"><HomeSearchBox /></div>
      </div>

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
