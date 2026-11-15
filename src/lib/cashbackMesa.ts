import { randomBytes } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'
import { creditarCashback, getSaldoCashback } from '@/lib/cashback'

// Travas antifraude do cashback de MESA (nov/2026). O garçom digita o WhatsApp na
// comanda — sem trava, podia pôr o próprio número (ou o de um parente) em várias
// contas e juntar saldo. Regras:
// 1) número de garçom cadastrado na loja nunca ganha cashback de mesa;
// 2) no máximo 1 conta com cashback por número a cada 12 h (uma noite);
// 3) se o WhatsApp não foi confirmado por código na mesa, o crédito fica pendente
//    até o cliente tocar em "confirmar" no link que chega no WhatsApp dele;
// 4) padrões suspeitos aparecem como alerta no painel de cashback (lá, não aqui).

export const LIMITE_HORAS = 12
export const PENDENTE_DIAS = 7

export type Bloqueio = 'funcionario' | 'limite' | null

export async function bloqueioCashbackMesa(sb: SupabaseClient, companyId: string, phoneRaw: string, comandaId: string): Promise<Bloqueio> {
  const phone = normalizePhone(phoneRaw)
  if (!phone) return 'funcionario'
  const { count: func } = await sb.from('loja_garcons').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('telefone', phone)
  if ((func || 0) > 0) return 'funcionario'
  const desde = new Date(Date.now() - LIMITE_HORAS * 3600000).toISOString()
  const { count: pend } = await sb.from('cashback_pendentes').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('customer_phone', phone).in('estado', ['pendente', 'confirmado']).neq('comanda_id', comandaId).gte('criado_em', desde)
  if ((pend || 0) > 0) return 'limite'
  // Créditos de mesa de antes desta trava existir (ainda sem linha em cashback_pendentes).
  const { data: led } = await sb.from('cashback_ledger').select('pedido_id').eq('company_id', companyId).eq('customer_phone', phone)
    .eq('tipo', 'credito').not('pedido_id', 'is', null).gte('created_at', desde)
  const ids = (led || []).map(l => l.pedido_id as string)
  if (ids.length) {
    const { count } = await sb.from('loja_pedidos').select('id', { count: 'exact', head: true }).in('id', ids).not('comanda_id', 'is', null).neq('comanda_id', comandaId)
    if ((count || 0) > 0) return 'limite'
  }
  return null
}

export async function registrarCashbackMesa(sb: SupabaseClient, args: {
  companyId: string; comandaId: string; pedidoId: string; phoneRaw: string; valor: number
  estado: 'pendente' | 'confirmado' | 'bloqueado'; motivo?: string
}): Promise<string | null> {
  const token = randomBytes(18).toString('base64url')
  const { error } = await sb.from('cashback_pendentes').insert({
    company_id: args.companyId, comanda_id: args.comandaId, pedido_id: args.pedidoId,
    customer_phone: normalizePhone(args.phoneRaw), valor: args.valor, token, estado: args.estado,
    motivo: args.motivo || null, confirmado_em: args.estado === 'confirmado' ? new Date().toISOString() : null,
    expira_em: new Date(Date.now() + PENDENTE_DIAS * 86400000).toISOString(),
  })
  return error ? null : token
}

export type ResultadoConfirmar =
  | { ok: true; valor: number; saldo: number; loja: string; jaConfirmado?: boolean }
  | { ok: false; erro: string }

export async function confirmarCashbackPendente(sb: SupabaseClient, token: string): Promise<ResultadoConfirmar> {
  const { data: p } = await sb.from('cashback_pendentes').select('id, company_id, pedido_id, customer_phone, valor, estado, expira_em').eq('token', token).maybeSingle()
  if (!p) return { ok: false, erro: 'Link inválido.' }
  const { data: co } = await sb.from('companies').select('name').eq('id', p.company_id).maybeSingle()
  const loja = String(co?.name || '').trim()
  const valor = Number(p.valor)
  if (p.estado === 'confirmado') return { ok: true, valor, saldo: await getSaldoCashback(sb, p.company_id, p.customer_phone), loja, jaConfirmado: true }
  if (p.estado === 'bloqueado') return { ok: false, erro: 'Este cashback não pode ser liberado.' }
  if (p.estado === 'expirado' || new Date(p.expira_em).getTime() < Date.now()) {
    if (p.estado !== 'expirado') await sb.from('cashback_pendentes').update({ estado: 'expirado' }).eq('id', p.id)
    return { ok: false, erro: 'O prazo para confirmar este cashback já passou.' }
  }
  // Marca primeiro (só quem mudar de pendente → confirmado credita), depois credita.
  const { data: upd } = await sb.from('cashback_pendentes').update({ estado: 'confirmado', confirmado_em: new Date().toISOString() })
    .eq('id', p.id).eq('estado', 'pendente').select('id')
  if (!upd?.length) return { ok: true, valor, saldo: await getSaldoCashback(sb, p.company_id, p.customer_phone), loja, jaConfirmado: true }
  await creditarCashback(sb, { companyId: p.company_id, phoneRaw: p.customer_phone, pedidoId: p.pedido_id, valor })
  return { ok: true, valor, saldo: await getSaldoCashback(sb, p.company_id, p.customer_phone), loja }
}
