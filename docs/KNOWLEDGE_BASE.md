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

## 6. FUNCIONALIDADES IMPLEMENTADAS (COMPLETO)

### Sistema de Trial e Planos
- Toda empresa nova ganha **7 dias de trial automático** (trigger no banco)
- WhatsApp e link externo visíveis durante trial e plano pago
- Lojista vê banner de aviso quando faltam 3 dias ou trial venceu
- **Bloqueio de renovação:** não permite nova compra se >60 dias restantes; aviso amarelo dentro de 60 dias
- Admin vê dashboard: Pago / Em Trial / Trial Vencido / Vence em 3 dias

### Avaliações
- Limite: 1 avaliação por empresa por semana (unique index no banco)
- Trigger bloqueia duplicata com mensagem em português
- Admin pode deletar qualquer avaliação (ícone 🗑 visível só para admin)
- Novas empresas começam com `avg_rating = 0` e `total_reviews = 0`

### Igrejas — Horários de Culto
- Quando `category_id = '00000000-0000-0000-0000-000000000008'`
- Formulário muda para grade 7 dias × Manhã/Noite
- Aplicado no cadastro e no painel do lojista

### Listings (Desapega/Empregos/Imóveis/Achados)
- Qualquer morador cadastrado pode postar
- Admin pode excluir via aba Denúncias
- Morador pode marcar Achados & Perdidos como "resolvido"
- Sistema de denúncias: morador denuncia → admin recebe notificação

### Painel Lojista
- Dashboard com métricas (views, cliques WhatsApp, avaliações)
- Abas: Perfil, Fotos, Avaliações, Destaques, Plano, Cupons, Promoções
- Card "🔔 Interesses recebidos"
- Link "← Ver site" e "Sair" no header
- Tela de boas-vindas quando empresa ainda não cadastrada

### Painel Admin
- DashboardTab com Chart.js (linha, donut, barra), filtros de período, alertas, métricas, top empresas, tabela de buscas
- Aba Empresas: listar, ativar/desativar, botões de email com cores por contagem de envios
- Aba Usuários: listar moradores
- Aba Buscas: termos mais buscados
- Aba Destaques: gerenciar por escopo (home/categoria/subcategoria)
- Aba Denúncias: excluir ou ignorar
- Aba Notificações: dispatch manual de push + toggles automáticos via feature_flags
- DisparosTab: campanhas WhatsApp em massa

### Notificações Push (OneSignal)
- Disparo manual pelo admin
- Automático em: criação de cupom, criação de promoção, aprovação de empresa (verifica feature_flags)
- Todas registradas na `notification_log`

### WhatsApp (Evolution API)
- Sequência de boas-vindas automática ao cadastro: 3 mensagens (imediata, +2min, +10min)
- Campanhas em massa via admin DisparosTab

### Email (Resend)
- Email de aprovação de empresa com layout HTML table-based
  - Cabeçalho preto, linha dourada, comparativo gratuito vs pago, 3 cards de planos
  - Botão muda cor no admin conforme envios: verde → amarelo → laranja → vermelho
- Tabela `email_logs` rastreia envios por empresa
- Login com `?redirect=` leva ao tab de planos após autenticação

### Cupons Relâmpago (`/cupons`)
- Empresa cria e gerencia via painel
- Validação e confirmação de resgate
- "Meus Cupons" no perfil do usuário
- Ranking mensal top 3 por categoria (baseado em resgates confirmados)

### Promoções da Semana (`/promocoes`)
- Interface Stories no mobile
- Grid 4 colunas no desktop
- Empresa cria via painel

### Banners da Home
- 2 banners acima das categorias via Supabase Storage
- Dimensões desktop: 1200×359px | mobile: 750×500px

### Feature Flags
- Tabela `feature_flags` no banco
- Toggle via UI do admin
- Controla notificações automáticas

### Mercado Pago Pix
- Rota: `/api/mp/create-charge`
- Webhook aceita `type === 'payment'` E `action === 'payment.updated'`
- Webhook usa `await` em todas operações assíncronas (crítico em Vercel serverless)

