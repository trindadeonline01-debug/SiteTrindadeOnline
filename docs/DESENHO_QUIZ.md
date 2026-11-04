# Desenho — Quiz Premiado (Pesca Premiada, etapa 4)

> Rascunho de 4/nov/2026, para o Ricardo aprovar antes de qualquer código.
> Fontes: `docs/pesca-premiada/plano_experiencia_e_gamificacao.md` (§7 e §11), `quiz_calcada_do_peixe_*` e `docs/DESENHO_MESAS_JOGOS.md`.
> Escopo: **só o Quiz adulto com prêmio**. Aventura do Peixinho e rankings ficam para depois (mas o quiz já grava os pontos para o ranking).

## 1. Regras fechadas (já decididas)

- Acesso pelo QR da mesa (`/mesa/[token]` → "Jogar"), sem cadastro para jogar.
- 4 alternativas, **10 s** por pergunta (**20 s** com "Pensar"), 3 pulos e 2 "Pensar 20 s" por rodada (decisão do Ricardo, 4/nov/2026: começou em 5 s e 10 s, passou por 7 s e 15 s). Pular e ajuda não contam como acerto.
- **Fase segura (até 15 acertos):** o jogador tem **3 chances de errar** (decisão do Ricardo, 4/nov/2026). Erro e tempo esgotado contam igual. Os 3 primeiros erros são perdoados e o jogo continua; o **4º erro encerra** a rodada e ele leva o último marco: 5→2%, 10→3%, 15→5%. Mostrar as chances na tela (3 corações). Dificuldade da pergunta segue os acertos, não a quantidade de perguntas respondidas.
- **Depois dos 15 acertos:** não há mais chances. Cada erro encerra o jogo (zera o prêmio se escolheu arriscar; a partir de 30 acertos mantém os 10%).
- **Portão aos 15 acertos:** "Parar e garantir 5%" ou "Continuar e arriscar tudo".
- **Fase de risco (16+):** sem chances de errar. Antes de cada pergunta, "Parar e garantir X%" ou "Continuar". Erro/tempo esgotado zera o prêmio da rodada. Marcos: 20→6%, 25→8%, 30→10% (teto; depois só recorde).
- **Só a primeira rodada elegível gera prêmio**; as demais valem só pontos e recorde.
- Pontos (ranking, nunca dinheiro): 100 por acerto + 20 por segundo inteiro restante (máx. 200).
- **O prêmio só é liberado depois da conta paga.** Sem compra, sem prêmio.
- Valor do prêmio configurável por campanha: (A) valor fixo por faixa ou (B) % da conta com teto em R$.
- A resposta certa e o cronômetro ficam **no servidor**; a resposta certa nunca vai para o celular antes de responder.

## 0. STATUS — EM ESPERA (decisão do Ricardo, 4/nov/2026: "deixa documentado, mas não vamos implementar o quiz agora")

**Nada do jogo de verdade foi construído.** O que existe hoje:
- `src/lib/quizRegras.ts` + `scripts/quiz-regras.test.mts` — motor de regras (14 testes passando), ainda não ligado a nenhuma rota ou tela.
- `docs/sql/quiz_premiado_fase1.sql` — migração já aplicada no banco (tabelas do quiz, regra de 1 telefone por conta/conflito). Nenhuma tela lê ou grava nessas tabelas.
- Mockup jogável: arquivo salvo em `docs/pesca-premiada/quiz-mockup.html` (abrir no navegador; inclui cadastro com apelido e WhatsApp, ranking da loja, sair no meio perde tudo, queda de conexão de 2 min e 93 perguntas em 3 níveis). Antes era só um Artifact privado: intro, contagem 3-2-1, pergunta, círculo de resultado, portão dos 15, tela final, sons. **O Ricardo não disse "aprovado" formalmente** — ao retomar, confirmar o mockup antes de codar.
- Perguntas-fonte: `docs/pesca-premiada/` (30 perguntas da Calçada do Peixe). Banco necessário para lançar: mínimo 60, meta 300+ (seção 8).

**Decisões do Ricardo, 4/nov/2026 (conversa seguinte — só desenho, continua sem implementar):**
- **Ranking é obrigatório.** Botão "Ver ranking" na tela inicial do jogo (ou o ranking aparece ao rolar a tela; ao tocar no botão, a tela desce até ele). Mostra ranking geral e histórico, e a **posição do jogador depois da 1ª rodada**.
- **Apelido + WhatsApp antes de jogar.** Ao tocar em iniciar, já pede apelido e WhatsApp; recebe o código de confirmação no WhatsApp, volta e começa. O jogo só libera depois disso (garante prêmio ligado a um número verificado e ranking com apelido).
- **Sair no meio da rodada = perde tudo** (pontos da rodada e o cashback garantido, mesmo o marco já alcançado), e a rodada seguinte começa do zero. Vale também para sair sem finalizar/salvar.

