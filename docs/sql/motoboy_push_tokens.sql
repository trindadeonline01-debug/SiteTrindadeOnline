-- Token FCM do aparelho de cada motoboy (app-motoboy). Mesmo padrão de
-- loja_push_tokens, mas sem policies: motoboy não é usuário Supabase Auth,
-- só o servidor (service role) lê e grava, via /api/motoboy/push-token.
create table if not exists public.motoboy_push_tokens (
  id uuid primary key default gen_random_uuid(),
  motoboy_id uuid not null references public.motoboys(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists motoboy_push_tokens_motoboy_idx on public.motoboy_push_tokens(motoboy_id);
alter table public.motoboy_push_tokens enable row level security;
