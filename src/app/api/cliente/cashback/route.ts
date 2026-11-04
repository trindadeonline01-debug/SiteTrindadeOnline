import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import { normalizePhone } from '@/lib/phone'
import { sendPlatformWhatsApp } from '@/lib/whatsapp'
import { CASHBACK_EXPIRA_DIAS_DEFAULT } from '@/lib/cashback'

// "Meu cashback" do CLIENTE (nov/2026): entra com WhatsApp + código de 6 números e vê o
// saldo e o extrato em cada loja onde tem cashback. Sem tabela nova: o código e os
// contadores de envio/erro moram em `whatsapp_verifications` com chaves próprias
// (cb:<tel>, cbx:<tel> = erros, cbip:<ip> = envios por IP) que nunca colidem com o
// cadastro. A sessão é um token assinado (HMAC), sem estado no banco.

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const DAY = 86400000
const SESSAO_MS = 2 * 3600_000

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

function assinar(phone: string, exp: number) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`cb-sessao|${phone}|${exp}`).digest('hex').slice(0, 40)
}
function criarToken(phone: string) {
  const exp = Date.now() + SESSAO_MS
  return `${phone}.${exp}.${assinar(phone, exp)}`
}
function lerToken(token: unknown): string | null {
  const [phone, expS, sig] = String(token || '').split('.')
  const exp = Number(expS)
  if (!phone || !exp || !sig || exp < Date.now()) return null
  return igual(sig, assinar(phone, exp)) ? phone : null
}

async function contar(chave: string, ms: number) {
  const { count } = await sb.from('whatsapp_verifications').select('id', { count: 'exact', head: true })
    .eq('phone', chave).gte('created_at', new Date(Date.now() - ms).toISOString())
  return count || 0
}

