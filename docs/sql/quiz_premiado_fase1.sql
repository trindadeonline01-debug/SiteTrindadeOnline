-- Quiz Premiado (4/nov/2026). Todas as tabelas com RLS ligado e SEM policies: só o servidor
-- (service role) lê/escreve. Ver docs/DESENHO_QUIZ.md.

create table if not exists public.quiz_perguntas (
  id text primary key,
  nivel smallint not null check (nivel in (1,2,3)),            -- 1 fácil, 2 médio, 3 difícil
  categoria text not null,
  enunciado text not null,
  opcoes jsonb not null,                                        -- ["certa","errada1","errada2","errada3"] (a 1ª é a certa; o servidor embaralha)
  curiosidade text,
  fonte text,
  status text not null default 'gerada',                        -- revisado_para_piloto | gerada
  ativa boolean not null default true,
  criada_em timestamptz not null default now()
);
create index if not exists quiz_perguntas_nivel_idx on public.quiz_perguntas (nivel) where ativa;

create table if not exists public.quiz_campanhas (
  company_id uuid primary key references public.companies(id) on delete cascade,
  ativa boolean not null default false,
  premio_ativo boolean not null default false,
  modo text not null default 'percentual' check (modo in ('percentual','fixo')),
  -- valor de cada marco de acertos: % da conta (modo percentual) ou R$ (modo fixo)
  marcos jsonb not null default '{"2":2,"3":3,"5":5,"6":6,"8":8,"10":10}',
  teto_valor numeric not null default 50,                       -- teto em R$ (modo percentual)
  atualizado_em timestamptz not null default now()
);

create table if not exists public.quiz_rodadas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  comanda_id uuid not null references public.loja_comandas(id) on delete cascade,
  jogador_key text not null,                                    -- id do aparelho (anônimo)
  premiada boolean not null default false,                      -- 1ª rodada da conta: a que pode gerar prêmio
  estado text not null default 'jogando' check (estado in ('jogando','portao','risco','encerrada')),
  acertos int not null default 0,
  pontos int not null default 0,
  marco int not null default 0,                                 -- nível garantido: 0,2,3,5,6,8,10
  pulos_usados smallint not null default 0,
  pensar_usados smallint not null default 0,
  motivo_fim text,                                              -- erro | tempo | parou | abandono | banco_esgotado
  iniciada_em timestamptz not null default now(),
  encerrada_em timestamptz,
  atualizada_em timestamptz not null default now()
);
create index if not exists quiz_rodadas_comanda_idx on public.quiz_rodadas (comanda_id);
create index if not exists quiz_rodadas_company_idx on public.quiz_rodadas (company_id, iniciada_em desc);
-- só UMA rodada premiada por conta
create unique index if not exists quiz_rodadas_premiada_unica on public.quiz_rodadas (comanda_id) where premiada;

create table if not exists public.quiz_rodada_itens (
  id uuid primary key default gen_random_uuid(),
  rodada_id uuid not null references public.quiz_rodadas(id) on delete cascade,
  ordem int not null,
  pergunta_id text not null references public.quiz_perguntas(id),
  ordem_opcoes smallint[] not null,                              -- ordem_opcoes[i] = índice (no banco) da alternativa exibida na posição i
  servida_em timestamptz not null default now(),
  prazo timestamptz not null,
  pensar boolean not null default false,
  resposta smallint,                                             -- posição escolhida (0-3); null = pulo/tempo
  acertou boolean,
  pontos int not null default 0,
  respondida_em timestamptz
);
create index if not exists quiz_rodada_itens_rodada_idx on public.quiz_rodada_itens (rodada_id, ordem);

-- memória do que cada jogador já viu: nunca repete enquanto houver pergunta nova
create table if not exists public.quiz_vistas (
  jogador_key text not null,                                     -- 'd:<aparelho>' ou 'p:<telefone>'
  pergunta_id text not null references public.quiz_perguntas(id) on delete cascade,
  vista_em timestamptz not null default now(),
  primary key (jogador_key, pergunta_id)
);

create table if not exists public.quiz_premios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rodada_id uuid not null unique references public.quiz_rodadas(id) on delete cascade,
  comanda_id uuid not null references public.loja_comandas(id) on delete cascade,
  marco int not null,
  estado text not null default 'pendente' check (estado in ('pendente','liberado','sem_telefone','cancelado')),
  valor numeric,                                                 -- calculado ao fechar a conta
  liberado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists quiz_premios_comanda_idx on public.quiz_premios (comanda_id);

alter table public.quiz_perguntas enable row level security;
alter table public.quiz_campanhas enable row level security;
alter table public.quiz_rodadas enable row level security;
alter table public.quiz_rodada_itens enable row level security;
alter table public.quiz_vistas enable row level security;
alter table public.quiz_premios enable row level security;
