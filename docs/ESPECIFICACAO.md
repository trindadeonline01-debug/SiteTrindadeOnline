# Especificação de reestruturação — Trindade Online

> Documento de referência para implementação. Consolida todas as decisões tomadas na fase de discovery e design.
> **Status:** aprovado para implementação. Pendências abertas listadas na seção 14.

---

## 1. Tese do produto

**É um sistema para negócios locais que usa um portal como canal de aquisição.**

O portal traz o morador. O morador dá movimento ao negócio. O movimento justifica a mensalidade. O portal é o funil; o sistema é o produto.

**Critério de desempate:** quando houver conflito entre agradar o morador e servir o dono do negócio, ganha o dono — desde que o morador continue tendo motivo para voltar.

**Vantagem defensável:** o bairro. Catálogo, delivery, CRM e inbox têm concorrentes grandes e focados. Nenhum deles tem a padaria, o açougue e a saboaria da Trindade num raio de 2 km. Toda decisão de escopo deve ser testada contra isso.

**Risco permanente a monitorar:** cinco frentes (portal, catálogo, delivery, CRM, inbox) é muita superfície para um time pequeno. Portal parado mata o funil — se a home não tiver motivo diário de retorno, o sistema vira um CRM caro sem tráfego próprio.

---

## 2. As três superfícies

O produto se divide em três superfícies com públicos, frequências e regras de layout diferentes. Elas compartilham cor e tipografia, mas **não** compartilham densidade nem hierarquia.

| Superfície | Público | Frequência | Job | Regra visual |
|---|---|---|---|---|
| **Portal** | Morador | Eventual, mobile | Achar negócio e produto perto | Claro, espaçado, marca forte, mobile-first |
| **Loja** | Cliente do negócio | Na hora da compra, mobile | Comprar | A marca do negócio, não a nossa |
| **Operação** | Dono | Diária, desktop e tablet | Trabalhar | Denso, sóbrio, desktop-first |

**Regra de ouro entre elas:** hoje o painel usa os mesmos títulos condensados em caixa alta do site de marketing, o que faz uma ferramenta de trabalho parecer uma landing page. Mesmos tokens, mas no painel a fonte condensada aparece **apenas** em título de página e em números — nunca em rótulo de campo, nome de cliente ou item de menu.

---

## 3. Modelo de contas

### 3.1 Regra central

> **Uma conta é sempre uma pessoa. O negócio é um ativo que pertence a ela.**

Não existe "conta de empresa". É isso que resolve a dor original do cadastro duplicado e do menu dobrado.

### 3.2 Estrutura de dados

```
Pessoa (users)
  └── Membership (person_id, business_id, role)
        └── Negócio (businesses)
              ├── Plano (subscription)
              ├── Produtos
              ├── Pedidos
              ├── Interesses
              └── Clientes
```

**Decisão sobre equipe:** por enquanto **só existe o papel `owner`**. A UI não mostra gestão de equipe.

**Mas a tabela `membership` deve existir desde já**, mesmo com um único registro por negócio. Motivo: quando mesa e balcão entrarem (roadmap), garçom e cozinheiro não podem ter a mesma chave que o dono. Modelar agora custa uma tabela; modelar depois custa refatorar permissão em cinco telas.

Papéis previstos para o futuro (não implementar agora, apenas reservar): `owner`, `atendente`, `cozinha`, `entregador`.

### 3.3 Fluxo de cadastro (unificado)

O usuário **nunca** deve perceber que fez dois cadastros.

1. CTA único no header: **"Anunciar meu negócio"** → `/anunciar`
2. **Passo 1** — rotulado como *"Seus dados de acesso"*: nome, WhatsApp, senha. **A conta de pessoa nasce aqui**, implicitamente.
3. **Passos 2 a 4** — dados do negócio (aproveitar a estrutura de 3 etapas que já existe).
4. Pagamento e publicação.

**O cadastro de morador sai do header.** Ele passa a ser acionado no contexto: ao favoritar, avaliar, salvar busca ou publicar um anúncio na Comunidade. Converte muito mais.

### 3.4 Menu do usuário logado — um só

Fica embaixo do avatar, com três blocos:

| Bloco | Itens | Condição |
|---|---|---|
| Minha conta | Meu perfil, Favoritos, Minhas avaliações, Meus pedidos, Configurações | sempre |
| Meus anúncios | Desapega, Vagas, Imóveis publicados | se tiver algum |
| Meus negócios | Lista de negócios → cada um abre o Painel · "Cadastrar outro negócio" | se tiver algum |

**Comportamento adaptativo:**
- 0 negócios → o terceiro bloco não aparece; o header mostra "Anunciar meu negócio"
- 1 negócio → link direto para o painel; **"Cadastrar empresa" sai do header**
- 2+ negócios → lista com todos

**Bug atual a corrigir:** hoje o botão "Cadastrar empresa" continua no header mesmo para quem já tem negócio cadastrado.

---

## 4. Navegação

### 4.1 Portal — header