**Pontos que o Claude levantou para fechar antes de codar (sem resposta ainda):**
1. *Ranking da loja ou da plataforma:* recomendado por loja (o prêmio é cashback daquela loja), com abas "Semana" e "Sempre"; geral da plataforma pode vir depois. Métrica a decidir (melhor rodada, soma da semana ou mais acertos).
2. *Apelido:* travado depois de escolhido (preso ao WhatsApp), único por loja, 3 a 16 caracteres, com filtro de palavrões e botão de denunciar para o admin remover.
3. *Cadastro obrigatório x menores:* a regra antiga dizia que menores jogam sem telefone. Com cadastro obrigatório, o quiz adulto pede "tenho 18 anos ou mais" + aceite de aparecer no ranking com apelido (LGPD); criança joga só a Aventura do Peixinho, que não exige cadastro e não tem ranking.
4. *Quem já confirmou o WhatsApp* (nesta conta da mesa ou neste aparelho) não recebe código de novo; só o 1º acesso passa pelo cadastro. Reaproveita o fluxo de código que já existe na página da mesa (`codigo_enviar`/`codigo_verificar`).
5. *Sair no meio:* botão de sair avisa "se sair, perde tudo". Queda de internet, ligação ou fechar o navegador sem querer: dar 2 minutos para voltar à mesma rodada (o relógio da pergunta continua correndo; tempo esgotado conta como erro). Passou disso sem voltar = rodada abandonada = perde tudo e não entra no ranking. Isso muda a regra antiga ("abandono = erro, leva o marco") e é coerente: sair nunca é melhor do que responder.
- Menor risco de fraude: um prêmio por conta de mesa e por telefone continua valendo.

**Respondido pelo Ricardo (4/nov/2026):** ranking **só da loja** (nada da plataforma inteira por enquanto), métrica = **melhor rodada** (abas Semana e Sempre, cada jogador aparece uma vez com a melhor rodada do período), e **2 minutos para voltar à rodada** depois de queda aceitos. Ficam valendo as recomendações dos pontos 2, 3 e 4 acima (apelido travado e único por loja com filtro; 18+ e aceite de ranking; quem já confirmou o WhatsApp não recebe código de novo), que não foram contestadas.

**Ao retomar, decidir (restam):**
1. Mockup v17 aprovado? Ele precisa ganhar as telas novas: cadastro (apelido + WhatsApp + código) e ranking (botão "Ver ranking", abas, posição do jogador).
2. (respondido) pontos 1 e 5 acima; confirmar só se os pontos 2, 3 e 4 seguem como recomendado.
3. Itens da seção 8 (modo do prêmio, limite, validade, lançar sem prêmio).
4. Consulta jurídica (Lei 5.768/71) antes de ligar o prêmio.

**Para construir (seção 7):** ações `quiz_*` em `/api/mesa`, tela em `/mesa/[token]`, prêmio pendente → crédito de cashback em `fechar` (extrato "Prêmio do Quiz", mesma mensagem de WhatsApp do cashback), painel da loja (campanha, prêmio, marcos, teto, validade), banco de perguntas com memória de perguntas vistas por jogador (`quiz_vistas`).

## 2. Como o jogo roda (servidor manda, celular só mostra)

Estados da rodada: `jogando` → (`portao` aos 15) → `risco` → `encerrada`.

