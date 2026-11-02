# Aventura do Peixinho — especificação de produto e desenvolvimento

**Projeto:** Trindade Online × Calçada do Peixe  
**Data:** 02/11/2026  
**Versão:** 1.0 (conceito definido; parâmetros de jogabilidade sujeitos a teste)  
**Destinação:** documento para orientar a implementação no Claude, integrado ao Trindade Online existente.

> **Objetivo:** criar uma experiência infantil agradável e memorável durante a espera na Calçada do Peixe, com sessões curtas, comandos intuitivos e oportunidades futuras de competição. A experiência deve apoiar os pilares **atração, conversão e retenção** do Trindade Online, sem complicar o atendimento do restaurante.

## 1. Decisões estabelecidas na conversa

- O jogo se chamará provisoriamente **Aventura do Peixinho**, dentro da experiência **Pesca Premiada**.
- Foco inicial: crianças de **4 a 10 anos**, com níveis de desafio adequados à faixa de desenvolvimento.
- O peixinho **nada automaticamente** na horizontal; a criança **desliza o dedo para cima ou para baixo** para mudar a altura do personagem.
- O controle deve ser suave, diferente da mecânica punitiva de *Flappy Bird*.
- As fases são curtas — **aproximadamente 60 segundos por fase** — e avançam em complexidade.
- Colisões **não matam o personagem** nem encerram imediatamente a partida: podem descontar poucos pontos ou reduzir a velocidade por instantes.
- Há três fases iniciais: **Recife Encantado**, **Resgate dos Amigos** e **Tesouro Submarino**.
- A criança escolhe entre **três peixinhos** de aparência e personalidade distintas, mas **com as mesmas habilidades**.
- O personagem pode **crescer e ganhar evoluções visuais** à medida que o jogador avança.
- A cada fase, o jogador recebe **medalha/conquista** e vê sua pontuação.
- **Ranking entre mesas, ranking semanal e histórico** são evolução prevista, não pré-requisito do lançamento.
- O jogo roda no **celular, pelo navegador**, acessado por QR Code da mesa via Trindade Online, sem exigir instalação ou cadastro infantil.
- Não misturar a pontuação do minijogo com os **percentuais do Quiz Premiado para adultos**. O minijogo infantil não precisa distribuir descontos diretamente à criança.

## 2. Princípios de experiência

1. **Entender em segundos.** Sem tutorial escrito longo. Demonstração visual de um dedo deslizando para cima/baixo antes da primeira fase; botão grande «Jogar».
2. **Diversão sem frustração.** Resposta audiovisual positiva, pequenos efeitos em colisões e possibilidade de tentar novamente.
3. **Sensação de progresso.** Cada fase possui missão reconhecível, medalha e mudanças visuais no peixinho.
4. **A sessão cabe na espera.** Três fases de cerca de um minuto, com pausa entre elas, sem obrigar a criança a concluir tudo.
5. **Nada de cadastro obrigatório.** Acesso rápido e anônimo; evitar anúncios, compras no jogo e pedidos de dados pessoais de crianças.
6. **Tecnologia reutilizável.** Motor do minijogo reutilizável em outras empresas; tema, cores, personagens e nomes das fases são configuráveis.

## 3. Jornada principal da criança

1. O responsável ou cliente escaneia o **QR Code fixo da mesa**, que abre a página da Calçada do Peixe dentro do Trindade Online.
2. Seleciona **Aventura do Peixinho**.
3. Vê uma abertura curta: «Escolha seu peixinho e vamos explorar o oceano!».
4. Seleciona um entre três avatares (diferem apenas visualmente) e o modo de desafio (ver seção 4).
5. Recebe instrução **visual** de arrastar o dedo para cima/baixo e inicia a primeira fase.
6. Coleta itens, supera obstáculos, completa objetivos e vê um resumo ao final.
7. Recebe medalha, mudança estética do personagem e botão **«Próxima fase»** ou **«Jogar de novo»**.
8. Ao completar a terceira fase, recebe tela comemorativa com pontuação final e conquistas.
9. Pode jogar outra vez para superar o próprio recorde. Futuramente poderá comparar a pontuação **da mesa** com outras mesas, sem mostrar identidade da criança.

