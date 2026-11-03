-- Mesas — Fase 2: pedido pelo QR do cliente (3/nov/2026)
-- Rodar no Supabase: SQL Editor > cole tudo > Run. Seguro para rodar mais de uma vez.
-- Não altera dados existentes.

-- O pedido do cliente fica guardado no chamado (tipo 'pedido') até o garçom confirmar.
alter table public.loja_mesa_chamados add column if not exists payload jsonb;

-- Por loja: liga/desliga o pedido pelo QR e quantos envios por minuto cada mesa pode fazer.
alter table public.companies add column if not exists mesas_qr_pedir boolean not null default true;
alter table public.companies add column if not exists mesas_pedidos_por_minuto int not null default 3;
alter table public.companies drop constraint if exists companies_mesas_pedidos_por_minuto_check;
alter table public.companies add constraint companies_mesas_pedidos_por_minuto_check check (mesas_pedidos_por_minuto between 1 and 10);

create index if not exists loja_mesa_chamados_mesa_recentes on public.loja_mesa_chamados (mesa_id, criado_em desc);