0. **Contagem 3-2-1-JÁ (sugestão do Ricardo, 4/nov/2026):** ao tocar em jogar entra uma tela de contagem antes da 1ª pergunta. É só do celular: o servidor só sorteia e começa a contar o tempo da 1ª pergunta quando o celular avisa que a contagem terminou (`quiz_pergunta`). Sair (‹ Início) durante a contagem não perde nada, a rodada ainda não começou.
1. **Iniciar** (`POST /api/mesa` ação `quiz_iniciar`): confere conta aberta + chave da conta, cria a rodada, decide se é **elegível a prêmio** (seção 5) e devolve o saldo de ajudas.
2. **Pergunta** (`quiz_pergunta`): servidor sorteia (sem repetir na rodada, por nível: 1–5 fácil, 6–10 médio, 11+ difícil), **embaralha as alternativas** e guarda a ordem; grava `servida_em` e o prazo = 10 s + folga de rede (~1,5 s). Devolve só texto e 4 alternativas.
2.1. **Resultado de cada pergunta (sugestão do Ricardo, 4/nov/2026):** sem tela separada. Um círculo aparece sobre a própria pergunta: verde com ✓ e os pontos (~1,3 s), ou vermelho com ✗, as chances que restam e a resposta certa (~1,8 s). O topo da tela (pergunta, pontos, chances, escada de níveis) já atualiza na hora. A curiosidade ("Você sabia?") sai do fluxo do jogo. Depois do círculo vem a próxima pergunta, ou o portão dos 15, ou o resumo se a rodada acabou.
3. **Responder** (`quiz_responder`): servidor confere o prazo (chegou depois = tempo esgotado), compara com a certa, calcula pontos, atualiza acertos e marco e só então devolve "certo/errado + curiosidade". 
4. **Pular** / **Pensar** (`quiz_pular`, `quiz_pensar`): consome 1 unidade; "Pensar" estende o prazo da pergunta atual para 20 s e só vale antes de vencer.
5. **Decidir** (`quiz_decidir`): no portão e antes de cada pergunta da fase de risco — `parar` encerra e garante o marco; `continuar` segue.
6. **Encerrar:** grava o resultado, o marco final e (se elegível) cria o prêmio **pendente**.

Anti-trapaça: uma rodada ativa por conta; perguntas já vistas não voltam; tempo medido só no servidor; limite de chamadas por segundo; a ordem das alternativas muda a cada vez (copiar "é a B" não ajuda quem joga depois); rodada abandonada (sem resposta por 2 min) encerra sozinha como erro.

## 2.1 Tela da pergunta (pedido do Ricardo, 4/nov/2026)

- **Cabe numa tela só, sem rolagem, em qualquer celular** (testado de 320×568 a 430×932 no mockup). Em telas baixas o desenho se enxuga sozinho: some o rótulo das zonas, depois a escada de níveis, e o relógio e os botões encolhem.
- **Topo estilo videogame:** três plaquetas com borda dourada (nível e número da pergunta · chances em corações · pontos em dourado, que dá um "pulo" quando soma). Na zona de risco a plaqueta do meio vira "cada erro encerra".
- **Alternativas** com letras em quadradinhos coloridos (A vermelho, B azul, C amarelo, D verde).
- **Botões de baixo grandes e coloridos:** Pular (azul) e Pensar (roxo), com a quantidade que sobra num selo dourado; apagam quando acabam.

## 2.2 Sons (pedido do Ricardo, 4/nov/2026)

- **Acerto:** "ka-ching" de caixa registradora (clique da gaveta, sino de dois toques e moedas). A cada 5 acertos (níveis) soma aplausos.
- **Erro e tempo esgotado:** duas notas graves descendo.
- **Prêmio garantido:** aplausos com uma pequena fanfarra.
- **Botão de som** (alto-falante) na barra de cima, para ligar e desligar.
- **Regra do navegador:** áudio só toca depois de um toque do jogador; o toque em "Jogar" libera. No mockup os sons são sintetizados no navegador (sem arquivos). No jogo real podemos manter assim ou trocar por arquivos mp3 curtos escolhidos pelo Ricardo.

## 2.3 Tela final (pedido do Ricardo, 4/nov/2026)

- **Uma tela só no fim**, ganhando ou perdendo, sem a tela de explicação ("Você sabia?", "Ver resultado"): depois do círculo do último erro vai direto para ela.
- **Ordem de importância:** placar da rodada (pontos e acertos) e posição no ranking geral · prêmio ganho em destaque dourado (ou, sem prêmio, uma frase dizendo por quê) · ranking geral (top 3 e a linha do jogador destacada) · botões.
- **Ranking geral:** só mostra apelido de quem aceitou participar (LGPD, menores sem ranking). Falta decidir o escopo (só da loja, semanal, geral) e o apelido do jogador. No mockup os dados são de exemplo.
- Cabe numa tela só em qualquer celular; em telas baixas o ranking se resume à linha do jogador.

## 3. Dados (migração — pedir confirmação antes de aplicar)