**Linha 1 (fixa, em todas as páginas):**
`[logo] [◉ Bairro ▾] [busca ─────────────] [Entrar] [Anunciar meu negócio]`

Logado, o par de botões vira `[🔔 notificações] [avatar]`.

**Linha 2 — navegação, apenas 3 famílias:**

| Item | Conteúdo |
|---|---|
| **Empresas ▾** | Comércios, Gastronomia, Serviços, Igrejas + subcategorias populares + lista de bairros |
| **Ofertas** | Cupons e promoções unificados numa página só |
| **Comunidade ▾** | Empregos, Imóveis, Desapega, Achados & Perdidos |

À direita: indicador `● N abertos agora`.

**Mudanças em relação ao atual:**
- Hoje o header logado tem 7 itens, sendo 5 de administração de empresa (Cupons, Promoções, Meu Painel, Planos, Produção) e **nenhuma** categoria de busca. Isso é o inverso do correto.
- As 8 categorias achatadas viram 3 famílias, porque hoje misturam duas naturezas diferentes: negócios cadastrados (perfis permanentes) e anúncios da comunidade (posts com validade).
- Cupons e Promoções, que hoje só existem como banner na home, ganham lugar no menu.
- **A busca fica visível em todas as páginas.** Hoje a faixa de categorias existe só na home, e a página de empresa não tem nem menu nem busca — só um "← Voltar ao Trindade Online" no rodapé. Quem cai pelo Google fica num beco sem saída.

### 4.2 Portal — mobile

Barra fixa no rodapé com 5 destinos: **Buscar · Empresas · Ofertas · Comunidade · Perfil**

Header mobile: logo + seletor de bairro + campo de busca, presente em **todas** as telas.

### 4.3 Painel — sidebar por frequência de uso

Agrupada por quantas vezes se abre por semana, não por assunto.

```
[Seletor de negócio ▾]

  Visão geral

TODO DIA
  Pedidos              (Loja+)
  Interesses           (Loja+)
  Mensagens            (Operação)
  Cozinha              (Operação)

MINHA LOJA
  Catálogo             (Loja+)
  Perfil e fotos       (Grátis+)
  Horários             (Grátis+)
  Entrega e retirada   (Loja+)

CLIENTES
  CRM                  (Operação)
  Avaliações           (Grátis+)

CRESCER
  Cupons               (Essencial+)
  Promoções            (Essencial+)
  Destaques            (Loja+)
  Banners              (Loja+)
  Relatórios           (Operação)

CONTA
  Plano e pagamento    (Grátis+)
  Meus negócios        (Grátis+)

[Bloco reservado: "Mesa e balcão — em breve"]

  Ver minha página
  Voltar ao site
  Sair
```

**Regra do bloqueio:** função sem plano **não some** — fica apagada, com ícone de cadeado, e o clique abre a tela de venda do plano. Esconder economiza pixel e perde venda, porque o dono nunca descobre que a função existe.

**Argumento de venda por nível de bloqueio:**
- Grátis vê "Botão de WhatsApp" apagado na tela de perfil
- Essencial vê "Catálogo" apagado com *"seus produtos apareceriam nas buscas do bairro"*
- Loja vê "Pedidos" apagado com o número de vezes que abriram seu catálogo

### 4.4 Modos — tela cheia, sem sidebar

Modo não é página de menu. É um estado que ocupa a tela toda e tem uma única saída.

| Modo | Rota | Dispositivo | Observação |
|---|---|---|---|
| Cozinha | `/cozinha` | Tablet na parede | Fundo escuro está **correto** — leitura à distância, ambiente quente e claro |
| Atendimento | `/atendimento` | Desktop | Inbox em foco, aberto o dia inteiro |

---

## 5. Rotas

### 5.1 Portal (público)

| Rota | Descrição | Status |
|---|---|---|
| `/` | Home do bairro | existe |
| `/[bairro]` | Home com bairro na URL | **novo** — depende da decisão de expansão |
| `/busca?q=` | Resultados: produtos + empresas | **novo** |
| `/categoria/[slug]` | Comércios, gastronomia, serviços, igrejas | existe |
| `/empresa/[slug]` | Página pública do negócio | existe |
| `/empresa/[slug]/menu` | Catálogo público | mover de `/cardapio` |
| `/aberto-agora` | Quem está funcionando neste momento | **novo** |
| `/ofertas` | Cupons + promoções unificados | unificar 2 páginas |
| `/empregos`, `/imoveis`, `/desapega`, `/achados-perdidos` | Comunidade | existe |
| `/planos` | Página de venda dos planos | **novo** |
| `/anunciar` | Cadastro de negócio | mover de `/empresa/cadastrar` |

### 5.2 Loja (público, dentro do negócio)

| Rota | Descrição | Status |
|---|---|---|
| `/empresa/[slug]/menu` | Catálogo com preço e foto | existe |
| `/empresa/[slug]/item/[id]` | **Produto individual — indexável no Google** | **novo, crítico** |
| `/empresa/[slug]/carrinho` | Carrinho | existe |
| `/empresa/[slug]/checkout` | Entrega ou retirada, Pix ou cartão | existe |
| `/pedido/[id]` | Acompanhamento pelo cliente | **novo** |