**Importante:** o QR Code identifica a mesa, mas não deve permitir consultar contas de consumo ou dados de ocupações anteriores. Um novo atendimento cria uma nova sessão. O jogo deve funcionar mesmo se não estiver associado a um usuário identificado.

## 4. Dois modos para a mesma mecânica

Em vez de exigir idade exata, oferecer dois botões claros (a escolha pode ser feita pelo responsável):

| Modo | Referência de idade | Características |
|---|---|---|
| **Passeio no Mar** | ~4 a 6 anos | Mais lento; muitos itens positivos; obstáculos amplos e espaçados; sem necessidade de leitura; tolerância maior a colisões; missões fáceis de concluir. |
| **Aventura no Mar** | ~7 a 10 anos | Velocidade progressiva; obstáculos mais próximos; resgates e chaves exigem mais atenção; pontuação comparável apenas a partidas do mesmo modo. |

Os números são sugestões de usabilidade, não identificação obrigatória da criança. **Não coletar data de nascimento** para escolher dificuldade.

## 5. Três personagens iniciais

Criar três peixinhos originais, com expressão simpática e silhuetas bem distinguíveis:

- **Bolinha:** redondinho, curioso, com barbatanas arredondadas.
- **Faísca:** esguio, alegre, com cauda em formato marcante.
- **Coral:** colorido, tranquilo, com nadadeiras onduladas.

**Equilíbrio:** os três têm exatamente o mesmo alcance, velocidade e capacidade. Evoluções (mudança de cor, nadadeira especial, coroa, brilho) são **cosméticas**, não deixam um avatar melhor que o outro.

## 6. Fase 1 — O Recife Encantado

**Duração-alvo:** 60 segundos.  
**Objetivo:** ensinar o movimento e incentivar a coleta de itens.

**Cenário:** recife luminoso, corais coloridos, algas suaves, bolhas e peixinhos ao fundo. O personagem nada automaticamente; a criança o desloca verticalmente para alcançar colecionáveis.

**Elementos e regra sugerida:**

- ⭐ **Estrela:** +10 pontos por unidade.
- 🫧 **Bolha brilhante:** +20 pontos por unidade.
- 🌿 **Alga:** obstáculo leve; esbarrar gera animação e pequena penalidade, sem eliminação.
- Missão inicial: **coletar pelo menos 5 estrelas**. No modo Passeio, oferecer oportunidades suficientes para quase toda criança conseguir completar.

**Conclusão:** «Você explorou o Recife Encantado!» + **Medalha de Explorador do Oceano**. Peixinho ganha um pequeno brilho/crescimento visual.

## 7. Fase 2 — O Resgate dos Amigos

**Duração-alvo:** 60 segundos.  
**Objetivo:** encontrar **3 peixinhos amigos** durante o percurso.

**Cenário:** oceano um pouco mais profundo, com águas-vivas e elementos móveis lentos. A criança continua coletando estrelas e precisa encostar nos amigos para resgatá-los.

**Elementos e regra sugerida:**

- 🐠 **Peixinho resgatado:** +50 pontos (até 3 por partida).
- ⭐ Estrelas continuam disponíveis (+10 pontos).
- 🪼 Águas-vivas servem como obstáculo visual, com colisão suave, sem sofrimento ou violência.
- Mostrar progresso com **0/3, 1/3, 2/3, 3/3 amigos resgatados** usando ícones grandes.

**Conclusão:** **Medalha de Guardião do Oceano**; nova animação/efeito cosmético no personagem.

## 8. Fase 3 — O Tesouro Submarino

**Duração-alvo:** 60 segundos.  
**Objetivo:** encontrar **3 chaves** para abrir um baú de tesouro.

**Cenário:** navio naufragado estilizado, moedas ilustrativas, corais e caranguejos divertidos.

**Elementos e regra sugerida:**

- 🔑 **Chave:** completar o contador de 3 (sem necessidade de valor monetário próprio).
- ⭐ Estrelas (+10 pontos).
- 🦀 **Caranguejos:** obstáculos que se movem devagar, sem eliminação ao tocar.
- 🎁 **Baú aberto:** bônus de **+100 pontos** quando as três chaves forem encontradas.

**Conclusão:** **Medalha de Mestre dos Mares** e transformação cosmética especial (por exemplo, uma pequena coroa). Exibir placar da aventura.

