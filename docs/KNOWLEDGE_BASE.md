# BASE DE CONHECIMENTO — TRINDADE ONLINE
> Documento de continuidade para novo contexto/conta Claude
> Gerado em: julho de 2026 | Versão: 3.1 (revisada — segredos removidos, branch corrigido)

---

## REGRAS DE TRABALHO (LER PRIMEIRO — INEGOCIÁVEIS)

### Fluxo atual — Claude Code direto (a partir de jul/2026)
Ricardo dá o comando → Claude executa a mudança, commita, dá push **direto no `main`** e a Vercel publica sozinha. **Sem pedir aprovação passo a passo**, sem esperar "pode"/"aprovado" antes de cada etapa, sem mockup HTML antes do código. Roda `tsc --noEmit` (ou lint equivalente) antes do push como checagem de sanidade, mas não pausa pra aprovação por isso.

**Exceções que continuam valendo sempre:**
- **Supabase MCP** — desde jul/2026 está conectado corretamente ao projeto do Trindade Online (`plfuznchzuzardkfjmqo`, verificado via `list_projects`). Sempre reconferir o project_id antes de rodar algo, mas já pode ser usado diretamente (consultas e mudanças de dados) em vez de só fornecer SQL manual. Mudanças de schema (`apply_migration`) e qualquer coisa destrutiva continuam pedindo confirmação antes.
- Mudanças ambíguas, destrutivas (delete em massa, mudança de schema, etc.) ou que fujam do que foi pedido: perguntar antes, não assumir.
- Ricardo usa **voz transcrita** — interpretar: "feio"=feito, "puxo"=push, "Cláudia"=Claude
- Respostas **curtas e diretas** — Ricardo não gosta de textos longos explicativos
- **REGRA ABSOLUTA DE TEXTO (15/nov/2026):** respostas em 1–3 frases: "fiz X por causa de Y". Sem recap, sem lista longa, sem explicar o que não foi perguntado. Mockup só se Ricardo pedir. Uma sessão nova por assunto (economiza token).
- **Consumo Vercel (set/2026):** agrupar mudanças pequenas/relacionadas num push só em vez de um push por ajuste (cada push = 1 build completo, é o maior item de custo — Build CPU Minutes). Pra medir performance/tempo de resposta do site ao vivo, não bater direto na URL de produção via `pg_net`/`curl` repetidas vezes (cada chamada gera tráfego real, soma em Fast Data Transfer) — preferir `EXPLAIN ANALYZE` no Supabase pra tempo de query, e limitar chamada direta ao site a no máximo 1-2 vezes por diagnóstico, só quando não der pra confirmar de outro jeito.
- **App do motoboy — `eas build` reescreve `app.json` local, trava `git pull` (out/2026):** caso real — Ricardo testou 3 rodadas de mudança (som, filtro, header invertido, caixinhas de código, digital) e **nada apareceu**, nem a mudança mais simples (altura da barra de baixo). Causa raiz: `eas build` normaliza as permissões Android (acrescenta versão `android.permission.*` de cada uma) e grava `extra.eas.projectId` direto no `app.json`, sem pedir — e isso nunca tinha sido commitado. Então todo `git pull` subsequente batia em "local changes would be overwritten by merge" e **abortava silenciosamente** (ele só via isso rodando o comando, não tinha como adivinhar que o pull tinha falhado só de olhar o app) — o app instalado ficava preso numa versão de dias atrás, enquanto cada "já implementei, roda os comandos" meu parecia não ter feito efeito nenhum. Resolvido commitando esse estado final do `app.json` (permissões normalizadas + `projectId`) — próximos `eas build` não devem gerar diff nenhum a mais, já que o conteúdo bate com o que ele mesmo escreveria. Lição: **depois de mandar rodar `git pull`, sempre conferir se apareceu "Updating... Fast-forward" com arquivos mudados — "Aborting"/erro de merge silencioso é fácil de passar despercebido no meio de um bloco de comandos.**
- **App do motoboy — comandos de rebuild sempre separados (out/2026):** diferente do site (que publica sozinho via push na Vercel), o app nativo (`app-motoboy/`) só chega no celular do Ricardo depois dele rodar comandos no cmd do próprio computador (clonar/puxar, `npm install`, `eas build`). Pedido explícito dele: **sempre mandar cada comando em blocos separados**, um por vez — nunca juntar `git pull` + `cd` + `npm install` etc num texto só. Motivo real, não só preferência: ele copia/cola rápido no terminal, e quando dois comandos vêm colados sem quebra de linha de verdade, o cmd gruda os dois numa linha só (ex: `git pull origin maincd app-motoboy` virou um comando inválido, out/2026). Vale pra toda alteração no app, sempre.

