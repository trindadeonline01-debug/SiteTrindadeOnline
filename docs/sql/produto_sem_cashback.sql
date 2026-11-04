-- 4/nov/2026: produto em promoção pode ficar de fora do cashback (flag por produto).
alter table public.loja_produtos add column if not exists sem_cashback boolean not null default false;