### Módulos independentes: Cardápio / CRM / Entrega (ago/2026)
- Cardápio+Pedidos+Cozinha (`loja_digital_enabled`), CRM WhatsApp (`crm_whatsapp_enabled`) e Entrega (`entrega_enabled`) são 3 flags **independentes** em `companies` — dá pra vender qualquer combinação, inclusive só Entrega sem os outros dois (empresa usa sistema de pedido próprio, só chama motoboy pela tela `/painel/crm/entrega` com "+ Nova entrega" avulsa)
- `trial_modules_until` (timestamptz): período de teste liberado pelo admin ativa os 3 módulos de uma vez, sem mexer nos flags reais — `moduleActive()` em `src/lib/modules.ts` calcula o efetivo (flag real OU dentro do teste); quando a data passa, volta a valer só o que a empresa tem contratado
- Admin → aba Empresas: botões ON/OFF por módulo + "Liberar teste" (N dias) por empresa
- **Preços pensados (ainda não cobrados automaticamente, só o painel de liberação manual existe)**: Cardápio R$49,90/mês · +CRM R$89,90/mês · +Entrega R$129,90/mês — a diária/crédito de entrega continuam sendo cobrados à parte, por fora dessas mensalidades, por ser consumo variável. Falta: checkout automático desses pacotes (hoje só o Plano Visibilidade tem Pix automático — ver seção 7)

### Trindade Entrega (v1 — ago/2026)
- Motoboy é da plataforma, não da loja. Modelo pré-pago: diária de R$30 pra liberar o dia + créditos de R$5/entrega (pacotes de 10/20/50), tudo via Pix real (Mercado Pago) em `/painel/crm/entrega`
- Tabelas: `motoboys`, `company_delivery_wallet`, `delivery_credit_ledger`, `delivery_payments`, `delivery_orders`, `delivery_offers`
- Loja chama o motoboy pelo botão "🏍️ Chamar motoboy" num pedido de entrega em `/painel/crm/pedidos` → `/api/entrega/criar`
- Motor de disparo (`src/lib/entregaDispatch.ts`): chama o motoboy ativo há mais tempo sem corrida, pelo WhatsApp da **instância da plataforma** (não a de cada empresa) — mensagem pede resposta SIM/NÃO em 45s; recusa ou timeout repassa pro próximo automaticamente
- Confirmação por código de 4 dígitos: cliente recebe o código (pela conversa do CRM da própria loja, se conectado, e visível em `/perfil` → Meus Pedidos), motoboy digita na chegada pelo mesmo WhatsApp — bate o código, libera o pagamento e desconta 1 crédito da carteira da loja
- Cadastro de motoboy (nome, telefone, chave Pix) numa aba nova do admin (`MotoboysTab.tsx`)
- Timeout de 45s é conferido tanto a cada mensagem recebida no webhook quanto por polling do painel da loja a cada 15s (`/api/entrega/tick`) — não depende de cron de minuto em minuto
- **Pendente**: pagamento em lote pro motoboy (hoje só marca "liberado", ainda não faz o Pix de saída pra ele); app do motoboy com localização/proximidade real (v1 é só WhatsApp, sem geo); reestruturação de planos puxada por essa feature (ver item 9 da fila pendente)

