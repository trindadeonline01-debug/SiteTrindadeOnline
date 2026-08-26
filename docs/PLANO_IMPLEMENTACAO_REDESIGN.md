# Plano de implementação — Redesenho Trindade Online

> Tradução da `ESPECIFICACAO.md` pro código real do repositório. Este documento não substitui a especificação — ele mapeia cada fase pra arquivos/rotas/tabelas que já existem hoje, marca o que precisa ser descoberto e lista o que exige confirmação antes de mexer (schema, coisa destrutiva, decisão ambígua), conforme a regra padrão de trabalho.
>
> Status: **Fase 0 completa** (itens 0.1 a 0.7). **Fase 1 completa** (itens 1.1 a 1.5). **Fase 2 completa** (itens 2.1 a 2.6 — sidebar por frequência + gating com cadeado, "Para fazer" na visão geral, correções em Pedidos/Catálogo/Clientes, modo Atendimento em tela cheia). Tudo publicado no `main`. Próxima: **Fase 2.5 — design system visual** (§11, fonte Anton + cores novas, decidido em 26/ago/2026 pra vir logo depois da Fase 2), depois **Fase 3** (Catálogo e busca por produto).

---

## 0. O que já confirmei no código (não é suposição)

- **Dívida #1 (canonical/og genérico) é real e tem uma causa única e simples de corrigir:** `src/app/layout.tsx` define um `export const metadata` estático no `RootLayout` com `alternates.canonical` fixo em `https://trindadeonline.com.br` e o mesmo `openGraph`/`twitter` pra qualquer rota. Não existe nenhum `generateMetadata` em nenhuma página (`/empresa/[slug]`, `/categoria/[slug]`, etc.) sobrescrevendo isso. Ou seja: toda página do site literalmente manda o mesmo card pro Google e pro preview do WhatsApp. Corrigir é adicionar `generateMetadata(props)` dinâmico nas páginas que importam — não precisa refazer nada estrutural.
- **Rotas atuais do painel:** `/painel`, `/painel/mais` (já existe um "Mais" mobile — bate com a ideia da seção 10.12), e tudo hoje debaixo de `/painel/crm/`: `catalogo`, `clientes`, `cozinha`, `entrega`, `mensagens`, `pedidos`. A separação `/painel/crm/*` → `/painel/*` da seção 5.3 é literalmente mover essas 6 pastas pra um nível acima e trocar os imports/links.
- **Header hoje (`TopNav.tsx`/`MobileMenu.tsx`/`BottomNav.tsx`):** confirma a dívida #9 da seção 4.1 — o menu logado mistura Início/Cupons/Promoções com Meu Painel/Planos/Admin/Produção, sem nenhuma categoria de busca, e não existe lógica de "esconder Cadastrar empresa se já tem negócio". As 8 categorias do `MobileMenu.tsx` (`PAGES` array) hoje são uma lista achatada — vira as 3 famílias da seção 4.1.
- **Modelo de conta atual:** `companies.owner_id` aponta direto pra um usuário. Não existe tabela `membership`. Migrar pra o modelo da seção 3 é: criar `membership(person_id, business_id, role)`, popular com 1 linha por empresa existente (`owner_id` → role `owner`), e trocar os pontos que hoje checam `owner_id` pra checar `membership`.

---

## 1. Decisão da expansão de bairro — resolvida

Ricardo decidiu: **construir a estrutura multi-bairro já na Fase 0, mas só a Trindade fica visível/ativa** até ele cadastrar outro bairro no admin.

Implicação prática pro schema e pras rotas:
- Tabela `neighborhoods` (ou `bairros`) nova: `id`, `name`, `slug`, `active`. Seed com uma linha só — Trindade, `active = true`.
- `companies` (e depois `businesses`, se a seção 3 for adiante) ganha `neighborhood_id`, apontando todo mundo pra Trindade no backfill.
- Rotas já nascem no formato `/[bairro]/...` (ex: `/trindade`, `/trindade/categoria/comercios`), mas:
  - `/` continua funcionando — redireciona (ou renderiza direto, a decidir na hora) pro bairro ativo único quando só existe um.
  - O seletor de bairro no header só lista bairros com `active = true`. Com um só cadastrado, ele nem precisa aparecer como dropdown de verdade — pode ser um rótulo fixo até o segundo bairro existir.
  - Busca, SEO e categorias já filtram por `neighborhood_id` desde o início, então quando o segundo bairro for ativado não tem nada pra retrabalhar — só cadastrar e marcar `active`.

