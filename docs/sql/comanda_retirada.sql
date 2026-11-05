-- Retirada (5/nov/2026): conta de quem vem buscar, sem mesa e sem taxa de serviço por padrão.
-- Vira mesa quando o cliente decide comer no local (ação 'transferir' do /api/mesas).
alter table public.loja_comandas alter column mesa_id drop not null;
alter table public.loja_comandas add column if not exists tipo text not null default 'mesa';
alter table public.loja_comandas add column if not exists rotulo text;
alter table public.loja_comandas add constraint loja_comandas_tipo_check check (tipo in ('mesa','retirada'));
alter table public.loja_comandas add constraint loja_comandas_mesa_ou_retirada check (tipo = 'retirada' or mesa_id is not null);

-- Produção impressa pelo computador, pedida de outro aparelho (5/nov/2026)
alter table public.loja_comandas add column if not exists imprimir_producao_em timestamptz;
alter table public.loja_comandas add column if not exists imprimir_producao_todas boolean not null default false;