### Agenda de Produção — modelo de pastas (`/producao`, ago/2026)
- Área interna da equipe de mídia (Ricardo + Rafaella + freelancers), separada do site principal, mesma conta Supabase Auth. Substituiu a antiga `/agenda` (removida) que só listava tarefas atribuídas.
- Estrutura: **cliente** (`production_clients`) → **pasta** (`production_folders`: evento, semana, o que fizer sentido — quantidade de conteúdo é livre, não fixa) → **conteúdo** (`production_tasks` com `folder_id`; o `title` já existente vira o rótulo livre do conteúdo, ex: "Foto", "Vídeo de Cortes"). Ícone e cor de cada tipo de conteúdo são gerados por hash do rótulo, não vêm de tabela.
- Cada conteúdo tem: status (`video_status`: a_gravar/gravado/editado/postado, clicável pra avançar), responsável (`assigned_to` → `production_team`, clicável pra alternar entre a equipe ativa), link de referência e anotação (`reference_link`/`notes`, autosave com debounce), e fica com destaque vermelho quando a data de postagem passou sem ter sido postado.
- Pasta pode ser **arquivada** (`archived`) — abas "Ativas"/"Arquivadas" na lista; conteúdo de pasta arquivada some do calendário e das estatísticas.
- Calendário por cliente: grade mensal com navegação, cada dia mostra bolinhas por tipo de conteúdo (estilo Google Calendar), clique abre o painel do dia — mesmo layout no desktop e no mobile.
- Equipe: acesso por convite direto do admin (`✉️ Convidar alguém` → `/api/producao/convidar`, cria o login, já entra ativo, manda email + WhatsApp com link de criar senha) ou pedido de acesso espontâneo (fica "aguardando aprovação" até um admin aprovar). `joined_at` só é marcado no 1º acesso real à página — é isso que diferencia "convite enviado, aguardando 1º acesso" de "equipe ativa" na tela.
- Lembrete automático por WhatsApp 1 dia antes da data de postagem, pro responsável **e** pros admins: `/api/cron/lembretes-producao`, cron diário via `vercel.json` (13:20 UTC), protegido por `CRON_SECRET`; marca `reminder_sent_at` pra não duplicar envio.
- Escola Bem Viver (cliente já existente) foi migrada automaticamente: os 90 vídeos já agendados viraram 20 pastas semanais (segunda a sexta), 1 por semana; os 5 feriados do calendário antigo não migraram (não são conteúdo de verdade).

### Breadcrumb
- Topbar com grid 3 colunas em todas as páginas internas

---

## 7. PLANOS E PREÇOS (valores reais — gerenciar via admin → Planos)

### Plano Visibilidade
| Período | Duração | Valor |
|---------|---------|-------|
| Mensal | 30d | R$49,90 |
| Semestral | 180d | R$269,40 |
| Anual | 365d | R$478,80 |

### Banner
| Período | Duração | Valor |
|---------|---------|-------|
| 7d | 7d | R$49,90 |
| 15d | 15d | R$89,90 |
| 30d | 30d | R$149,90 |

### Destaques Home
| Período | Duração | Valor |
|---------|---------|-------|
| 7d | 7d | R$49,90 |
| 15d | 15d | R$89,90 |
| 30d | 30d | R$159,90 |

### Destaques Categoria
| Período | Duração | Valor |
|---------|---------|-------|
| 7d | 7d | R$29,90 |
| 15d | 15d | R$54,90 |
| 30d | 30d | R$99,90 |

### Destaques Subcategoria
| Período | Duração | Valor |
|---------|---------|-------|
| 7d | 7d | R$14,90 |
| 15d | 15d | R$27,90 |
| 30d | 30d | R$49,90 |

---

## 8. PRÓXIMOS PASSOS (em ordem)

1. **Header da home** — adicionar links ❤️ Favoritos e 👤 Perfil quando logado
2. **Página 404 customizada**
3. **Termos de uso e Política de Privacidade** (LGPD) — ✅ já implementado
4. **Pix via Asaas** — Ricardo precisa criar conta em asaas.com
5. **Limpar dados de teste** antes do lançamento:
```sql
DELETE FROM listings WHERE user_id IN (SELECT id FROM profiles WHERE user_type = 'admin');
DELETE FROM companies WHERE slug LIKE '%-teste';
```

---

## 9. FILA DE FEATURES PENDENTES

1. **Feed do Bairro** — timeline com posts de empresas (pago) e moradores (categorias específicas); likes e comentários
2. **Categorias do Desapega** — estilo Mercado Livre para filtrar anúncios
3. **Visual de subcategorias** — voltar para ícones emoji em quadrado com nome abaixo (em vez de pills)
4. **Tamanhos de fonte no Perfil** — aumentar ~30%, bold, mobile e desktop
5. **WhatsApp group auto-management** — empresas pagas → grupo VIP, grátis → grupo separado (precisa WhatsApp Business API)
6. **Sequência de emails automáticos** — via Vercel Cron Jobs:
   - Dia 2 após aprovação: "Seus clientes não conseguem te contatar"
   - Dia 7: "Veja o que você está perdendo"
   - Dia 15: Urgência + prova social
   - Só dispara se empresa ainda não tiver plano pago
