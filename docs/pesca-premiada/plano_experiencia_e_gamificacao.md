# Trindade Online × Calçada do Peixe
## Plano de experiência do cliente, gamificação e fidelização

**Versão:** 1.3 — 2 de novembro de 2026  
**Status:** Documento de produto para discussão e desenvolvimento no Claude.  
**Escopo:** O piloto da Calçada do Peixe e a possibilidade de replicar o módulo em outros estabelecimentos. Não é uma redefinição completa do Trindade Online.

---

## 1. Objetivo estratégico

Usar o movimento já existente da Calçada do Peixe para validar um conjunto replicável de experiências e ferramentas do Trindade Online. A proposta é **melhorar o atendimento, surpreender clientes durante a espera, criar relacionamento e estimular novas compras**, inclusive em outros negócios locais.

O produto não é o jogo, a comanda, o cupom ou o QR Code isoladamente. Esses são instrumentos para entregar resultados nos três pilares do Trindade Online:

- **Atração:** aumentar a descoberta e a circulação de clientes entre negócios parceiros.
- **Conversão:** facilitar pedidos, reduzir atritos de atendimento e melhorar a experiência de compra.
- **Retenção:** criar relacionamento, incentivar recompras, promover fidelidade e benefícios cruzados.

**Dados e inteligência comercial** conectam os pilares. O primeiro papel do Trindade Online é administrar e demonstrar valor; uma pequena participação futura em transações geradas e comprovadas pela plataforma poderá ser estudada, sem ser compromisso desta versão.

## 2. Contexto operacional da Calçada do Peixe

- Durante o dia existe uma peixaria física. À noite, a operação de restaurante acontece em mesas na calçada, em frente a um trailer que funciona como cozinha.
- O restaurante já atrai muitos clientes e pode ter filas; o maior problema percebido não é falta de público, mas organização operacional e experiência de espera.
- Atualmente o garçom anota pedidos no papel e os leva à cozinha. No fechamento, o caixa lança manualmente os itens no sistema.
- O atendimento inicial pode levar em torno de cinco minutos por haver poucos garçons para muitas mesas; a preparação frequentemente leva 20 a 30 minutos, variando por pedido e movimento. **Esses tempos são observações iniciais, não métricas aferidas.**
- Pedidos simples, como uma porção padronizada de peixe com fritas, entram diretamente na produção. Quando o cliente escolhe peixe fresco, ele vai ao balcão da peixaria, onde o produto é selecionado, pesado, limpo e preparado para seguir ao trailer. O processo extra explica parte da demora. A operação respeita a ordem de chegada, mas diferentes itens têm durações distintas.

**Diretriz:** não tentar digitalizar todas as etapas da peixaria e cozinha na primeira versão; preservar a operação essencial e organizar as comandas.

## 3. O que já existe no Trindade Online

Conforme informado durante a conversa, o sistema já possui:

- Modalidades de **mesa, balcão e delivery**.
- Abertura de mesa, inclusão de vários itens/pedidos na mesma comanda e fechamento/liberação da mesa para o próximo atendimento.
- Estrutura de registro de pedidos; a impressão é parte do fluxo usado ou previsto no sistema atual.

O piloto usa **mesa/balcão/comanda**, não o módulo de delivery para atender as mesas. O delivery entra como **canal futuro para resgatar benefícios e incentivar recompra**.

Não se propõe recriar o sistema. O trabalho é adaptar e integrar o que já funciona, validando impressoras, permissões, rotinas de caixa, fluxo dos garçons e UX.

## 4. Experiência de atendimento desejada

1. Cliente chega e ocupa uma mesa.
2. Ele escolhe livremente entre ser atendido por garçom e consultar/fazer o pedido no próprio celular por QR Code. A **disponibilização efetiva de autoatendimento depende de teste operacional**; o atendimento tradicional permanece.
3. Todos os pedidos utilizam a **mesma comanda digital**, independentemente da origem.
4. O pedido chega ao fluxo usual de preparação, sem exigir digitalização detalhada das fases de limpeza e cozinha.
5. No encerramento, o caixa finaliza a comanda e a mesa fica disponível para novo atendimento.

