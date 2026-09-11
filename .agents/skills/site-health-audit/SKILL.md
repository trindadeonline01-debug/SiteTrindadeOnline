---
name: site-health-audit
description: Audita a saúde e performance do repositório inteiro do Trindade Online (Next.js + Supabase + Vercel) — código morto/órfão, imagem sem otimização, ausência de cache, awaits sequenciais que travam a resposta, arquivo órfão no Storage, tabela de log crescendo sem limite, console.log esquecido, dependência não usada. Use sempre que o usuário pedir uma auditoria de performance, "ver se não tem nada quebrado/redundante/fora do lugar", "site lento", "limpeza de lixo eletrônico/cache", "saúde do site", ou pedir pra rodar a checagem periódica/noturna do site — mesmo sem citar essas palavras exatas. Só detecta e relata: NUNCA apaga arquivo, nunca roda DELETE, nunca dá push sozinho.
---

# Auditoria de saúde e performance — Trindade Online

Varredura do repositório inteiro (não é revisão de diff — pra isso existe `/code-review`). Roda tanto sob pedido quanto sozinha de madrugada via rotina agendada, sem ninguém supervisionando em tempo real. Por isso a regra abaixo não é negociável.

## Regra inegociável: só detectar e relatar

Esse skill nunca corrige nada sozinho, mesmo quando a correção parece óbvia e segura:
- Nunca apaga arquivo (nem código, nem foto no Storage).
- Nunca roda `DELETE`/`UPDATE` em tabela do Supabase.
- Nunca commita nem dá push de código.

Termina sempre entregando um relatório com os achados e esperando aprovação explícita antes de qualquer correção — mesma regra de "mudança destrutiva ou ambígua sempre pede confirmação" que já vale pro resto do projeto (`docs/KNOWLEDGE_BASE.md`). Se a auditoria rodou sozinha de madrugada, isso significa literalmente não fazer nada além de entregar o relatório — a correção fica pra quando o usuário disser "pode" numa sessão de verdade.

## O que checar

Vá em ordem. Para cada categoria, se não achar nada, diga isso em uma linha em vez de omitir a seção — "nada encontrado" também é sinal útil.

### 1. Código morto/órfão
- Para cada componente em `src/components/**/*.tsx`, `grep` o nome do arquivo (sem extensão) no resto de `src/` — se não aparecer importado em lugar nenhum além da própria definição, é candidato a órfão.
- Para cada rota em `src/app/api/**/route.ts`, extraia o caminho da URL e `grep` por esse caminho como string em todo `src/` (chamadas `fetch('/api/...')`) e em `vercel.json` (crons). Sem nenhuma referência, é candidato a rota morta.
- O projeto migrou `/painel/crm/*` para `/painel/*` em ago/2026 (ver `docs/ESPECIFICACAO.md` §5.3, §13 fase 0). Confira se sobrou algum diretório, link (`href="/painel/crm/...`) ou referência ao caminho antigo.
- Páginas ou componentes visivelmente duplicados (mesmo propósito, dois arquivos) também entram aqui.

### 2. Performance de imagem
- `grep -rn "<img" src --include="*.tsx"` — liste cada ocorrência com arquivo:linha. `next.config.ts` já tem `remotePatterns` configurado pro Storage do Supabase, então normalmente dá pra trocar por `next/image`; para cada achado, diga se parece uma exceção legítima (ex: ícone SVG pequeno, emoji-avatar) ou uma foto de conteúdo real que devia estar otimizada.
- Around isso, note qualquer `<img>` sem `loading="lazy"` que também não seja `next/image` (esse já tem lazy-load por padrão).

### 3. Cache e rendering
- `grep -rn "revalidate\|unstable_cache\|force-static\|export const dynamic" src/app` — hoje (set/2026) isso normalmente vem vazio, ou seja, toda página busca dado fresco do Supabase a cada request.
- Não sugira cache em nada que precisa estar sempre atualizado (pedidos, mensagens, status de loja aberta/fechada, carrinho). Foque em dado que muda raramente: `categories`/`subcategories` (praticamente fixas), `plans` (só muda quando o admin edita preço). Se achar página buscando essas tabelas sem nenhuma estratégia de cache, é achado real.

