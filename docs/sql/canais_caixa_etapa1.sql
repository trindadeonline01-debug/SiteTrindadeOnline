-- Canais separados (delivery / PDV / mesa) + Caixa — Etapa 1 e 2 (3/nov/2026)

-- 1) Novos canais no pedido: 'pdv' (venda de balcão no PDV) e 'mesa' (rodada de comanda).
--    'balcao' continua sendo o "+ Novo pedido" manual de /painel/pedidos (família delivery).
alter table public.loja_pedidos drop constraint if exists loja_pedidos_origin_check;
alter table public.loja_pedidos add constraint loja_pedidos_origin_check
  check (origin = any (array['cardapio_publico','balcao','conversa','pdv','mesa']));

-- Reclassifica o que já existe
update public.loja_pedidos set origin = 'mesa' where origin = 'balcao' and comanda_id is not null;
update public.loja_pedidos set origin = 'pdv'
  where origin = 'balcao' and comanda_id is null and delivery_type = 'balcao' and customer_name = 'Cliente balcão';

-- 2) PDV e mesa não geram "sinal de venda" do CRM (isso é do delivery)
create or replace function public.crm_sales_signals_from_pedido()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_contact_id uuid;
begin
  if new.origin in ('pdv', 'mesa') then
    return new;
  end if;
  select id into v_contact_id from crm_contacts
    where company_id = new.company_id and phone = new.customer_phone limit 1;

  insert into crm_sales_signals (company_id, contact_id, channel, source, confirmed, valor, pedido_id, occurred_at)
  values (new.company_id, v_contact_id, 'trindade_online', 'loja_pedidos', true, new.total, new.id, new.created_at)
  on conflict (pedido_id) where pedido_id is not null do nothing;

  return new;
end;
$function$;

-- 3) Caixa (PDV + mesas): um caixa aberto por loja
create table if not exists public.loja_caixas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  troco_inicial numeric(10,2) not null default 0 check (troco_inicial >= 0),
  aberto_em timestamptz not null default now(),
  aberto_por text,
  fechado_em timestamptz,
  fechado_por text,
  dinheiro_esperado numeric(10,2),
  dinheiro_contado numeric(10,2),
  diferenca numeric(10,2),
  observacao text,
  resumo jsonb
);
create unique index if not exists loja_caixas_um_aberto on public.loja_caixas (company_id) where status = 'aberto';
create index if not exists loja_caixas_company_data on public.loja_caixas (company_id, aberto_em desc);

create table if not exists public.loja_caixa_movimentos (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references public.loja_caixas(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('sangria', 'suprimento')),
  valor numeric(10,2) not null check (valor > 0),
  motivo text,
  por text,
  criado_em timestamptz not null default now()
);
create index if not exists loja_caixa_mov_caixa on public.loja_caixa_movimentos (caixa_id);

alter table public.loja_caixas enable row level security;
alter table public.loja_caixa_movimentos enable row level security;

create policy "loja_caixas: dono le" on public.loja_caixas for select
  using (exists (select 1 from public.companies c where c.id = loja_caixas.company_id and c.owner_id = auth.uid()));
create policy "loja_caixas: admin acesso total" on public.loja_caixas for all using (public.is_admin());
create policy "loja_caixa_movimentos: dono le" on public.loja_caixa_movimentos for select
  using (exists (select 1 from public.companies c where c.id = loja_caixa_movimentos.company_id and c.owner_id = auth.uid()));
create policy "loja_caixa_movimentos: admin acesso total" on public.loja_caixa_movimentos for all using (public.is_admin());
-- escrita só pelo servidor (service role), que confere PIN e regras