### Fora do escopo da primeira versão

- Notificações ao cliente sobre limpeza do peixe, preparo, pedido pronto ou entrega.
- Rastreamento granular das etapas internas da cozinha.
- Promessas de horário exato de entrega.
- Imposição de pedido pelo celular a todos os clientes.

## 5. QR Code único por mesa e segurança da sessão

Cada mesa possui um QR Code físico próprio. Exemplo: o QR da mesa 12 abre uma página da Calçada do Peixe dentro do Trindade Online, identificando a mesa 12 e convidando para as experiências.

**Regra técnica importante:** o QR Code identifica a **mesa física**, mas não pode, sozinho, dar acesso irrestrito à comanda ou às informações do cliente anterior. Cada ocupação da mesa é uma sessão de atendimento distinta, criada ao abrir a mesa e encerrada ao fechá-la. Vincular pedidos, jogos e recompensas à sessão correta exige validações no servidor.

A participação nos jogos pode ser oferecida sem cadastro inicial. Para **guardar benefícios, participar de ranking histórico identificado ou receber contatos futuros**, é necessário identificação e tratamento apropriado dos dados, com informações claras ao usuário e observância da LGPD.

## 6. Proposta de entrada na experiência

**Nome provisório:** *Pesca Premiada* — experiência personalizada da Calçada do Peixe, executada dentro do Trindade Online.

Ao escanear o QR Code, apresentar uma tela de abertura leve, rápida e responsiva:

> 🐟 Bem-vindo à Calçada do Peixe!  
> Enquanto espera, que tal se divertir e pescar alguns prêmios?

Três caminhos principais:

- **Quiz Premiado** — perguntas rápidas com recompensas.
- **Aventura do Peixinho** — minijogo simples e divertido, especialmente adequado às crianças.
- **Minha Carteira de Prêmios** — benefícios disponíveis, condições e validade.

**Princípio de UX:** diversão primeiro, cadastro depois. Não interromper a chegada com formulário. Oferecer a possibilidade de salvar o benefício após o usuário conquistá-lo; não tornar a participação dependente de mensagens promocionais.

A interface deve ser curta, legível, intuitiva e funcionar bem em telefones comuns e conexões móveis.

## 7. Quiz Premiado

**Conceito:** perguntas de múltipla escolha sobre peixes, gastronomia, história e curiosidades da Trindade, cultura geral e comércios parceiros. Pode ser adaptado a cada restaurante, preservando o motor central do Trindade Online.

**Formato definido:** quiz de sobrevivência, com quatro alternativas, contagem padrão de cinco segundos por questão e banco amplo de perguntas sobre mar, animais, geografia, fenômenos e curiosidades. O cliente responde até errar ou decidir parar. O modo premiado usa a progressão abaixo; outros jogos são competitivos e não multiplicam cupons.

## Regras consolidadas — Modo Sobrevivência com risco e recompensa (02/11/2026)

**Decisão registrada na conversa:** o quiz usa quatro alternativas por pergunta, tempo padrão de **5 segundos** e continua enquanto o jogador acerta. A **primeira disputa elegível da campanha** oferece descontos graduais; as disputas seguintes servem à competição por recordes, sem gerar novos descontos automaticamente. Critérios de elegibilidade por pessoa/visita e validação do cupom precisam ser definidos no produto.

### Progressão de descontos

| Acertos acumulados na mesma rodada | Desconto que pode ser garantido | Etapa |
|---:|---:|---|
| 0–4 | 0% | Segura |
| 5–9 | 2% | Segura |
| 10–14 | 3% | Segura |
| 15–19 | 5% | Ao alcançar 15 acertos, entra na escolha de risco |
| 20–24 | 6% | Arrisca tudo se continuar |
| 25–29 | 8% | Arrisca tudo se continuar |
| 30 ou mais | 10% (teto) | Recordes continuam sem ampliar desconto |

**Fase segura — até completar 15 acertos:** um erro ou tempo esgotado encerra a rodada, mas preserva o **último percentual efetivamente alcançado** (0%, 2% ou 3%; 5% se já houver 15 acertos). Ajudas não contam como acerto.

