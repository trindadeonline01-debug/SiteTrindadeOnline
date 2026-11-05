/* eslint-disable @typescript-eslint/no-explicit-any -- corpo JSON validado campo a campo abaixo */
import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { promoPrice } from '@/lib/lojaPricing'
import { PESO_REGEX } from '@/lib/produtoCart'
import { normalizePhone } from '@/lib/phone'
import { moduleActive } from '@/lib/modules'
import { sb, erro, r2, configQr, resolveOpcoes, evento, telefoneVerificado, type ProdutoMesaDb } from '@/lib/mesas'
import { sendPlatformWhatsApp } from '@/lib/whatsapp'
import { getSaldoCashback } from '@/lib/cashback'

// Página pública da mesa (QR). Sem login: o QR identifica só a mesa. Aqui o
// celular PEDE; o servidor confere tudo (mesa, conta, produto, opção, preço) e
// o pedido só vira cozinha quando o garçom confirma no tablet.
// docs/DESENHO_MESAS_JOGOS.md §5.

function igual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

async function carregar(token: unknown) {
  const t = String(token || '')
  if (t.length < 10 || t.length > 80) return null
  const { data: mesa } = await sb.from('loja_mesas').select('id, numero, nome, ativa, company_id').eq('qr_token', t).maybeSingle()
  if (!mesa || !mesa.ativa) return null
  const { data: company } = await sb.from('companies')
    .select('id, name, slug, mesas_enabled, loja_digital_enabled, trial_modules_until, cashback_enabled, cashback_percent_mesa').eq('id', mesa.company_id).maybeSingle()
  if (!company || !company.mesas_enabled || !moduleActive(company.loja_digital_enabled, company.trial_modules_until)) return null
  const { data: comanda } = await sb.from('loja_comandas').select('id, sessao_secret').eq('mesa_id', mesa.id).eq('status', 'aberta').maybeSingle()
  return { mesa, company, comanda: comanda || null }
}

// Conta aberta exige a chave da própria conta (quem saiu ou tem foto antiga do QR não pede).
function sessaoConfere(comanda: { sessao_secret: string } | null, sessao: unknown) {
  if (!comanda) return true
  return igual(String(sessao || ''), comanda.sessao_secret)
}
const ENCERRADA = 'Essa conta mudou. Atualizando…'

