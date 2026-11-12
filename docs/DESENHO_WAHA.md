# DESENHO — Migração Evolution → WAHA (GOWS)

> Criado em 12/nov/2026. **Só desenho, nada de código do site foi alterado.** Ricardo decidiu migrar depois dos testes do dia (ver "Por que" abaixo).

## 1. Por que migrar

- A Evolution v2.3.7 (Baileys 7.0.0-rc.9) **não consegue decifrar** mensagens de contatos no formato `@lid` (`No matching sessions found for message`). Efeito medido no banco: a 1ª mensagem de contato novo chega 12 a 46 h atrasada, em quase todas as lojas, desde 08/11. Em 12/11 a "surdez" virou geral: nenhuma loja recebeu mensagem de cliente entre 23:53 de 11/11 e 12:42 de 12/11; reiniciar a Evolution devolveu só parte das lojas (a Calçada do Peixe seguiu surda).
- A 2.4.0-rc2 da Evolution usa **o mesmo Baileys 7.0.0-rc.9** (conferido no package.json do GitHub): atualizar não resolve.
- **WAHA com motor GOWS** (whatsmeow, em Go; imagem gratuita `devlikeapro/waha`, tier CORE, 2026.10.1) subiu na VPS em `/opt/waha` (container `waha`, porta só em 127.0.0.1:3000, limite 700 MB) com a sessão `teste` (número 21 98023-9006 do Ricardo). Resultados:
  - contato NOVO ("Meu Bagageiro", nunca tinha falado): chegou na hora (12:23);
  - contato antigo (Trindade Online): chegou na hora (12:44);
  - teste lado a lado, mesmo número ligado nos dois: WAHA recebeu na hora, a Evolution **não recebeu** a mensagem.

## 2. O que o site usa da Evolution hoje (inventário)

| Função | Rota/arquivo | Endpoint da Evolution |
|---|---|---|
| Enviar texto (loja e plataforma) | `src/lib/whatsapp.ts`, `crm/enviar`, `notificar-motoboy`, `pedido-editado`, `solicitar-cancelamento`, `ofertas.ts`, `whatsappFila.ts`, `notifyAdmin.ts`, `lembretes-producao`, `producao/convidar`, `trial-reminders/test`, `crm/webhook` (respostas da IA) | `POST /message/sendText/{instância}` |
| Enviar mídia/áudio/local./contato | `crm/enviar`, `blast/*` | `sendMedia`, `sendWhatsAppAudio`, `sendLocation`, `sendContact` |
| Reagir, apagar, editar, marcar como lida, foto de perfil | `crm/reagir`, `crm/apagar`, `crm/editar`, `crm/ler`, `crm/avatar` | `sendReaction`, `deleteMessageForEveryone`, `updateMessage`, `markMessageAsRead`, `fetchProfilePictureUrl` |
| Conectar loja (QR) | `crm/whatsapp/connect` | `POST /instance/create` + QR |
| Estado da conexão | `blast/test`, `blast/route`, `blast/status`, `whatsappFila.ts` | `connectionState`, `fetchInstances` |
| Receber | `crm/webhook` (lojas), `entrega/webhook` (motoboys, número da plataforma) | webhook `MESSAGES_UPSERT/UPDATE`, `PRESENCE`, `CONNECTION`, `CHATS_*` |
| Baixar mídia recebida | `crm/webhook` | `chat/getBase64FromMediaMessage` |
| Auto-registro do webhook | `whatsapp.ts` (`ensureEntregaWebhookRegistered`), `crm/webhook` (auto-upgrade) | `webhook/set` |

## 3. Princípio: camada única, uma loja por vez, com volta

```
site (rotas) ─► src/lib/wa/index.ts  (interface WaProvider)
                   ├─ evolution.ts   (o comportamento de hoje, movido pra cá)
                   └─ waha.ts        (novo)
```

- Interface mínima: `sendText`, `sendMedia(image|video|document|audio)`, `sendLocation`, `sendContact`, `sendReaction`, `deleteMessage`, `editMessage`, `markRead`, `profilePicture`, `connectionState`, `createSession`/`getQr`/`logout`, `setWebhook`.
- Qual provedor usar é **por instância**: coluna nova `crm_whatsapp_instances.provider` (`'evolution'` padrão | `'waha'`). Mudar de volta é trocar a coluna e reconectar o QR.
- A instância da plataforma (avisos, motoboys, número 21 98621-0551) segue por variável de ambiente própria (`WA_PLATFORM_PROVIDER`) e **migra por último**: o fluxo dos motoboys funciona e é crítico.
- WAHA usa uma chave global (`WAHA_API_KEY`) no servidor, não uma chave por instância.

## 4. Recebimento: traduzir na porta de entrada

O `crm/webhook` tem ~500 linhas de regra de negócio (IA, motoboy próprio, opt-out, follow-up, mídia, reação, status) escritas sobre o formato de mensagem da Evolution. Trocar tudo de uma vez é arriscado.