> **Por que a rota por item é crítica:** hoje o catálogo inteiro vive numa página só, então "2 pães de picanha por R$ 59,90" não tem endereço próprio para ranquear. Sem rota por item, não existe indexação de produto no Google — e a busca por produto perde metade do valor.

### 5.3 Operação (privado)

| Rota | De onde vem |
|---|---|
| `/painel` | existe |
| `/painel/pedidos` | mover de `/painel/crm/pedidos` |
| `/painel/interesses` | **novo** |
| `/painel/mensagens` | mover de `/painel/crm/mensagens` |
| `/painel/catalogo` | mover de `/painel/crm/catalogo` |
| `/painel/perfil` | existe |
| `/painel/horarios` | **novo** |
| `/painel/entrega` | **novo** |
| `/painel/clientes` | mover de `/painel/crm/clientes` |
| `/painel/avaliacoes` | existe |
| `/painel/cupons`, `/painel/promocoes` | existe |
| `/painel/destaques`, `/painel/banners` | existe |
| `/painel/relatorios` | **novo** |
| `/painel/plano` | existe |
| `/painel/negocios` | **novo** — trocar de negócio, cadastrar outro |

> Nota: catálogo não é CRM. O prefixo `/painel/crm/` deve sair de tudo que não for relacionamento com cliente.

### 5.4 Conta (pessoa)

`/conta` · `/conta/favoritos` · `/conta/avaliacoes` · `/conta/anuncios` · `/conta/pedidos` *(novo)*

### 5.5 Modos

`/cozinha` · `/atendimento`

---

## 6. Planos

### 6.1 Os quatro degraus

| Plano | Promessa | Preço |
|---|---|---|
| **Grátis** | Estar no mapa do bairro | R$ 0 |
| **Essencial** | Ser contatado e divulgado | *a definir* |
| **Loja** | Vender pelo catálogo | *a definir* |
| **Operação** | Rodar o negócio inteiro aqui | *a definir* |

**Princípio que organiza tudo:** *ser encontrado é de graça; ser contatado é pago.*

### 6.2 Matriz de funções

| Função | Grátis | Essencial | Loja | Operação |
|---|:---:|:---:|:---:|:---:|
| **Presença no portal** |
| Página pública, endereço, mapa, categoria | ✓ | ✓ | ✓ | ✓ |
| Horários e "Aberto agora" | ✓ | ✓ | ✓ | ✓ |
| Busca por palavra-chave | ✓ | ✓ | ✓ | ✓ |
| Avaliações (receber e responder) | ✓ | ✓ | ✓ | ✓ |
| Fotos | 1 | 5 | 10 | 20 |
| Botão de WhatsApp | — | ✓ | ✓ | ✓ |
| Redes sociais e link externo | — | ✓ | ✓ | ✓ |
| **Divulgação** |
| Cupons e promoções (validação manual) | — | ✓ | ✓ | ✓ |
| Cupom aplicado automático no checkout | — | — | ✓ | ✓ |
| Destaques e banners | — | — | ✓ | ✓ |
| **Catálogo e venda** |
| Catálogo de produtos | — | — | ✓ | ✓ |
| Produtos indexados na busca do bairro | — | — | ✓ | ✓ |
| Página própria por produto | — | — | ✓ | ✓ |
| Link e QR code do catálogo | — | — | ✓ | ✓ |
| Pedido e checkout | — | — | ✓ | ✓ |
| **Entrega e retirada** | — | — | ✓ | ✓ |
| Interesses (valor e volume) | — | — | ✓ | ✓ |
| **Operação** |
| Modo Cozinha | — | — | — | ✓ |
| Mensagens (inbox) | — | — | — | ✓ |
| CRM (clientes) | — | — | — | ✓ |
| Relatórios completos | — | — | — | ✓ |
| Identificação de quem enviou interesse | — | — | — | ✓ |
| Mesa e balcão | — | — | — | *roadmap* |

### 6.3 Decisões e justificativas

**Por que busca por palavra-chave está no Grátis:** um diretório com buracos não é um diretório. Se o morador busca "chaveiro", não acha nada, e existe um chaveiro cadastrado que não apareceu, quem foi punido foi a busca — não o chaveiro. Bônus: quanto mais negócio no índice, mais página indexada, mais tráfego orgânico. **O plano Grátis é aquisição de tráfego.**

**Por que horários estão no Grátis:** é o que alimenta o "Aberto agora". Queremos 100% da base preenchendo, não só quem paga. É a única função onde o interesse da plataforma e o do lojista coincidem antes do dinheiro.

**Por que "Loja" inclui entrega:** a pizzaria da esquina é o cliente mais óbvio e quer delivery, mas não quer mesa, balcão nem CRM. Se entrega ficasse no Operação, ela seria empurrada para o plano mais caro por causa de uma única função.

