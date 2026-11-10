-- Última posição de cada motoboy (rastreio durante a corrida, nov/2026).
-- UMA linha por motoboy, sempre sobrescrita (upsert) — nunca guarda trajeto,
-- pra não repetir o travamento de banco de out/2026. Só existe enquanto o
-- motoboy tem corrida em andamento: o app apaga a linha ao terminar
-- (/api/motoboy/posicao, action 'parar'). Sem policies: motoboy não é
-- usuário Supabase Auth, só o servidor (service role) lê e grava.
create table if not exists public.motoboy_locations (
  motoboy_id uuid primary key references public.motoboys(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy real,
  heading real,
  speed real,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.motoboy_locations enable row level security;