- Rota nova `POST /api/wa/webhook` recebe o evento do WAHA e **traduz para o formato que o código atual já entende** (`key.remoteJid`, `key.fromMe`, `message.conversation`, etc.), chamando a mesma lógica. A rota da Evolution continua igual.
- Passo seguinte (opcional, depois): extrair a lógica para uma função `processarMensagem(evento normalizado)` e remover o tradutor.
- Número de telefone: no GOWS o remetente pode vir como `@lid`. Resolver pelo endpoint do WAHA `GET /api/{sessão}/lids/{lid}` (as rotas `lids` existem na imagem instalada) e normalizar para `55DDDNNNNNNNN` como hoje.
- Mídia: o WAHA guarda o arquivo e dá uma URL; o tradutor baixa com a chave e entrega no formato que `crm/webhook` já usa (base64 buscado sob demanda).
- **Assinar o webhook** (HMAC do WAHA) e conferir no site, como pedem as regras de rota com service role.

## 4.1 Contrato do WAHA — CONFERIDO na documentação (arquivo enviado pelo Ricardo em 12/nov/2026)

Autenticação: header `X-Api-Key` (chave global, uma só para todas as sessões). `chatId` de envio é sempre `55DDDNNNNNNNN@c.us` (nunca `@s.whatsapp.net`; `@lid` também é aceito para enviar).

| Função (Evolution hoje) | WAHA |
|---|---|
| `sendText` | `POST /api/sendText` `{session, chatId, text}` (`linkPreview:false` opcional) |
| `sendMedia` imagem | `POST /api/sendImage` `{session, chatId, file:{mimetype,url\|data,filename}, caption}` — **WhatsApp prefere JPEG; sem flag de conversão** (converter antes) |
| vídeo / documento / voz | `POST /api/sendVideo`, `/api/sendFile` (aceita `caption` e `filename`), `/api/sendVoice` (tem `convert`) |
| `sendLocation` / `sendContact` | `POST /api/sendLocation`, `POST /api/sendContactVcard` |
| `sendReaction` | `PUT /api/reaction` `{session, messageId, reaction}` — **PUT**, e `reaction:""` remove |
| `updateMessage` (editar) | `PUT /api/{session}/chats/{chatId}/messages/{messageId}` `{text}` — `@` escapado como `%40` |
| `deleteMessageForEveryone` | `DELETE /api/{session}/chats/{chatId}/messages/{messageId}` |
| `markMessageAsRead` | `POST /api/sendSeen` (aceita vários `messageIds`) |
| `fetchProfilePictureUrl` | `GET /api/contacts/profile-picture?contactId=&session=` |
| `connectionState` | `GET /api/sessions/{nome}` → `status`: `WORKING`, `SCAN_QR_CODE`, `FAILED`, `STOPPED`, `STARTING` |
| criar instância + QR | `POST /api/sessions` `{name, config}`; `GET /api/{session}/auth/qr` (imagem; com `Accept: application/json` vem base64); código de pareamento `POST /api/{session}/auth/request-code` |
| parar / reiniciar / desvincular | `POST /api/sessions/{nome}/stop`, `/restart`, `POST /api/sessions/{nome}/logout` |
| `webhook/set` | vai dentro do `config.webhooks` da sessão (ou global por variável `WHATSAPP_HOOK_*`) |
| mapa `@lid` ↔ telefone | `GET /api/{session}/lids/{lid}` e `/lids/pn/{telefone}` (a 2026.10.1, que roda aqui, corrigiu o `@lid` devolvendo o número da própria conta) |

**Webhook de mensagem recebida** (`event: "message"`): `{event, session, payload:{id, timestamp (segundos), from, fromMe, to, body, hasMedia, media:{url,mimetype,filename,error}, ack, replyTo, vCards, _data}}`. Eventos úteis: `message` (recebida), `message.any` (inclui as enviadas por outros aparelhos), `message.ack` (entregue/lido), `message.reaction`, `message.edited`, `message.revoked`, `session.status`.

Diferenças que o tradutor precisa tratar:
- **ID da mensagem é composto**: `true_55...@c.us_AAAA` (`fromMe_chat_id_idCurto`). A Evolution usa só o id curto em `key.id` e é isso que `crm_messages.wa_message_id` guarda. Para editar/apagar/reagir pelo WAHA é preciso o id composto: guardar o composto nas instâncias WAHA (e converter ao comparar duplicata).
- **`from` pode ser `@lid`**: resolver pelo endpoint de lids antes de gravar `crm_contacts.phone` (formato `55DDD...`).
- **Mídia**: `media.url` aponta para o próprio WAHA (`/api/files/...`) e **exige `X-Api-Key` para baixar**; o tradutor baixa e entrega no formato que o webhook atual já espera. `media.url` pode vir `null` quando o WAHA não baixou (só mimetype).
- **Segurança**: o WAHA assina o corpo com HMAC SHA-512 (`X-Webhook-Hmac`, chave em `config.webhooks[].hmac.key`) e manda `X-Webhook-Request-Id` (usar para ignorar repetição). O `/api/wa/webhook` precisa conferir o HMAC.
- **Menos tráfego**: `config.ignore = {status:true, groups:true, channels:true}` (o CRM é 1:1; hoje a Evolution manda até evento de grupo e status). `config.webhooks[].retries` configurável (policy `exponential`).
- **Webhook entrega só o que for pedido em `events`** (a Evolution mandava `chats.update`, `presence` etc. que o site mal usa).