- `quiz_perguntas`: id (ex.: MAR-001), nível, categoria, enunciado, alternativas (jsonb), correta, curiosidade, fonte, ativa. Global (banco da plataforma); a loja pode ter perguntas próprias depois (`company_id` opcional).
- `quiz_campanhas`: company_id, ativa, modo (`fixo`|`percentual`), tabela de marcos 0/2/3/5/6/8/10 → valores, teto em R$, validade do prêmio (dias), regra de elegibilidade (seção 5), textos.
- `quiz_rodadas`: id, company_id, comanda_id, jogador (telefone verificado ou token anônimo), elegível, estado, acertos, pontos, marco, pulos/pensar usados, iniciada/encerrada_em.
- `quiz_rodada_itens`: rodada, ordem, pergunta, ordem das alternativas, servida_em, prazo, resposta, acertou, pontos, ajuda usada.
- `quiz_premios`: company_id, rodada_id, comanda_id, telefone, marco, valor calculado, estado (`pendente` → `liberado` → `usado`/`vencido`), liberado_em, vence_em.
- Todas **sem policy de RLS** (só o servidor com service role), como as tabelas de cashback.

## 4. O prêmio vira cashback (recomendação — reaproveita tudo que já existe)

Quando a conta da mesa é fechada e paga, o prêmio pendente da rodada vira **crédito de cashback** da loja para o telefone verificado (mesma carteira, mesmo extrato, mesma validade, mesmo "Meu cashback", mesmo uso na mesa e no delivery). Vantagens: já tem anti-duplicidade, aviso por WhatsApp, vencimento e tela do cliente; "sem compra, sem prêmio" sai de graça porque o crédito nasce no fechamento da conta.
- **Modo fixo:** o valor da faixa (ex.: marco 5% → R$ 5; 10% → R$ 20).
- **Modo percentual:** o % do marco × (consumo − desconto, sem taxa de serviço), limitado ao teto em R$.
- O extrato mostra a origem "Prêmio do Quiz". O cashback normal da mesa continua separado e somado.
- Quem não confirmou o WhatsApp até o fim da conta: o app oferece confirmar (código de 6 números já existente); sem telefone verificado, o prêmio expira junto com a sessão da mesa.

## 5. Elegibilidade (sugestão — Ricardo decide)

Primeira rodada elegível = a primeira do **telefone verificado** na campanha, e no máximo **1 prêmio por conta de mesa**. Para não virar "todo dia um desconto de graça", sugiro também **1 prêmio por telefone a cada 7 dias**. Antes de verificar o telefone o jogador joga "para valer" mas o prêmio só fica garantido ao confirmar o WhatsApp (as rodadas seguintes são só recorde).

## 6. Pontos que precisam de cuidado

- **Banco de perguntas:** com 30 perguntas, 3 pulos e 3 erros perdoados, chegar a 30 acertos exige 36 sorteios — **não dá**. Mínimo realista 60 antes do lançamento; meta 300. Perguntas por nível: pelo menos 10 fáceis, 15 médias e 35 difíceis.
- **10 segundos no celular:** enunciado curto (conferir leitura em 10 s), alternativas curtas, botão grande. A folga de ~1,5 s cobre sinal ruim da calçada, mas a contagem na tela mostra os 10 s.
- **Desligar a qualquer momento:** botão da loja desliga a campanha; rodadas em andamento terminam sem prêmio novo.
- **Menores:** jogam sem prêmio e sem telefone (só diversão); o prêmio exige telefone verificado de adulto.
- **Jurídico (Lei 5.768/71):** prêmio por desempenho num jogo, **condicionado a compra**, pode ser enquadrado como promoção comercial/vale-brinde que exige autorização. Resolver com advogado **antes de ligar o prêmio**. O jogo em si (pontos e recorde, sem prêmio) pode ir primeiro.

## 7. Ordem de construção sugerida

1. Banco de perguntas + motor de regras (servidor) com **testes automáticos** dos exemplos: 12 acertos e erro → 3%; 15 e parar → 5%; 18 e erro após arriscar → 0%; 22 e parar → 6%; 27 e erro após arriscar → 0%; 30 → 10%; 3 pulos não somam 3 acertos.
2. Tela do jogo em `/mesa/[token]` (mockup aprovado antes).
3. Prêmio pendente → crédito de cashback no fechamento da conta + aviso por WhatsApp.
4. Painel da loja: ligar/desligar, tabela de prêmios, teto, validade; relatório (rodadas, marcos, custo total).
5. Jogar sem prêmio primeiro (modo "só recorde") enquanto o jurídico não fecha.

## 8. Decisões que faltam (Ricardo)

1. **Modo do prêmio:** valor fixo por faixa ou % da conta com teto? Valores/teto.
2. **Limite:** 1 prêmio por conta + 1 a cada 7 dias por telefone está bom?
3. **Prêmio como cashback** (seção 4) ou cupom separado?
4. **Validade** do prêmio (sugestão: a mesma do cashback, 90 dias).
5. **Lançar primeiro sem prêmio** (só jogo/recorde) até o jurídico responder?