**Diferença de cupom entre Essencial e Loja:** no Essencial o cupom é validado à mão pelo lojista no painel (o gerador e o validador já existem). No Loja ele se aplica sozinho no checkout e o sistema conta uso e valor. Mesma função, duas qualidades — assim o Essencial ganha cupom sem esvaziar o Loja.

**Teto de ofertas ativas (sugestão a validar):** 2 no Essencial, 5 no Loja, ilimitado no Operação. A aba Ofertas é território nobre; se virar mural de cupom velho, o morador para de abrir. Ordenar por relevância, não por data.

### 6.4 Vocabulário adaptativo por categoria

Mesma engine, rótulo diferente. Decide se o plano do meio vende para 40% ou 100% da base.

| Categoria | "Catálogo" vira | "Interesse/Pedido" vira |
|---|---|---|
| Gastronomia | Cardápio | Pedido |
| Comércio | Catálogo | Pedido |
| Serviços | Tabela de preços | Orçamento |

> **Consequência para o nome do plano:** "Loja" fecha a porta na cara do contador, da corretora de seguros e da empresa de segurança — que representam boa parte do diretório e poderiam usar a mesma função como tabela de preço. Sugestão de renomear para algo neutro (Negócio, Profissional). **Decisão pendente.**

---

## 7. Busca por produto

O ativo mais valioso do sistema. Existe um catálogo estruturado (nome, foto, preço, categoria) de vários negócios do mesmo bairro — um índice que nenhum concorrente local tem.

### 7.1 O que muda

Buscar "picanha" na Trindade devolve **o produto, com preço, do negócio que está aberto agora**. O Google não faz isso. O iFood faz, mas não tem a padaria, o açougue nem a saboaria do bairro.

### 7.2 Regras de indexação

- **Produto sem foto não entra no índice.** Aparece no painel como pendência.
- **Produto pausado ou sem estoque sai do índice** imediatamente.
- Preço e disponibilidade viram públicos e comparáveis entre vizinhos — precisam estar corretos.
- Só negócios com plano Loja ou Operação têm produtos indexados.

### 7.3 Ordenação — decisão sensível

**Padrão: relevância.** "Mais perto" e "Menor preço" existem como opções, mas não são o padrão e não ficam em destaque.

> **Motivo:** ordenar por preço transforma o portal num comparador de bairro e coloca a plataforma na posição de ajudar o morador a escolher o mais barato entre dois clientes pagantes. Quando o açougue e o mercadinho da mesma rua ficam comparáveis lado a lado, alguém reclama.

Pelo mesmo motivo: **na página de produto, os relacionados são do mesmo negócio**, nunca de concorrentes.

### 7.4 Sequência de ativação — importante

A busca por produto é o argumento para vender o plano com catálogo, mas só quem paga cadastra produto. É pescadinha mordendo o rabo.

**Não ligar a busca por produto com poucos catálogos cadastrados.** Vitrine com quatro itens queima a ideia. Manter desligada, usar o período como isca de venda (*"cadastre agora; na virada seus produtos entram na busca do bairro"*) e ligar quando houver massa mínima.

### 7.5 Ciclo completo

1. Morador busca um produto, não um nome de empresa
2. Produto aparece — só de quem tem plano com catálogo
3. Abre a loja do negócio
4. Pedido cai no painel
5. Dono vê no relatório: *"você apareceu em 128 buscas por camisa personalizada"*

### 7.6 Dado agregado — ativo da plataforma

Interesse e busca agregados por bairro são mapa de demanda: *"buscaram churrasco 140 vezes na Trindade neste mês e nenhum negócio cadastrado atende"*. Isso é lista de prospecção, argumento de venda e conteúdo. Ninguém mais tem esse dado no bairro.

No painel do lojista, versão individual: termos buscados no bairro para os quais ele **não** tem produto correspondente aparecem marcados como demanda perdida.

---

## 8. Interesses — entidade nova

### 8.1 Definição

> **Interesse** = o cliente montou um carrinho com valor e enviou. Nasce e fica.
> **Pedido** = alguém confirmou que virou venda.

**Um interesse nunca vira pedido sozinho.** Isso mantém o dado honesto.

### 8.2 Por que existe

Mesmo que o lojista não conclua a venda nem preencha envio e entrega, o registro de interesse com valor fica gravado. É dado rico: mostra volume de demanda real, não só cliques.

### 8.3 O problema de identidade e a solução

Quando o cliente aperta "enviar no WhatsApp", a mensagem sai do celular dele para o do dono. **O servidor não fica sabendo o número.** O interesse nasce sem rosto.

**Solução adotada: anônimo com código na mensagem.**

- Não pedir nome nem telefone antes de abrir o WhatsApp — é o maior matador de conversão nesse fluxo, e o cliente já vai se identificar na conversa
- A mensagem que vai para o WhatsApp carrega um **código curto**
- Quem tem o inbox (plano Operação) tem o código lido automaticamente na conversa e o interesse amarrado ao número

**Consequência comercial:** no plano Loja o dono vê *"R$ 4.320 em interesse este mês, 38 carrinhos"*. No Operação ele vê **quem** foi cada um. O buraco vende o plano de cima sem precisar de argumento — é o produto construindo o próprio upsell.

