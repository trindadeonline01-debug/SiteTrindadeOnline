-- Cashback da mesa por forma de pagamento (nov/2026). Já aplicado no banco.
alter table public.companies
  add column if not exists cashback_pct_dinheiro numeric(5,2),
  add column if not exists cashback_pct_pix numeric(5,2),
  add column if not exists cashback_pct_debito numeric(5,2),
  add column if not exists cashback_pct_credito numeric(5,2);
alter table public.loja_comanda_pagamentos add column if not exists cartao_tipo text;
alter table public.loja_comanda_pagamentos drop constraint if exists loja_comanda_pagamentos_cartao_tipo_check;
alter table public.loja_comanda_pagamentos add constraint loja_comanda_pagamentos_cartao_tipo_check check (cartao_tipo is null or cartao_tipo in ('debito','credito'));
update public.companies set cashback_pct_dinheiro = cashback_percent_mesa, cashback_pct_pix = cashback_percent_mesa,
  cashback_pct_debito = cashback_percent_mesa, cashback_pct_credito = cashback_percent_mesa where coalesce(cashback_percent_mesa, 0) > 0;
