-- Quiz em grupo (nov/2026): sala com código, 15 perguntas iguais para todos, ranking individual e de grupos.
-- Sem cashback (decisão do Ricardo): só diversão e ranking. Tabelas só do servidor (RLS ligada, sem policies).

create table if not exists public.quiz_salas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mesa_id uuid references public.loja_mesas(id) on delete set null,
  codigo text not null,
  nome text not null,
  anfitriao_id uuid not null references public.quiz_jogadores(id) on delete cascade,
  estado text not null default 'espera' check (estado in ('espera','jogando','encerrada','cancelada')),
  iniciada_em timestamptz,
  encerrada_em timestamptz,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  n_jogadores integer,
  pontos_total integer,
  pontos_media numeric
);
create unique index if not exists quiz_salas_codigo_ativo on public.quiz_salas (company_id, codigo) where estado in ('espera','jogando');
create index if not exists quiz_salas_mesa on public.quiz_salas (mesa_id, estado);
create index if not exists quiz_salas_company_enc on public.quiz_salas (company_id, encerrada_em) where estado = 'encerrada';

create table if not exists public.quiz_sala_jogadores (
  sala_id uuid not null references public.quiz_salas(id) on delete cascade,
  jogador_id uuid not null references public.quiz_jogadores(id) on delete cascade,
  pontos integer not null default 0,
  acertos integer not null default 0,
  tempo_ms bigint not null default 0,
  entrou_em timestamptz not null default now(),
  primary key (sala_id, jogador_id)
);
create index if not exists quiz_sala_jogadores_jog on public.quiz_sala_jogadores (jogador_id);

create table if not exists public.quiz_sala_perguntas (
  sala_id uuid not null references public.quiz_salas(id) on delete cascade,
  ordem smallint not null,
  pergunta_id text not null,
  ordem_opcoes smallint[] not null,
  primary key (sala_id, ordem)
);

create table if not exists public.quiz_sala_respostas (
  sala_id uuid not null references public.quiz_salas(id) on delete cascade,
  ordem smallint not null,
  jogador_id uuid not null references public.quiz_jogadores(id) on delete cascade,
  pos smallint not null,
  acertou boolean not null,
  pontos integer not null default 0,
  tempo_ms integer not null default 0,
  respondida_em timestamptz not null default now(),
  primary key (sala_id, ordem, jogador_id)
);

alter table public.quiz_salas enable row level security;
alter table public.quiz_sala_jogadores enable row level security;
alter table public.quiz_sala_perguntas enable row level security;
alter table public.quiz_sala_respostas enable row level security;

-- Ranking individual do quiz em grupo: melhor partida (pontos) de cada jogador.
create or replace function public.quiz_ranking_duelo(p_company uuid, p_desde timestamptz, p_limite integer)
returns table(posicao bigint, jogador_id uuid, apelido text, pontos integer, acertos integer, total bigint)
language sql security definer set search_path to 'public' as $$
  with melhor as (
    select distinct on (sj.jogador_id) sj.jogador_id, sj.pontos, sj.acertos, s.encerrada_em
      from public.quiz_sala_jogadores sj join public.quiz_salas s on s.id = sj.sala_id
     where s.company_id = p_company and s.estado = 'encerrada' and (p_desde is null or s.encerrada_em >= p_desde)
     order by sj.jogador_id, sj.pontos desc, s.encerrada_em asc),
  ord as (
    select m.jogador_id, j.apelido, m.pontos, m.acertos,
           row_number() over (order by m.pontos desc, m.encerrada_em asc) as pos, count(*) over () as tot
      from melhor m join public.quiz_jogadores j on j.id = m.jogador_id where j.aceite_ranking)
  select pos, jogador_id, apelido, pontos, acertos, tot from ord order by pos limit greatest(p_limite, 1)
$$;

-- Ranking de grupos: melhor partida de cada nome de grupo (média de pontos por jogador, mínimo 2 jogadores).
create or replace function public.quiz_ranking_grupos(p_company uuid, p_desde timestamptz, p_limite integer)
returns table(posicao bigint, nome text, media integer, jogadores integer, total bigint)
language sql security definer set search_path to 'public' as $$
  with melhor as (
    select distinct on (lower(s.nome)) s.nome, s.pontos_media, s.n_jogadores, s.encerrada_em
      from public.quiz_salas s
     where s.company_id = p_company and s.estado = 'encerrada' and coalesce(s.n_jogadores,0) >= 2
       and (p_desde is null or s.encerrada_em >= p_desde)
     order by lower(s.nome), s.pontos_media desc, s.encerrada_em asc),
  ord as (
    select m.nome, round(m.pontos_media)::integer as media, m.n_jogadores,
           row_number() over (order by m.pontos_media desc, m.encerrada_em asc) as pos, count(*) over () as tot
      from melhor m)
  select pos, nome, media, n_jogadores, tot from ord order by pos limit greatest(p_limite, 1)
$$;

-- Ranking geral individual: melhor rodada solo + melhor partida em grupo de cada jogador.
create or replace function public.quiz_ranking_geral(p_company uuid, p_desde timestamptz, p_limite integer)
returns table(posicao bigint, jogador_id uuid, apelido text, pontos integer, total bigint)
language sql security definer set search_path to 'public' as $$
  with solo as (
    select r.jogador_id, max(r.pontos) as p
      from public.quiz_rodadas r
     where r.company_id = p_company and r.estado = 'encerrada' and coalesce(r.motivo_fim,'') <> 'abandono'
       and r.jogador_id is not null and (p_desde is null or r.encerrada_em >= p_desde)
     group by r.jogador_id),
  grp as (
    select sj.jogador_id, max(sj.pontos) as p
      from public.quiz_sala_jogadores sj join public.quiz_salas s on s.id = sj.sala_id
     where s.company_id = p_company and s.estado = 'encerrada' and (p_desde is null or s.encerrada_em >= p_desde)
     group by sj.jogador_id),
  soma as (
    select coalesce(a.jogador_id, b.jogador_id) as jogador_id, coalesce(a.p,0) + coalesce(b.p,0) as pontos
      from solo a full join grp b on a.jogador_id = b.jogador_id),
  ord as (
    select s.jogador_id, j.apelido, s.pontos::integer as pontos,
           row_number() over (order by s.pontos desc, j.criado_em asc) as pos, count(*) over () as tot
      from soma s join public.quiz_jogadores j on j.id = s.jogador_id where j.aceite_ranking)
  select pos, jogador_id, apelido, pontos, tot from ord order by pos limit greatest(p_limite, 1)
$$;
