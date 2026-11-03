-- Mesas e Comandas — Fase 1 (2/nov/2026)
-- Rodar no Supabase: SQL Editor > cole tudo > Run. Seguro para rodar uma vez (usa IF NOT EXISTS onde possível).
-- Não altera dados existentes. Tudo fica desligado (mesas_enabled = false) até a loja ser liberada.

-- Config por loja (tudo desligado por padrão)
alter table public.companies add column if not exists mesas_enabled boolean not null default false;
alter table public.companies add column if not exists loja_taxa_servico_pct numeric(5,2) not null default 10;
alter table public.companies add column if not exists loja_supervisor_pin_hash text;

-- Mesas
create table if not exists public.loja_mesas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  numero int not null check (numero > 0),
  nome text,
  ativa boolean not null default true,
  qr_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  criado_em timestamptz not null default now(),
  unique (company_id, numero)
);

-- Garçons (lista simples, cadastrada pela dona da loja)
create table if not exists public.loja_garcons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Numeração sequencial das comandas por loja
create table if not exists public.loja_comanda_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  next_number int not null default 1
);

-- Comanda = a conta da mesa
create table if not exists public.loja_comandas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mesa_id uuid not null references public.loja_mesas(id) on delete restrict,
  numero int not null,
  status text not null default 'aberta' check (status in ('aberta','fechada','cancelada')),
  garcom_id uuid references public.loja_garcons(id) on delete set null,
  garcom_nome text,
  customer_phone text,
  customer_name text,
  taxa_servico_ativa boolean not null default true,
  taxa_servico_pct numeric(5,2) not null default 10,
  desconto numeric(10,2) not null default 0 check (desconto >= 0),
  desconto_motivo text,
  subtotal numeric(10,2) not null default 0,
  taxa_valor numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  sessao_secret text not null default replace(gen_random_uuid()::text, '-', ''),
  unida_a uuid references public.loja_comandas(id) on delete set null,
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz,
  fechada_por text,
  updated_at timestamptz not null default now()
);
create unique index if not exists loja_comandas_uma_aberta_por_mesa on public.loja_comandas (mesa_id) where status = 'aberta';
create unique index if not exists loja_comandas_numero_por_loja on public.loja_comandas (company_id, numero);
create index if not exists loja_comandas_loja_status on public.loja_comandas (company_id, status);

create or replace function public.loja_comanda_numero()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.numero is null then
    insert into public.loja_comanda_counters (company_id, next_number) values (new.company_id, 2)
    on conflict (company_id) do update set next_number = public.loja_comanda_counters.next_number + 1
    returning next_number - 1 into n;
    new.numero := n;
  end if;
  return new;
end $$;
revoke all on function public.loja_comanda_numero() from public, anon, authenticated;
drop trigger if exists trg_loja_comanda_numero on public.loja_comandas;
create trigger trg_loja_comanda_numero before insert on public.loja_comandas
  for each row execute function public.loja_comanda_numero();

-- Cada rodada de itens continua sendo um pedido, ligado à comanda
alter table public.loja_pedidos add column if not exists comanda_id uuid references public.loja_comandas(id) on delete set null;
create index if not exists loja_pedidos_comanda on public.loja_pedidos (comanda_id) where comanda_id is not null;

-- Pagamentos da comanda (misto / dividido)
create table if not exists public.loja_comanda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  comanda_id uuid not null references public.loja_comandas(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  forma text not null check (forma in ('dinheiro','cartao','pix','cashback')),
  valor numeric(10,2) not null check (valor > 0),
  pessoa text,
  customer_phone text,
  registrado_por text,
  criado_em timestamptz not null default now()
);
create index if not exists loja_comanda_pagamentos_comanda on public.loja_comanda_pagamentos (comanda_id);

-- Chamados da mesa (garçom / conta / pedido aguardando)
create table if not exists public.loja_mesa_chamados (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mesa_id uuid not null references public.loja_mesas(id) on delete cascade,
  comanda_id uuid references public.loja_comandas(id) on delete set null,
  tipo text not null check (tipo in ('garcom','conta','pedido')),
  mensagem text,
  status text not null default 'aberto' check (status in ('aberto','atendido','cancelado')),
  criado_em timestamptz not null default now(),
  atendido_em timestamptz,
  atendido_por text
);
create index if not exists loja_mesa_chamados_abertos on public.loja_mesa_chamados (company_id) where status = 'aberto';

-- Histórico de ações sensíveis (cancelamento, desconto, transferência, junção...)
create table if not exists public.loja_comanda_eventos (
  id uuid primary key default gen_random_uuid(),
  comanda_id uuid not null references public.loja_comandas(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null,
  detalhe jsonb,
  por text,
  criado_em timestamptz not null default now()
);
create index if not exists loja_comanda_eventos_comanda on public.loja_comanda_eventos (comanda_id);

-- RLS: dono da loja e admin (mesmo padrão de loja_pedidos). Cliente só pelo servidor (fase do QR).
alter table public.loja_mesas enable row level security;
alter table public.loja_garcons enable row level security;
alter table public.loja_comanda_counters enable row level security;
alter table public.loja_comandas enable row level security;
alter table public.loja_comanda_pagamentos enable row level security;
alter table public.loja_mesa_chamados enable row level security;
alter table public.loja_comanda_eventos enable row level security;

create policy "loja_mesas: dono gerencia" on public.loja_mesas for all
  using (exists (select 1 from public.companies c where c.id = loja_mesas.company_id and c.owner_id = auth.uid()));
create policy "loja_mesas: admin acesso total" on public.loja_mesas for all using (public.is_admin());

create policy "loja_garcons: dono gerencia" on public.loja_garcons for all
  using (exists (select 1 from public.companies c where c.id = loja_garcons.company_id and c.owner_id = auth.uid()));
create policy "loja_garcons: admin acesso total" on public.loja_garcons for all using (public.is_admin());

create policy "loja_comandas: dono gerencia" on public.loja_comandas for all
  using (exists (select 1 from public.companies c where c.id = loja_comandas.company_id and c.owner_id = auth.uid()));
create policy "loja_comandas: admin acesso total" on public.loja_comandas for all using (public.is_admin());

create policy "loja_comanda_pagamentos: dono gerencia" on public.loja_comanda_pagamentos for all
  using (exists (select 1 from public.companies c where c.id = loja_comanda_pagamentos.company_id and c.owner_id = auth.uid()));
create policy "loja_comanda_pagamentos: admin acesso total" on public.loja_comanda_pagamentos for all using (public.is_admin());

create policy "loja_mesa_chamados: dono gerencia" on public.loja_mesa_chamados for all
  using (exists (select 1 from public.companies c where c.id = loja_mesa_chamados.company_id and c.owner_id = auth.uid()));
create policy "loja_mesa_chamados: admin acesso total" on public.loja_mesa_chamados for all using (public.is_admin());

create policy "loja_comanda_eventos: dono le" on public.loja_comanda_eventos for select
  using (exists (select 1 from public.companies c where c.id = loja_comanda_eventos.company_id and c.owner_id = auth.uid()));
create policy "loja_comanda_eventos: admin acesso total" on public.loja_comanda_eventos for all using (public.is_admin());
-- loja_comanda_counters: sem policies (só o gatilho/servidor mexe)

-- Tempo real: o tablet atualiza sozinho
alter publication supabase_realtime add table public.loja_comandas;
alter publication supabase_realtime add table public.loja_mesa_chamados;