### Regras antigas (fluxo manual via GitHub Codespaces — Ricardo copia/cola arquivos)
Só se aplicam quando Ricardo estiver trabalhando fora do Claude Code, colando arquivos manualmente:
1. Nunca gerar código ou documento sem aprovação prévia de Ricardo
2. Sempre mostrar visual HTML interativo em chat para aprovação ANTES de gerar código Next.js
3. Sempre gerar **arquivo completo** para substituição total — Ricardo apaga tudo e cola tudo, sem exceção
4. Aguardar confirmação explícita ("pode", "aprovado", "sim") antes de executar qualquer passo
5. **Executar em etapas separadas:** 1) criar pasta → 2) criar arquivo → 3) fazer alterações. Nunca combinar em um comando. Aguardar confirmação entre cada etapa
6. Após cada comando, enviar imediatamente o comando de verificação antes de avançar
7. Sempre `grep` para verificar correspondência exata de texto antes de qualquer substituição

---

## 1. IDENTIDADE DO PROJETO

**Nome:** Trindade Online
**Fundador:** Ricardo (ex-vendedor ambulante e carpinteiro)
**Instagram:** @trindade.online
**Site:** trindadeonline.com.br ✅ (live na Vercel)
**Missão:** Conectar moradores, comércios, histórias e serviços do bairro Trindade (São Gonçalo, RJ)
**Frase resumo:** "O Trindade Online conecta histórias, pessoas e comércios da Trindade, transformando conteúdo em movimento real dentro do bairro."

**Números atuais (junho 2026):**
- Instagram: ~12.300 seguidores
- TikTok: ~6.500
- Facebook: ~1.000
- Total: ~20.000 seguidores

---

## 2. IDENTIDADE VISUAL

| Item | Valor |
|------|-------|
| Fundo principal | `#111111` / `#1A0F00` |
| Dourado primário | `#C9951A` |
| Dourado secundário | `#B8860B` |
| Bege | `#F0EDE8` |
| Tipografia títulos | Bebas Neue |
| Tipografia corpo | Inter |
| Formato social | 1080×1080px |

---

## 3. STACK TÉCNICO

| Item | Detalhe |
|------|---------|
| Framework | Next.js 16 (App Router + TypeScript) |
| Estilo | Tailwind CSS + CSS inline nos componentes |
| Banco | Supabase (PostgreSQL + RLS + Storage) |
| Deploy | Vercel |
| Email | Resend (`noreply@trindadeonline.com.br`) |
| Domínio | `trindadeonline.com.br` ✅ |
| Repositório | `trindadeonline01-debug/SiteTrindadeOnline` |
| Branch de produção | `main` |
| Conta Supabase | `trindadeonline01@gmail.com` |
| Supabase project ref | `plfuznchzuzardkfjmqo` |

**Infraestrutura adicional:**
- **Hetzner VPS** (Ubuntu, Docker) — Evolution API v2.3.7 para WhatsApp em massa
  - SSH: `ssh root@evo.trindadeonline.com.br` (domínio já aponta pra essa VPS, usuário `root` — senha nunca documentada aqui, digitada na hora)
  - Reiniciar o container do Evolution API (seguro, não perde sessão — ver "Lições aprendidas" §10): `docker ps` pra achar o nome do container, depois `docker restart <nome>`
