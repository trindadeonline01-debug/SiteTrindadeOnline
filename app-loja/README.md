# Trindade Loja

App nativo (Expo/React Native) pro lojista — resolve o problema real que motivou esse app: numa aba de navegador (ou PWA) em segundo plano/tela apagando, o Android suspende o JS, então a musiquinha de pedido novo não toca e a impressão automática não dispara, obrigando a ficar clicando "Imprimir" na mão. Mesmo limite técnico que já tinha motivado o `app-motoboy/` nativo em vez de ajeitar no navegador.

Contexto completo da decisão: `docs/KNOWLEDGE_BASE.md` (raiz do repo).

## Estado atual (Rodada 1 — escrito e com typecheck limpo, **nunca rodou num device real**)

Escopo enxuto, decidido com o Ricardo: só Pedidos + Cardápio + Configuração.

- **Login** (`src/screens/LoginScreen.tsx`) — mesmo e-mail/senha do painel web, via Supabase Auth de verdade (não token próprio, diferente do app-motoboy). Precisa de CAPTCHA (ver seção própria abaixo) — já implementado.
- **Pedidos** (`src/screens/PedidosScreen.tsx`) — fila de pedidos em aberto (recebido/em preparo/pronto/saiu para entrega), botão "Aceitar e avançar"/"Avançar" por pedido, reimprimir manual. Realtime de verdade (Supabase, não poll) pra pedido novo — `src/api/pedidos.ts`.
- **Cardápio** (`src/screens/CardapioScreen.tsx`) — lista de produtos com busca e toggle Disponível/Pausado (`esgotado`), mesma ação que `/painel/catalogo` já faz no site. Não edita preço/foto/cadastra produto — fora do escopo de propósito.
- **Som + auto-impressão em pedido novo** — `HomeScreen.tsx` (sempre montado, independente da aba, mesma lição aprendida com o bug real do app-motoboy documentada no KNOWLEDGE_BASE) dispara som (`expo-audio`) e chama `autoImprimirPedido()` assim que o Realtime avisa um INSERT.
- **Tela sempre acesa** (`expo-keep-awake`) — tablet de balcão fica o dia inteiro ligado; isso é o que mantém o app em primeiro plano de verdade (a causa raiz do problema original é justamente app/aba em 2º plano).
- **Configuração** (`src/screens/ConfigScreen.tsx`) — escolher impressora Bluetooth pareada, calibrar largura (58mm/32 colunas ou 80mm/42 colunas), botão de impressão de teste, sair da conta.

Typecheck limpo (`npx tsc --noEmit`, dentro desta pasta) nesta sessão. **Nunca rodou em aparelho/emulador real** — este sandbox não tem Android SDK nem emulador, e os dois pontos mais sensíveis (impressão Bluetooth, WebView do captcha) só se provam de verdade num device físico.

## Impressão térmica — decisão tomada e por quê

Pedido explícito do Ricardo: impressão Bluetooth **nativa**, sem depender de instalar/configurar o RawBT (app de terceiro que o site usa como atalho hoje) em cada tablet.

Pesquisei antes de implementar: o único pacote Expo pronto pra isso (`expo-thermal-printer`, npm) está na versão `0.1.1` — abri o código fonte dele e só expõe `print(text)` fixo em "primeira impressora pareada", 48mm/203dpi/32 colunas **hardcoded** (sem deixar escolher impressora nem largura), e usa a sintaxe de formatação própria da lib por baixo (`com.dantsu.escposprinter`, não ESC/POS cru). Não dava pra confiar nisso como está pra um negócio de verdade.

**Decisão**: escrever um módulo nativo Expo LOCAL (`modules/thermal-printer-loja/`), em cima da MESMA lib Android que o pacote usa por baixo (`com.github.DantSu:ESCPOS-ThermalPrinter-Android:3.4.0` — madura, usada em produção por vários apps de PDV, não é a parte arriscada), mas expondo o que faltava:

- `listPairedPrinters()` — lista de verdade (`BluetoothPrintersConnections.getList()`), não só a primeira.
- `printFormatted(texto, endereço, dpi, larguraMm, colunas)` — largura/dpi configuráveis pela tela de Configuração, não fixo.

O conteúdo do recibo (`src/print/receipt.ts`) usa a sintaxe de marcação própria do DantSu (`[C]`/`[L]`/`[R]`, `<b>`, `<font size='wide'>`) em vez do ESC/POS cru que o site manda pro QZ Tray/RawBT (`src/lib/qzPrint.ts`) — é a sintaxe que `printFormattedText` entende, e ela já calcula coluna/alinhamento sozinha a partir da largura configurada, mais robusto que recalcular isso na mão feito o site faz.

**Isso precisa de validação real antes de confiar**: o módulo compila (typecheck limpo), mas eu nunca testei contra uma impressora Bluetooth física — nem a sintaxe de marcação, nem a leitura de dispositivos pareados, nem o fluxo de permissão do Android 12+. Primeiro teste de verdade só acontece com um build instalado num tablet com a impressora pareada.

## Login/CAPTCHA — ponte por WebView

Desde a auditoria de segurança de out/2026, **todo** `signInWithPassword` (QUALQUER origem — navegador ou app) exige um token do Cloudflare Turnstile, validado pelo próprio Supabase. Turnstile não tem SDK nativo pra React Native — só funciona num navegador de verdade.

Solução: `src/components/CaptchaWebView.tsx` abre uma WebView carregando `https://www.trindadeonline.com.br/mobile-captcha` — uma página nova e pequena no site (`src/app/mobile-captcha/page.tsx`) que só renderiza o mesmo widget `CaptchaTurnstile.tsx` que o site já usa, e manda o token de volta pro app via `postMessage`. Fica visível (não escondida) porque às vezes o Turnstile pede confirmação visual.