### 4. Awaits sequenciais que travam resposta
- Procure funções (rotas de API, principalmente) com 3+ chamadas `await supabase...` seguidas que não dependem do resultado uma da outra — candidatas a virar `Promise.all`. Esse padrão já apareceu nesse projeto antes (ver lições no `KNOWLEDGE_BASE.md` sobre webhook precisar de `await`) — aqui é o oposto: await em série sem necessidade, alongando o tempo de resposta.
- Não sinalize sequência de awaits que realmente dependem um do outro (ex: busca empresa → usa o `owner_id` pra buscar outra coisa) — isso está correto, não é achado.

### 5. Arquivo órfão no Supabase Storage
- Usa Supabase MCP (`mcp__Supabase__execute_sql`). **Sempre rode `mcp__Supabase__list_projects` primeiro e confirme o project_id antes de qualquer query** — não hardcode o ref sem checar, mesmo que pareça sempre o mesmo.
- Primeiro descubra os buckets existentes (`select id, name from storage.buckets`), depois cruze `storage.objects` (coluna `name` = path) com as tabelas que guardam foto por URL (`company_photos`, `loja_produtos.photo_url`, `listing_photos`, etc — confira o schema atual em vez de assumir a lista de `KNOWLEDGE_BASE.md` §5 estar completa). Um jeito prático: para uma amostra de paths em `storage.objects`, verifica se aquele path aparece em alguma URL salva numa tabela; se não aparecer em nenhuma, é candidato a órfão.
- Isso é só leitura (`select`) — nunca rode `storage.objects` delete nem remova arquivo do bucket.

### 6. Tabela de log crescendo sem limite
- Para `search_logs`, `page_views`, `notification_log`, `email_logs`, `blast_logs`, `whatsapp_clicks` (confira se o nome/tabela ainda existe — schema pode ter mudado): `select count(*), min(created_at), max(created_at)` de cada uma. Reporte contagem total e quantas linhas são mais velhas que 6 meses, por exemplo — não apague nada, é só pra decidir depois se vale criar uma rotina de retenção.

### 7. `console.log`/debug esquecido
- `grep -rn "console\.log\|console\.debug" src/app src/components src/lib --include="*.ts" --include="*.tsx"`. Ignore `console.error`/`console.warn` em `catch` (isso é tratamento de erro legítimo, não debug esquecido).

### 8. Dependência não usada
- Para cada pacote em `dependencies` do `package.json` (pule `devDependencies` — lint/build tooling não aparece em import), `grep -rn "from '<pacote>'" src` (e variações tipo `require(`). Sem nenhuma ocorrência, é candidato a dependência morta — mas confirme que não é usado indiretamente (ex: plugin de config, CLI usado só em script do `package.json`) antes de listar como achado.

## Formato do relatório

Curto e direto — quem lê (Ricardo) não gosta de texto enrolado. Markdown, nessa estrutura exata:

```markdown
# Auditoria de saúde — Trindade Online (<data>)

## 1. Código morto/órfão
- `caminho/arquivo.tsx` — <por que é candidato a órfão>
(ou: "Nada encontrado.")

## 2. Performance de imagem
...

## 3. Cache e rendering
...

## 4. Awaits sequenciais
...

## 5. Arquivo órfão no Storage
...

## 6. Logs sem limite
- `search_logs`: N linhas, mais antiga de <data>
...

## 7. console.log esquecido
...

## 8. Dependência não usada
...

## Sugestão de prioridade
No máximo 5 itens, os mais seguros e valiosos de atacar primeiro, em ordem. Cada um numa linha: o quê + por quê + risco de mexer (baixo/médio/alto).
```

Termine sempre perguntando se o usuário quer que algum item da lista de prioridade seja corrigido agora — nunca corrija de conta própria, nem os itens de risco baixo.
