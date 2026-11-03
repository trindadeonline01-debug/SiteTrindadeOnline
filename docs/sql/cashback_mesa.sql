-- Cashback separado para Mesa (3/nov/2026). Já aplicado no banco via migração.
-- 0 = a mesa não dá cashback; teto 15% (mesmo CASHBACK_PERCENT_MAX do delivery).
alter table public.companies add column if not exists cashback_percent_mesa numeric(5,2) not null default 0;
alter table public.companies drop constraint if exists companies_cashback_percent_mesa_check;
alter table public.companies add constraint companies_cashback_percent_mesa_check check (cashback_percent_mesa >= 0 and cashback_percent_mesa <= 15);
