/* eslint-disable @typescript-eslint/no-explicit-any -- corpo JSON validado campo a campo abaixo */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { promoPrice } from '@/lib/lojaPricing'
import { PESO_REGEX } from '@/lib/produtoCart'
import { normalizePhone } from '@/lib/phone'
import { moduleActive } from '@/lib/modules'
import { sb, erro, r2, configQr, resolveOpcoes, type ProdutoMesaDb } from '@/lib/mesas'

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
    .select('id, name, slug, mesas_enabled, loja_digital_enabled, trial_modules_until').eq('id', mesa.company_id).maybeSingle()
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
          .select('id, name, description, photo_url, category_id, sale_price, promo_type, promo_value, promo_starts_at, promo_ends_at, esgotado, track_stock, stock_qty, groups:loja_opcoes_grupo(id, name, required, min_select, max_select, pricing_rule, display_order, options:loja_opcoes(id, name, price, display_order))')
          .eq('company_id', company.id).eq('active', true).order('display_order'),
      ])
      const produtos = (prods || [])
        .filter((p: any) => !p.esgotado && !(p.track_stock && (p.stock_qty ?? 0) <= 0))
        .map((p: any) => {
          const preco = promoPrice({ ...p, sale_price: Number(p.sale_price), promo_value: p.promo_value != null ? Number(p.promo_value) : null } as never) ?? Number(p.sale_price)
          const grupos = [...(p.groups || [])].sort((a: any, c: any) => (a.display_order ?? 0) - (c.display_order ?? 0)).map((g: any) => ({
            id: g.id, name: g.name, required: !!g.required, min: g.min_select || 0, max: Math.max(1, g.max_select || 1),
            options: [...(g.options || [])].sort((a: any, c: any) => (a.display_order ?? 0) - (c.display_order ?? 0)).map((o: any) => ({ id: o.id, name: o.name, price: Number(o.price) || 0 })),
          }))
          return {
            id: p.id, name: p.name, description: p.description || null, photo: p.photo_url || null, categoriaId: p.category_id || null,
            preco: r2(preco), precoCheio: preco < Number(p.sale_price) ? Number(p.sale_price) : null,
            porPeso: PESO_REGEX.test(p.name), grupos,
          }
        })
      return NextResponse.json({
        ok: true,
        empresa: { nome: company.name },
        mesa: { numero: mesa.numero },
        contaAberta: !!comanda,
        // A chave da conta só sai quando há conta aberta; a página guarda e manda de volta.
        sessao: comanda ? comanda.sessao_secret : null,
        podePedir: cfg.qrPedir,
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
        .select('id, name, sale_price, promo_type, promo_value, promo_starts_at, promo_ends_at, active, esgotado, track_stock, stock_qty, groups:loja_opcoes_grupo(id, name, required, min_select, max_select, pricing_rule, options:loja_opcoes(id, name, price))')
        .eq('company_id', company.id).in('id', ids)
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
