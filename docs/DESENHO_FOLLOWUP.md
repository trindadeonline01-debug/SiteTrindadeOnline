# Desenho do Follow-up de Atendimento — Trindade Online
> Documento de desenho (1/nov/2026). **Nada foi codado.** As 10 decisões estão fechadas (seção 10); falta a aprovação final do resumo antes da fase 1.

---

## 1. Objetivo

Ter um motor de follow-up **leve, efetivo e que não dê problema futuro**, que:
- puxa de volta quem some no meio de uma conversa (caso do job 7, hoje pausado);
- serve de base pra outros casos dos pilares Conversão/Retenção (Pix não pago, carrinho parado, pós-entrega, cliente sumido);
- nunca derruba o banco, nunca arrisca bloquear o WhatsApp da loja e nunca incomoda quem não quer.

---

## 2. O que existe hoje (achados no código e no banco)

| Peça | Situação |
|---|---|
| `atendimento-silencio` (job 7) | Varre as conversas todo minuto procurando quem sumiu. **Pausado.** Foi o maior culpado do travamento (700 consultas/min, sempre os mesmos contatos antigos). |
| `atendimento-resgate` (job 6) | IA assume depois de 5 min sem resposta humana. **Ativo** só em Calçada do Peixe e Mineroca. Também varre todo minuto. |
| `follow_up_at` em `crm_contacts` | **Semente do desenho certo**: a IA da Julia Eventos agenda "voltar em N dias" e o webhook cancela quando a cliente responde. Só serve pra um piloto, 1 data por contato, sem histórico. |
| Cancelamento quando o cliente responde | Só existe pro `follow_up_at` (webhook). |
| Opt-out ("parar de mandar") | **Não existe.** Nada no CRM trata isso. |
| Limite diário de envio (`companies.crm_daily_send_limit`) | A coluna existe, **nenhum código lê**. |
| Tipo da mensagem enviada | **Não é gravado.** `crm_messages` não diz se uma mensagem foi conversa, aviso de pedido, resposta automática de "fechado" ou campanha. |
| Índices | `crm_contacts` só tem índice em `company_id`; nada em `last_message_at`/direção. Varredura é sempre cara. |
| Fila lenta de WhatsApp | Existe (`whatsappFila`), mas só pro número da **plataforma**, não pro número de cada loja. |
| Status de entrega da mensagem | Já guarda `sent`/`delivered`/`read` em `crm_messages.status`. |
| `sendCustomerWhatsApp` | Usado pra avisos de pedido/entrega. Se a loja não tem WhatsApp conectado, cai pro número da plataforma. |

---

## 3. Números reais (Calçada do Peixe + Mineroca, últimos 30 dias)

- **~356 contatos ativos** nos 2 locais; **~273 terminam com mensagem da loja** (sem resposta depois); **~251 desses nunca compraram**.
- De 1.790 mensagens da loja, **629 tiveram resposta**. **Quando respondem, respondem rápido:** 75% em até 5 min, 11% de 5 a 20 min, 5% de 20 a 60 min, 5% entre 1 e 24 h, 4% depois de 24 h.
- **274 mensagens da loja (15%) não têm próxima mensagem** — muitas são avisos de pedido, "obrigado", respostas automáticas. **Nem toda mensagem sem resposta é um cliente "perdido".**
- **Pix pendente:** desde 30/out foram 20 pagamentos pendentes: 17 pagos, 3 recusados, **0 expirados**. Abandono de Pix hoje é praticamente zero — **não é o primeiro caso a atacar.**
- **Volume do follow-up de silêncio:** na casa de **poucas dezenas de itens por dia** nas duas lojas. Não precisa de infraestrutura pesada. Precisa de infraestrutura **correta**.

Conclusão dos números: o gatilho de **5 minutos** faz sentido (depois dele só restam ~14% dos que iriam responder), mas o ganho real está em **acertar quem merece o lembrete** e **não incomodar**, não em volume.

---

## 4. Alternativas avaliadas

| # | Alternativa | Veredito |
|---|---|---|
| A | Manter a varredura de conversas todo minuto, só com índices e janelas de tempo | **Descartada.** Continua frágil: custo cresce com o nº de conversas e de lojas, e a regra "quem sumiu" fica espalhada. |
| B | **Fila de agendamentos** (tabela com "o que fazer e quando") + checagem na hora de enviar | **Recomendada.** Custo proporcional ao que está pendente, não ao tamanho do histórico. |
| C | Serviço externo de tarefas agendadas (QStash, Inngest, Vercel Queues) | Boa tecnicamente, mas **dependência nova e custo** pra um volume de dezenas por dia. Reavaliar só se escalar muito. |
| D | Um `cron.schedule` do pg_cron por item | Descartada: polui o agendador e é difícil de cancelar. |
| E | API oficial do WhatsApp com templates aprovados | **Elimina o risco de bloqueio** (hoje usamos Evolution/Baileys, não oficial), mas exige migrar números, aprovar templates e tem custo por conversa. Caminho de **escala futura**, não agora. |