### 8.4 Confirmação de venda

Um toque em **"Virou venda? Sim / Não"** dá a taxa de conversão sem obrigar o dono a gerenciar pedido.

Estados: `virou venda` · `não fechou` · `sem resposta` (default após N dias).

### 8.5 Rótulo — obrigatório

Se o painel mostrar "R$ 4.320" e o dono tiver vendido R$ 900, ele vai achar que o sistema mente. **Todo lugar que exibe interesse precisa dizer explicitamente que é interesse, não venda.**

### 8.6 Campos

`id` · `business_id` · `criado_em` · `itens[]` (produto, qtd, preço unitário, observações) · `valor_total` · `origem` (link WhatsApp / QR balcão / status / portal) · `codigo` · `cliente_id` (nullable) · `status_venda`

---

## 9. Link e QR do catálogo

### 9.1 Fluxo

```
Dono copia o link no painel
        ↓
Manda no WhatsApp (conversa, grupo, status)  ou  QR no balcão/sacola/fachada
        ↓
Cliente abre a loja — preview com a marca do negócio
        ↓
Monta o pedido
        ↓
   ┌────────────────────────┬─────────────────────────┐
   │ Plano LOJA             │ Plano OPERAÇÃO          │
   │ volta como mensagem    │ checkout, Pix, entrega  │
   │ pronta no WhatsApp     │ pedido cai no painel    │
   │ dono fecha na conversa │ vai pra Cozinha         │
   └────────────────────────┴─────────────────────────┘
        ↓
Interesse registrado com valor nos dois casos
```

### 9.2 Três granularidades de link

| Link | Uso típico |
|---|---|
| Catálogo inteiro | Mandar no status, divulgação ampla |
| Categoria | *"olha só os combos"* |
| Produto único | *"é esse aqui, R$ 59,90"* — o mais usado no dia a dia |

O terceiro exige a rota `/empresa/[slug]/item/[id]`.

### 9.3 Preview do link — requisito

Se o dono cola no WhatsApp e aparece um card genérico escrito "Trindade Online", parece link de propaganda e ninguém clica.

**Cada catálogo e cada produto precisa gerar `og:image`, `og:title` e `og:description` próprios, com a identidade do negócio.** (Ver seção 12 — isso hoje está quebrado em toda a plataforma.)

### 9.4 QR code

Canal subestimado e de custo quase zero. Cola no balcão, na sacola, na porta, na mesa. Para negócio de bairro funciona melhor que anúncio pago. Gerar automaticamente no painel, pronto para impressão.

### 9.5 Formato da mensagem de volta

Precisa ser lida em três segundos: **nome do cliente · itens com quantidade · total · entrega ou retirada · código**. Texto corrido não serve — o dono continuaria fazendo conta na mão, que é justamente o trabalho que prometemos tirar dele.

---

## 10. Especificação de telas

### 10.1 Portal — Home

Ordem dos blocos:

1. **Hero de busca** — headline: *"Ache pelo produto, nome da loja ou segmento"*. Campo grande estilo placa, chips de atalho com coisas que se compra (pizza, farmácia, camisa personalizada, manicure) + toggle "Aberto agora"
2. **Produtos no bairro** — esteira com preço, nome do negócio e distância. Prova visível de que a busca por produto existe
3. **Categorias** — grade de 8 com ícone (4×2 no mobile)
4. **Aberto agora** — faixa dinâmica com relógio, muda ao longo do dia. É o motivo de retorno diário
5. **Ofertas do bairro** — cupons e promoções unificados em cards reais com validade e nome do negócio
6. **Novos na Trindade** — recém-cadastrados dos últimos 30 dias. Recompensa quem acabou de pagar
7. **Comunidade** — **um bloco com abas** (Empregos · Imóveis · Desapega · Achados), não quatro esteiras separadas. Corta cerca de 60% da altura
8. **Faixa "anuncie"** com números reais (negócios, buscas/mês, cliques no WhatsApp)
9. Rodapé

### 10.2 Portal — Busca

- Título: *"Picanha na Trindade"* + contagem (*"6 produtos em 3 negócios · 2 negócios sem catálogo"*)
- Abas: Tudo · Produtos · Negócios
- **Produtos vêm primeiro** (foi o que a pessoa digitou); negócios depois, como contexto
- Filtros: disponibilidade (aberto agora, entrega, retirada), distância, categoria, extras (com cupom, aceita Pix, bem avaliados), ordenação
- **Desktop:** coluna lateral de filtros. **Mobile:** gaveta (bottom sheet) com contagem em cada opção e botão dizendo *"Ver 6 resultados"* — ninguém aplica filtro e cai em tela vazia sem entender
- Negócio no plano Grátis **aparece** no resultado, com o rótulo "sem catálogo" e sem botão de contato

### 10.3 Portal — Página da empresa

