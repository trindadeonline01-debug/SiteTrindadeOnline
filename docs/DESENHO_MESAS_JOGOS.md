# Desenho — Mesas, Comandas e Pesca Premiada (jogos + cashback)
> Documento de desenho (2/nov/2026). **Nada foi codado.** Registra tudo que foi decidido com o Ricardo na conversa de 2/nov. Documentos-fonte (enviados por ele) ficam em `docs/pesca-premiada/`: `plano_experiencia_e_gamificacao.md`, `quiz_calcada_do_peixe_esqueleto_30_perguntas.md`, `quiz_calcada_do_peixe_30_perguntas.json`, `aventura_do_peixinho_especificacao.md`.

---

## 1. Objetivo

Ter, dentro do Trindade Online, **três formas de vender** sobre o mesmo núcleo:

1. **Delivery** — cardápio público + entrega (já existe).
2. **Balcão** — PDV, venda direta sem mesa (já existe, `/painel/pdv`).
3. **Mesas** — formato restaurante: várias mesas, cada uma com a sua comanda; mesa fechada = comanda paga = mesa liberada para o próximo cliente (**novo**).

Por cima disso, a **Pesca Premiada**: o cliente lê o QR da mesa e, além de pedir, joga (Quiz e Aventura do Peixinho). O Quiz gera **cashback para a próxima compra**, ligado ao perfil do cliente (telefone). Piloto: **Calçada do Peixe**; módulo replicável (multinegócio).

Hoje **não existe** nada de mesa/comanda no código ou no banco (conferido em 2/nov). O mais próximo é o PDV (`loja_pedidos` com `origin: 'balcao'`).

## 2. Decisões já fechadas (Ricardo, 2/nov/2026)

**Operação**
- **Acaba o papel.** O garçom lança no **tablet ou celular da loja** (aparelho da loja, não pessoal).
- O **cliente pode pedir sozinho pelo QR da mesa, só prato pronto**. **Peixe/item por peso: só o garçom lança** (precisa pesar e ver o valor). No QR, item por peso mostra apenas **"Chamar garçom"**.
- Chegou pedido ou chamado → **toca som + aviso na tela** no aparelho do garçom. Fase 1: navegador (tablet com a tela ligada). Depois: "modo garçom" dentro do app Trindade Loja (que já tem alarme com tela apagada) — **não** criar app novo do zero.
- **Taxa de serviço 10%**: ligada por padrão, **removível** no fechamento (botão).
- **Pagamento misto** (parte dinheiro, parte cartão…) e **divisão de conta**: entram já. Divisão **por partes iguais (÷ N)** ou **por valor livre**; **cada parcela tem a sua forma de pagamento**. Divisão por item fica para depois.
- **Pagamento sempre manual** por enquanto (dinheiro, cartão na maquininha, Pix registrado à mão). **Pix pelo celular: em stand-by.**
- **Uma impressora para tudo** (sem setores).
- **Transferir mesa e juntar mesas: entram já.**
- **20 mesas** no início; botão **"acrescentar N mesas"** numera sozinho (21–25, 26–35…). Precisa suportar 40–50+ mesas por loja.
- **Garçom se identifica ao abrir/confirmar a mesa** (escolhe o nome numa lista, sem senha). **O nome trava**; só a gestão (PIN) muda.
- **Cancelar item já enviado e dar desconto: só com PIN da supervisão.** Qualquer outro lança.
- Telefone do cliente: **pedido já no pedido** ("em qual WhatsApp eu coloco o pedido?") — **opcional** (pode pular), mas sempre perguntado. Vale para o garçom (ao abrir a mesa) e para o pedido pelo QR.
- Pedido de mesa **nunca** dispara WhatsApp de status, **nunca** gera cashback por pedido e **nunca** é marcado como pago pela cozinha.