---

## 5. Arquitetura recomendada (B)

**Tabela `crm_followups`** (uma linha = uma ação planejada):
`id, company_id, contact_id, tipo, passo, ancora_msg_id, due_at, status (pendente/enviado/cancelado/ignorado/falhou/expirado), motivo, texto_gerado, criado_em, processado_em, grupo_controle (bool)`.
Índice parcial `(due_at) where status = 'pendente'` e índice único `(contact_id, ancora_msg_id, passo)` — **nunca duplica**.

**Fluxo:**
1. **Criar:** quando uma mensagem de saída de **conversa** (não aviso de pedido, não resposta automática) é registrada, cria a linha com `due_at = agora + 5 min` (regra da loja).
2. **Cancelar:** quando entra uma mensagem do cliente **ou** do dono (celular/painel), cancela as pendentes do contato. O ideal é um **gatilho no banco** em `crm_messages`, porque hoje há vários caminhos que gravam mensagem e esquecer um deixaria follow-up órfão.
3. **Executar:** o job só **acorda o site quando existe item vencido** — o próprio comando do pg_cron faz `select ... where exists (...)` antes de chamar a Vercel. **Fila vazia = zero chamadas à Vercel** (hoje o job 7 faz 1.440 por dia à toa).
4. **Decidir na hora de enviar**, não na hora de criar: uma função de política (pura, testável) devolve `enviar`, `ignorar`, `adiar` ou `cancelar`, sempre com o **motivo gravado**.
5. **Enviar** pela fila de envio da loja, com espaçamento aleatório e limite diário.
6. **Limpeza:** linhas concluídas com mais de 60 dias são apagadas por rotina (aprendizado do `crm_webhook_debug`: toda tabela nova precisa de aposentadoria).

**Reaproveita:** a classificação de conversa que já existe (`crmAtendimentoIA`), o gerador de mensagem (`gerarFollowUpSilencio`) e o conceito do `follow_up_at` — a Julia Eventos migra pro motor novo depois, pra não manter dois sistemas.

---

## 6. Política de decisão (quando enviar, quando NÃO enviar)

Só envia se **todas** forem verdadeiras na hora do envio:
1. A última mensagem da conversa ainda é a **âncora** (ninguém falou depois).
2. A âncora **espera resposta** (pergunta, oferta, "qual você prefere?") — não é aviso de pedido, "obrigado", nem resposta automática de loja fechada.
3. O contato **não** está silenciado, arquivado, em atendimento humano ativo, nem com opt-out.
4. **Não há pedido seu em andamento ou criado depois** da âncora (pelo telefone normalizado), nem Pix pendente.
5. Está dentro da **janela de horário** (ex.: 8h–21h Brasília) e **a loja está aberta** quando o lembrete convida a pedir.
6. A mensagem anterior foi **entregue** (`delivered`/`read`). Se ficou só `sent`, o cliente nem recebeu: adia ou ignora.
7. A conversa **não é de reclamação, problema ou fora de área** (classificação de estado). Lembrete de venda em cima de reclamação é pior que silêncio.
8. Não estourou o **limite por contato** (ex.: máx. 2 toques por conversa, 1 conversa a cada 7 dias) nem o **limite diário da loja**.
9. A instância de WhatsApp da loja está **conectada**.
10. O item não está **velho demais** (ex.: vencido há mais de 3 h → `expirado`, nunca dispara em rajada).

---

## 7. Pontos cegos (o que normalmente ninguém pensa e dá problema depois)