**Portão de risco após 15 acertos:** exibir uma tela destacada com duas escolhas: **“Parar e garantir 5%”** ou **“Continuar e arriscar tudo”**. A partir da pergunta 16, se o jogador decidiu continuar, **qualquer resposta incorreta ou tempo esgotado encerra a rodada e zera o desconto da rodada**, inclusive se ele já tiver chegado aos marcos de 6% ou 8%.

**Direito de parar:** antes de iniciar cada nova pergunta na fase de risco, mostrar “**Parar e garantir X%**” ou “**Continuar**”. Parar assegura o maior marco alcançado. A decisão deve ocorrer antes do cronômetro da próxima pergunta; não é permitido desistir depois de ver a resposta incorreta. Se alcançar 30 acertos, o benefício chega a 10% e não aumenta mais.

### Cinco ajudas por rodada

- **3 pulos:** ignoram a pergunta atual sem acerto, sem ponto e sem subir o contador de acertos; carregar outra pergunta não repetida. Cada pulo consome uma unidade. Pular não conta como erro.
- **2 ajudas “Pensar por 10 segundos”:** em duas perguntas distintas, elevam o **tempo total disponível naquela pergunta de 5 para 10 segundos**. Cada ativação consome uma unidade. A interface precisa sinalizar o momento de ativação antes do encerramento do cronômetro.
- Exibir saldo de ajudas e impedir reutilização ao esgotar. O botão “Não sei” deve pedir confirmação para **usar um pulo**, quando houver; sem pulo, permitir encerrar/parar conforme a fase, deixando a consequência explícita.

### Rankings e separação financeira

- **Pontos competitivos e recordes** são independentes do desconto. Uma rodada perdida continua com os pontos/acertos já obtidos registrados para análise e ranking conforme as regras de integridade.
- **Primeira rodada elegível:** pode conceder no máximo um desconto de até 10%, conforme o marco alcançado e a decisão final. **Rodadas seguintes:** somente desafio e rankings; a disponibilidade de uma nova rodada premiada depende das regras comerciais da campanha.
- Após 30 acertos, o jogador pode seguir em modo recorde, sem elevar o desconto acima de 10%. A apresentação do prêmio obtido e o salvamento na carteira não podem ser confundidos com o placar competitivo.
- Rankings ao vivo entre mesas, semanal e histórico permanecem **evolução prevista**, com apelidos, proteções contra abuso e regras de privacidade.

### Fluxo mínimo para o desenvolvimento

`iniciar -> responder/pular/ajuda -> atualizar acertos e pontos -> [erro na fase segura: manter marco e encerrar] -> [15 acertos: escolha parar/arriscar] -> [fase de risco: oferecer parar antes da próxima pergunta] -> [erro: zerar desconto e encerrar] -> [30 acertos: fixar 10%; continuar apenas recordes] -> finalizar -> ofertar salvamento de prêmio válido`.

**Exemplos de teste:** 12 acertos e erro => 3%; 15 acertos e parar => 5%; 18 acertos e erro após escolher arriscar => 0%; 22 acertos e parar => 6%; 27 acertos e erro após arriscar => 0%; 30 acertos => 10%; 3 pulos não acrescentam 3 acertos. Descontos, validade, regras de resgate e campanha precisam de aprovação da Calçada do Peixe antes de produção.

**Cuidados:** validar legibilidade de cada questão em cinco segundos, uso justo das ajudas, limite de tentativas elegíveis, prevenção de fraudes e regras de emissão/resgate antes do piloto. O conjunto inicial de 30 perguntas e o JSON ficam documentados em `quiz_calcada_do_peixe_esqueleto_30_perguntas.md` e `quiz_calcada_do_peixe_30_perguntas.json`.

## 8. Aventura do Peixinho

**Especificação detalhada para o Claude:** [`aventura_do_peixinho_especificacao_para_claude.md`](aventura_do_peixinho_especificacao_para_claude.md). Este documento específico inclui telas, objetivos, regras, pontuação, critérios de aceitação, recomendações técnicas e evolução prevista.

