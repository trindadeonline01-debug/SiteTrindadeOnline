# Trindade Motoboy

App nativo (Expo/React Native) pro motoboy da Trindade Entrega — mesma engine de despacho que já existe no site, só com cara de app e (quando a Rodada 2 estiver pronta) rastreio em segundo plano + push de verdade, que o navegador não entrega.

Contexto completo: `docs/KNOWLEDGE_BASE.md` (raiz do repo) → seção "Trindade Entrega". Mapa de telas original: artefato "App do Motoboy" (out/2026).

## Estado atual (Rodada 1 — funcional, sem Maps/push ainda)

Já funciona de ponta a ponta, consumindo a API de produção (`https://www.trindadeonline.com.br`):

- **Login** — código por WhatsApp ou senha (`src/screens/LoginScreen.tsx`)
- **Corridas ativas** — oferta com contador, aceitar/recusar, retirada em grupo, confirmar código de retirada/entrega (`src/screens/CorridasScreen.tsx`) — poll de 4s, mesma engine de `delivery_offers`/`delivery_orders`
- **Ganhos** — a receber, já recebido, histórico de corridas (`src/screens/GanhosScreen.tsx`)
- **Perfil** — editar Pix, sair (`src/screens/PerfilScreen.tsx`)
- Sessão persistida no aparelho (`src/auth.ts`, `AsyncStorage`) — mesmo token opaco do painel web, não é Supabase Auth

Typecheck limpo (`npx tsc --noEmit`) e bundle Metro testado (592 módulos, sem erro) nesta sessão. **Nunca rodou em aparelho/emulador de verdade** — este sandbox não tem Android SDK nem emulador; o primeiro teste real é via build EAS (abaixo).

## Rodada 2 — pendente, precisa de ação do Ricardo

Três coisas que só ele consegue prover (contas/credenciais de serviços externos):

1. **Token de acesso Expo** — [expo.dev](https://expo.dev) → criar conta → Account Settings → Access Tokens. Sem isso não dá pra rodar `eas build` daqui.
2. **`google-services.json`** — Firebase Console → criar projeto → Adicionar app Android, pacote `com.trindadeonline.motoboy` → baixar o arquivo e colar na raiz desta pasta (`app-motoboy/google-services.json`, já está no `.gitignore` por ser credencial).
3. **Chave do Google Maps pra Android** — só depois do primeiro build (o Android gera uma assinatura/SHA-1 nova que a chave precisa reconhecer). Console Cloud → mesmo projeto do Maps do site → nova chave restrita por app Android (pacote + SHA-1) → habilitar "Maps SDK for Android".

Com isso em mãos, falta: rastreio em 2º plano de verdade (`expo-location`, já instalado, falta a tarefa em background + tabela nova no Supabase pra gravar a posição), notificação push real (`expo-notifications`, já instalado, falta o `google-services.json` pra ativar), e o mapa embutido na corrida (porta da lógica que já existe em `src/app/motoboy/painel/page.tsx` pro nativo).

## Comandos

```bash
cd app-motoboy
npm install            # instalar dependências (expo install trava no proxy do sandbox — ver nota abaixo)
npx tsc --noEmit        # typecheck
npx expo export --platform android  # testa que o bundle Metro compila, sem precisar de device
```

**Nota de ambiente**: `npx expo install` falha neste sandbox (`HTTP Proxy Network Error: Forbidden`) porque ele tenta consultar `reactnative.directory` pra checar compatibilidade, domínio fora da allowlist do proxy. Usar `npm install <pacote>` direto funciona igual — só perde a checagem automática de versão compatível com a SDK do Expo (hoje SDK 57), então confirmar a versão manualmente quando isso importar.

## Build (quando tiver o token Expo)

```bash
npx eas-cli@latest login            # com o token do passo 1
npx eas-cli@latest build:configure  # cria o project ID na primeira vez
npx eas-cli@latest build --platform android --profile preview  # gera o APK, link de download ao final
```
