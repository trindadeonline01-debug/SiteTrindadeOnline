# Plano de implementação — Redesenho Trindade Online

> Tradução da `ESPECIFICACAO.md` pro código real do repositório. Este documento não substitui a especificação — ele mapeia cada fase pra arquivos/rotas/tabelas que já existem hoje, marca o que precisa ser descoberto e lista o que exige confirmação antes de mexer (schema, coisa destrutiva, decisão ambígua), conforme a regra padrão de trabalho.
>
> Status: rascunho pra aprovação do Ricardo. Nenhum item aqui foi implementado ainda.

---

## 0. O que já confirmei no código (não é suposição)

- **Dívida #1 (canonical/og genérico) é real e tem uma causa única e simples de corrigir:** `src/app/layout.tsx` define um `export const metadata` estático no `RootLayout` com `alternates.canonical` fixo em `https://trindadeonline.com.br` e o mesmo `openGraph`/`twitter` pra qualquer rota. Não existe nenhum `generateMetadata` em nenhuma página (`/empresa/[slug]`, `/categoria/[slug]`, etc.) sobrescrevendo isso. Ou seja: toda página do site literalmente manda o mesmo card pro Google e pro preview do WhatsApp. Corrigir é adicionar `generateMetadata(props)` dinâmico nas páginas que importam — não precisa refazer nada estrutural.
- **Rotas atuais do painel:** `/painel`, `/painel/mais` (já existe um "Mais" mobile — bate com a ideia da seção 10.12), e tudo hoje debaixo de `/painel/crm/`: `catalogo`, `clientes`, `cozinha`, `entrega`, `mensagens`, `pedidos`. A separação `/painel/crm/*` → `/painel/*` da seção 5.3 é literalmente mover essas 6 pastas pra um nível acima e trocar os imports/links.
- **Header hoje (`TopNav.tsx`/`MobileMenu.tsx`/`BottomNav.tsx`):** confirma a dívida #9 da seção 4.1 — o menu logado mistura Início/Cupons/Promoções com Meu Painel/Planos/Admin/Produção, sem nenhuma categoria de busca, e não existe lógica de "esconder Cadastrar empresa se já tem negócio". As 8 categorias do `MobileMenu.tsx` (`PAGES` array) hoje são uma lista achatada — vira as 3 famílias da seção 4.1.
- **Modelo de conta atual:** `companies.owner_id` aponta direto pra um usuário. Não existe tabela `membership`. Migrar pra o modelo da seção 3 é: criar `membership(person_id, business_id, role)`, popular com 1 linha por empresa existente (`owner_id` → role `owner`), e trocar os pontos que hoje checam `owner_id` pra checar `membership`.

---

## 1. Decisão bloqueante antes da Fase 0

A pendência nº 4 da especificação (expansão pra São Gonçalo) muda a rota (`/[bairro]` vs `/` fixo), a busca, o SEO e potencialmente a marca. Fazer isso depois do redesenho é redesenhar de novo. Preciso da sua decisão **antes** de tocar em rotas — pergunta separada logo abaixo desta mensagem.

---

## 2. Fase 0 — Fundação

Ordem sugerida dentro da própria fase (item 1 primeiro, é o de maior retorno e não depende de nada):

1. **SEO por página** — `generateMetadata` dinâmico em: `/empresa/[slug]`, `/categoria/[slug]`, `/subcategoria/[slug]`, `/anuncio/[id]`, `/cupons`, `/promocoes`. Cada um puxando nome/foto/descrição reais do banco pro `og:title`, `og:description`, `og:image` e `canonical` daquela URL específica.
2. **Tabela `membership`** — migração (peço confirmação explícita antes de aplicar, é mudança de schema). Sem quebrar nada que já lê `companies.owner_id` — os dois convivem até todo ponto de checagem ser migrado.
3. **Cadastro unificado em `/anunciar`** — reaproveita as 3 etapas que já existem em `/empresa/cadastrar`, só muda o passo 1 pra criar a pessoa implicitamente (hoje precisa investigar exatamente onde a conta de usuário nasce no fluxo atual antes de alterar).
4. **Reorganizar rotas do painel** — mover as 6 pastas de `/painel/crm/*` pra `/painel/*`, atualizar links internos, e adicionar redirects das URLs antigas (pra não quebrar favoritos/links salvos do Ricardo e da equipe).
5. **Rota `/empresa/[slug]/item/[id]`** — página de produto individual + `og:image` próprio. Hoje o catálogo inteiro vive em uma view só dentro de `/painel/crm/catalogo` pro lado do lojista e em alguma página pública de cardápio pro lado do cliente (preciso confirmar o nome exato da rota pública atual antes de mexer).
6. **Dívidas #3 a #12** da seção 12 — a maioria são bugs pontuais e independentes entre si (preço de imóvel exibido como aluguel, "100% margem" falso, filtro "sumidos" quebrado, etc.) — dá pra corrigir em paralelo, cada um é um commit pequeno.

## 3. Fase 1 — Portal

Depende da Fase 0 (rotas e SEO precisam estar prontos primeiro). Cobre: header fixo com busca em toda página + seletor de bairro, menu de 3 famílias, bottom tab bar mobile (Buscar·Empresas·Ofertas·Comunidade·Perfil — troca o `BottomNav.tsx`/`MobileMenu.tsx` atual), home reestruturada (ordem da seção 10.1), página de empresa (incluindo o estado do plano Grátis da seção 10.4).

## 4. Fase 2 — Painel

Sidebar por frequência de uso (a que já existe no admin foi alfabetizada recentemente — a do painel do lojista é outra tela, ainda com agrupamento por assunto), gating por plano com cadeado (função aparece apagada, não some), Visão Geral com "Para fazer", correções em Pedidos/Catálogo/Clientes descritas na seção 10.7–10.10, modos Cozinha/Atendimento em tela cheia, painel mobile com a barra Hoje·Pedidos·Interesses·Conversas·Mais.

## 5. Fase 3 — Catálogo e busca por produto

A parte mais nova estruturalmente: entidade **Interesse** (tabela nova — schema, confirmar antes), código curto na mensagem do WhatsApp, link/QR em 3 granularidades, índice de produtos **construído mas desligado** até massa mínima de catálogos, cadastro de horários alimentando "Aberto agora".

## 6. Fase 4 — Roadmap (não entra nesta rodada)

Mesa e balcão, expansão pra outros bairros (a menos que a decisão da seção 1 deste plano mude isso).

---

## 7. O que fica pra depois, mesmo dentro da Fase 0/1

Da seção 14 da especificação — pendências de baixo custo de adiar, não bloqueiam nada:
- Preços dos 3 planos pagos (Essencial/Loja/Operação) — preciso que você defina os valores quando chegarmos na tela de planos (fase 1, item "Página de venda dos planos")
- Nome do plano "Loja" (exclui contador/corretora/segurança) — decisão de marketing, não trava código
- Marca única vs duas — afeta o cabeçalho do painel, mas dá pra manter "Trindade Online" nos dois até decidir

---

## 8. Como isso vai rodar na prática

Sigo o fluxo direto-pro-main de sempre, `tsc --noEmit` antes de cada push, sem parar pra aprovação passo a passo — **exceto** nos pontos que a regra padrão já exige: a migração da tabela `membership`, a migração da tabela `interesses` (Fase 3), e qualquer decisão de rota/marca que a especificação deixou pendente. Nesses eu paro e confirmo com você antes.

Cada fase vira um lote de tarefas na lista de acompanhamento, do jeito que fizemos com a Agenda de Produção e o sistema de Entrega.