## 9. Regras de progressão, falhas e repetição

- Cada fase termina ao completar seu tempo-alvo ou ao atingir a condição de conclusão de modo satisfatório; **não exibir tela de morte**.
- Ao não cumprir uma missão, permitir **«Tentar novamente»** ou **«Continuar explorando»**. Como simplificação de MVP, o caminho recomendado é deixar a criança avançar mesmo sem todos os objetivos, mas reservar a medalha dourada a quem cumprir a missão.
- O jogo não deve travar por falta de coleta de um item. Distribuir itens suficientes durante cada fase.
- Colisão: sugestão inicial **–5 pontos**, nunca abaixo de zero na fase, com ~1 segundo de imunidade temporária para evitar descontos em cascata. Validar em testes.
- Salvar o **melhor resultado por sessão**, não somar infinitamente as tentativas para o ranking. Para comparações públicas futuras, registrar apenas rodadas completas, regras/versionamento e modo de dificuldade.
- Reiniciar uma fase permite tentar pontuação melhor. Medalhas já obtidas não devem desaparecer em uma nova tentativa.
- A progressão visual do personagem é decorativa e não confere vantagem competitiva.

## 10. Pontuação e rankings

**Pontuação da versão inicial:** estrelas (+10), bolhas brilhantes (+20), amigos resgatados (+50), baú (+100), colisões (–5 sugeridos). Guardar pontuação por fase e pontuação total. A distribuição de itens por fase precisa ser balanceada para evitar que uma fase represente quase todo o placar.

**Ranking é evolução prevista**, como aprovado para o ecossistema Trindade Online:

- **Entre mesas em tempo real:** comparar os melhores resultados por mesa ativa, com rótulos como «Mesa 12», sem nomes ou perfis infantis.
- **Semanal:** melhores desempenhos dentro de um período definido.
- **Histórico:** recordes da Calçada do Peixe, separados por versão do jogo e nível de dificuldade.
- Se houver exibição pública de pontuação de crianças, usar **somente dados não identificadores** e controles pelo responsável. Para lançamento, **recomenda-se recorde pessoal local e ranking por mesa somente após validação de privacidade e prevenção a fraudes**.
- **Modo Passeio** e **Modo Aventura** não devem competir na mesma tabela, pois não possuem dificuldade comparável.

Não vincular ranking infantil automaticamente à carteira de descontos do Quiz Premiado. Se houver vantagens comerciais, o resgate e a autorização devem ocorrer com o responsável e regras específicas.

## 11. Telas mínimas do MVP

1. **Entrada / convite:** banner «Aventura do Peixinho» com botão «Jogar».
2. **Seleção de personagem e modo:** três peixinhos e «Passeio»/«Aventura».
3. **Instrução visual:** dedo deslizando para cima e baixo; botão «Começar».
4. **Jogo:** cena, personagem, estrelas e obstáculos; contador de pontos; objetivo em ícones; indicador de tempo; botão de pausa.
5. **Conclusão de fase:** medalha, pontuação, «Próxima fase» e «Repetir».
6. **Conclusão da aventura:** três conquistas, placar total, «Jogar novamente» e «Voltar à Calçada do Peixe».

**Não incluir no MVP:** anúncios, anúncios de compras, chat, criação de conta infantil, coleta de nomes ou fotos de crianças, monetização dentro do jogo, ranking público individual, compartilhamento automático em redes sociais.

## 12. Comportamento técnico recomendado

**Stack:** aproveitar a infraestrutura web atual do Trindade Online (frontend no Vercel; Supabase para dados, se necessário). Antes de escolher tecnologia de jogo (Canvas 2D, Phaser ou outra), verificar as bibliotecas e padrões já usados no projeto — sem reescrever o sistema de comandas.

**Condições técnicas:**