1. **Nem toda mensagem sem resposta merece lembrete.** Aviso de pedido, código de entrega, "obrigado!", resposta de "estamos fechados" — se virar gatilho, a cliente recebe "ainda está aí?" depois de ter o pedido entregue. **Falta gravar o tipo da mensagem** (`origem`): conversa-IA, conversa-humano, aviso-de-pedido, resposta-automática, campanha.
2. **O dono está conversando manualmente.** A IA entrar no meio atropela. Hoje o webhook já muda a conversa pra "humano" quando o dono digita; o motor tem que respeitar. Alternativa mais segura: em conversa humana, **avisar o dono** ("fulano não respondeu há 30 min") em vez de falar com o cliente.
3. **Cliente já comprou por outro caminho** (site, PDV, outro atendente) depois da conversa. Precisa cruzar `loja_pedidos` pelo telefone normalizado (com 55) e cancelar.
4. **Opt-out não existe.** Quem pede "para de mandar" e recebe lembrete denuncia o número como spam. Precisa de: palavra-chave ("PARAR"), detecção de recusa na conversa e flag por contato respeitada por **todos** os envios automáticos.
5. **Risco de bloqueio do WhatsApp** (Evolution é não oficial). Mitigações: só em conversa que o **cliente iniciou nas últimas 24 h** (follow-up de continuidade, não marketing), limite por contato e por loja, intervalo aleatório entre envios, **variação de texto** (nunca a mesma frase pra todo mundo), e parar sozinho se houver sinal de problema (desconexões, falhas em sequência).
6. **Rajada depois de uma queda.** Se o WhatsApp/Evolution ficou fora 2 h (a VPS reinicia a cada 4 h), todos os itens vencem juntos e saem de uma vez. Precisa de **expiração por atraso** e **teto por rodada**.
7. **Dois processos ao mesmo tempo / retry.** Trava otimista no item (`pendente → processando`), índice único contra duplicata, e gravar o envio **antes** de qualquer retry que possa repetir mensagem.
8. **O cliente responde no meio do envio.** Reler a âncora imediatamente antes de mandar.
9. **Falha silenciosa da IA.** Foi exatamente o que aconteceu (crédito da Anthropic zerado, ninguém soube por dias). O motor precisa de **alerta ao admin** quando a geração falha N vezes, e de um **plano B** (texto pronto) ou "não enviar" — nunca silêncio invisível.
10. **Mensagem velha ou errada.** O texto gerado pode citar preço, produto ou horário que mudou. Política: o lembrete **retoma o assunto**, não repete preço/promessa; e checa se a loja está aberta antes.
11. **Medir de verdade.** Sem comparação não dá pra saber se o lembrete ajuda ou só incomoda. Separar um **grupo de controle** (10–20% elegíveis que **não** recebem) e comparar respostas e pedidos.
12. **Tabela nova que cresce sem fim.** Retenção definida desde o dia 1.
13. **Varredura escondida.** Qualquer "procura quem..." sem índice volta a ser o problema do job 7. O desenho obriga a consulta a partir da fila indexada.
14. **Muitos caminhos gravam mensagem** (webhook, painel, IA, avisos, campanhas). Cancelamento e criação confiáveis pedem **um ponto único** (gatilho no banco) em vez de lembrar de chamar função em cada rota.
15. **Dependências cruzadas entre automações.** Resposta automática de "fechado", IA de resgate (job 6), follow-up e campanhas não podem se pisar. Precisa de uma regra de precedência.
16. **Conversas que não são cliente** (grupos, bots, outro comércio, contatos sem DDI correto). Filtrar.
17. **Transparência pro lojista.** Ele precisa ver o que o sistema mandou em nome dele, poder **pausar por contato e por loja**, e receber um resumo. Surpresa vira reclamação.
18. **LGPD.** Follow-up de **continuidade** (cliente falou há pouco) tem base legítima clara; **reativação de cliente dormente** é marketing e exige opt-out visível e mais cuidado. Tratar como **dois produtos separados**.
19. **Horário e fuso.** Gravar tudo em UTC, decidir em Brasília; lembrete às 23h ou no domingo cedo é mau sinal.
20. **Custo.** Volume é pequeno (dezenas/dia): IA barata (Haiku) resolve. Texto pronto como plano B zera o custo.

---

## 8. Medição (o que acompanhar)

Por loja e por passo: enviados, ignorados (e por quê), taxa de resposta em 24 h, pedidos em 24/48 h, **comparação com o grupo de controle**, opt-outs, falhas de envio, desconexões de instância, custo de IA. Um painel simples no admin e um resumo semanal pro lojista.

---

## 9. Fases (nada avança sem o "pode" do Ricardo)