7. **Painel financeiro/admin** — planos ativos, expirations, receita, renovações manuais/automáticas
8. **Header mobile do painel** — "Ver site" e "Sair" muito grandes; mover para barra superior
9. ~~Sistema de entrega (delivery)~~ — **v1 implementado em ago/2026**, ver seção 6 "Trindade Entrega". Ainda pendente: reestruturação de planos/preços puxada por isso (pacotes por combinação — só cardápio / cardápio + CRM / cardápio + CRM + entrega), além do plano Visibilidade atual (R$49,90/mês) — Ricardo ainda não detalhou como quer precificar isso.
10. **Disparos em massa dentro do CRM** (pedido em ago/2026, adiado a pedido do Ricardo — "não vou fazer isso agora, documenta") — hoje o sistema de disparo (`DisparosTab.tsx` + `/api/blast`) é **só do admin da plataforma**: dispara pelo número da própria Trindade Online, filtros fixos (todas empresas/pago/não pago/moradores/etc), tabelas `blast_campaigns`/`blast_logs`/`blast_blacklist` sem `company_id` (cruzam a base toda). Objetivo: dar a cada empresa um disparo em massa **para os próprios contatos do CRM dela**, usando a instância WhatsApp já conectada da empresa (`crm_whatsapp_instances`), com filtros comportamentais que hoje não existem em lugar nenhum: não respondeu (última msg foi da loja, sem resposta há X dias), não compra há X dias, nunca comprou, conversa parada há X dias. Plano combinado com o Ricardo:
    - **Não reaproveitar as tabelas do admin diretamente** — misturaria campanha de plataforma com campanha de empresa e furaria RLS (lojista veria/mexeria em campanha de outra loja). Precisa de tabelas novas com `company_id` obrigatório: `crm_campaigns` (id, company_id, name, message, filter_type, filter_days, status, delay_min, delay_max, total_contacts, sent_count, failed_count, scheduled_at, started_at, completed_at, created_at) + `crm_campaign_logs` (id, campaign_id, contact_id, phone, status, error_message, sent_at).
    - **Reaproveitar o MOTOR**, sim — copiar/adaptar a lógica de `src/app/api/blast/route.ts`: lote com atraso aleatório entre envios, continuação encadeada quando estoura o tempo da função serverless (HARD_LIMIT_MS), watchdog que reativa campanha travada.
    - Cuidado extra de rate-limit: como usa o número pessoal/comercial da própria empresa (não um número dedicado da plataforma), o risco de bloqueio pelo WhatsApp é maior — limite diário de envios mais conservador, pula contatos silenciados/arquivados.
    - Tela nova sugerida: `/painel/crm/campanhas` (ou aba dentro de Mensagens), com contador de quantos contatos batem no filtro antes de disparar, e histórico de campanhas anteriores.
    - Implica migração de schema — pedir confirmação antes de aplicar, conforme regra padrão.

---

### Redesenho do site (jul-ago/2026) — ver `docs/ESPECIFICACAO.md` e `docs/PLANO_IMPLEMENTACAO_REDESIGN.md`
Fases 0, 1, 2 e 3 completas e publicadas (header com busca+bairro, menu de 3 famílias, painel reorganizado, entidade Interesse, índice de produtos). Um ponto que precisa de ação manual do Ricardo quando chegar a hora:
- **Busca por produto está construída mas desligada de propósito** (ESPECIFICACAO.md §7.4 — vitrine com poucos catálogos "queima a ideia"). Pra ligar: `update feature_flags set enabled = true where key = 'busca_produtos_enabled';` — sem precisar de deploy, é só isso.

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