- Header com busca presente (corrige o beco sem saída)
- Hero com foto, contador de galeria
- Status "aberto/fechado · fecha às Xh", nota, distância
- Ação primária: **Chamar no WhatsApp** (verde) + como chegar, favoritar, compartilhar
- Abas: **Cardápio/Catálogo primeiro**, depois Ofertas, Avaliações, Sobre
- **Desktop:** grade de produtos. **Mobile:** lista horizontal com foto pequena e descrição — grade de dois em dois só funciona com nome curto
- **Barra de carrinho fixa no rodapé desde o primeiro item.** Sem isso a pessoa adiciona e não descobre como enviar
- Texto do botão do carrinho muda por plano: Loja = *"Enviar pedido no WhatsApp"*, Operação = *"Finalizar pedido"*
- Rodapé: "Quem viu isso, viu também" — mantém a navegação viva

### 10.4 Portal — Página da empresa no plano Grátis

Tela crítica: é ela que decide se o Grátis ajuda ou atrapalha.

- Precisa ser **útil de verdade**: horário, endereço, mapa, "aberto agora", categoria. Se parecer quebrada, a credibilidade que se quis ganhar vira o contrário
- Sem botão de WhatsApp. No lugar, um bloco: *"Este negócio ainda não ativou o contato direto — você pode ir até o endereço acima. É o seu negócio? Ative o WhatsApp aqui →"*
- **O convite fica exatamente onde é visto por quem tentou falar com ele e não conseguiu.** A página do Grátis vira canal de venda
- Aba "Cardápio" aparece bloqueada
- Rodapé mostra produtos de concorrentes que **têm** catálogo — honesto sobre o custo de não pagar

### 10.5 Portal — Página do produto

- Breadcrumb: Bairro › Categoria › Negócio › Produto
- Galeria, nome, preço grande, parcelamento
- Status do negócio e tempo de entrega
- Descrição
- **Opções obrigatórias e adicionais** (ponto da carne, tamanho, acompanhamentos). Sem isso o pedido chega incompleto no WhatsApp e o lojista pergunta tudo de novo na conversa
- Card do vendedor com link para o cardápio
- Campo de observação
- Barra fixa: quantidade + *"Enviar no WhatsApp · R$ 59,90"*
- Relacionados: **do mesmo negócio**

### 10.6 Painel — Visão geral

**KPIs com comparação, nunca número solto.** "47 visualizações" sozinho não diz se é bom ou ruim.

- Cliques no WhatsApp (destaque) · Interesse recebido (com rótulo *"interesse, não venda"*) · Apareceu em buscas · Visualizações
- Seletor de período: 7 / 30 / 90 dias
- **"Para fazer agora"** — substitui o "Ações rápidas" que hoje tem título e nada embaixo. Lista de pendências acionáveis com botão:
  - Horário em branco → fora do "Aberto agora"
  - N produtos sem foto → fora da busca
  - N interesses sem resposta há X dias, somando R$ Y
  - Nenhum cupom ativo
- **"Como te encontraram"** — termos buscados, com marcação de demanda perdida
- Avaliação recente com botões de responder e compartilhar

### 10.7 Painel — Pedidos

- Kanban: Recebido · Em preparo · Pronto · Saiu p/ entrega · Entregue · Cancelados
- **Coluna vazia encolhe** para uma tira estreita em vez de ocupar 20% da largura. Hoje quatro colunas vazias comem 60% da tela e o conteúdo real fica comprimido
- Pagamento é **estado do pedido**. Hoje aparece "entregue · pendente", que é uma combinação que não pode existir — ou o fluxo de pagamento não fecha, ou o rótulo está errado
- Pedido parado mais tempo que o combinado ganha borda vermelha
- **Mobile:** kanban não sobrevive. Vira filtro de status no topo + lista vertical. Uma ação principal grande por cartão (avança de estado) + botão de WhatsApp + "⋯"

### 10.8 Painel — Catálogo

- Medidor "Qualidade do catálogo" — **manter, é a melhor ideia de produto do painel atual**
- **As três faixas de importação saem do caminho e viram um botão "Importar ▾".** São ações de setup, feitas uma vez, e hoje ocupam meia tela todo dia
- Filtros úteis: Tudo · Fora da busca · Sem foto · categorias
- Cada card mostra se está entrando na busca do bairro
- **Margem só aparece quando existe custo cadastrado.** Hoje todo produto mostra "100% margem" porque o custo está vazio — o dado é falso em 100% dos casos
- **Mobile:** lista com interruptor de pausar. **Essa é a função mais valiosa do app.** Acabou a linguiça às 20h, o dono pausa de dentro do balcão com o polegar. Sem isso ele recebe pedido do que não tem e o cliente fica bravo com ele, não com a plataforma

### 10.9 Painel — Interesses

- KPIs: interesse recebido · carrinhos enviados · % virou venda · ticket médio
- Filtros: todos · sem resposta · virou venda
- Tabela: quando · itens · valor · origem · quem · virou venda?
- "Não identificado" para quem não tem inbox — **é esse buraco que vende o plano Operação**

### 10.10 Painel — Clientes (CRM)