0. **Aprovação deste desenho** e das decisões da seção 10.
1. **Encanamento sem enviar nada:** coluna de tipo de mensagem, tabela `crm_followups`, gatilho de cancelamento, flag de opt-out, limpeza, job condicional (desligado).
2. **Modo sombra** (1 semana, 2 lojas piloto): o motor decide e **gera o texto, mas não envia**; o dono revisa numa tela "o que eu mandaria". Ajusta a política com dado real.
3. **Piloto com envio** nas 2 lojas, com tetos baixos, grupo de controle e kill-switch.
4. **Medir** 2 a 4 semanas; só então abrir pra outras lojas.
5. **Ampliar o motor:** Pix não pago, carrinho parado, pós-entrega, migrar Julia Eventos. **Reativação de cliente dormente** só depois, junto com os disparos do CRM (item 10 da fila), com opt-out completo.

---

## 10. Decisões fechadas com o Ricardo (1/nov/2026)

Todas as 10 decisões foram fechadas uma a uma. **Nada foi codado ainda.**

| # | Tema | Decisão |
|---|---|---|
| 1 | Escopo | **Só conversas ativas:** o cliente escreveu nas últimas 24 h, a loja respondeu e ele sumiu (inclui sumir no meio da conversa, não só no 1º atendimento). Reativação de clientes dormentes / recompra inteligente (produto certo, dia certo) é **outro produto**, do pilar Retenção, com desenho próprio depois. |
| 2 | Conversa em atendimento humano | O motor **nunca fala com o cliente**. O painel só mostra "aguardando cliente há X min". |
| 3 | Lembretes | **2 lembretes: aos 6 e aos 20 minutos** (contados da última mensagem da loja). Máx. 2 por conversa; sem resposta a nenhum, novo ciclo só após **7 dias**. |
| 4 | Horário | Loja com horário definido: **só com a loja aberta** (loja pausada não). Loja sem horário fixo: **das 9h às 18h**. **Não manda nos 10 min antes de a loja fechar.** Fora disso, **cancela** (nunca adia). |
| 5 | Texto | **IA escreve** (máx. 2 frases, máx. 1 emoji, sem preço/promessa, sem repetir a pergunta anterior), com **texto pronto de reserva** se a IA falhar. O 2º lembrete é o último, sem insistir. |
| 6 | Opt-out | **Completo:** detecta "parar/chega/não quero mais" e irritação (palavra + IA); marca o contato, cancela os pendentes, selo no painel; frase discreta só no 2º lembrete ("Se não quiser mais mensagens, é só me avisar"); vale pra **todo envio automático** daquele contato (exceto avisos de pedido); o sistema **não responde** ao pedido; o dono pode reativar. |
| 7 | Grupo de controle | **50% no 1º mês de envio real, depois 10%.** Resumo semanal no WhatsApp do Ricardo (segunda-feira); lembrete agendado de 30 dias (criado no dia em que o envio real começar) e o resumo semanal também avisa o marco. |
| 8 | Modo sombra | **1 semana** nas 2 lojas piloto: o motor decide e escreve, mas não envia. Tela de admin "O que eu teria mandado" com 👍/👎 + motivo. **Critério pra liberar o envio real:** ≥ 30 casos revisados, ≥ 90% 👍 e **nenhum erro grave** (lembrete pra quem já pediu, pediu pra parar ou estava reclamando). |
| 9 | Controle do lojista | **Liga/desliga da loja + pausar por contato.** Cada lembrete aparece na conversa com o selo "🤖 lembrete automático". No piloto, quem liga a loja é o Ricardo. |
| 10 | Julia Eventos | **Sem follow-up por enquanto** (o atendimento é humano). Sem migração pro motor novo. Ver o projeto novo "IA aprende com o histórico da Julia" (KB item 30). |

### Como saber se deu certo (acertos e erros)
- **Sombra:** revisão caso a caso (👍/👎 + motivo) e porcentagem calculada sozinha.
- **Envio real — acertos:** clientes que responderam/pediram depois do lembrete **comparados com o grupo de controle**.
- **Envio real — erros técnicos:** WhatsApp da loja desconectado, falha da IA, mensagem não entregue.
- **Envio real — sinais de dano:** pedidos pra parar, respostas irritadas, queda de resposta.
- **Alertas automáticos no WhatsApp do admin:** IA falhando várias vezes seguidas; WhatsApp de loja caído; pedidos pra parar acima do normal.
- **Botão de emergência** na mesma tela: desliga o follow-up de uma loja ou de todas.

### Próximo passo
Mostrar o resumo final pro Ricardo aprovar. **Só depois** começa a fase 1 (encanamento sem enviar nada): coluna de tipo de mensagem, tabela `crm_followups`, gatilho de cancelamento, flag de opt-out, rotina de limpeza e job condicional (desligado). Mudanças de schema pedem confirmação antes de aplicar.