**Também sem teste real ainda** — o fluxo foi escrito seguindo a documentação do `react-native-webview`, mas nunca confirmei numa WebView de verdade se o `postMessage` chega, nem se o domínio `trindadeonline.com.br` (allowlisted no Turnstile pro site) aceita a origem de uma WebView do app sem ajuste nenhum na configuração do Cloudflare.

## Push nativo (FCM) — tocar com a tela apagada (Rodada 2, out/2026)

A Rodada 1 só resolve o problema em primeiro plano (`expo-keep-awake` mantém a tela acesa). Pra tocar/imprimir com a tela apagada/bloqueada de verdade, o app precisa ser acordado por uma notificação push nativa — Realtime do Supabase sozinho não acorda app em 2º plano/fechado no Android.

**Decisão explícita: infraestrutura 100% própria, sem misturar com o app-motoboy.** O motoboy usa OneSignal (projeto, app ID e tabelas dele); o app-loja usa **Firebase Cloud Messaging direto** (`google-services.json` próprio, pacote `com.trindadeonline.loja`, tabela `loja_push_tokens` própria) — projeto, credenciais e código completamente separados.

Implementado nesta rodada (`src/push/registerPush.ts`):
- Canal de notificação Android (`pedidos-loja`) em importância MÁXIMA, com o mesmo som de pedido novo (`assets/sounds/novo_pedido.wav`, bundlado via plugin `expo-notifications` no `app.json`) — é essa combinação (canal de alta prioridade + som customizado) que faz o Android tocar mesmo com a tela apagada, diferente de uma notificação silenciosa comum.
- Pedido de permissão (obrigatório a partir do Android 13) e captura do **token FCM nativo** (`Notifications.getDevicePushTokenAsync()` — não é o Expo Push Token, o envio do lado do servidor vai usar o Firebase Admin SDK direto, sem depender do serviço de push da Expo).
- Registro desse token em `HomeScreen.tsx` assim que a empresa carrega.

**Ainda falta, nessa ordem:**
1. Firebase project + `google-services.json` (ver "Pendente" abaixo) — sem isso o build nem compila com o plugin de notificações configurado de verdade.
2. Migração no Supabase criando a tabela `loja_push_tokens` (RLS por dono da empresa, mesmo padrão de `company_id` do resto do app) — rascunho pronto, só falta confirmação pra aplicar.
3. Lado servidor (site Next.js): rota que, quando um `loja_pedidos` novo chega com `status='recebido'`, manda a notificação via Firebase Admin SDK pros tokens daquela empresa — ainda não escrita, só o cliente está pronto.
4. Teste real num device — canal/som com tela apagada é exatamente o tipo de coisa que só se prova num aparelho físico, nunca no sandbox.

## Placeholders que precisam ser trocados

- **Ícone do app** (`assets/icon.png`, `assets/android-icon-*.png`, `assets/favicon.png`) — gerado por código (fundo escuro + "TL"), não é a marca de verdade. Trocar quando tiver a arte real.
- **Som de pedido novo** (`assets/sounds/novo_pedido.wav`) — gerado por código (2 bips), mesmo padrão que o app-motoboy já fez com o som dele. Trocar quando o Ricardo mandar o arquivo real.

## Pendente — precisa de ação do Ricardo antes de buildar

1. **Projeto Firebase próprio pro app-loja** (`com.trindadeonline.loja`) — criar em console.firebase.google.com (pode ser um projeto Firebase novo, OU reaproveitar o MESMO projeto Firebase já criado pro app-motoboy se ele existir, desde que seja um "app Android" NOVO e separado dentro desse projeto — projeto Firebase pode ter vários apps, o que importa é não misturar o pacote/`google-services.json`). Adicionar app Android → pacote `com.trindadeonline.loja` → baixar `google-services.json` → mandar esse arquivo pra entrar em `app-loja/google-services.json` (gitignored, nunca commitado) e em `android.googleServicesFile` do `app.json`.
2. **Conta/token de acesso Expo** — se já existe uma do `app-motoboy`, a MESMA conta serve (mesma organização Expo); só precisa rodar `eas build:configure` dentro desta pasta pra gerar um `projectId` novo (não dá pra copiar o do motoboy — é 1:1 por app). `app.json` já está com `extra.eas.projectId` vazio, esperando isso.
3. **Build de teste** (`eas build --profile preview --platform android`) gera um APK instalável direto (sem Play Store) — mesmo profile que o app-motoboy já usa.
4. **No tablet do Durval**: parear a impressora Bluetooth pelas configurações do Android ANTES de abrir o app (o app só lista impressoras já pareadas, não pareia sozinho ainda — isso também pode ser um follow-up se o fluxo manual for ruim na prática).
5. Depois de instalado: testar login (confirma o CAPTCHA), testar pedido novo chegando com o app aberto em Pedidos E em Cardápio (confirma que o som/impressão disparam dos dois jeitos), testar impressão de teste na tela de Configuração, ajustar a largura (58mm/80mm) se o recibo sair cortado ou com espaço sobrando, e — já na Rodada 2 — testar notificação chegando com a tela apagada/app fechado de verdade.

## Comandos

```bash
cd app-loja
npm install            # expo install trava no proxy do sandbox — usar npm install <pacote> direto quando precisar adicionar algo
npx tsc --noEmit        # typecheck
```

**Nota de ambiente**: igual o app-motoboy, `npx expo install` falha neste sandbox (proxy bloqueia `reactnative.directory`) — `npm install <pacote>` funciona, só sem a checagem automática de compatibilidade com o SDK (hoje 57).