- Blast worker Node.js gerenciado por PM2 em `/opt/blast/`
- Nginx reverse proxy com SSL:
  - `evo.trindadeonline.com.br` (porta 8080)
  - `api.trindadeonline.com.br` (porta 3001)
- Evolution API panel: acesso e credenciais **não documentados aqui** — solicitar a Ricardo diretamente (fora do repositório)
  - Nome da instância: **`Trindade Online`** (com espaço e maiúsculas — obrigatório exato)
- **OneSignal** push notifications — app ID: `237b0896-717c-4ba7-8585-73ca162fa751`
- **Google Tag Manager:** `GTM-P3889L2G` (instalado em `layout.tsx`)
- **Mercado Pago Pix** — integração ativa (`/api/mp/create-charge`, webhook, check-payment)

---

## 4. ARQUITETURA DE PÁGINAS

### Páginas públicas
| Rota | Status |
|------|--------|
| `/` | ✅ Home com highlights, busca global, banners, categorias |
| `/login` | ✅ Lê `?redirect=` para redirecionar após auth |
| `/cadastro` | ✅ |
| `/redefinir-senha` | ✅ |
| `/sair` | ✅ |
| `/empresa/[slug]` | ✅ Perfil público com avaliações semanais |
| `/empresa/cadastrar` | ✅ |
| `/empresa/planos` | ✅ Página de planos redesenhada |
| `/categoria/[slug]` | ✅ Com highlights e breadcrumb |
| `/subcategoria/[slug]` | ✅ Com highlights e breadcrumb |
| `/busca` | ✅ Empresas + listings |
| `/desapega` | ✅ |
| `/empregos` | ✅ |
| `/imoveis` | ✅ |
| `/achados-perdidos` | ✅ |
| `/anuncio/[id]` | ✅ |
| `/favoritos` | ✅ |
| `/perfil` | ✅ Com listings, avaliações, favoritos |
| `/cupons` | ✅ Flash Coupons — listing público, painel empresa, "Meus Cupons" no perfil, ranking mensal top 3 por categoria |
| `/promocoes` | ✅ Promoções da Semana — Stories mobile, grid 4 colunas desktop |
| `/termos` | ✅ Termos de uso + Privacidade LGPD completo |
| `/not-found` (404) | ✅ |

### Páginas autenticadas
| Rota | Status |
|------|--------|
| `/painel` | ✅ Painel lojista completo |
| `/admin` | ✅ Painel admin completo |

### Componentes
| Componente | Status |
|-----------|--------|
| `CookieBanner.tsx` | ✅ |
| `WAButton` (WhatsApp flutuante home) | ✅ Com botão fechar |
| TopNav (desktop) | ✅ Global, role-based |
| BottomNav (mobile) | ✅ Global, role-based |

---

## 5. BANCO DE DADOS

### Tabelas principais (28+ tabelas)
```
profiles              — usuários (user_type: admin/company/user)
companies             — empresas cadastradas
company_photos        — fotos das empresas
company_hours         — horários de funcionamento
company_subcategories — vínculo empresa ↔ subcategoria
categories            — 8 categorias fixas
subcategories         — subcategorias por categoria
reviews               — avaliações (limite 1/semana por empresa)
review_responses      — respostas do lojista às avaliações
highlights            — destaques (home/category/subcategory)
favorites             — favoritos dos moradores
listings              — anúncios (desapega/emprego/imovel/achado)
listing_photos        — fotos dos anúncios
listing_reports       — denúncias de anúncios
search_logs           — log de buscas
page_views            — analytics de visualizações
whatsapp_clicks       — cliques no WhatsApp
plans                 — planos e preços
email_logs            — rastreamento de envios por empresa
notification_log      — log de todas as notificações
feature_flags         — flags de funcionalidades (toggle via admin)
blast_campaigns       — campanhas WhatsApp em massa
blast_logs            — logs das campanhas
blast_blacklist       — lista de exclusão das campanhas
```

