import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { requireCompanyAccess, requireUser } from '@/lib/requireUser'
import { moduleActive } from '@/lib/modules'

// Mesas e comandas (nov/2026) — regras de verdade ficam TODAS aqui no
// servidor (service role): o tablet só pede, nunca decide total, taxa, PIN
// ou se a conta pode fechar. docs/DESENHO_MESAS_JOGOS.md.

export const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type CompanyMesas = {
  id: string; name: string; owner_id: string
  mesas_enabled: boolean; loja_taxa_servico_pct: number; loja_supervisor_pin_hash: string | null
  loja_digital_enabled: boolean; trial_modules_until: string | null
}

// Dono/admin da empresa + módulo de Mesas ligado (admin passa direto, pra
// poder configurar antes de ligar pra loja).
export async function acessoMesas(req: NextRequest, companyId: string, opts: { exigirLigado?: boolean } = {}): Promise<{ company: CompanyMesas; userId: string } | NextResponse> {
  const access = await requireCompanyAccess(req, companyId)
  if (access instanceof NextResponse) return access
  const { data: company } = await sb.from('companies')
    .select('id, name, owner_id, mesas_enabled, loja_taxa_servico_pct, loja_supervisor_pin_hash, loja_digital_enabled, trial_modules_until')
    .eq('id', companyId).maybeSingle()
  if (!company) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
  if (!moduleActive(company.loja_digital_enabled, company.trial_modules_until)) {
    return NextResponse.json({ error: 'O cardápio digital não está ativo nessa empresa.' }, { status: 403 })
  }
  if ((opts.exigirLigado ?? true) && !company.mesas_enabled) {
    return NextResponse.json({ error: 'O módulo de Mesas não está ligado nessa empresa.' }, { status: 403 })
  }
  return { company: company as CompanyMesas, userId: access.userId }
}