### Lições aprendidas (não repetir erros)
- **Webhook Vercel:** sempre `await` em operações assíncronas — funções serverless terminam antes de completar sem isso
- **Email HTML:** sempre table-based (não CSS grid/flex) para compatibilidade com clientes de email; mesclar tudo em um `<td>` para evitar colapso no Gmail
- **Python heredoc:** usar `repr()` para detectar whitespace exato antes de fazer match — diferenças invisíveis causam falhas silenciosas
- **Evolution API:** nome da instância deve ser exatamente `Trindade Online` (espaço + maiúsculas); IPs de container Docker podem mudar no restart — usar nome do container ou DNS interno
- **Supabase MCP** desde jul/2026 aponta pro projeto certo (`plfuznchzuzardkfjmqo`) — sempre confirmar via `list_projects` antes de rodar algo, já que trocar de conta/projeto no futuro é possível
- **Foto em baixa na importação de cardápio via CSV (Anota Aí):** a URL que vem na coluna `foto_url` do CSV (formato `client-assets.anota.ai/produtos/{id}/{numero}blob`) às vezes é uma miniatura pequena, mesmo a foto aparecendo boa no site público do Anotaí (o CSS deles estica/suaviza na tela). Nosso `/api/loja/importar-foto` não comprime nada, só re-hospeda o que a URL devolver — então a qualidade final depende 100% da URL de origem. Ambiente sandbox do Claude Code não tem acesso de rede a `anota.ai` (bloqueado pelo proxy), então não dá pra inspecionar a página por aqui. Prompt/roteiro pra achar a URL da foto grande, quando isso acontecer de novo:
  1. Abrir a loja em `pedido.anota.ai/loja/{slug-da-loja}` no Chrome.
  2. DevTools (F12) → aba Network → filtro Img.
  3. Clicar no produto pra abrir a foto ampliada/detalhe.
  4. Ver no Network qual URL foi carregada pra essa imagem grande — copiar.
  5. Comparar com a URL do CSV: se for diferente (outro domínio/caminho, ou tiver `?w=`/`/original/`), usar essa URL maior no CSV antes de importar. Se for a mesma URL, não tem versão maior — a foto pequena é a original enviada pelo lojista no Anotaí, e o fix é subir foto nova direto no nosso painel (`/painel/crm/catalogo`).
- **Foto sumindo no preview de link (WhatsApp) — não usar Satori/`sharp` pra decodificar foto do Storage:** o reparo automático de foto quebrada reconverte quase toda foto de empresa pra `.webp` (às vezes até com nome de arquivo `.jpg`/`.png` — confirma sempre pelo `metadata->>'mimetype'` em `storage.objects`, nunca pela extensão). O gerador de OG image por código (`opengraph-image.tsx`, biblioteca Satori do `next/og`) não decodifica webp — a imagem sai em branco, sem erro visível no preview. Tentativa de corrigir decodificando com `sharp` no próprio `opengraph-image.tsx` quebrou em produção (`FUNCTION_INVOCATION_FAILED`, ~10ms — crash na inicialização do módulo, o binário nativo do sharp não carrega nesse ambiente serverless da Vercel, nem com `serverExternalPackages: ['sharp']` no `next.config.ts`, que resolve o empacotamento mas não esse crash). **Solução que funcionou:** quando tem foto, nem gerar imagem por código — usar a URL da foto direto em `openGraph.images`/`twitter.images` no `generateMetadata` da página (mesmo padrão que já funcionava em `/anuncio/[id]`). WhatsApp/Facebook buscam e decodificam a imagem sozinhos, sem passar pelo Satori, e lidam bem com webp. `opengraph-image.tsx` (Satori) fica só pra quando não tem foto nenhuma — fundo com gradiente + nome, sem imagem externa envolvida.

---

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

## 12. CONTEXTO DO NEGÓCIO — CONTEÚDO / INSTAGRAM

### Os 7 Programas (P1–P7)

| Programa | Nome | Função | Cadência |
|----------|------|---------|---------|
| P1 | Memória e Identidade | Reter e emocionar | 3x/semana (Seg, Qui, Dom) |
| P2 | Negócio da Trindade | Alcance + atrair parceiros | 3x/semana (Ter, Qui, Sáb) |
| P3 | Trindade Empreende | Autoridade + servir | 1x/semana (lives) |
| P4 | Voz da Trindade | Engajamento máximo | 2x/semana (Ter, Sex) |
| P5 | Transformação Trindade | Impacto real + viral | 1x/mês |
| P6 | Trindade das Crianças | Engajamento familiar | 2x/semana (Sex) |
| P7 | Raízes da Trindade | Memória viva + homenagem | 1x/mês (live presencial) |

### Formatos Vlog (subformatos dentro dos programas)
- **"Me conta de quem?"** (dentro do P1) — Ricardo visita personagem e pergunta sobre outro; encadeamento
- **"Experiência Trindade Anônima"** (dentro do P2) — câmera escondida; só publica se positivo
- **"Trindade Raiz na Rua"** (dentro do P4) — visita aleatória a comércios; mede reconhecimento da marca

