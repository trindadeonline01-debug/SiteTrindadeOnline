-- Caixa por canal (3/nov/2026): PDV e Mesas têm cada um o seu caixa (gaveta própria).
-- Tabela estava vazia na hora da troca (nenhum dado migrado).
alter table public.loja_caixas add column if not exists canal text not null default 'pdv' check (canal in ('pdv','mesa'));
drop index if exists public.loja_caixas_um_aberto;
create unique index if not exists loja_caixas_um_aberto_por_canal on public.loja_caixas (company_id, canal) where status = 'aberto';