- Colunas: cliente · último contato · origem · interesse · comprou · ação
- **Fallback de nome:** telefone formatado. Hoje aparece "Sem nome", "." e emoji como nome de cliente
- Filtros acionáveis: compraram · **interesse sem compra** (a lista de quem quase comprou) · só conversaram · sumidos 30d+
- Hoje a tela repete "0 pedidos · R$ 0,00 gasto · Sem compra" 91 vezes — mostra a ausência de dado em vez do dado que existe. E "Sumidos 30d+ (89)" de 91 é um filtro que não filtra nada

### 10.11 Modo Cozinha

- Fundo escuro (correto, manter)
- Três colunas: Recebido · Em preparo · Pronto
- Número do pedido grande, **quantidade destacada em amarelo**, tempo decorrido, observação do cliente em evidência
- **Um botão só por cartão**, que avança de estado
- Pedido atrasado muda de cor sozinho
- **É tela de tablet.** Não fazer versão de celular — espremer estragaria as duas

### 10.12 Painel mobile

**Regra:** o celular serve para **reagir**; o computador serve para **configurar**.

Barra fixa: **Hoje · Pedidos · Interesses · Conversas · Mais**

- **Hoje:** alerta no topo (pedido atrasado), KPIs compactos, "para fazer", como te encontraram
- **Mais:** menu completo. Itens que não fazem sentido no celular ficam listados com a etiqueta **"No computador"** — não somem, mas também não fingem que raio de entrega se configura com o polegar. São eles: Entrega e retirada, Destaques, Banners, Relatórios. Cozinha aparece com a etiqueta "Tablet"

**Notificações push — o motivo real de instalar:**
1. Pedido novo (com valor e itens)
2. Pedido atrasado
3. Carrinho grande sem resposta — é o que transforma Interesses de relatório em ferramenta

---

## 11. Design system

### 11.1 Direção visual

**Placa de comércio de bairro**, não "ouro premium". Amarelo de toldo em bloco sólido, preto quente, cinza-calçada. O elemento assinatura do portal é o campo de busca como uma placa física amarela.

Mantém o padrão de marca atual (segunda palavra em destaque) para não jogar fora o reconhecimento.

### 11.2 Tokens

```css
--ink:        #151210;  /* preto quente */
--ink-2:      #231F1B;
--paper:      #FFFFFF;
--concrete:   #E9EAE5;  /* fundo */
--concrete-2: #F5F6F2;  /* fundo claro */
--sign:       #FFC531;  /* amarelo placa — cor de assinatura */
--sign-dark:  #A87200;  /* amarelo para texto sobre claro */
--open:       #0F8A57;  /* aberto, WhatsApp, sucesso */
--alert:      #D6392B;  /* atrasado, erro, cupom relâmpago */
--info:       #2A4E7A;
--warn:       #C97A0E;
--line:       #DCDDD6;
--muted:      #6F6C67;
```

Restrição: `--sign` é a única cor de assinatura, usada em **blocos sólidos**. Verde só para status "aberto" e WhatsApp. Vermelho só para atraso e urgência.

### 11.3 Tipografia

| Papel | Fonte |
|---|---|
| Display | **Anton** (condensada pesada) — vernáculo de placa de comércio |
| Interface e texto | **Archivo** |

**A tipografia atual não é ruim — o uso é.** Condensada em caixa alta é a escolha certa para o assunto; o erro é usá-la em tudo: título do site, títulos de seção, rótulos e nomes de empresa. Quando tudo é caixa alta e condensado, nada tem hierarquia, e nome longo em caixa alta fica ilegível ("SM KARAOKÊ -ALUGUEL DE KARAOKE /TOTO/ FLIPERAMA").

**Regras:**
- Display só em título de página, número grande e faixa de destaque
- Nome de empresa, de produto e de cliente: **caixa normal**, sempre
- Rótulo em caixa alta só com tamanho pequeno e entreletra ampla, como etiqueta
- Portal: corpo 15px. Painel: corpo 14px, mais denso

---

## 12. Correções de dívidas existentes

Encontradas durante a análise. Ordenadas por impacto.

| # | Problema | Impacto | Onde |
|---|---|---|---|
| 1 | **Todas as páginas compartilham a mesma `canonical`, `og:title` e `meta-description` da home** | Crítico. SEO é o canal principal de aquisição e está anulado. Também quebra o preview de qualquer link compartilhado no WhatsApp | Global |
| 2 | Página de empresa sem header nem busca — só um "voltar" no rodapé | Quem chega pelo Google não tem como continuar. Derruba páginas por sessão | `/empresa/[slug]` |
| 3 | Imóveis exibindo preço de venda como aluguel: "CASA DE 1 QUARTO — R$ 170.000**/mês**" nos 4 anúncios | Mata credibilidade | Home / Imóveis |
| 4 | "100% margem" em todos os produtos porque o campo de custo está vazio | Dado falso em 100% dos casos | `/painel/catalogo` |
| 5 | Pedidos "entregues" com pagamento "pendente" | Estado impossível — verificar se é o fluxo ou o rótulo | `/painel/pedidos` |
| 6 | Clientes com nome "Sem nome", "." e emoji | Falta fallback para telefone | `/painel/clientes` |
| 7 | Filtro "Sumidos 30d+ (89)" de 91 clientes | Filtro que não filtra | `/painel/clientes` |
| 8 | "Ações Rápidas" com título e nenhum conteúdo | Espaço morto no dashboard | `/painel` |
| 9 | Botão "Cadastrar empresa" no header de quem já tem empresa | Lógica de exibição | Header |
| 10 | Nome duplicado nos cards ("DRY BROWNIE DRY BROWNIE") | Possivelmente o `alt` da logo — **verificar se aparece na tela** | Home |
| 11 | Quatro colunas vazias ocupando 60% da largura em Pedidos | Conteúdo real comprimido | `/painel/pedidos` |
| 12 | Três faixas de importação ocupando meia tela acima dos produtos | Ação de setup no caminho diário | `/painel/catalogo` |
| 13 | Módulos de gastronomia (Cardápio, Cozinha, Pedidos) visíveis para negócio de Comércios | Neste caso foi teste, mas a regra de exibição por plano precisa existir | Sidebar |