## 4.2 Limites do WhatsApp que o WAHA mostra (e a Evolution escondia)

- `GET /api/sessions/{s}/timelock` e `GET /api/sessions/{s}/capping`: o WhatsApp restringe contas que escrevem para **muitos contatos novos** (erro 463 = timelock; 475 = cota por ciclo). A sessão continua `WORKING`; **não reiniciar nem desvincular** (não adianta), só pausar contato novo até o fim (`timeEnforcementEnds`/`cycleEnd`). Mensagem para chat que já existe continua funcionando.
- Para o site: a fila de ofertas (`ofertas-fila`) e qualquer envio em lote devem **consultar essa cota antes de mandar** e pausar sozinhos; isso é o jeito certo de evitar banimento. A sessão `teste` mostrou `cappingStatus: NONE`, `totalQuota: -1` (sem limite).
- Sincronização de histórico: na conexão o GOWS baixa o histórico inteiro (vimos milhares de "message secret keys" e um aviso `listener is too slow`). Variáveis para limitar, **definir antes de vincular a loja** (exige desvincular/vincular de novo para valer): `WAHA_GOWS_DEVICE_REQUIRE_FULL_SYNC=false`, `WAHA_GOWS_DEVICE_HISTORY_SYNC_RECENT_SYNC_DAYS_LIMIT=30`, `WAHA_GOWS_DEVICE_HISTORY_SYNC_FULL_SYNC_DAYS_LIMIT=365`, `WAHA_GOWS_DEVICE_HISTORY_SYNC_INITIAL_SYNC_MAX_MESSAGES_PER_CHAT=100`. O CRM guarda o próprio histórico, não precisa do da Evolution/WAHA.

## 5. Infra necessária (precisa do Ricardo)

- O site (Vercel) precisa chamar o WAHA: hoje ele só escuta em `127.0.0.1:3000`. Opções: subdomínio `waha.trindadeonline.com.br` no nginx com SSL (mesmo padrão de `evo.` e `api.`), protegido por chave. **Decisão: criar o registro DNS e o bloco nginx.**
- Memória: a VPS tem 2 GB com Evolution + Postgres + Redis + WAHA. Medir o consumo do WAHA com várias sessões (GOWS é leve, mas o limite de 700 MB provavelmente precisa subir). Ao terminar a migração a Evolution (e o Redis/Postgres dela) saem.
- Reinício automático a cada 4 h da Evolution **não se aplica** ao WAHA; não copiar esse cron sem necessidade.

## 6. Etapas

1. **Camada sem mudar comportamento**: criar `src/lib/wa` com o provedor Evolution (código movido, mesmas chamadas) e trocar os 22 arquivos para usá-la. Coluna `provider` com padrão `evolution`. Deploy; conferir que tudo segue igual.
2. **Provedor WAHA + webhook tradutor** (`/api/wa/webhook`), atrás do `provider = 'waha'`. Testar com a sessão `teste` apontada para uma "empresa de teste".
3. **Piloto**: 1 loja pequena (a loja reconecta o QR no WAHA; histórico do CRM é mantido). Acompanhar 2–3 dias: entrada na hora, contato novo, IA, envio de mídia, pedido/status.
4. **Plataforma/motoboys**: migrar o número 21 98621-0551 (avisos, oferta de corrida, código de entrega) com janela combinada.
5. **Demais lojas**, uma ou duas por dia. Cada uma exige o dono ler o QR de novo.
6. **Desligar a Evolution** quando nenhuma instância usar mais.

## 7. Riscos e pontos em aberto

- Contrato da API do WAHA **conferido** na documentação (seção 4.1). Falta só validar o formato exato do payload do GOWS com uma mensagem real (o campo `_data` e o `from` em `@lid`): configurar um webhook de teste em `https://webhook.site` na sessão `teste` e receber 3 mensagens (texto, foto, áudio) antes de fechar o tradutor.
- Dono de cada loja precisa **ler o QR de novo** (inevitável, mesma coisa que o conserto atual da Calçada do Peixe).
- Risco de bloqueio do número é o mesmo das duas ferramentas (não oficiais). Continuam valendo a fila lenta `enfileirarWhatsApp()` e os limites de ofertas.
- Presença ("digitando…"), "lido no celular" e algumas confirmações de status podem ter formato diferente; começar sem elas e acrescentar depois se a loja sentir falta.
- Plano B definitivo, se o WAHA também falhar em escala: API oficial da Meta (muda o produto).

## 8. Decisões pendentes do Ricardo

1. Criar `waha.trindadeonline.com.br` (DNS + nginx + SSL)?
2. Qual loja será o piloto (sugestão: uma pequena, com dono receptivo)?
3. Aceita que cada dono leia o QR de novo na migração?
4. Quando migrar o número da plataforma (motoboys)?