**Jogos / prêmios**
- **Um QR só por mesa** → "página da mesa" com portas: **Pedir · Jogar · Minha carteira**. Material de divulgação (flyer, porta) usa o mesmo endereço com marca de origem (QR por origem — pilar Atração).
- **Só o Quiz (adulto) gera cashback.** **Aventura do Peixinho: sem cashback** — diversão, medalha, recorde; os rankings dela ficam desligados no MVP (pontuação feita no celular é mais fácil de falsificar).
- **Valor do prêmio configurável nos dois jeitos** (decide-se no dia da campanha): **(A) valor fixo por faixa** (ex.: R$ 5 / 10 / 20) ou **(B) percentual da conta com teto em R$**.
- **Prêmio do jogo só é liberado depois da conta paga** — **confirmado pelo Ricardo em 2/nov/2026**. Sem compra, sem prêmio.
- Rankings: **ao vivo entre mesas**, **quem está online agora** (apelidos, só quem aceitou), **semanal** e **geral/histórico** (precisa de perfil + apelido consentido). Quiz e Peixinho **separados**; modos Passeio/Aventura **separados**.

## 3. Modelo de dados (conceitual — sem SQL ainda)

- `loja_mesas` — `company_id`, `numero`, `ativa`, `qr_token` (código aleatório, não adivinhável).
- `loja_comandas` — a **conta da mesa**: `mesa_id`, `status` (aberta/fechada/cancelada), `aberta_em`, `fechada_em`, `garcom_nome` (trava), `customer_phone` (opcional), `taxa_servico_pct`, `desconto`, `total`, `sessao_secret`. **Uma só comanda aberta por mesa** (garantida pelo banco).
- `loja_pedidos` ganha `comanda_id` e `origin = 'mesa'` — **cada rodada de itens é um pedido** (a cozinha e a impressão reaproveitam o que existe).
- `loja_comanda_pagamentos` — pagamento misto/dividido: `forma`, `valor`, `customer_phone` opcional por parcela; forma `cashback` para resgate presencial.
- Jogos: `jogo_sessoes` (jogo, modo, comanda/mesa, aparelho, telefone opcional, apelido), `jogo_rodadas` (pontos, acertos, motivo do fim, duração, versão), `jogo_premios` (carteira de prêmios: emissor, tipo, valor, validade, status, comanda de origem). Rankings = consultas/visões sobre `jogo_rodadas`.
- Cashback: reaproveita `company_cashback_wallet`/`cashback_ledger` (chave = empresa + telefone), com **tipo do lançamento** distinguindo "compra" de "jogo".

## 4. Identidade em três camadas

| Camada | O que é | Quando existe |
|---|---|---|
| Mesa / comanda | A conta anônima daquela vez | Quando a mesa abre |
| Jogador anônimo | Joga sem cadastro (chave no aparelho) | No primeiro toque |
| Perfil | **Telefone/WhatsApp confirmado por código** (reaproveita `whatsapp_verifications`) | Quando quer salvar prêmio ou informa no pedido |

Ninguém é obrigado a se cadastrar para jogar ou pedir. O telefone liga **comanda + jogo + cashback** ao mesmo perfil.

## 5. Segurança do QR e da sessão

- O QR identifica **só a mesa**, com código aleatório. Não dá acesso à conta de ninguém.
- **Toda ação do cliente é validada no servidor**: o celular só diz "quero X na mesa 12"; o sistema confere se a mesa está aberta, se o prato existe/está ativo/não é de pesar e usa **o preço dele**, nunca o enviado.
- **Limite de pedidos por minuto por mesa** (ex.: 3) contra brincadeira/robô.
- **Cada comanda tem sessão própria**: ao ler o QR, o celular recebe uma chave **daquela comanda**. Quando a conta fecha, a chave morre — quem saiu não pede na mesa do próximo nem vê o consumo dele; foto antiga do QR não serve.
- **Mesa livre + cliente lê o QR**: o primeiro pedido fica **"aguardando o garçom"**; o garçom confirma na mesa (e coloca o nome); aí nasce a comanda nova com chave nova. Depois, os pedidos da mesa vão direto para a cozinha. Duas pessoas da mesma mesa entram na **mesma** comanda.

## 6. Jornada completa de uma visita

1. Cliente senta, lê o QR → página da mesa (sessão anônima).
2. Joga sem cadastro (se quiser).
3. Garçom abre/confirma a mesa (nome travado) e pergunta o WhatsApp (opcional).
4. Pedidos: pelo garçom (tablet) ou pelo cliente (só prato pronto). Peixe por peso → garçom.
5. Prêmio conquistado no Quiz → **"Salvar meu prêmio"** → confirma o WhatsApp por código → perfil identificado e ligado à comanda.
6. Fechamento: taxa de serviço (removível), desconto (PIN), pagamento misto/dividido. **Conta paga** → libera o **prêmio do jogo** (valor fixo ou %, conforme a campanha) e credita o cashback da compra (regra existente). Mensagem de WhatsApp ao cliente com o saldo e a validade.
7. Volta: no **delivery** usa o saldo no checkout (já existe o toggle); **presencial**, o garçom busca o telefone e aplica o saldo como forma de pagamento.
8. Reengajamento (só quem optou): "seu recorde foi superado".

