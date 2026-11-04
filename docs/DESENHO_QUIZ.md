# Desenho — Quiz Premiado (Pesca Premiada, etapa 4)

> Rascunho de 4/nov/2026, para o Ricardo aprovar antes de qualquer código.
> Fontes: `docs/pesca-premiada/plano_experiencia_e_gamificacao.md` (§7 e §11), `quiz_calcada_do_peixe_*` e `docs/DESENHO_MESAS_JOGOS.md`.
> Escopo: **só o Quiz adulto com prêmio**. Aventura do Peixinho e rankings ficam para depois (mas o quiz já grava os pontos para o ranking).

## 1. Regras fechadas (já decididas)

- Acesso pelo QR da mesa (`/mesa/[token]` → "Jogar"), sem cadastro para jogar.
- 4 alternativas, **7 s** por pergunta (**15 s** com "Pensar"), 3 pulos e 2 "Pensar 15 s" por rodada (decisão do Ricardo, 4/nov/2026: era 5 s e 10 s). Pular e ajuda não contam como acerto.
- **Fase segura (até 15 acertos):** o jogador tem **3 chances de errar** (decisão do Ricardo, 4/nov/2026). Erro e tempo esgotado contam igual. Os 3 primeiros erros são perdoados e o jogo continua; o **4º erro encerra** a rodada e ele leva o último marco: 5→2%, 10→3%, 15→5%. Mostrar as chances na tela (3 corações). Dificuldade da pergunta segue os acertos, não a quantidade de perguntas respondidas.
- **Depois dos 15 acertos:** não há mais chances. Cada erro encerra o jogo (zera o prêmio se escolheu arriscar; a partir de 30 acertos mantém os 10%).
- **Portão aos 15 acertos:** "Parar e garantir 5%" ou "Continuar e arriscar tudo".
- **Fase de risco (16+):** sem chances de errar. Antes de cada pergunta, "Parar e garantir X%" ou "Continuar". Erro/tempo esgotado zera o prêmio da rodada. Marcos: 20→6%, 25→8%, 30→10% (teto; depois só recorde).
- **Só a primeira rodada elegível gera prêmio**; as demais valem só pontos e recorde.
- Pontos (ranking, nunca dinheiro): 100 por acerto + 20 por segundo inteiro restante (máx. 200).
- **O prêmio só é liberado depois da conta paga.** Sem compra, sem prêmio.
- Valor do prêmio configurável por campanha: (A) valor fixo por faixa ou (B) % da conta com teto em R$.
- A resposta certa e o cronômetro ficam **no servidor**; a resposta certa nunca vai para o celular antes de responder.

## 2. Como o jogo roda (servidor manda, celular só mostra)

Estados da rodada: `jogando` → (`portao` aos 15) → `risco` → `encerrada`.

1. **Iniciar** (`POST /api/mesa` ação `quiz_iniciar`): confere conta aberta + chave da conta, cria a rodada, decide se é **elegível a prêmio** (seção 5) e devolve o saldo de ajudas.
2. **Pergunta** (`quiz_pergunta`): servidor sorteia (sem repetir na rodada, por nível: 1–5 fácil, 6–10 médio, 11+ difícil), **embaralha as alternativas** e guarda a ordem; grava `servida_em` e o prazo = 7 s + folga de rede (~1,5 s). Devolve só texto e 4 alternativas.
3. **Responder** (`quiz_responder`): servidor confere o prazo (chegou depois = tempo esgotado), compara com a certa, calcula pontos, atualiza acertos e marco e só então devolve "certo/errado + curiosidade". 
4. **Pular** / **Pensar** (`quiz_pular`, `quiz_pensar`): consome 1 unidade; "Pensar" estende o prazo da pergunta atual para 15 s e só vale antes de vencer.
5. **Decidir** (`quiz_decidir`): no portão e antes de cada pergunta da fase de risco — `parar` encerra e garante o marco; `continuar` segue.
6. **Encerrar:** grava o resultado, o marco final e (se elegível) cria o prêmio **pendente**.

Anti-trapaça: uma rodada ativa por conta; perguntas já vistas não voltam; tempo medido só no servidor; limite de chamadas por segundo; a ordem das alternativas muda a cada vez (copiar "é a B" não ajuda quem joga depois); rodada abandonada (sem resposta por 2 min) encerra sozinha como erro.

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
- **7 segundos no celular:** enunciado curto (conferir leitura em 7 s), alternativas curtas, botão grande. A folga de ~1,5 s cobre sinal ruim da calçada, mas a contagem na tela mostra os 7 s.
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