export async function POST(req: NextRequest) {
  try {
    const b: Record<string, unknown> = await req.json().catch(() => ({}))
    const acao = String(b.acao || '')

    if (acao === 'enviar' || acao === 'entrar') {
      const tel = normalizePhone(String(b.telefone || ''))
      if (tel.length < 12 || tel.length > 13) return erro('Confira o número do WhatsApp (com DDD).')

      if (acao === 'enviar') {
        const ip = (req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim()
        const chaveIp = `cbip:${ip}`
        if ((await contar(chaveIp, 3_600_000)) >= 10) return erro('Muitos pedidos de código. Tente de novo mais tarde.', 429)
        if ((await contar(`cb:${tel}`, 60_000)) >= 1) return erro('Aguarde 1 minuto para pedir outro código.', 429)
        if ((await contar(`cb:${tel}`, 3_600_000)) >= 3) return erro('Muitos códigos pedidos para este número. Tente de novo mais tarde.', 429)
        const venc = new Date(Date.now() + 10 * 60_000).toISOString()
        await sb.from('whatsapp_verifications').insert({ phone: chaveIp, code: 'ip', expires_at: venc, used: true })
        // Só manda se o número tem cashback em alguma loja — a resposta é a mesma de qualquer jeito.
        const { data: w } = await sb.from('company_cashback_wallet').select('company_id').eq('customer_phone', tel).limit(1)
        if (w?.length) {
          const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
          await sb.from('whatsapp_verifications').insert({ phone: `cb:${tel}`, code, expires_at: venc })
          const r = await sendPlatformWhatsApp(tel, `🔐 Seu código do *Meu cashback* Trindade Online: *${code}*\n\nVale por 10 minutos. Não compartilhe com ninguém.`)
          if (!r.ok) return erro('Não consegui enviar o código agora. Tente de novo em instantes.', 502)
        }
        // limpeza de rastros com mais de 1 dia
        await sb.from('whatsapp_verifications').delete().or('phone.like.cb:*,phone.like.cbx:*,phone.like.cbip:*').lt('created_at', new Date(Date.now() - DAY).toISOString())
        return NextResponse.json({ ok: true })
      }

      // entrar
      if ((await contar(`cbx:${tel}`, 10 * 60_000)) >= 5) return erro('Muitas tentativas erradas. Peça um código novo daqui a alguns minutos.', 429)
      const dig = String(b.codigo || '').replace(/\D/g, '')
      const { data: rec } = await sb.from('whatsapp_verifications').select('id, code, expires_at').eq('phone', `cb:${tel}`).eq('used', false)
        .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!rec || dig.length !== 6 || !igual(dig, String(rec.code))) {
        await sb.from('whatsapp_verifications').insert({ phone: `cbx:${tel}`, code: 'erro', expires_at: new Date(Date.now() + 600_000).toISOString(), used: true })
        return erro('Código incorreto ou vencido.')
      }
      await sb.from('whatsapp_verifications').update({ used: true }).eq('id', rec.id)
      return NextResponse.json({ ok: true, token: criarToken(tel), telefone: tel })
    }

    // ---- daqui pra baixo exige sessão ----
    const phone = lerToken(b.token)
    if (!phone) return erro('Sessão vencida. Entre de novo com o código.', 401)

    if (acao === 'lojas') {
      const { data: ws } = await sb.from('company_cashback_wallet').select('company_id, saldo, updated_at').eq('customer_phone', phone)
      const ids = (ws || []).map(w => w.company_id)
      const { data: cs } = ids.length
        ? await sb.from('companies').select('id, name, slug, cashback_expira_dias').in('id', ids)
        : { data: [] as { id: string; name: string; slug: string; cashback_expira_dias: number | null }[] }
      const mapa = new Map((cs || []).map(c => [c.id, c]))
      const lojas = (ws || []).map(w => {
        const c = mapa.get(w.company_id)
        const dias = Number(c?.cashback_expira_dias) || CASHBACK_EXPIRA_DIAS_DEFAULT
        const saldo = Number(w.saldo)
        return {
          companyId: w.company_id, nome: c?.name || 'Loja', slug: c?.slug || null, saldo: r2(saldo),
          venceEm: saldo > 0 ? new Date(new Date(w.updated_at).getTime() + dias * DAY).toISOString() : null,
        }
      }).sort((a, z) => z.saldo - a.saldo)
      return NextResponse.json({ ok: true, telefone: phone, total: r2(lojas.reduce((s, l) => s + l.saldo, 0)), lojas })
    }

    if (acao === 'extrato') {
      const companyId = String(b.companyId || '')
      const [{ data: w }, { data: led }] = await Promise.all([
        sb.from('company_cashback_wallet').select('saldo').eq('company_id', companyId).eq('customer_phone', phone).maybeSingle(),
        sb.from('cashback_ledger').select('tipo, valor, created_at, pedido_id').eq('company_id', companyId).eq('customer_phone', phone)
          .order('created_at', { ascending: false }).limit(100),
      ])
      if (!w && !led?.length) return erro('Nenhum cashback nesta loja.', 404)
      const pids = [...new Set((led || []).map(l => l.pedido_id).filter(Boolean) as string[])]
      const { data: peds } = pids.length
        ? await sb.from('loja_pedidos').select('id, order_number, origin, comanda_id').in('id', pids)
        : { data: [] as { id: string; order_number: number | null; origin: string | null; comanda_id: string | null }[] }
      const pm = new Map((peds || []).map(p => [p.id, p]))
      let corrente = Number(w?.saldo || 0)
      const movs = (led || []).map(l => {
        const v = Number(l.valor)
        const sinal = l.tipo === 'credito' || l.tipo === 'estorno' ? 1 : -1
        const saldoApos = r2(corrente); corrente = r2(corrente - sinal * v)
        const p = l.pedido_id ? pm.get(l.pedido_id) : undefined
        let origem = ''
        if (l.tipo === 'expirado') origem = 'Venceu por falta de uso'
        else if (l.tipo === 'estorno') origem = 'Devolvido'
        else if (p) origem = p.comanda_id || p.origin === 'mesa' ? 'Conta de mesa' : `Pedido nº ${p.order_number ?? '—'}`
        else if (l.tipo === 'debito') origem = 'Usado na mesa'
        return { tipo: l.tipo, valor: v, data: l.created_at, origem, saldoApos }
      })
      return NextResponse.json({ ok: true, movs })
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    console.error('[cliente/cashback]', e)
    return erro('Erro interno. Tente de novo.', 500)
  }
}