// Código de confirmação do WhatsApp: derivado (HMAC) da conta + telefone + janela de
// 10 min, sem tabela. Vale a janela atual e a anterior (10 a 20 min). Tentativas erradas
// e envios ficam contados no extrato da própria comanda.
const JANELA_MS = 10 * 60_000
function codigoOtp(comandaId: string, phone: string, janela: number) {
  const h = createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`mesa-otp|${comandaId}|${phone}|${janela}`).digest('hex')
  return String(parseInt(h.slice(0, 8), 16) % 1_000_000).padStart(6, '0')
}
async function contarEventos(comandaId: string, tipo: string, ms: number) {
  const { count } = await sb.from('loja_comanda_eventos').select('id', { count: 'exact', head: true })
    .eq('comanda_id', comandaId).eq('tipo', tipo).gte('criado_em', new Date(Date.now() - ms).toISOString())
  return count || 0
}
export async function POST(req: NextRequest) {
  try {
    const b: Record<string, any> = await req.json()
    const acao = String(b.acao || '')
    const ctx = await carregar(b.token)
    if (!ctx) return erro('Mesa não encontrada ou indisponível. Chame o garçom.', 404)
    const { mesa, company, comanda } = ctx
    const cfg = await configQr(company.id)

    // ---------- cardápio da mesa ----------
    if (acao === 'info') {
      const [{ data: cats }, { data: prods }] = await Promise.all([
        sb.from('loja_categorias').select('id, name').eq('company_id', company.id).order('display_order'),
        sb.from('loja_produtos')
          .select('id, name, description, photo_url, category_id, sale_price, promo_type, promo_value, promo_starts_at, promo_ends_at, esgotado, track_stock, stock_qty, groups:loja_opcoes_grupo(id, name, required, min_select, max_select, pricing_rule, display_order, options:loja_opcoes(id, name, price, display_order, pausado))')
          .eq('company_id', company.id).eq('active', true).eq('canal_mesa', true).order('display_order'),
      ])
      const produtos = (prods || [])
        .filter((p: any) => !p.esgotado && !(p.track_stock && (p.stock_qty ?? 0) <= 0))
        .map((p: any) => {
          const preco = promoPrice({ ...p, sale_price: Number(p.sale_price), promo_value: p.promo_value != null ? Number(p.promo_value) : null } as never) ?? Number(p.sale_price)
          const grupos = [...(p.groups || [])].sort((a: any, c: any) => (a.display_order ?? 0) - (c.display_order ?? 0)).map((g: any) => ({
            id: g.id, name: g.name, required: !!g.required, min: g.min_select || 0, max: Math.max(1, g.max_select || 1),
            options: [...(g.options || [])].filter((o: any) => !o.pausado).sort((a: any, c: any) => (a.display_order ?? 0) - (c.display_order ?? 0)).map((o: any) => ({ id: o.id, name: o.name, price: Number(o.price) || 0 })),
          }))
          return {
            id: p.id, name: p.name, description: p.description || null, photo: p.photo_url || null, categoriaId: p.category_id || null,
            preco: r2(preco), precoCheio: preco < Number(p.sale_price) ? Number(p.sale_price) : null,
            porPeso: PESO_REGEX.test(p.name), grupos,
          }
        })
      return NextResponse.json({
        ok: true,
        // Logo da loja (a mesma do centro do QR, enviada em Mesas → Configurar). A página esconde se não existir.
        empresa: { nome: company.name, logo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/loja-produtos/${company.id}/qr-logo.png` },
        mesa: { numero: mesa.numero },
        contaAberta: !!comanda,
        // A chave da conta só sai quando há conta aberta; a página guarda e manda de volta.
        sessao: comanda ? comanda.sessao_secret : null,
        podePedir: cfg.qrPedir,
        cashback: { ativo: !!company.cashback_enabled && Number(company.cashback_percent_mesa) > 0, percentual: Number(company.cashback_percent_mesa) || 0 },
        categorias: cats || [],
        produtos,
      })
    }

    // ---------- pedido ----------
    if (acao === 'pedir') {
      if (!cfg.qrPedir) return erro('Essa loja não recebe pedido pelo QR. Chame o garçom.', 403)
      if (!sessaoConfere(comanda, b.sessao)) return erro(ENCERRADA, 409)

      // Limites contra brincadeira/robô: envios por minuto (configurável) e pedidos esperando.
      const desde = new Date(Date.now() - 60_000).toISOString()
      const [{ count: ultMin }, { count: abertos }] = await Promise.all([
        sb.from('loja_mesa_chamados').select('id', { count: 'exact', head: true }).eq('mesa_id', mesa.id).eq('tipo', 'pedido').gte('criado_em', desde),
        sb.from('loja_mesa_chamados').select('id', { count: 'exact', head: true }).eq('mesa_id', mesa.id).eq('tipo', 'pedido').eq('status', 'aberto'),
      ])
      if ((ultMin || 0) >= cfg.porMinuto) return erro('Muitos pedidos em sequência. Espere um instante e tente de novo.', 429)
      if ((abertos || 0) >= 5) return erro('Já há pedidos esperando o garçom. Aguarde a confirmação.', 429)

      const entrada: any[] = Array.isArray(b.itens) ? b.itens : []
      if (entrada.length === 0 || entrada.length > 40) return erro('Escolha pelo menos um item.')
      const ids = [...new Set(entrada.map(i => String(i?.produtoId || '')))]
      const { data: prods } = await sb.from('loja_produtos')
        .select('id, name, sale_price, promo_type, promo_value, promo_starts_at, promo_ends_at, active, esgotado, track_stock, stock_qty, groups:loja_opcoes_grupo(id, name, required, min_select, max_select, pricing_rule, options:loja_opcoes(id, name, price, pausado))')
        .eq('company_id', company.id).eq('canal_mesa', true).in('id', ids)
      const porId = new Map<string, ProdutoMesaDb>((prods || []).map((p: any) => [p.id, p as ProdutoMesaDb]))

      const itens: { produtoId: string; nome: string; qty: number; modifiers: { name: string; price: number }[]; notes: string | null; unit: number }[] = []
      for (const i of entrada) {
        const p = porId.get(String(i?.produtoId))
        if (!p || !p.active) return erro('Um dos itens não está mais disponível. Atualize o cardápio.', 409)
        if (p.esgotado || (p.track_stock && (p.stock_qty ?? 0) <= 0)) return erro(`"${p.name}" esgotou.`, 409)
        if (PESO_REGEX.test(p.name)) return erro(`"${p.name}" é vendido por peso. Toque em “Chamar garçom” para pedir.`, 400)
        const qty = Math.floor(Number(i.qty))
        if (!(qty >= 1 && qty <= 20)) return erro('Quantidade inválida.')
        const o = resolveOpcoes(p, i.opcoes)
        if ('erro' in o) return erro(o.erro)
        const base = promoPrice({ ...p, sale_price: Number(p.sale_price), promo_value: p.promo_value != null ? Number(p.promo_value) : null } as never) ?? Number(p.sale_price)
        const unit = r2(base + o.mods.reduce((s, m) => s + m.price, 0))
        itens.push({ produtoId: p.id, nome: p.name, qty, modifiers: o.mods, notes: i.obs ? String(i.obs).slice(0, 120) : null, unit })
      }
      const total = r2(itens.reduce((s, i) => s + i.unit * i.qty, 0))
      const tel = normalizePhone(b.telefone)
      if (b.telefone && (tel.length < 12 || tel.length > 13)) return erro('Confira o número do WhatsApp (com DDD) ou deixe em branco.')
      const nome = b.nome ? String(b.nome).trim().slice(0, 40) : ''
      const resumo = `${itens.reduce((s, i) => s + i.qty, 0)} ${itens.reduce((s, i) => s + i.qty, 0) === 1 ? 'item' : 'itens'} · R$ ${total.toFixed(2).replace('.', ',')}`
      const { data: ch, error } = await sb.from('loja_mesa_chamados').insert({
        company_id: company.id, mesa_id: mesa.id, comanda_id: comanda?.id ?? null, tipo: 'pedido', mensagem: resumo,
        payload: { itens, obs: b.obs ? String(b.obs).slice(0, 300) : null, telefone: tel || null, nome: nome || null, total },
      }).select('id').single()
      if (error || !ch) return erro('Não consegui enviar o pedido. Chame o garçom.', 500)
      return NextResponse.json({ ok: true, chamadoId: ch.id, total, aguardando: true })
    }

    // ---------- chamar garçom / pedir a conta ----------
    if (acao === 'chamar') {
      const tipo = b.tipo === 'conta' ? 'conta' : 'garcom'
      if (!sessaoConfere(comanda, b.sessao)) return erro(ENCERRADA, 409)
      if (tipo === 'conta' && !comanda) return erro('Ainda não há conta aberta nessa mesa. Chame o garçom.', 400)
      const msg = b.mensagem ? String(b.mensagem).slice(0, 160) : null
      const { data: aberto } = await sb.from('loja_mesa_chamados').select('id, mensagem').eq('mesa_id', mesa.id).eq('tipo', tipo).eq('status', 'aberto').maybeSingle()
      if (aberto) {
        // Já avisado: só acrescenta o recado, sem tocar o alarme de novo.
        if (msg && !(aberto.mensagem || '').includes(msg)) await sb.from('loja_mesa_chamados').update({ mensagem: [aberto.mensagem, msg].filter(Boolean).join(' · ').slice(0, 300) }).eq('id', aberto.id)
        return NextResponse.json({ ok: true, jaChamado: true })
      }
      const desde = new Date(Date.now() - 30_000).toISOString()
      const { count } = await sb.from('loja_mesa_chamados').select('id', { count: 'exact', head: true }).eq('mesa_id', mesa.id).eq('tipo', tipo).gte('criado_em', desde)
      if ((count || 0) >= 1) return NextResponse.json({ ok: true, jaChamado: true })
      const { error } = await sb.from('loja_mesa_chamados').insert({ company_id: company.id, mesa_id: mesa.id, comanda_id: comanda?.id ?? null, tipo, mensagem: msg })
      if (error) return erro('Não consegui avisar o garçom. Levante a mão para ele.', 500)
      return NextResponse.json({ ok: true })
    }

    // ---------- identificação do cliente por código (cashback) ----------
    if (acao === 'carteira' || acao === 'codigo_enviar' || acao === 'codigo_verificar') {
      if (!company.cashback_enabled) return erro('Esta loja não usa cashback.', 400)
      if (!comanda) return erro('A conta ainda não foi aberta. Peça ao garçom ou envie um pedido primeiro.', 409)
      if (!sessaoConfere(comanda, b.sessao)) return erro(ENCERRADA, 409)

      if (acao === 'carteira') {
        const { data: c } = await sb.from('loja_comandas').select('customer_phone').eq('id', comanda.id).maybeSingle()
        const ok = await telefoneVerificado(comanda.id, c?.customer_phone ?? null)
        return NextResponse.json({ ok: true, verificado: ok, telefone: ok ? c?.customer_phone : null, saldo: ok && c?.customer_phone ? r2(await getSaldoCashback(sb, company.id, c.customer_phone)) : 0 })
      }

      const tel = normalizePhone(b.telefone)
      if (tel.length < 12 || tel.length > 13) return erro('Confira o número do WhatsApp (com DDD).')
      const janela = Math.floor(Date.now() / JANELA_MS)

      // Uma conta, um WhatsApp (pedido do Ricardo, 4/nov/2026): se a conta já tem telefone
      // (do garçom ou de outra pessoa da mesa), outro número não entra — evita 4 pessoas da mesma
      // mesa ganhando cashback/prêmio pela mesma comanda. Só o garçom troca (aba da comanda).
      {
        const { data: cc } = await sb.from('loja_comandas').select('customer_phone').eq('id', comanda.id).maybeSingle()
        if (cc?.customer_phone && cc.customer_phone !== tel) {
          return erro(`Já existe um WhatsApp cadastrado para esta conta (final ${cc.customer_phone.slice(-4)}). Para trocar, chame o garçom.`, 409)
        }
      }

      if (acao === 'codigo_enviar') {
        if ((await contarEventos(comanda.id, 'otp_enviado', 60_000)) >= 1) return erro('Aguarde 1 minuto para pedir outro código.', 429)
        if ((await contarEventos(comanda.id, 'otp_enviado', 3_600_000)) >= 3) return erro('Muitos códigos pedidos. Chame o garçom para ajudar.', 429)
        await evento(company.id, comanda.id, 'otp_enviado', { final: tel.slice(-4) }, null)
        const r = await sendPlatformWhatsApp(tel, `🔐 Seu código Trindade Online (${company.name}): *${codigoOtp(comanda.id, tel, janela)}*\n\nVale por alguns minutos. Não compartilhe com ninguém.`)
        if (!r.ok) return erro('Não consegui enviar o código agora. Chame o garçom.', 502)
        return NextResponse.json({ ok: true })
      }

      // codigo_verificar
      if ((await contarEventos(comanda.id, 'otp_errado', 10 * 60_000)) >= 5) return erro('Muitas tentativas erradas. Chame o garçom.', 429)
      const dig = String(b.codigo || '').replace(/\D/g, '')
      const valido = [janela, janela - 1].some(j => igual(dig, codigoOtp(comanda.id, tel, j)))
      if (!valido) {
        await evento(company.id, comanda.id, 'otp_errado', {}, null)
        return erro('Código incorreto ou vencido.', 400)
      }
      await sb.from('loja_comandas').update({ customer_phone: tel }).eq('id', comanda.id)
      await evento(company.id, comanda.id, 'telefone_verificado', { telefone: tel }, null)
      return NextResponse.json({ ok: true, verificado: true, telefone: tel, saldo: r2(await getSaldoCashback(sb, company.id, tel)) })
    }

    // ---------- andamento do pedido enviado ----------
    if (acao === 'status') {
      const { data: ch } = await sb.from('loja_mesa_chamados').select('status, payload').eq('id', String(b.chamadoId || '')).eq('mesa_id', mesa.id).eq('tipo', 'pedido').maybeSingle()
      if (!ch) return erro('Pedido não encontrado.', 404)
      return NextResponse.json({ ok: true, status: ch.status, motivo: ch.status === 'cancelado' ? (ch.payload?.recusa || null) : null })
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    console.error('[mesa-publica] falha:', e)
    return erro('Não consegui agora. Chame o garçom.', 500)
  }
}
