-- Caça-Palavras (nov/2026). Uma linha por rodada; a grade atual (letras e posição de cada palavra) fica no servidor.
create table if not exists public.caca_rodadas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  jogador_id uuid not null references public.quiz_jogadores(id) on delete cascade,
  estado text not null default 'jogando' check (estado in ('jogando','entre_niveis','encerrada')),
  motivo_fim text check (motivo_fim in ('parou','tempo','completa')),
  nivel smallint not null default 1,
  parte smallint not null default 1,
  pontos integer not null default 0,
  pontos_nivel integer not null default 0,
  melhor_nivel smallint not null default 0,          -- maior nível concluído na rodada
  grade jsonb not null,
  usadas text[] not null default '{}',                -- palavras que já saíram na rodada (nunca repetem)
  ajudas jsonb not null default '{"tempo":1,"emb":1,"troca":1}'::jsonb,
  ratios jsonb not null default '[]'::jsonb,          -- sobra de tempo (0 a 1) de cada grade do nível, para as estrelas
  tempo_total integer not null,                       -- segundos da grade atual (com as ajudas de tempo)
  grade_iniciada_em timestamptz not null default now(),
  tempo_usado integer not null default 0,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  encerrada_em timestamptz
);
create index if not exists caca_rodadas_jogador_idx on public.caca_rodadas (jogador_id, criada_em desc);
create index if not exists caca_rodadas_rank_idx on public.caca_rodadas (company_id, criada_em desc);
alter table public.caca_rodadas enable row level security;   -- sem policies: só o servidor (service role) lê e escreve

-- Ranking do caça-palavras: melhor rodada (pontos) de cada jogador que aceitou aparecer no ranking.
create or replace function public.caca_ranking(p_company uuid, p_desde timestamptz, p_limite integer)
returns table(posicao bigint, jogador_id uuid, apelido text, pontos integer, nivel smallint, total bigint)
language sql security definer set search_path to 'public' as $$
  with melhor as (
    select distinct on (r.jogador_id) r.jogador_id, r.pontos, r.melhor_nivel, r.criada_em
      from public.caca_rodadas r
     where r.company_id = p_company and r.pontos > 0 and (p_desde is null or r.criada_em >= p_desde)
     order by r.jogador_id, r.pontos desc, r.criada_em asc),
  ord as (
    select m.jogador_id, j.apelido, m.pontos, m.melhor_nivel,
           row_number() over (order by m.pontos desc, m.criada_em asc) as pos, count(*) over () as tot
      from melhor m join public.quiz_jogadores j on j.id = m.jogador_id where j.aceite_ranking)
  select pos, jogador_id, apelido, pontos, melhor_nivel, tot from ord order by pos limit greatest(p_limite, 1)
$$;
