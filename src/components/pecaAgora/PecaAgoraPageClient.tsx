'use client'
import { useState } from 'react'
import HomePecaAgora, { PecaGroup } from '@/components/home/HomePecaAgora'
import Footer from '@/components/Footer'

// Página própria da vitrine de delivery (ESPECIFICACAO.md §7) — antes
// embutida inteira na home, agora com endereço fixo (mockup aprovado,
// set/2026). Reaproveita 100% o mesmo componente/lógica que já existia
// (HomePecaAgora), só muda onde ele mora — ele já carrega o próprio
// título/abas/filtros (faixa amarela), então essa página não duplica
// hero nenhum, só dá a moldura (breadcrumb + busca + rodapé).
export default function PecaAgoraPageClient({ groups }: { groups: PecaGroup[] }) {
  const [query, setQuery] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)

  // Mesmo padrão do compartilhar do cardápio de loja (CardapioClient.tsx):
  // nativo do celular primeiro, com o link sempre dentro do `text` (nem
  // todo app que recebe repassa os dois campos) — cai pra copiar link se
  // não tiver nativo ou o usuário cancelar (pedido do Ricardo, set/2026).
  async function handleShare() {
    const url = window.location.href
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
    if (nav.share) {
      try {
        await nav.share({ title: 'Peça Agora — Trindade Online', text: `Dá uma olhada no que tá rolando pra pedir agora na Trindade!\n${url}` })
        return
      } catch {
        // usuário cancelou o compartilhamento nativo — cai pro copiar link
      }
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // clipboard bloqueado (raro) — só ignora, o link já está na barra do navegador
    }
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--concrete)' }}>
      <style>{`
        /* O espaço entre a barra de breadcrumb e a faixa amarela ficava
           vazio — pedido do Ricardo, set/2026 (mockup aprovado, opção
           "preto"): a barra preta cresce e absorve a busca, virando um
           bloco só até a faixa amarela começar, em vez de sobrar espaço
           em branco à toa. Fundo branco (não amarelo) no campo — pedido
           do Ricardo logo em seguida: "tá tudo muito amarelo", queria
           destacar o campo por contraste com a faixa preta em vez de
           repetir a cor da faixa amarela logo abaixo. E busca só de
           PRODUTO, filtrando a própria vitrine em tempo real (nome do
           produto) — não é a busca geral de empresa da home (essa usa
           HomeSearchBox/busca); aqui o campo é local e passa a query
           pro HomePecaAgora via prop search, que já sabe fazer esse
           filtro (ver HomePecaAgora.tsx). */
        .pca-top { background: var(--ink); padding: 14px 20px 22px; }
        .pca-bc-row { max-width: 1120px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .pca-bc { font-size: 11px; color: #fff; font-weight: 700; }
        .pca-bc a { color: var(--sign); text-decoration: none; }
        .pca-share-btn { display: flex; align-items: center; gap: 6px; background: var(--sign); color: var(--ink); border: none; border-radius: 10px; padding: 8px 13px; font-family: 'Archivo', sans-serif; font-size: 12px; font-weight: 800; flex-shrink: 0; white-space: nowrap; cursor: pointer; }
        .pca-top-search { max-width: 1120px; margin: 0 auto; }
        .pca-search-wrap { display: flex; max-width: 600px; margin: 0 auto; align-items: center; gap: 8px; background: var(--paper); border: 2.5px solid var(--sign); border-radius: 14px; padding: 6px 6px 6px 16px; box-shadow: 4px 4px 0 rgba(0,0,0,.35); }
        .pca-search-wrap input { flex: 1; border: none; background: transparent; font-size: 15px; font-family: 'Archivo', sans-serif; font-weight: 500; color: var(--ink); outline: none; }
        .pca-search-wrap input::placeholder { color: var(--muted); }
        .pca-search-ico { font-size: 15px; flex-shrink: 0; color: var(--muted); }
        .pca-search-clear { background: var(--concrete-2); border: none; border-radius: 50%; width: 22px; height: 22px; color: var(--ink-2); font-size: 13px; font-weight: 700; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; line-height: 1; }
        @media(min-width: 768px) {
          .pca-top { padding: 18px 20px 30px; }
          .pca-search-wrap { padding: 6px 6px 6px 20px; box-shadow: 5px 5px 0 rgba(0,0,0,.35); }
          .pca-search-wrap input { font-size: 16px; }
        }
        .pca-main { max-width: 1120px; margin: 0 auto; padding: 0 20px 40px; }
        .pca-main .pa-wrap { margin-top: 0; }
        .pca-empty { text-align: center; padding: 60px 20px; color: var(--muted); }
        .pca-empty-ico { font-size: 40px; margin-bottom: 10px; }
        .pca-empty-title { font-family: 'Anton', sans-serif; font-size: 20px; color: var(--ink); text-transform: uppercase; margin-bottom: 6px; }
        .pca-empty-sub { font-size: 13px; line-height: 1.6; max-width: 380px; margin: 0 auto 18px; }
        .pca-empty-btn { display: inline-block; background: var(--sign); color: var(--ink); font-weight: 800; font-size: 13px; padding: 11px 20px; border-radius: 10px; text-decoration: none; }
        /* Botãozinho redondo flutuante de compartilhar, só no mobile — pedido
           do Ricardo, out/2026: a barra de breadcrumb + compartilhar lá em
           cima tomava espaço de tela à toa no celular. Em vez disso, some
           essa barra só no mobile (ver .pca-bc-row abaixo) e o compartilhar
           migra pra esse botão flutuante, mesmo tamanho e logo acima do
           botão preto de voltar (BackButton.tsx: 48px, right:16,
           bottom:84 no mobile) — mesma pilha, cor amarela pra diferenciar. */
        .pca-float-share { display: none; }
        @media(max-width: 767.98px) {
          .pca-bc-row { display: none; }
          .pca-float-share {
            display: flex; position: fixed; right: 16px; bottom: 140px;
            width: 48px; height: 48px; border-radius: 50%;
            background: var(--sign); border: none; box-shadow: 0 4px 14px rgba(0,0,0,.35);
            align-items: center; justify-content: center; cursor: pointer;
            font-size: 20px; z-index: 40;
          }
        }
      `}</style>

      <button type="button" className="pca-float-share" onClick={handleShare} aria-label={linkCopied ? 'Link copiado' : 'Compartilhar'}>
        {linkCopied ? '✅' : '🔗'}
      </button>

      <div className="pca-top">
        <div className="pca-bc-row">
          <div className="pca-bc"><a href="/">Trindade Online</a> › Peça Agora</div>
          <button type="button" className="pca-share-btn" onClick={handleShare} aria-label={linkCopied ? 'Link copiado' : 'Compartilhar'}>
            <span>🔗</span> {linkCopied ? 'Copiado!' : 'Compartilhar'}
          </button>
        </div>
        <div className="pca-top-search">
          <div className="pca-search-wrap">
            <span className="pca-search-ico">🔍</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar produto, tipo empadão, pizza..."
              aria-label="Buscar produto"
            />
            {query && (
              <button type="button" className="pca-search-clear" aria-label="Limpar busca" onClick={() => setQuery('')}>✕</button>
            )}
          </div>
        </div>
      </div>

      <div className="pca-main">
        {groups.length > 0 ? (
          <HomePecaAgora groups={groups} search={query} />
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