### Grade Semanal
| Dia | Vídeo 1 | Vídeo 2 |
|-----|---------|---------|
| Segunda | P1 — Memória/Nostalgia | P4 — Voz/Novidade |
| Terça | P4 — Pergunta | P2 — Negócio |
| Quarta | P2 — Experiência Trindade | P1 — Descoberta |
| Quinta | P1 — Nostalgia | P2 — Comércio |
| **Sexta ★** | P4 — Pergunta fim de semana | P6 — Crianças |
| Sábado | P2 — Visita/Experiência | P1 — Descoberta |
| Domingo | P1 — Memória coletiva | P7 — Bastidores |

### Dados de engajamento
- **Melhor horário:** publicar entre 12h–14h (pico de audiência às 15h)
- **Melhor dia:** Sexta (3.215 seguidores ativos às 15h)
- **Maior Reel:** Restaurante Mineroca — 44,6K views, restaurante lotado no dia
- **Case validador:** Protocolo Experiência Trindade (3 atos: Stories antecipação → Live no local → Reel 2 dias depois)

### Monetização de conteúdo
| Produto | Valor |
|---------|-------|
| Stories patrocinado | R$50 |
| Reel patrocinado | R$200 |
| Combo Stories+Reel | R$230 |
| Quadro Missão Trindade (premium) | R$3.000/mês · contrato 3 meses |
| Ecossistema (Fase 3) | R$300–800/mês por comércio |

### WhatsApp — Comunidade Clube Trindade Raiz
- ~70+ empresas cadastradas no grupo parceiro
- Calendário de conteúdo semanal: Segunda motivação → Terça prova social → Quarta educação → Quinta urgência → Sexta upgrade CTA → Sábado engajamento leve
- Objetivo primário: converter gratuito → plano pago

---

## 13. EXPANSÃO DE NEGÓCIO

### Serviço de Entrega B2B
- **Fase 1:** taxa diária pré-paga + cobrança por entrega para estabelecimentos comerciais
- **Fase 2:** integrar ao Trindade Online para delivery consumer-facing

### Rodada Seed
- R$20.000 · 5 investidores × R$4.000
- Retorno 20% a partir do mês 6 em 12 meses

### Curso "Trindade Online"
- 6 módulos ensinando outros a criar mídia hiperlocal de bairro
- "Construa uma renda de R$5 a 10 mil sendo o influenciador do seu bairro"
- Estrutura aprovada; detalhes dos módulos ainda não desenvolvidos

### Projeto Paralelo — Alppaes
- Empresa de reforma predial/fachadas em Niterói
- Entregues: portfólio PDF A4 paisagem (17 páginas), versão mobile 9:16, iterações de logo SVG
- Paleta: branco/preto/laranja #F47820 | Iniciais "AP" + "REFORMAS PREDIAIS"

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

## 16. CONTEÚDO — BANCO DE PAUTAS (para referência)

### Personagens — urgência alta (idosos, gravar logo)
- DJ Nininho — primeiro DJ infantil, fotógrafo, matinês, bailes de 15 anos
- Tia Euza — professora Externato Santo Antônio
- Tia Leda — barraca de cachorro quente na praça
- Dona Lia — costureira de vestidos de noiva, 60 anos na Trindade

### Personagens pedidos pela comunidade
Coronel Dalmo, Chicão do Dom Hélder, Sr. Jorge Farmacêutico, Mestre Boka (Capoeira), França (jogador do Botafogo), Professor Mário, Professora Maria Augusta, Professora Regina Lúcia, Irmã Jaziz

### Raízes da Trindade — episódios definidos
- Ep. 01 — DJ Nininho
- Ep. 02 — Tia Euza do Externato
- Ep. 03 — Tia Leda do Cachorro Quente
- Ep. 04+ — Indicados pela comunidade

---

*Base gerada em julho de 2026 — consolidando toda memória e arquivos do projeto*
*Revisada em jul/2026: credenciais (API key Evolution, IP da VPS) removidas do arquivo versionado; branch de produção corrigido para `main`.*
