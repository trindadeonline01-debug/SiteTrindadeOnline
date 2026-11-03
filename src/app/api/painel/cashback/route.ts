import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/requireUser'
import { normalizePhone } from '@/lib/phone'
import { CASHBACK_EXPIRA_DIAS_DEFAULT } from '@/lib/cashback'

// Painel de cashback da LOJA (nov/2026): resumo + lista de clientes com saldo +
// extrato por cliente. As tabelas de cashback não têm policy de RLS (só o
// service role lê), então tudo passa por aqui, e só dono/admin da empresa.

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const DAY = 86400000

type Linha = { tipo: string; valor: number; created_at: string; pedido_id: string | null; customer_phone: string }
type PedidoInfo = { id: string; order_number: number | null; origin: string | null; comanda_id: string | null; customer_name: string | null }

// Início do mês no fuso de Brasília (UTC-3), como ISO.
function inicioMesBR(agora = new Date()): string {
  const br = new Date(agora.getTime() - 3 * 3600000)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3, 0, 0)).toISOString()
}

async function pedidosPorId(ids: string[]): Promise<Map<string, PedidoInfo>> {
  const m = new Map<string, PedidoInfo>()
  const lista = [...new Set(ids)]
  for (let i = 0; i < lista.length; i += 200) {
    const { data } = await sb.from('loja_pedidos').select('id, order_number, origin, comanda_id, customer_name').in('id', lista.slice(i, i + 200))
    for (const p of (data || []) as PedidoInfo[]) m.set(p.id, p)
  }
  return m
}

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 }) }
  const companyId = String(b.companyId || '')
  if (!companyId) return NextResponse.json({ error: 'Empresa não informada' }, { status: 400 })
  const access = await requireCompanyAccess(req, companyId)
  if (access instanceof NextResponse) return access

  const { data: company } = await sb.from('companies')
    .select('cashback_enabled, cashback_percent, cashback_percent_mesa, cashback_expira_dias').eq('id', companyId).maybeSingle()
  const dias = Number(company?.cashback_expira_dias) || CASHBACK_EXPIRA_DIAS_DEFAULT
  const config = {
    ativo: !!company?.cashback_enabled, pctDelivery: Number(company?.cashback_percent) || 0,
    pctMesa: Number(company?.cashback_percent_mesa) || 0, dias,
  }

  if (b.action === 'extrato') {
    const phone = normalizePhone(String(b.phone || ''))
    if (!phone) return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })
    const [{ data: w }, { data: led }] = await Promise.all([
      sb.from('company_cashback_wallet').select('saldo, updated_at').eq('company_id', companyId).eq('customer_phone', phone).maybeSingle(),
      sb.from('cashback_ledger').select('tipo, valor, created_at, pedido_id, customer_phone').eq('company_id', companyId).eq('customer_phone', phone)
        .order('created_at', { ascending: false }).limit(200),
    ])
    const linhas = (led || []) as Linha[]
    const peds = await pedidosPorId(linhas.map(l => l.pedido_id).filter(Boolean) as string[])
    // Saldo depois de cada movimento: parte do saldo atual e volta no tempo.
    let corrente = Number(w?.saldo || 0)
    const movs = linhas.map(l => {
      const v = Number(l.valor)
      const sinal = l.tipo === 'credito' || l.tipo === 'estorno' ? 1 : -1
      const saldoApos = r2(corrente)
      corrente = r2(corrente - sinal * v)
      const p = l.pedido_id ? peds.get(l.pedido_id) : undefined
      const mesa = !!p?.comanda_id || p?.origin === 'mesa'
      let origem = ''
      if (l.tipo === 'expirado') origem = 'Venceu por falta de uso'
      else if (l.tipo === 'estorno') origem = p ? 'Devolvido (pedido cancelado)' : 'Devolvido (pagamento removido)'
      else if (p) origem = mesa ? (p.customer_name || 'Mesa') + ' · conta fechada' : `Pedido nº ${p.order_number ?? '—'} · delivery`
      else origem = l.tipo === 'debito' ? 'Usado na mesa' : ''
      return { tipo: l.tipo, valor: v, data: l.created_at, origem, saldoApos }
    })
    const nome = [...peds.values()].find(p => p.customer_name && !/^mesa\b/i.test(p.customer_name))?.customer_name || null
    const ultima = linhas[0]?.created_at || w?.updated_at || null
    return NextResponse.json({
      phone, nome, saldo: Number(w?.saldo || 0),
      venceEm: w && Number(w.saldo) > 0 ? new Date(new Date(w.updated_at).getTime() + dias * DAY).toISOString() : null,
      ultima, movs,
    })
  }

  // ---- resumo + lista de clientes ----
  const mesIni = inicioMesBR()
  const [{ data: wallet }, { data: ledMes }] = await Promise.all([
    sb.from('company_cashback_wallet').select('customer_phone, saldo, updated_at').eq('company_id', companyId).gt('saldo', 0)
      .order('saldo', { ascending: false }).limit(1000),
    sb.from('cashback_ledger').select('tipo, valor, created_at, pedido_id, customer_phone').eq('company_id', companyId).gte('created_at', mesIni).limit(20000),
  ])
  const wl = wallet || []
  const mes = (ledMes || []) as Linha[]

  // Gerado no mês, separado entre delivery e mesa (pelo pedido que gerou o crédito).
  const credIds = mes.filter(l => l.tipo === 'credito' && l.pedido_id).map(l => l.pedido_id as string)
  const pedsMes = await pedidosPorId(credIds)
  let gerado = 0, geradoMesa = 0, usado = 0, expirado = 0, estornado = 0
  for (const l of mes) {
    const v = Number(l.valor)
    if (l.tipo === 'credito') {
      gerado += v
      const p = l.pedido_id ? pedsMes.get(l.pedido_id) : undefined
      if (p && (p.comanda_id || p.origin === 'mesa')) geradoMesa += v
    } else if (l.tipo === 'debito') usado += v
    else if (l.tipo === 'estorno') estornado += v
    else if (l.tipo === 'expirado') expirado += v
  }

  // Última movimentação (e nome, quando houver) de cada cliente com saldo.
  const phones = wl.map(w => w.customer_phone)
  const ultima = new Map<string, { tipo: string; data: string }>()
  const nomes = new Map<string, string>()
  if (phones.length) {
    const { data: led } = await sb.from('cashback_ledger').select('customer_phone, tipo, created_at, pedido_id')
      .eq('company_id', companyId).in('customer_phone', phones).order('created_at', { ascending: false }).limit(5000)
    const pids: string[] = []
    for (const l of (led || []) as (Linha)[]) {
      if (!ultima.has(l.customer_phone)) ultima.set(l.customer_phone, { tipo: l.tipo, data: l.created_at })
      if (l.pedido_id && pids.length < 1500) pids.push(l.pedido_id)
    }
    const peds = await pedidosPorId(pids)
    for (const l of (led || []) as (Linha)[]) {
      if (nomes.has(l.customer_phone) || !l.pedido_id) continue
      const p = peds.get(l.pedido_id)
      if (p?.customer_name && !/^mesa\b/i.test(p.customer_name) && p.customer_name !== 'Cliente balcão') nomes.set(l.customer_phone, p.customer_name)
    }
  }

  const agora = Date.now()
  const clientes = wl.map(w => {
    const vence = new Date(w.updated_at).getTime() + dias * DAY
    const u = ultima.get(w.customer_phone)
    return {
      phone: w.customer_phone, nome: nomes.get(w.customer_phone) || null, saldo: Number(w.saldo),
      ultimaData: u?.data || w.updated_at, ultimaTipo: u?.tipo || null,
      venceEm: new Date(vence).toISOString(), diasParaVencer: Math.ceil((vence - agora) / DAY),
    }
  })
  const aberto = clientes.reduce((s, c) => s + c.saldo, 0)
  const aVencer = clientes.filter(c => c.diasParaVencer <= 7)
  return NextResponse.json({
    config,
    resumo: {
      aberto: r2(aberto), clientes: clientes.length,
      gerado: r2(gerado), geradoMesa: r2(geradoMesa), geradoDelivery: r2(gerado - geradoMesa),
      usado: r2(Math.max(0, usado - estornado)), expirado: r2(expirado),
      aVencer: r2(aVencer.reduce((s, c) => s + c.saldo, 0)), aVencerQtd: aVencer.length,
    },
    clientes,
  })
}