- Orientação **vertical**, jogável com uma mão e sem exigir instalação.
- Controles por gesto de toque; prevenir rolagem acidental da página dentro da área do jogo.
- Ajustar cenários e hitboxes a telas pequenas; interface legível, com contraste adequado.
- Sons **desligados por padrão** ou ativáveis voluntariamente, já que o restaurante é um espaço compartilhado.
- Pausar o jogo ao minimizar o navegador ou perder foco, retomando sem punição.
- Respeitar preferências de movimento reduzido quando possível; sem flashes fortes.
- Carregar recursos com cuidado em redes móveis; mostrar progresso de carregamento e botão de tentar novamente se falhar.
- Pontos exibidos na interface podem ser locais, mas **rankings e prêmios** exigem validação no servidor e regras antifraude.
- A chave de identificação de mesa do QR Code não é credencial para acessar dados da comanda nem autoriza leitura de histórico de outros clientes.

### Eventos mínimos de produto (sem identificar a criança)

`game_started`, `level_started`, `item_collected`, `collision`, `level_completed`, `game_completed`, `game_restarted`, `game_exited`.

Metadados possíveis: `tenant_id`, `table_session_id` (token seguro quando aplicável), `game_version`, `difficulty_mode`, `level_id`, `score`, `duration_seconds`, `timestamp`. **Evitar nome, data de nascimento, contato, localização precisa ou qualquer perfil comportamental individual da criança.** Definir retenção mínima e agregação para métricas de produto.

### Exemplo de configuração (proposta, não especificação da API atual)

```json
{
  "game_key": "aventura_do_peixinho",
  "theme": "calcada_do_peixe",
  "difficulty_modes": ["passeio", "aventura"],
  "level_duration_seconds": 60,
  "characters": ["bolinha", "faisca", "coral"],
  "scores": {
    "star": 10,
    "special_bubble": 20,
    "friend_rescue": 50,
    "treasure_chest": 100,
    "collision_penalty": 5
  },
  "leaderboards_initially_enabled": false,
  "registration_required": false
}
```

## 13. Critérios de aceitação para o Claude / QA

- [ ] Um cliente que acessa o QR Code da mesa consegue iniciar o minijogo **sem cadastrar criança**.
- [ ] Os três peixinhos aparecem e têm comportamento idêntico, mudando apenas aparência.
- [ ] O peixe avança sozinho e responde suavemente ao dedo para cima/baixo.
- [ ] É possível concluir a fase 1 coletando estrelas; a fase mostra pontos e medalha.
- [ ] A fase 2 permite resgatar três amigos e mostra contador de progresso.
- [ ] A fase 3 permite coletar três chaves, abrir o baú e receber bônus.
- [ ] Colisões não encerram o jogo e não reduzem o placar abaixo de zero.
- [ ] As fases funcionam nos dois modos, com dificuldade perceptivelmente diferente.
- [ ] A criança pode pausar, retomar, repetir uma fase e iniciar nova aventura.
- [ ] O funcionamento do jogo **não altera pedidos, caixa ou comandas** do restaurante.
- [ ] O navegador não revela dados de mesas anteriores.
- [ ] Áudio não surpreende outros clientes; não há links externos ou compras no jogo.
- [ ] Os rankings futuros estão previstos no modelo de dados, mas ficam desligados no MVP.

## 14. Etapas de implantação

**MVP 1:** tela inicial, três personagens, modos, controle vertical, três fases, pontuação, medalhas, repetição, sem cadastro ou ranking público.  
**Evolução 2:** aprimorar efeitos, personalização estética, equilíbrio de pontuação e novas fases (Oceano Congelado, Reino das Tartarugas, Mar dos Tubarões).  
**Evolução 3:** ranking de mesas, semanal e histórico, com separação por dificuldade, regras de elegibilidade e privacidade.  
**Evolução 4:** temáticas configuráveis para diferentes estabelecimentos do Trindade Online.

## 15. Pendências para validação (sem bloquear o protótipo)

- Definir identidade visual final, mascotes, animações, efeitos e se os personagens terão nomes oficiais.
- Testar se 60 segundos por fase funciona para 4–6 anos em dispositivos reais.
- Ajustar velocidade, distribuição de itens, colisões e valor dos bônus conforme testes.
- Validar se haverá medalha parcial quando objetivo não for alcançado.
- Testar se uma experiência de três minutos entretém sem gerar disputas pelo celular entre irmãos.
- Deliberar formalmente regras futuras de rankings infantis, visibilidade pública e participação do responsável.

---

**Frase-guia do projeto:** «O cliente chegou para comer peixe; a criança encontrou uma aventura. O Trindade Online tornou a espera uma experiência agradável.»
