-- Consumo interno (15/nov/2026): conta da casa, fora do caixa. Já aplicado no banco.
alter table public.loja_comandas drop constraint if exists loja_comandas_tipo_check;
alter table public.loja_comandas add constraint loja_comandas_tipo_check check (tipo = any (array['mesa'::text,'retirada'::text,'consumo'::text]));
alter table public.loja_comandas drop constraint if exists loja_comandas_mesa_ou_retirada;
alter table public.loja_comandas add constraint loja_comandas_mesa_ou_retirada check (tipo = any (array['retirada'::text,'consumo'::text]) or mesa_id is not null);
alter table public.loja_comanda_pagamentos drop constraint if exists loja_comanda_pagamentos_forma_check;
alter table public.loja_comanda_pagamentos add constraint loja_comanda_pagamentos_forma_check check (forma = any (array['dinheiro'::text,'cartao'::text,'pix'::text,'cashback'::text,'consumo'::text]));