### IDs fixos das categorias
```
Comércios:          00000000-0000-0000-0000-000000000001
Serviços:           00000000-0000-0000-0000-000000000002
Gastronomia:        00000000-0000-0000-0000-000000000003
Empregos:           00000000-0000-0000-0000-000000000004
Imóveis:            00000000-0000-0000-0000-000000000005
Desapega:           00000000-0000-0000-0000-000000000006
Achados & Perdidos: 00000000-0000-0000-0000-000000000007
Igrejas:            00000000-0000-0000-0000-000000000008
```

---

## 10. PADRÕES TÉCNICOS CRÍTICOS

### TypeScript fix padrão (Supabase joins retornam array)
```typescript
setData((data || []) as any)
```

### Next.js 16 params assíncronos
```typescript
const { slug } = use(params) // params é Promise
```

### Constantes globais
```typescript
const IGREJAS_CATEGORY_ID = '00000000-0000-0000-0000-000000000008'
const DIAS_SEMANA = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo']
```

### Filtro de período — padrão obrigatório pra qualquer tela nova/atualizada (set/2026)
Definido em Sala de Vendas (admin), que Ricardo aprovou como referência visual ("ficou top"). Qualquer filtro de data novo, ou um já existente que for mexido, deve reaproveitar `src/lib/periodFilter.ts` (tipos `PeriodSel`/`PeriodKind` + `periodRange()`/`periodLabel()`) e o componente `src/components/admin/PeriodFilterBar.tsx` — não reinventar o próprio conjunto de botões. Padrão: pills **Hoje · Ontem · Esta semana · Este mês · Este ano · Tudo** + dropdown **Outro mês** + intervalo personalizado com dois campos, **De** (início) **até** (término) — nunca um único campo de data solto pra período personalizado (era o bug em Sala de Vendas antes desse padrão existir).



## 11. FLUXO DE DEPLOY

**Fluxo original (Ricardo via GitHub Codespaces):**
1. Ricardo edita no GitHub Codespaces
2. Cola arquivos completos gerados pelo Claude
3. `git add . && git commit -m "mensagem" && git push`
4. Vercel detecta o push no branch `main` e faz deploy automático
5. Disponível em `trindadeonline.com.br`

**Fluxo atual (Claude Code neste ambiente, a partir de jul/2026):**
- Claude edita, commita e dá push **direto no branch `main`** — sem PR, sem aprovação por etapa (ver seção "Regras de Trabalho")
- Vercel detecta o push no `main` e publica automaticamente
- Vercel: projeto correto é **`site-trindade-online`** (`trindadeonline01-debug/SiteTrindadeOnline`, domínio `www.trindadeonline.com.br`). Havia um projeto duplicado (`site-trindade-online-7tgh`) que foi **removido** em jul/2026.
- GitHub App do Claude precisa estar instalado com permissão de escrita (`Contents: Read and write`) no repositório — sem isso, push e criação de branch/PR falham com 403.

---

## 14. POSICIONAMENTO LEGAL

Sob o **Marco Civil da Internet** (Brasil), o Trindade Online é um **intermediário passivo** amplamente protegido de responsabilidade por conteúdo de terceiros, desde que:
- Não processe pagamentos entre partes
- Não intermedeie entregas
- Não garanta anúncios
- Responda a notificações formais de remoção de conteúdo
- Cumpra a LGPD

---

## 15. VARIÁVEIS DE AMBIENTE CRÍTICAS

Nomes das variáveis (valores ficam só na Vercel/Supabase, nunca no repositório):
```
SUPABASE_SERVICE_ROLE_KEY  → chave service role (no Vercel)
RESEND_API_KEY             → chave Resend
```
Project ref Supabase: `plfuznchzuzardkfjmqo`

---


---

## DETALHES E HISTÓRICO
Funcionalidades implementadas, planos e preços, fila de pendências (seções 6–9), lições aprendidas, módulos (mesas, quiz, cashback, entrega, apps), conteúdo/Instagram: **docs/KB_HISTORICO.md** (não carregado automaticamente — usar `grep` e ler só o trecho). Especificação do redesign: docs/ESPECIFICACAO.md (idem, sob demanda).