## 7. Regras do Quiz (resumo — fonte: `docs/pesca-premiada/`)

4 alternativas, 5 s por pergunta; fase segura até 15 acertos (0/2/3/5%), portão de risco aos 15 ("parar e garantir 5%" ou "continuar e arriscar tudo"), marcos 6/8/10% na fase de risco; 3 pulos + 2 "pensar 10 s"; **primeira disputa elegível** gera prêmio, as demais só recorde. **Servidor guarda as perguntas e o cronômetro; a resposta certa nunca vai para o celular.** Faixas de % da fonte devem ser mapeadas para os valores da campanha (fixo ou %). 30 perguntas iniciais já escritas (banco-alvo: 300).

## 8. Ordem de construção

1. **Mesas e comandas** (mapa, abrir/confirmar com nome do garçom, rodadas → cozinha/impressão, fechamento com taxa, pagamento misto e divisão, liberar mesa, transferir/juntar, adicionar mesas), **já com o campo de telefone na comanda** e os cuidados com cozinha/relatórios/cashback.
2. **Pedido pelo QR** (prato pronto; item por peso → "Chamar garçom"; mesa livre → aguardando o garçom), som e aviso no aparelho do garçom, PIN da supervisão.
3. **Identificação por código** + cashback no fechamento + resgate presencial.
4. **Quiz** (servidor valida) + carteira de prêmios.
5. **Aventura do Peixinho** (sem cashback, sem ranking).
6. **Rankings** (ao vivo, online agora, semanal, geral).

## 9. Cuidados técnicos já mapeados

- Hoje o sistema assume "um pedido = uma venda que se paga": a cozinha (`/painel/cozinha`) e `/painel/pedidos` marcam `payment_status = 'pago'` ao entregar. **Pedido de mesa precisa ficar de fora** (pago só no fechamento da comanda).
- Relatórios: contar a **comanda fechada**, não cada rodada nem pedido não pago, para não contar em dobro.
- `status-pedido` (WhatsApp/cashback por pedido) e a IA do CRM precisam ignorar `origin = 'mesa'`.
- 33 arquivos tocam `loja_pedidos` — mapear antes de construir.
- Impressão: ticket da rodada com **número da mesa**; recibo da conta no fechamento.
- Realtime: assinar `loja_pedidos`/chamados com o mesmo cuidado de ressincronização do painel (`useRealtimeResync`).

## 10. Pendências / a decidir

- **Regra comercial do prêmio** na Calçada do Peixe: valores das faixas (modo fixo) ou % e teto (modo percentual); limite de jogadas por pessoa/visita; validade; uso em outros parceiros.
- **Consulta jurídica** (Lei 5.768/71): desconto/cashback liberado por desempenho em quiz pode ser tratado como promoção comercial — checar com advogado antes de lançar prêmio.
- **Aviso de pergunta MAR-015** (hemisfério dos pinguins): o pinguim-de-galápagos cruza o Equador — ajustar a redação antes de publicar.
- **Decidido (2/nov/2026):** o **PIN da supervisão** é definido pela **dona da loja**, e a **lista de garçons** também é cadastrada por ela (no painel, por loja). Ainda em aberto: limite de pedidos por minuto na mesa (sugestão: 3) e valor da taxa de serviço por loja (padrão 10%).
- **Pergunta MAR-015 ajustada** nos arquivos de `docs/pesca-premiada/`: virou "A maioria dos pinguins vive em qual hemisfério?" (o pinguim-de-galápagos cruza o Equador).
- **Mockup** das telas publicado como canvas no Artifact "Mesas e Comandas — Calçada do Peixe" (5 telas: mapa de mesas, comanda e fechamento, página da mesa, cardápio da mesa e envio de pedido).
- Mockup das telas (mapa de mesas do garçom, comanda + fechamento/divisão, tela do cliente no QR) — aprovar antes de codar.
- LGPD: menores jogam sem cadastro e sem marketing; ranking só com apelido e consentimento.