**Decisões estabelecidas:** jogo infantil para aproximadamente 4 a 10 anos; peixinho nada automaticamente e responde ao movimento vertical do dedo; duas dificuldades (Passeio, mais tranquilo, e Aventura, mais desafiadora); três peixinhos de escolha visual sem vantagens de habilidade; sessões de aproximadamente um minuto por fase; colisões não causam morte; medalhas, evolução visual e possibilidade de repetir para melhorar o recorde.

**Três fases iniciais:**

1. **Recife Encantado:** coletar estrelas e bolhas e desviar de algas; Medalha de Explorador do Oceano.
2. **Resgate dos Amigos:** encontrar três peixinhos e desviar de águas-vivas; Medalha de Guardião do Oceano.
3. **Tesouro Submarino:** coletar três chaves e abrir o baú; Medalha de Mestre dos Mares.

**Modelo inicial:** acesso sem cadastro infantil obrigatório, sem prêmio comercial concedido diretamente à criança, sem ranking público individual. **Evolução prevista:** placar entre mesas, semanal e histórico, com privacidade e separação por nível de dificuldade. Pontuação deste minijogo é distinta dos percentuais de desconto do quiz adulto.

## 9. Carteira de benefícios do Trindade Online

Centralizar recompensas em um local único da plataforma, com **empresa emissora, tipo de benefício, validade, condições, situação e histórico de resgate**.

Exemplos discutidos:

- Desconto na próxima visita à Calçada do Peixe.
- Frete grátis no próximo pedido delivery, sujeito à área atendida e limites de custo.
- Cupom para conhecer outro parceiro do Trindade Online.
- Benefício por responder uma avaliação **sincera**, sem exigir nota positiva; a recompensa é pela participação, não pela avaliação favorável.

**Modelo de implantação preferencial:** cada parceiro oferece cupons sob regras e custos próprios. Pontos financeiros ou cashback compartilhado entre empresas requerem estudo posterior de compensação e responsabilidade financeira.

## 10. Encerramento da mesa e relacionamento

O processo de comanda permanece normal. Ao final da experiência, quando a mesa é fechada, o restaurante pode convidar o cliente a:

- Avaliar o atendimento e a experiência no Trindade Online.
- Salvar os benefícios já conquistados.
- Conhecer oportunidades de retorno à Calçada do Peixe ou de compra em outros estabelecimentos parceiros.

O momento do convite deve ser operacionalmente viável e não atrasar o caixa ou criar constrangimento. Benefícios podem ser resgatados em visitas futuras ou no delivery, conforme cada campanha.

## 11. Evolução prevista — gamificação entre mesas e clientes

**Esta seção faz parte do roadmap do produto, não é apenas uma ideia solta.** A implementação pode ocorrer após validar a experiência individual e a estabilidade operacional.

### 11.1. Ranking ao vivo entre mesas

Durante o funcionamento do restaurante, mostrar a posição das mesas participantes em um placar atualizado periodicamente, por exemplo:

> 🏆 Batalha das Mesas  
> 1º — Mesa 8: 950 pontos  
> 2º — Mesa 12: 870 pontos  
> 3º — Mesa 5: 720 pontos  
> “Faltam 80 pontos para sua mesa alcançar a liderança!”

A competição pode usar pontuação agregada por mesa e ter regras claras de duração da rodada, entrada e saída de mesas e atualização do placar. **Nunca expor consumo, valor da conta ou dados pessoais das mesas.**

### 11.2. Ranking semanal de jogadores

Tabela semanal de melhores desempenhos, com apelido escolhido pelo próprio participante, pontuação e período da disputa. O objetivo é gerar motivo para voltar, competir novamente e melhorar a própria posição.

### 11.3. Ranking histórico da Calçada do Peixe

Registro dos maiores resultados de todos os tempos por modalidade de jogo, com identificação consentida/apelidos. Preservar critérios comparáveis entre versões do quiz e dos jogos, para não misturar pontuações incompatíveis.

### 11.4. Premiações especiais

