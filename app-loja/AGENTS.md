This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Este projeto específico — Trindade Loja

App nativo pro lojista do Trindade Online — resolve o problema real de som/impressão automática não funcionando quando o painel web roda numa aba/tablet em segundo plano (ver `docs/KNOWLEDGE_BASE.md` na raiz do repo e `README.md` aqui nesta pasta pro estado atual/pendências). Backend é 100% o mesmo do site — este app fala direto com o Supabase (mesma RLS do painel web, `@supabase/supabase-js`), nunca duplica regra de negócio numa rota de API própria.

**Diferente do app-motoboy** (token opaco, API HTTP própria): o lojista tem Supabase Auth de verdade, então este app usa Realtime de verdade (não poll) e RLS normal.

**Escopo deliberadamente enxuto** (pedido do Ricardo, out/2026): só Pedidos (aceitar/avançar/reimprimir) e Cardápio (pausar/despausar produto) + uma tela de Configuração mínima (impressora, sair). Sem CRM, Relatórios, Atendimento, Destaques — essas telas continuam só no site, de propósito, porque não precisam da confiabilidade de app nativo.

**Desvio deliberado do padrão Expo Router abaixo** (mesma decisão do app-motoboy, mesmo motivo): v1 usa troca de tela por estado local (`App.tsx` → Login/Home; `HomeScreen.tsx` → abas Pedidos/Cardápio/Config). 4 telas sem necessidade de deep link.

**Login precisa de CAPTCHA** — desde a auditoria de segurança de out/2026, `signInWithPassword` em QUALQUER lugar (site ou app) exige um token do Cloudflare Turnstile, que não tem SDK nativo pra React Native. `LoginScreen.tsx` abre uma WebView carregando `https://www.trindadeonline.com.br/mobile-captcha` (ver esse arquivo no site) só pra resolver o desafio e devolver o token por `postMessage` — não inventar um jeito de pular isso, o login quebra sem o token.

**Impressão Bluetooth é um módulo nativo LOCAL** (`modules/thermal-printer-loja/`), não um pacote do npm — ver README.md, seção "Impressão térmica", antes de mexer nisso.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

```bash
npm install                          # expo install trava no proxy do sandbox — ver nota no README
npx tsc --noEmit                     # typecheck
npx expo export --platform android   # testa que o bundle Metro compila, sem precisar de device
```

Run typecheck before declaring any task done.

## Rules

- Módulo nativo próprio em `modules/thermal-printer-loja/` tem código Kotlin — **precisa de `eas build` (dev ou preview) pra testar de verdade**, nunca funciona no Expo Go (módulo nativo custom não existe lá).
- Se `ios/` e `android/` não existirem, são gerados (Continuous Native Generation) — nunca criar/editar à mão, configurar em `app.json`/módulo nativo.
- Prefira os módulos Expo recomendados a libs de terceiros, mas quando a lib de terceiro em questão é uma dependência NATIVA Android madura (ex: `com.dantsu.escposprinter`), embrulhar ela num módulo local pequeno (como já foi feito aqui) é melhor que confiar num pacote npm fino e imaturo em cima dela.