export function erro(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }
export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// ---- PIN da supervisão (hash com sal; nunca em texto puro) ----
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`
}
export function conferePin(pin: string, stored: string | null): boolean {
  if (!stored || !pin) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const calc = scryptSync(String(pin), salt, 32)
  const ref = Buffer.from(hash, 'hex')
  return calc.length === ref.length && timingSafeEqual(calc, ref)
}

// Trava simples anti-chute: 5 PINs errados em 10 min por empresa bloqueiam
// novas tentativas (conta eventos 'pin_errado' do log de auditoria).
export async function pinOk(company: CompanyMesas, pin: unknown, comandaId: string | null): Promise<string | null> {
  if (!company.loja_supervisor_pin_hash) return 'A loja ainda não definiu o PIN da supervisão (Mesas → Configurar).'
  const desde = new Date(Date.now() - 10 * 60_000).toISOString()
  const { count } = await sb.from('loja_comanda_eventos').select('id', { count: 'exact', head: true })
    .eq('company_id', company.id).eq('tipo', 'pin_errado').gte('criado_em', desde)
  if ((count || 0) >= 5) return 'Muitas tentativas erradas. Espere alguns minutos.'
  if (conferePin(String(pin || ''), company.loja_supervisor_pin_hash)) return null
  if (comandaId) await evento(company.id, comandaId, 'pin_errado', {}, null)
  return 'PIN da supervisão incorreto.'
}

export async function evento(companyId: string, comandaId: string, tipo: string, detalhe: Record<string, unknown>, por: string | null) {
  try { await sb.from('loja_comanda_eventos').insert({ company_id: companyId, comanda_id: comandaId, tipo, detalhe, por }) } catch {}
}

// Recalcula subtotal/taxa/total da comanda a partir dos pedidos (rodadas) que
// não foram cancelados. Única fonte da verdade do valor da conta.
export async function recalcComanda(comandaId: string) {
  const { data: c } = await sb.from('loja_comandas').select('id, taxa_servico_ativa, taxa_servico_pct, desconto').eq('id', comandaId).maybeSingle()
  if (!c) return null
  const { data: peds } = await sb.from('loja_pedidos').select('total').eq('comanda_id', comandaId).neq('status', 'cancelado')
  const subtotal = r2((peds || []).reduce((s, p) => s + Number(p.total || 0), 0))
  const desconto = Math.min(Number(c.desconto || 0), subtotal)
  const base = r2(subtotal - desconto)
  const taxa = c.taxa_servico_ativa ? r2(base * Number(c.taxa_servico_pct || 0) / 100) : 0
  const total = r2(base + taxa)
  await sb.from('loja_comandas').update({ subtotal, desconto, taxa_valor: taxa, total, updated_at: new Date().toISOString() }).eq('id', comandaId)
  return { subtotal, desconto, taxa, total }
}

export async function totalPago(comandaId: string): Promise<number> {
  const { data } = await sb.from('loja_comanda_pagamentos').select('valor').eq('comanda_id', comandaId)
  return r2((data || []).reduce((s, p) => s + Number(p.valor || 0), 0))
}

export function novoQrToken(): string { return randomBytes(18).toString('base64url') }

// PIN da supervisão pra ações fora de uma comanda (trocar PIN, renomear garçom,
// sangria do caixa). Admin da Trindade passa direto; loja sem PIN ainda também
// (primeiro cadastro) — quem exige PIN existente trata isso por fora. Erro conta
// na trava de 5 tentativas/10 min, registrado na comanda mais recente da loja
// (a tabela de eventos exige uma comanda).
export async function exigePinSupervisor(req: NextRequest, company: CompanyMesas, pin: unknown, opts: { semPinCadastrado?: 'liberar' | 'negar' } = {}): Promise<NextResponse | null> {
  const u = await requireUser(req)
  if (!(u instanceof NextResponse) && u.isAdmin) return null
  if (!company.loja_supervisor_pin_hash) {
    return opts.semPinCadastrado === 'negar' ? erro('A loja ainda não definiu o PIN da supervisão (Mesas → Configurar).', 403) : null
  }
  const { data: ult } = await sb.from('loja_comandas').select('id').eq('company_id', company.id).order('aberta_em', { ascending: false }).limit(1)
  const bad = await pinOk(company, pin, ult?.[0]?.id ?? null)
  return bad ? erro(bad, 403) : null
}

// Config do pedido pelo QR (Fase 2). Lida à parte de acessoMesas de propósito:
// se as colunas ainda não existirem no banco, a loja segue com o padrão em vez
// de derrubar o módulo inteiro.
export async function configQr(companyId: string): Promise<{ qrPedir: boolean; porMinuto: number }> {
  const { data } = await sb.from('companies').select('mesas_qr_pedir, mesas_pedidos_por_minuto').eq('id', companyId).maybeSingle()
  const pm = Number(data?.mesas_pedidos_por_minuto)
  return { qrPedir: data?.mesas_qr_pedir !== false, porMinuto: pm >= 1 && pm <= 10 ? pm : 3 }
}

// Preço de verdade de um produto + escolhas do cliente: tudo vem do banco, o
// celular só manda ids. Mesma regra do Picker do garçom (grupo obrigatório,
// máximo de escolhas, "maior valor" cobra só a opção mais cara).
export type ProdutoMesaDb = {
  id: string; name: string; sale_price: number; promo_type: string | null; promo_value: number | null
  promo_starts_at: string | null; promo_ends_at: string | null; active: boolean; esgotado: boolean | null
  track_stock: boolean | null; stock_qty: number | null
  groups: { id: string; name: string; required: boolean; min_select: number; max_select: number; pricing_rule: string; options: { id: string; name: string; price: number; pausado?: boolean | null }[] }[]
}
export function resolveOpcoes(p: ProdutoMesaDb, opcaoIds: unknown): { mods: { name: string; price: number }[] } | { erro: string } {
  const ids = new Set((Array.isArray(opcaoIds) ? opcaoIds : []).map(String))
  const mods: { name: string; price: number }[] = []
  const validas = new Set<string>()
  for (const g of p.groups || []) {
    const sel = (g.options || []).filter(o => !o.pausado && ids.has(o.id))
    sel.forEach(o => validas.add(o.id))
    const min = g.required ? Math.max(1, g.min_select || 0) : (g.min_select || 0)
    if (sel.length < min) return { erro: `Escolha ${g.name.toLowerCase()} em "${p.name}".` }
    if (sel.length > Math.max(1, g.max_select || 1)) return { erro: `Muitas opções em ${g.name.toLowerCase()} ("${p.name}").` }
    if (g.pricing_rule === 'maior_valor') {
      const maior = sel.length ? Math.max(...sel.map(o => Number(o.price))) : 0
      let usado = false
      for (const o of sel) { const pr = !usado && Number(o.price) >= maior ? maior : 0; if (pr === maior && maior > 0) usado = true; mods.push({ name: o.name, price: pr }) }
    } else for (const o of sel) mods.push({ name: o.name, price: Number(o.price) })
  }
  if ([...ids].some(i => !validas.has(i))) return { erro: 'Uma das opções escolhidas não existe mais. Atualize a página.' }
  return { mods }
}

// O telefone da conta foi confirmado por código de WhatsApp (e continua sendo o mesmo)?
// Se o garçom trocar o número depois, a confirmação deixa de valer.
export async function telefoneVerificado(comandaId: string, phone: string | null): Promise<boolean> {
  if (!phone) return false
  const { data } = await sb.from('loja_comanda_eventos').select('detalhe').eq('comanda_id', comandaId).eq('tipo', 'telefone_verificado').order('criado_em', { ascending: false }).limit(1)
  return data?.[0]?.detalhe?.telefone === phone
}