> **Sobre a #1:** na minha leitura é o item de maior retorno do site inteiro, acima de qualquer mudança visual. Recomendo tratar antes do redesenho.

---

## 13. Ordem de implementação sugerida

**Fase 0 — Fundação (antes de qualquer tela)**
1. Corrigir `canonical`, `og:*` e `meta-description` por página (dívida #1)
2. Criar tabela `membership` (pessoa ↔ negócio ↔ papel)
3. Unificar o cadastro: `/anunciar` cria pessoa no passo 1
4. Reorganizar rotas (`/painel/crm/*` → `/painel/*`)
5. Criar rota `/empresa/[slug]/item/[id]` e o `og:image` por produto
6. Corrigir dívidas #3 a #12

**Fase 1 — Portal**
7. Header fixo com busca em todas as páginas + seletor de bairro
8. Menu de 3 famílias + menu único do usuário
9. Bottom tab bar mobile
10. Home reestruturada
11. Página de empresa (incluindo o estado do plano Grátis)

**Fase 2 — Painel**
12. Sidebar por frequência + gating por plano com cadeado
13. Visão geral com "para fazer"
14. Pedidos, Catálogo, Clientes corrigidos
15. Modos Cozinha e Atendimento em tela cheia
16. Painel mobile + push

**Fase 3 — Catálogo e busca por produto**
17. Cadastro de horários (alimenta "Aberto agora")
18. Entidade Interesse + código na mensagem
19. Link e QR do catálogo em três granularidades
20. Índice de produtos — **construir, mas manter desligado**
21. Ligar a busca por produto quando houver massa mínima de catálogos

**Fase 4 — Roadmap**
22. Mesa e balcão (traz equipe e permissões junto)
23. Expansão para outros bairros

---

## 14. Decisões pendentes

| # | Pendência | Por que importa | Custo de adiar |
|---|---|---|---|
| 1 | **Preços dos três planos pagos** | A matriz da seção 6 está completa em funções, mas sem valores | Baixo — não trava código |
| 2 | **Marca: um nome ou dois** (portal + ferramenta) | Decide a assinatura de cabeçalho do painel e o domínio | Médio — retrabalho de identidade |
| 3 | **Nome do plano "Loja"** | "Loja" exclui contador, corretora, segurança — que poderiam usar como tabela de preço | Baixo, mas afeta conversão |
| 4 | **Expansão para São Gonçalo** | Muda URL, busca, SEO e marca. Hoje é um campo a mais no cadastro; depois é refazer tudo | **Alto** |
| 5 | Quinto slot da tab bar do painel mobile quando o plano não tem Conversas | Barra que muda de item entre planos pode confundir quem faz upgrade | Baixo |
| 6 | Tela de carrinho/revisão mobile — duas versões (Loja e Operação) | Não desenhada ainda | Baixo |
| 7 | O validador de cupom atual registra **valor** ou só marca "usado"? | Sem valor, não conversa com a lógica de Interesse | Baixo |
| 8 | Teto de ofertas ativas por plano | Evita que a aba Ofertas vire varal | Baixo |

---

## 15. Princípios para consultar em caso de dúvida

1. **O portal é o funil; o sistema é o produto.** Na dúvida entre morador e lojista, ganha o lojista — desde que o morador continue tendo motivo para voltar.
2. **Ser encontrado é de graça; ser contatado é pago.**
3. **Função bloqueada não some — fica visível com cadeado.** Esconder economiza pixel e perde venda.
4. **Celular reage; computador configura.**
5. **Interesse não é venda.** Nenhuma tela pode confundir os dois.
6. **Relevância, não preço.** Não transformar o portal num comparador contra quem paga.
7. **Número solto não diz nada.** Todo KPI precisa de comparação ou contexto.
8. **Dado falso corrói mais que dado ausente.** Melhor não mostrar do que mostrar errado.
9. **Modo não é página de menu.** Cozinha e Atendimento ocupam a tela toda.
10. **A vantagem é o bairro.** Toda decisão de escopo passa por esse teste.