**Evolução prevista, sujeita à validação de custos:** recompensas para os três primeiros do ranking semanal, oferecidas pela Calçada do Peixe ou por parceiros. Os prêmios devem ter orçamento máximo, critérios de desempate, prazo e regras transparentes.

### 11.5. Reengajamento

Exemplo de comunicação a quem **optar por recebê-la**: “Seu recorde foi superado! Você caiu para o segundo lugar. Quer voltar e tentar recuperar a liderança?”

### 11.6. Regras de integridade

- **Pontos de competição ≠ valor de desconto.** Competir pode ser ilimitadamente divertido sem criar descontos ilimitados.
- Definir limites de tentativas elegíveis, identificação de sessões e proteção contra automações/fraudes.
- Impedir que a troca de mesa produza vantagens indevidas.
- Separar rankings de crianças e adultos quando necessário; privacidade dos menores tem prioridade.
- Não tornar ranking obrigatório para aproveitar o atendimento.

## 12. Oportunidade de rede: além da Calçada do Peixe

O conteúdo pode apresentar outras empresas do Trindade Online em curiosidades e perguntas, e a carteira pode distribuir benefícios cruzados. Assim, o cliente chega atraído por um restaurante, conhece outros negócios e passa a reconhecer o Trindade Online como ponto de conexão do comércio local.

A estrutura deve ser **multinegócio e configurável**: marca do estabelecimento, temas das perguntas, regras de premiação, jogos ativos, rankings habilitados e campanhas. A Calçada do Peixe é o case-piloto; não deve virar uma personalização impossível de replicar.

## 13. Métricas para transformar o piloto em case

Acompanhar, de forma agregada e respeitando privacidade:

- Mesas atendidas e pedidos lançados pelo sistema.
- Tempo entre abertura e fechamento de mesa; tempo até primeiro pedido **se houver eventos confiáveis para medir**.
- Acessos aos QR Codes e percentual de mesas que interagem.
- Inícios e conclusões de quiz e minijogo.
- Taxa de identificação voluntária e prêmios salvos.
- Cupons emitidos, usados, expirados e custo total dos benefícios.
- Retornos identificados de clientes e compras no delivery vinculadas a campanhas.
- Uso cruzado de cupons entre estabelecimentos.
- Após habilitar rankings: participantes, recorrência de jogadores e variação de participação.

Comparar indicadores **antes e depois**, sempre distinguindo associação de causalidade: o objetivo é demonstrar resultados reais, não atribuir automaticamente todo aumento de vendas à plataforma.

## 14. Etapas de implementação

**Etapa A — Base operacional (prioridade):** validar comanda digital de mesa, impressão, fluxo de garçons, cozinha e caixa. QR único por mesa e sessão segura, sem exigir rastreamento da produção.

**Etapa B — Experiência inicial:** tela de boas-vindas, Quiz Premiado, Aventura do Peixinho, cadastro opcional após conquistar recompensa, carteira e regras básicas de resgate.

**Etapa C — Retenção e rede:** convite à avaliação no encerramento, entrega de benefícios para retorno/delivery, cupons cruzados com outros parceiros e indicadores de resultados.

**Etapa D — Evolução prevista de gamificação:** Batalha das Mesas ao vivo, rankings semanal e histórico por jogo, apelidos, prevenção de fraude, prêmios especiais e comunicações autorizadas para reengajamento.

## 15. Questões de implementação a validar com o software existente

Não presumir que estas peças já estão prontas: integração entre QR e sessão de mesa; permissão para autoatendimento e aprovação de pedidos; estrutura de pontuação; armazenamento de jogos; emissão/resgate de cupons; carteira por cliente; integração com delivery; relatórios; mecanismo de ranking; proteção contra duplicidade e abuso.

Recomenda-se revisar essas funcionalidades no código atual, implementar o mínimo necessário e testar em horário de movimento real antes de expandir.

---

**Princípio final de produto:** a experiência precisa ser memorável para o cliente, leve para o restaurante e mensurável para o Trindade Online. O piloto deve gerar um módulo replicável para outros parceiros, sem desviar do propósito de atração, conversão e retenção.
