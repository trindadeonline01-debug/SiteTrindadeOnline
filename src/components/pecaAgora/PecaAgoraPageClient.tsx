'use client'
import { useState, useRef, useEffect } from 'react'
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
  // Campo de busca fixo no topo saiu (pedido do Ricardo, out/2026: "tá
  // muito amador" ter ele sempre visível) — agora só aparece sob demanda,
  // via o botão "Buscar" (desktop, na linha do breadcrumb) ou a opção
  // "Pesquisar" do botão "+" flutuante (mobile, ver pca-fab abaixo).
  const [searchOpen, setSearchOpen] = useState(false)
  // Botão amarelo flutuante do mobile deixou de ser só "Compartilhar" e
  // virou um "+" que abre duas opções (Pesquisar/Compartilhar) — pedido
  // do Ricardo, out/2026, pra não precisar de mais um botão flutuante
  // separado só pra busca (já tinha voltar + compartilhar empilhados).
  const [fabOpen, setFabOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  function openSearch() {
    setFabOpen(false)
    setSearchOpen(true)
  }
  function closeSearch() {
    setSearchOpen(false)
    setQuery('')
  }
  function toggleSearch() {
    if (searchOpen) closeSearch()
    else openSearch()
  }

  // Mesmo padrão do compartilhar do cardápio de loja (CardapioClient.tsx):
  // nativo do celular primeiro, com o link sempre dentro do `text` (nem
  // todo app que recebe repassa os dois campos) — cai pra copiar link se
  // não tiver nativo ou o usuário cancelar (pedido do Ricardo, set/2026).
  async function handleShare() {
    setFabOpen(false)
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
           em branco à toa. Busca deixou de ficar fixa aqui (pedido do
           Ricardo, out/2026) — agora só aparece quando chamada (botão
           "Buscar" no desktop, opção do "+" flutuante no mobile), então
           no mobile essa barra preta só existe enquanto a busca tá aberta
           (ver .pca-top--open abaixo); sem isso ela ficaria com um espaço
           preto vazio à toa, já que o breadcrumb também só mora aqui no
           desktop. Fundo branco (não amarelo) no campo — contraste com a
           faixa preta em vez de repetir a cor da faixa amarela embaixo.
           Busca só de PRODUTO, filtrando a própria vitrine em tempo real
           (nome do produto) — não é a busca geral de empresa da home
           (essa usa HomeSearchBox/busca); aqui o campo é local e passa a
           query pro HomePecaAgora via prop search, que já sabe fazer esse
           filtro (ver HomePecaAgora.tsx). */
        .pca-top { background: var(--ink); padding: 14px 20px 22px; }
        .pca-bc-row { max-width: 1120px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .pca-bc { font-size: 11px; color: #fff; font-weight: 700; }
        .pca-bc a { color: var(--sign); text-decoration: none; }
        .pca-bc-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .pca-share-btn, .pca-search-btn { display: flex; align-items: center; gap: 6px; border-radius: 10px; padding: 8px 13px; font-family: 'Archivo', sans-serif; font-size: 12px; font-weight: 800; flex-shrink: 0; white-space: nowrap; cursor: pointer; }
        .pca-share-btn { background: var(--sign); color: var(--ink); border: none; }
        .pca-search-btn { background: transparent; color: #fff; border: 1.5px solid var(--sign); }
        .pca-search-btn.on { background: var(--sign); color: var(--ink); }
        .pca-top-search { max-width: 1120px; margin: 16px auto 0; }
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
        /* Botão flutuante único no mobile, só esse: a bolinha preta de
           voltar (BackButton.tsx) continua separada, mas a amarela deixou
           de ser só "Compartilhar" e virou um "+" que abre duas opções
           empilhadas acima dele (Pesquisar e Compartilhar) — pedido do
           Ricardo, out/2026: "transformar essa bolinha amarela num
           botãozinho de mais". Evita um terceiro botão flutuante só pra
           busca. Gira pra virar "✕" quando aberto. */
        .pca-fab, .pca-fab-opt { display: none; }
        @media(max-width: 767.98px) {
          .pca-bc-row { display: none; }
          .pca-top { display: none; }
          .pca-top.pca-top--open { display: block; padding: 14px 20px 18px; }
          .pca-top-search { margin-top: 0; }
          .pca-fab {
            display: flex; position: fixed; right: 16px; bottom: 140px;
            width: 48px; height: 48px; border-radius: 50%;
            background: var(--sign); border: none; box-shadow: 0 4px 14px rgba(0,0,0,.35);
            align-items: center; justify-content: center; cursor: pointer;
            font-size: 24px; font-weight: 700; color: var(--ink); line-height: 1;
            z-index: 41; transition: transform .2s;
          }
          .pca-fab.on { transform: rotate(45deg); }
          .pca-fab-opt {
            display: flex; position: fixed; right: 16px; align-items: center; gap: 7px;
            background: var(--paper); color: var(--ink); border: 1.5px solid var(--sign);
            border-radius: 24px; padding: 10px 16px; font-family: 'Archivo', sans-serif;
            font-size: 13px; font-weight: 800; white-space: nowrap; cursor: pointer;
            box-shadow: 0 4px 14px rgba(0,0,0,.25); z-index: 41;
            opacity: 0; transform: translateY(8px) scale(.92); pointer-events: none;
            transition: opacity .18s, transform .18s;
          }
          .pca-fab-opt.show { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
          .pca-fab-opt--search { bottom: 196px; }
          .pca-fab-opt--share { bottom: 252px; }
        }
      `}</style>

      <button type="button" className={`pca-fab ${fabOpen ? 'on' : ''}`} onClick={() => setFabOpen(v => !v)} aria-label={fabOpen ? 'Fechar menu' : 'Mais opções'} aria-expanded={fabOpen}>
        +
      </button>
      <button type="button" className={`pca-fab-opt pca-fab-opt--search ${fabOpen ? 'show' : ''}`} onClick={toggleSearch}>
        <span>🔍</span> Pesquisar
      </button>
      <button type="button" className={`pca-fab-opt pca-fab-opt--share ${fabOpen ? 'show' : ''}`} onClick={handleShare}>
        <span>{linkCopied ? '✅' : '🔗'}</span> {linkCopied ? 'Copiado!' : 'Compartilhar'}
      </button>

      <div className={`pca-top ${searchOpen ? 'pca-top--open' : ''}`}>
        <div className="pca-bc-row">
          <div className="pca-bc"><a href="/">Trindade Online</a> › Peça Agora</div>
          <div className="pca-bc-actions">
            <button type="button" className={`pca-search-btn ${searchOpen ? 'on' : ''}`} onClick={toggleSearch} aria-expanded={searchOpen}>
              <span>🔍</span> Buscar
            </button>
            <button type="button" className="pca-share-btn" onClick={handleShare} aria-label={linkCopied ? 'Link copiado' : 'Compartilhar'}>
              <span>🔗</span> {linkCopied ? 'Copiado!' : 'Compartilhar'}
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="pca-top-search">
            <div className="pca-search-wrap">
              <span className="pca-search-ico">🔍</span>
              <input
                ref={searchInputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar produto, tipo empadão, pizza..."
                aria-label="Buscar produto"
              />
              <button
                type="button"
                className="pca-search-clear"
                aria-label={query ? 'Limpar busca' : 'Fechar busca'}
                onClick={() => (query ? setQuery('') : closeSearch())}
              >✕</button>
            </div>
          </div>
        )}
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