Essa tabela é schema novo → confirmo com você antes de aplicar a migração, junto com a de `membership` (item 2 abaixo).

---

## 2. Fase 0 — Fundação

Ordem sugerida dentro da própria fase (item 1 primeiro, é o de maior retorno e não depende de nada):

1. **SEO por página** — `generateMetadata` dinâmico em: `/empresa/[slug]`, `/categoria/[slug]`, `/subcategoria/[slug]`, `/anuncio/[id]`, `/cupons`, `/promocoes`. Cada um puxando nome/foto/descrição reais do banco pro `og:title`, `og:description`, `og:image` e `canonical` daquela URL específica.
2. **Tabela `neighborhoods` + `neighborhood_id` em `companies`** — migração (confirmar antes de aplicar). Ver decisão da seção 1.
3. **Tabela `membership`** — migração (peço confirmação explícita antes de aplicar, é mudança de schema). Sem quebrar nada que já lê `companies.owner_id` — os dois convivem até todo ponto de checagem ser migrado.
4. **Cadastro unificado em `/anunciar`** — reaproveita as 3 etapas que já existem em `/empresa/cadastrar`, só muda o passo 1 pra criar a pessoa implicitamente (hoje precisa investigar exatamente onde a conta de usuário nasce no fluxo atual antes de alterar).
5. **Reorganizar rotas do painel** — mover as 6 pastas de `/painel/crm/*` pra `/painel/*`, atualizar links internos, e adicionar redirects das URLs antigas (pra não quebrar favoritos/links salvos do Ricardo e da equipe).
6. **Rota `/empresa/[slug]/item/[id]`** — página de produto individual + `og:image` próprio. Hoje o catálogo inteiro vive em uma view só dentro de `/painel/crm/catalogo` pro lado do lojista e em alguma página pública de cardápio pro lado do cliente (preciso confirmar o nome exato da rota pública atual antes de mexer).
7. **Dívidas #3 a #12** da seção 12 — a maioria são bugs pontuais e independentes entre si (preço de imóvel exibido como aluguel, "100% margem" falso, filtro "sumidos" quebrado, etc.) — dá pra corrigir em paralelo, cada um é um commit pequeno.

## 3. Fase 1 — Portal

Depende da Fase 0 (rotas e SEO precisam estar prontos primeiro). Cobre: header fixo com busca em toda página + seletor de bairro, menu de 3 famílias, bottom tab bar mobile (Buscar·Empresas·Ofertas·Comunidade·Perfil — troca o `BottomNav.tsx`/`MobileMenu.tsx` atual), home reestruturada (ordem da seção 10.1), página de empresa (incluindo o estado do plano Grátis da seção 10.4).

## 4. Fase 2 — Painel

Sidebar por frequência de uso (a que já existe no admin foi alfabetizada recentemente — a do painel do lojista é outra tela, ainda com agrupamento por assunto), gating por plano com cadeado (função aparece apagada, não some), Visão Geral com "Para fazer", correções em Pedidos/Catálogo/Clientes descritas na seção 10.7–10.10, modos Cozinha/Atendimento em tela cheia, painel mobile com a barra Hoje·Pedidos·Interesses·Conversas·Mais.

## 4.5. Fase 2.5 — Design system visual (decidido: depois da Fase 2)

Troca visual da seção 11 da especificação — sai o visual atual (dourado premium `#C9951A`/preto) e entra a direção "placa de comércio de bairro": tokens de cor novos (`--ink`, `--sign` amarelo de toldo, `--concrete`, `--open`, `--alert` etc.), fonte Anton no lugar de Bebas Neue pra título/número grande, Archivo no lugar de Inter pro corpo. Regra central: fonte condensada em caixa alta só em título de página e número grande — nunca em nome de empresa/produto/cliente nem rótulo de campo (é isso que hoje deixa nome longo ilegível, ex: "SM KARAOKÊ -ALUGUEL DE KARAOKE /TOTO/ FLIPERAMA").

É transversal — portal inteiro (home, categoria, busca, empresa, ofertas) e painel do lojista, os dois de uma vez. Por isso vem depois da Fase 2: sem isso, teríamos que restilizar o portal agora e o painel de novo depois, quando dá pra fazer as duas juntas.

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
