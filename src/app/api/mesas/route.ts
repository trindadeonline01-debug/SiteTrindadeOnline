/* eslint-disable @typescript-eslint/no-explicit-any -- corpo JSON validado campo a campo abaixo */
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, randomInt } from 'crypto'
import { normalizePhone } from '@/lib/phone'
import { requireUser } from '@/lib/requireUser'
import { promoPrice } from '@/lib/lojaPricing'
import { sendCustomerWhatsApp } from '@/lib/whatsapp'
import { desdeDaConta, jaGanhouNosUltimosDias, melhorRodadaPremiavel } from '@/lib/quizPremio'
import { valorDoPremio } from '@/lib/quizRegras'
import { creditarCashback, creditarCashbackAvulso, debitarCashback, getSaldoCashback, reembolsarCashback, valorItensSemCashback } from '@/lib/cashback'
import {
  sb, acessoMesas, erro, r2, hashPin, pinOk, exigePinSupervisor, evento, recalcComanda, totalPago, novoQrToken, telefoneVerificado,
} from '@/lib/mesas'

// Todas as ações do garçom/dono sobre mesas e comandas num lugar só. A tela
// manda a ação; aqui o servidor confere dono, módulo ligado, PIN da
// supervisão e recalcula o valor — o tablet nunca decide total nem fecha conta
// sozinho. docs/DESENHO_MESAS_JOGOS.md.

type Body = Record<string, any>

async function comandaAberta(companyId: string, comandaId: unknown) {
  if (!comandaId) return null
  const { data } = await sb.from('loja_comandas').select('*').eq('id', String(comandaId)).eq('company_id', companyId).maybeSingle()
  return data && data.status === 'aberta' ? data : null
}

type RodadaOk = { ped: { id: string; order_number: number | null }; linhas: { produto_id: string; product_name: string; unit_price: number; qty: number; peso_kg: number | null; selected_options: unknown[]; notes: string | null }[]; calc: Awaited<ReturnType<typeof recalcComanda>> }

// Uma rodada = pedido da cozinha ligado à comanda. Usada pelo garçom (tablet) e
// pela confirmação de pedido vindo do QR do cliente: o preço é sempre o do banco.
async function criarRodada(companyId: string, c: any, entrada: any[], obs: unknown): Promise<{ erro: NextResponse } | RodadaOk> {
  if (entrada.length === 0 || entrada.length > 60) return { erro: erro('Adicione pelo menos um item.') }
  const ids = [...new Set(entrada.map(i => String(i.produtoId || '')))]
  const { data: prods } = await sb.from('loja_produtos')
    .select('id, name, sale_price, promo_type, promo_value, promo_starts_at, promo_ends_at, active, esgotado, track_stock, stock_qty')
    .eq('company_id', companyId).eq('canal_mesa', true).in('id', ids)
  const porId = new Map((prods || []).map(p => [p.id, p]))
  const linhas: { produto_id: string; product_name: string; unit_price: number; qty: number; peso_kg: number | null; selected_options: unknown[]; notes: string | null }[] = []
  for (const i of entrada) {
    const p = porId.get(String(i.produtoId))
    if (!p || !p.active) return { erro: erro('Um dos itens não está mais disponível.', 409) }
    if (p.esgotado || (p.track_stock && (p.stock_qty ?? 0) <= 0)) return { erro: erro(`"${p.name}" esgotou.`, 409) }
    const base = promoPrice({ ...p, sale_price: Number(p.sale_price), promo_value: p.promo_value != null ? Number(p.promo_value) : null } as never) ?? Number(p.sale_price)
    const mods = (Array.isArray(i.modifiers) ? i.modifiers : []).slice(0, 30)
      .map((m: any) => ({ name: String(m?.name || '').slice(0, 80), price: Math.max(0, Number(m?.price) || 0) }))
    const extra = mods.reduce((s: number, m: { price: number }) => s + m.price, 0)
    const unit = r2(base + extra)
    const peso = i.pesoKg != null ? Number(i.pesoKg) : null
    if (peso != null) {
      if (!(peso > 0 && peso < 100)) return { erro: erro('Peso inválido.') }
      linhas.push({ produto_id: p.id, product_name: p.name, unit_price: r2(unit * peso), qty: 1, peso_kg: peso, selected_options: mods, notes: i.notes ? String(i.notes).slice(0, 200) : null })
    } else {
      const qty = Math.floor(Number(i.qty))
      if (!(qty >= 1 && qty <= 99)) return { erro: erro('Quantidade inválida.') }
      linhas.push({ produto_id: p.id, product_name: p.name, unit_price: unit, qty, peso_kg: null, selected_options: mods, notes: i.notes ? String(i.notes).slice(0, 200) : null })
    }
  }
  const subtotal = r2(linhas.reduce((s, l) => s + l.unit_price * l.qty, 0))
  const { data: mesa } = c.mesa_id ? await sb.from('loja_mesas').select('numero').eq('id', c.mesa_id).maybeSingle() : { data: null }
  // Rodada = pedido comum da loja ligado à comanda. Sem telefone no
  // pedido (fica na comanda) pra não disparar WhatsApp de status nem
  // cashback; origin 'mesa' + comanda_id identificam a rodada.
  const { data: ped, error: pe } = await sb.from('loja_pedidos').insert({
    company_id: companyId, customer_id: null, customer_name: c.tipo === 'retirada' ? `Retirada ${c.rotulo || '#' + c.numero}`.trim() : `Mesa ${mesa?.numero ?? ''}`.trim(), customer_phone: null,
    delivery_type: 'balcao', origin: 'mesa', comanda_id: c.id,
    subtotal, total: subtotal, accepted_at: new Date().toISOString(),
    notes: obs ? String(obs).slice(0, 300) : null,
  }).select('id, order_number').single()
  if (pe || !ped) return { erro: erro('Não consegui lançar o pedido: ' + (pe?.message || ''), 500) }
  const { error: ie } = await sb.from('loja_pedido_itens').insert(linhas.map(l => ({ pedido_id: ped.id, ...l })))
  if (ie) {
    await sb.from('loja_pedidos').delete().eq('id', ped.id)
    return { erro: erro('Não consegui salvar os itens: ' + ie.message, 500) }
  }
  const calc = await recalcComanda(c.id)
  await evento(companyId, c.id, 'rodada', { pedido: ped.order_number, itens: linhas.length, valor: subtotal }, c.garcom_nome)
  return { ped, linhas, calc }
}

// Primeira rodada (pedido) ativa da conta: serve de "chave" do cashback no extrato —
// o índice único do crédito é por pedido, então a conta só credita uma vez.
async function primeiraRodada(comandaId: string): Promise<string | null> {
  const { data } = await sb.from('loja_pedidos').select('id').eq('comanda_id', comandaId).neq('status', 'cancelado').order('created_at', { ascending: true }).limit(1)
  return data?.[0]?.id ?? null
}

export async function POST(req: NextRequest) {
  try {
    const b: Body = await req.json()
    const companyId = String(b.companyId || '')
    const acao = String(b.acao || '')
    if (!companyId || !acao) return erro('Dados obrigatórios.')

    // Configurar (PIN, taxa, mesas, garçons) funciona mesmo com o módulo
    // desligado — o dono prepara tudo antes de ligar.
    const livre = ['config_salvar', 'mesas_acrescentar', 'mesas_remover', 'garcom_salvar', 'pin_zerar'].includes(acao)
    const acc = await acessoMesas(req, companyId, { exigirLigado: !livre })
    if (acc instanceof NextResponse) return acc
    const { company } = acc

    // Trocar PIN e renomear garçom pedem o PIN atual da supervisão — a não ser que
    // quem esteja pedindo seja a Trindade Online (admin geral), que pode redefinir.
    // Erro de PIN conta na mesma trava das outras ações (5 erros = 10 min bloqueado);
    // o registro do erro vai na comanda mais recente da loja (a tabela exige uma comanda).
    const exigePinAtual = (pin: unknown) => exigePinSupervisor(req, company, pin)

    // Abrir "Configurar" pede o PIN da supervisão (a Trindade Online passa direto;
    // loja que ainda não definiu PIN entra pra cadastrar o primeiro).
    if (acao === 'config_abrir') {
      const negado = await exigePinSupervisor(req, company, b.pin)
      if (negado) return negado
      return NextResponse.json({ ok: true })
    }

    // Saldo de cashback do cliente da comanda (telefone cadastrado nela).
    if (acao === 'cashback_saldo') {
      const c = await comandaAberta(companyId, b.comandaId)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      const { data: cfg } = await sb.from('companies').select('cashback_enabled').eq('id', companyId).maybeSingle()
      if (!cfg?.cashback_enabled || !c.customer_phone) return NextResponse.json({ ok: true, ativo: !!cfg?.cashback_enabled, saldo: 0, verificado: false })
      return NextResponse.json({ ok: true, ativo: true, saldo: r2(await getSaldoCashback(sb, companyId, c.customer_phone)), verificado: await telefoneVerificado(c.id, c.customer_phone) })
    }

    // ---------- configuração ----------
    if (acao === 'pin_zerar') {
      // Só a Trindade Online: zera o PIN da loja e gera um novo, mostrado uma única vez.
      const u = await requireUser(req)
      if (u instanceof NextResponse || !u.isAdmin) return erro('Só a Trindade Online pode zerar o PIN.', 403)
      const novo = String(randomInt(0, 10000)).padStart(4, '0')
      const { error } = await sb.from('companies').update({ loja_supervisor_pin_hash: hashPin(novo) }).eq('id', companyId)
      if (error) return erro('Não consegui zerar o PIN: ' + error.message, 500)
      return NextResponse.json({ ok: true, pin: novo })
    }

    if (acao === 'config_salvar') {
      const upd: Record<string, unknown> = {}
      if (b.taxaPct != null) {
        const t = Number(b.taxaPct)
        if (!(t >= 0 && t <= 30)) return erro('A taxa de serviço precisa ficar entre 0% e 30%.')
        upd.loja_taxa_servico_pct = t
      }
      if (b.pin) {
        if (!/^\d{4,6}$/.test(String(b.pin))) return erro('O PIN precisa ter de 4 a 6 números.')
        const negado = await exigePinAtual(b.pinAtual)
        if (negado) return negado
        upd.loja_supervisor_pin_hash = hashPin(String(b.pin))
      }
      if (typeof b.qrPedir === 'boolean') upd.mesas_qr_pedir = b.qrPedir
      if (b.pedidosPorMinuto != null) {
        const n = Math.floor(Number(b.pedidosPorMinuto))
        if (!(n >= 1 && n <= 10)) return erro('O limite de envios por minuto vai de 1 a 10.')
        upd.mesas_pedidos_por_minuto = n
      }
      if (typeof b.mesasEnabled === 'boolean') {
        // Ligar/desligar o módulo é decisão da plataforma (admin), não da loja.
        const u = await requireUser(req)
        if (u instanceof NextResponse || !u.isAdmin) return erro('Só a Trindade Online liga o módulo de Mesas.', 403)
        upd.mesas_enabled = b.mesasEnabled
      }
      if (Object.keys(upd).length === 0) return erro('Nada para salvar.')
      const { error } = await sb.from('companies').update(upd).eq('id', companyId)
      if (error) return erro('Não consegui salvar: ' + error.message, 500)
      return NextResponse.json({ ok: true })
    }

    if (acao === 'mesas_acrescentar') {
      const qtd = Math.floor(Number(b.qtd))
      if (!(qtd >= 1 && qtd <= 50)) return erro('Escolha de 1 a 50 mesas.')
      const { data: todas } = await sb.from('loja_mesas').select('id, numero, ativa').eq('company_id', companyId).order('numero')
      const lista = todas || []
      const maxAtiva = Math.max(0, ...lista.filter(m => m.ativa).map(m => m.numero))
      const maxGeral = Math.max(0, ...lista.map(m => m.numero))
      if (lista.filter(m => m.ativa).length + qtd > 200) return erro('Limite de 200 mesas.')
      // Primeiro volta com as mesas removidas que vêm logo depois da última ativa (a numeração
      // fica seguida: tirou da 17 à 25, acrescentar 3 devolve a 17, 18 e 19). QR novo para elas.
      const reativar = lista.filter(m => !m.ativa && m.numero > maxAtiva).slice(0, qtd)
      for (const m of reativar) await sb.from('loja_mesas').update({ ativa: true, qr_token: novoQrToken() }).eq('id', m.id)
      const faltam = qtd - reativar.length
      if (faltam > 0) {
        const rows = Array.from({ length: faltam }, (_, i) => ({ company_id: companyId, numero: maxGeral + i + 1, qr_token: novoQrToken() }))
        const { error } = await sb.from('loja_mesas').insert(rows)
        if (error) return erro('Não consegui criar as mesas: ' + error.message, 500)
      }
      const ate = Math.max(maxAtiva + qtd, ...reativar.map(m => m.numero), faltam > 0 ? maxGeral + faltam : 0)
      return NextResponse.json({ ok: true, de: maxAtiva + 1, ate })
    }

    // Tira as últimas mesas (de trás para frente). A mesa sai da tela e o QR dela para de abrir, mas o
    // histórico de contas fica guardado. Mesa com conta aberta não sai.
    if (acao === 'mesas_remover') {
      const qtd = Math.floor(Number(b.qtd))
      if (!(qtd >= 1 && qtd <= 200)) return erro('Informe quantas mesas tirar.')
      const { data: ativas } = await sb.from('loja_mesas').select('id, numero').eq('company_id', companyId).eq('ativa', true).order('numero', { ascending: false })
      const lista = ativas || []
      if (qtd > lista.length) return erro(`A loja só tem ${lista.length} mesas.`)
      const alvo = lista.slice(0, qtd)
      const ids = alvo.map(m => m.id)
      const { data: abertas } = await sb.from('loja_comandas').select('mesa_id').in('mesa_id', ids).eq('status', 'aberta')
      if (abertas && abertas.length) {
        const ocupadas = alvo.filter(m => abertas.some(c => c.mesa_id === m.id)).map(m => m.numero).sort((x, y) => x - y)
        return erro(`Mesa ${ocupadas.join(', ')} com conta aberta. Feche a conta antes de tirar.`, 409)
      }
      const { error } = await sb.from('loja_mesas').update({ ativa: false }).in('id', ids)
      if (error) return erro('Não consegui tirar as mesas: ' + error.message, 500)
      await sb.from('loja_mesa_chamados').update({ status: 'atendido', atendido_em: new Date().toISOString(), atendido_por: 'sistema' }).in('mesa_id', ids).eq('status', 'aberto')
      const nums = alvo.map(m => m.numero).sort((x, y) => x - y)
      return NextResponse.json({ ok: true, de: nums[0], ate: nums[nums.length - 1], restam: lista.length - qtd })
    }

    if (acao === 'garcom_salvar') {
      const nome = String(b.nome || '').trim().slice(0, 40)
      if (!nome) return erro('Informe o nome do garçom.')
      if (b.id) {
        const { data: atual } = await sb.from('loja_garcons').select('nome').eq('id', String(b.id)).eq('company_id', companyId).maybeSingle()
        if (!atual) return erro('Garçom não encontrado.', 404)
        if (atual.nome !== nome) {
          const negado = await exigePinAtual(b.pin)
          if (negado) return negado
        }
        const { error } = await sb.from('loja_garcons').update({ nome, ativo: b.ativo !== false }).eq('id', String(b.id)).eq('company_id', companyId)
        if (error) return erro(error.message, 500)
      } else {
        const { error } = await sb.from('loja_garcons').insert({ company_id: companyId, nome })
        if (error) return erro(error.message, 500)
      }
      return NextResponse.json({ ok: true })
    }

    // ---------- abrir mesa ----------
    if (acao === 'abrir') {
      const { data: mesa } = await sb.from('loja_mesas').select('id, numero, ativa').eq('id', String(b.mesaId || '')).eq('company_id', companyId).maybeSingle()
      if (!mesa || !mesa.ativa) return erro('Mesa não encontrada.', 404)
      const { data: garcom } = await sb.from('loja_garcons').select('id, nome, ativo').eq('id', String(b.garcomId || '')).eq('company_id', companyId).maybeSingle()
      if (!garcom || !garcom.ativo) return erro('Escolha o garçom da mesa.')
      const { data: aberta } = await sb.from('loja_comandas').select('id').eq('mesa_id', mesa.id).eq('status', 'aberta').maybeSingle()
      if (aberta) return NextResponse.json({ ok: true, comandaId: aberta.id, jaAberta: true })
      const { data: c, error } = await sb.from('loja_comandas').insert({
        company_id: companyId, mesa_id: mesa.id, garcom_id: garcom.id, garcom_nome: garcom.nome,
        taxa_servico_ativa: Number(company.loja_taxa_servico_pct) > 0, taxa_servico_pct: Number(company.loja_taxa_servico_pct) || 0,
        sessao_secret: randomBytes(24).toString('base64url'),
      }).select('id').single()
      if (error || !c) return erro('Não consegui abrir a mesa: ' + (error?.message || ''), 500)
      await evento(companyId, c.id, 'abriu', { mesa: mesa.numero, garcom: garcom.nome }, garcom.nome)
      return NextResponse.json({ ok: true, comandaId: c.id })
    }

    // ---------- retirada: conta de quem vem buscar (sem mesa, sem taxa de serviço) ----------
    if (acao === 'abrir_retirada') {
      const { data: garcom } = await sb.from('loja_garcons').select('id, nome, ativo').eq('id', String(b.garcomId || '')).eq('company_id', companyId).maybeSingle()
      if (!garcom || !garcom.ativo) return erro('Escolha quem está atendendo.')
      const rotulo = String(b.rotulo || '').trim().slice(0, 40) || null
      const { data: c, error } = await sb.from('loja_comandas').insert({
        company_id: companyId, mesa_id: null, tipo: 'retirada', rotulo, garcom_id: garcom.id, garcom_nome: garcom.nome,
        taxa_servico_ativa: false, taxa_servico_pct: Number(company.loja_taxa_servico_pct) || 0,
        sessao_secret: randomBytes(24).toString('base64url'),
      }).select('id').single()
      if (error || !c) return erro('Não consegui abrir a retirada: ' + (error?.message || ''), 500)
      await evento(companyId, c.id, 'abriu', { retirada: rotulo, garcom: garcom.nome }, garcom.nome)
      return NextResponse.json({ ok: true, comandaId: c.id })
    }

    // ---------- imprimir produção por outro aparelho ----------
    // O celular não tem a impressora (ela está no computador com o QZ Tray): ele só registra o pedido de
    // impressão na comanda e o computador, que está com a tela de Mesas aberta, imprime.
    if (acao === 'producao_pedir') {
      const c = await comandaAberta(companyId, b.comandaId)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      await sb.from('loja_comandas').update({ imprimir_producao_em: new Date().toISOString(), imprimir_producao_todas: !!b.todas }).eq('id', c.id)
      return NextResponse.json({ ok: true })
    }

    // Celular sem impressora: pede para o computador imprimir a conta (aberta ou já fechada).
    if (acao === 'conta_pedir') {
      const { data: c } = await sb.from('loja_comandas').select('id').eq('id', String(b.comandaId || '')).eq('company_id', companyId).maybeSingle()
      if (!c) return erro('Comanda não encontrada.', 404)
      await sb.from('loja_comandas').update({ imprimir_conta_em: new Date().toISOString() }).eq('id', c.id)
      return NextResponse.json({ ok: true })
    }

    // ---------- lançar rodada ----------
    if (acao === 'rodada') {
      const c = await comandaAberta(companyId, b.comandaId)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      const r = await criarRodada(companyId, c, Array.isArray(b.itens) ? b.itens : [], b.obs)
      if ('erro' in r) return r.erro
      return NextResponse.json({ ok: true, pedidoId: r.ped.id, orderNumber: r.ped.order_number, ...r.calc })
    }

    // ---------- cancelar item (PIN) ----------
    if (acao === 'cancelar_item') {
      const { data: it } = await sb.from('loja_pedido_itens').select('id, pedido_id, product_name, unit_price, qty').eq('id', String(b.itemId || '')).maybeSingle()
      if (!it) return erro('Item não encontrado.', 404)
      const { data: ped } = await sb.from('loja_pedidos').select('id, comanda_id, company_id, status').eq('id', it.pedido_id).maybeSingle()
      if (!ped || ped.company_id !== companyId || !ped.comanda_id) return erro('Item não encontrado.', 404)
      const c = await comandaAberta(companyId, ped.comanda_id)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      const bad = await pinOk(company, b.pin, c.id)
      if (bad) return erro(bad, 403)
      await sb.from('loja_pedido_itens').delete().eq('id', it.id)
      const { data: resto } = await sb.from('loja_pedido_itens').select('unit_price, qty').eq('pedido_id', ped.id)
      const sub = r2((resto || []).reduce((s, x) => s + Number(x.unit_price) * Number(x.qty), 0))
      await sb.from('loja_pedidos').update({
        subtotal: sub, total: sub, updated_at: new Date().toISOString(),
        ...((resto || []).length === 0 ? { status: 'cancelado', cancelado_por: 'loja', cancelado_em: new Date().toISOString() } : {}),
      }).eq('id', ped.id)
      const calc = await recalcComanda(c.id)
      await evento(companyId, c.id, 'item_cancelado', { item: it.product_name, qty: it.qty, valor: r2(Number(it.unit_price) * Number(it.qty)), motivo: b.motivo ? String(b.motivo).slice(0, 120) : null }, c.garcom_nome)
      return NextResponse.json({ ok: true, ...calc })
    }

    // ---------- desconto (PIN) ----------
    if (acao === 'desconto') {
      const c = await comandaAberta(companyId, b.comandaId)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      const bad = await pinOk(company, b.pin, c.id)
      if (bad) return erro(bad, 403)
      const valor = r2(Number(b.valor) || 0)
      if (valor < 0) return erro('Desconto inválido.')
      const calc0 = await recalcComanda(c.id)
      if (valor > (calc0?.subtotal ?? 0)) return erro('O desconto não pode ser maior que o consumo.')
      await sb.from('loja_comandas').update({ desconto: valor, desconto_motivo: b.motivo ? String(b.motivo).slice(0, 120) : null }).eq('id', c.id)
      const calc = await recalcComanda(c.id)
      await evento(companyId, c.id, 'desconto', { valor, motivo: b.motivo || null }, c.garcom_nome)
      return NextResponse.json({ ok: true, ...calc })
    }

    // ---------- taxa de serviço (garçom pode tirar/colocar) ----------
    if (acao === 'taxa_toggle') {
      const c = await comandaAberta(companyId, b.comandaId)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      await sb.from('loja_comandas').update({ taxa_servico_ativa: !!b.ativa }).eq('id', c.id)
      const calc = await recalcComanda(c.id)
      await evento(companyId, c.id, b.ativa ? 'taxa_ligada' : 'taxa_removida', {}, c.garcom_nome)
      return NextResponse.json({ ok: true, ...calc })
    }

    if (acao === 'cliente') {
      const c = await comandaAberta(companyId, b.comandaId)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      const phone = b.phone ? normalizePhone(String(b.phone)) : null
      if (phone && (phone.length < 12 || phone.length > 13)) return erro('Telefone inválido.')
      await sb.from('loja_comandas').update({ customer_phone: phone, customer_name: b.nome ? String(b.nome).slice(0, 60) : null }).eq('id', c.id)
      return NextResponse.json({ ok: true })
    }

    // ---------- pagamentos (misto / dividido) ----------
    if (acao === 'pagar') {
      const c = await comandaAberta(companyId, b.comandaId)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      if (!['dinheiro', 'cartao', 'pix', 'cashback'].includes(String(b.forma))) return erro('Forma de pagamento inválida.')
      const valor = r2(Number(b.valor) || 0)
      if (!(valor > 0)) return erro('Informe o valor.')
      const calc = await recalcComanda(c.id)
      const pago = await totalPago(c.id)
      const falta = r2((calc?.total ?? 0) - pago)
      if (valor > falta + 0.005) return erro(`O valor passa do que falta pagar (R$ ${falta.toFixed(2).replace('.', ',')}).`)
      // Cashback: o saldo vem da carteira do telefone da comanda, nunca do que a tela mandar.
      if (b.forma === 'cashback') {
        if (!c.customer_phone) return erro('Informe o WhatsApp do cliente na comanda para usar o cashback.')
        const { data: cfg } = await sb.from('companies').select('cashback_enabled').eq('id', companyId).maybeSingle()
        if (!cfg?.cashback_enabled) return erro('O cashback não está ativo nesta loja.')
        // Gastar saldo exige o WhatsApp confirmado por código (QR da mesa) ou o PIN da supervisão.
        if (!(await telefoneVerificado(c.id, c.customer_phone))) {
          if (!b.pin) return erro('Confirme o WhatsApp do cliente pelo QR da mesa ou digite o PIN da supervisão para usar o cashback.', 403)
          const bad = await pinOk(company, b.pin, c.id)
          if (bad) return erro(bad, 403)
        }
        const usado = await debitarCashback(sb, { companyId, phoneRaw: c.customer_phone, valorDesejado: valor })
        if (usado + 0.005 < valor) {
          if (usado > 0) await reembolsarCashback(sb, { companyId, phoneRaw: c.customer_phone, valor: usado })
          return erro('Saldo de cashback insuficiente para esse valor.', 409)
        }
        await sb.from('cashback_ledger').insert({ company_id: companyId, customer_phone: c.customer_phone, pedido_id: await primeiraRodada(c.id), tipo: 'debito', valor })
      }
      const { data: novo, error } = await sb.from('loja_comanda_pagamentos').insert({
        comanda_id: c.id, company_id: companyId, forma: b.forma, valor,
        // Cartão: débito ou crédito (o cashback tem percentual diferente). Sem informar, vale crédito.
        cartao_tipo: b.forma === 'cartao' ? (b.cartaoTipo === 'debito' ? 'debito' : 'credito') : null,
        pessoa: b.pessoa ? String(b.pessoa).slice(0, 40) : null, customer_phone: c.customer_phone, registrado_por: c.garcom_nome,
      }).select('id').single()
      if (error) {
        if (b.forma === 'cashback') await reembolsarCashback(sb, { companyId, phoneRaw: c.customer_phone, valor })
        return erro('Não consegui registrar o pagamento: ' + error.message, 500)
      }
      await evento(companyId, c.id, 'pagamento', { forma: b.forma, valor, pessoa: b.pessoa || null }, c.garcom_nome)
      return NextResponse.json({ ok: true, falta: r2(falta - valor), pagamentoId: novo?.id ?? null })
    }

    if (acao === 'remover_pagamento') {
      const { data: pg } = await sb.from('loja_comanda_pagamentos').select('id, comanda_id, forma, valor').eq('id', String(b.pagamentoId || '')).eq('company_id', companyId).maybeSingle()
      if (!pg) return erro('Pagamento não encontrado.', 404)
      const c = await comandaAberta(companyId, pg.comanda_id)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      const bad = await pinOk(company, b.pin, c.id)
      if (bad) return erro(bad, 403)
      await sb.from('loja_comanda_pagamentos').delete().eq('id', pg.id)
      // Pagamento em cashback removido: o saldo volta pra carteira do cliente.
      if (pg.forma === 'cashback' && c.customer_phone) {
        await reembolsarCashback(sb, { companyId, phoneRaw: c.customer_phone, valor: Number(pg.valor) })
        await sb.from('cashback_ledger').insert({ company_id: companyId, customer_phone: c.customer_phone, pedido_id: null, tipo: 'estorno', valor: Number(pg.valor) })
      }
      await evento(companyId, c.id, 'pagamento_removido', { forma: pg.forma, valor: pg.valor }, c.garcom_nome)
      return NextResponse.json({ ok: true })
    }

    // ---------- fechar conta ----------
    if (acao === 'fechar') {
      const c = await comandaAberta(companyId, b.comandaId)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      const calc = await recalcComanda(c.id)
      const pago = await totalPago(c.id)
      const total = calc?.total ?? 0
      if (pago + 0.005 < total) return erro(`Ainda falta pagar R$ ${r2(total - pago).toFixed(2).replace('.', ',')}.`, 409)
      const { data: pgs } = await sb.from('loja_comanda_pagamentos').select('forma, valor, cartao_tipo').eq('comanda_id', c.id)
      const formas = [...new Set((pgs || []).map(p => p.forma))]
      const agora = new Date().toISOString()
      const { error } = await sb.from('loja_comandas').update({ status: 'fechada', fechada_em: agora, fechada_por: c.garcom_nome, updated_at: agora }).eq('id', c.id).eq('status', 'aberta')
      if (error) return erro('Não consegui fechar a conta: ' + error.message, 500)
      // Só agora as rodadas contam como vendas pagas.
      await sb.from('loja_pedidos').update({ payment_status: 'pago', payment_method: formas.length === 1 ? formas[0] : (formas.length > 1 ? 'misto' : null), updated_at: agora })
        .eq('comanda_id', c.id).neq('status', 'cancelado')
      if (c.mesa_id) await sb.from('loja_mesa_chamados').update({ status: 'atendido', atendido_em: agora, atendido_por: c.garcom_nome }).eq('mesa_id', c.mesa_id).eq('status', 'aberto')
      // Cashback da mesa: % próprio da mesa sobre o consumo (já sem desconto, sem a taxa
      // de serviço e sem a parte paga com cashback). Só vale pro próximo pedido do
      // cliente — o crédito entra agora, depois que a conta já foi paga.
      let cashbackGanho = 0
      try {
        const { data: cfg } = await sb.from('companies').select('cashback_enabled, cashback_percent_mesa, cashback_pct_dinheiro, cashback_pct_pix, cashback_pct_debito, cashback_pct_credito, cashback_expira_dias').eq('id', companyId).maybeSingle()
        const pctMax = Number(cfg?.cashback_percent_mesa) || 0
        if (cfg?.cashback_enabled && pctMax > 0 && c.customer_phone) {
          const pagoCash = r2((pgs || []).filter(p => p.forma === 'cashback').reduce((s, p) => s + Number(p.valor), 0))
          const { data: rodadasConta } = await sb.from('loja_pedidos').select('id').eq('comanda_id', c.id).neq('status', 'cancelado')
          const semCashback = await valorItensSemCashback(sb, (rodadasConta || []).map(r => r.id))
          const base = Math.max(0, r2((calc?.subtotal ?? 0) - (calc?.desconto ?? 0) - pagoCash - semCashback))
          // Percentual por forma de pagamento: a base é repartida na proporção do que foi pago em
          // cada forma (a parte paga com cashback não gera cashback). Forma sem percentual próprio
          // usa o percentual geral da mesa.
          const pctDe = (p: { forma: string; cartao_tipo: string | null }) => {
            const v = p.forma === 'dinheiro' ? cfg?.cashback_pct_dinheiro
              : p.forma === 'pix' ? cfg?.cashback_pct_pix
              : p.cartao_tipo === 'debito' ? cfg?.cashback_pct_debito
              : cfg?.cashback_pct_credito
            return v == null ? pctMax : Number(v) || 0
          }
          const comValor = (pgs || []).filter(p => p.forma !== 'cashback')
          const somaPago = comValor.reduce((s, p) => s + Number(p.valor), 0)
          const valorCash = somaPago > 0
            ? r2(comValor.reduce((s, p) => s + base * (Number(p.valor) / somaPago) * pctDe(p as { forma: string; cartao_tipo: string | null }) / 100, 0))
            : 0
          const rodada = await primeiraRodada(c.id)
          if (valorCash > 0 && rodada) {
            const antes = await getSaldoCashback(sb, companyId, c.customer_phone)
            await creditarCashback(sb, { companyId, phoneRaw: c.customer_phone, pedidoId: rodada, valor: valorCash })
            const depois = await getSaldoCashback(sb, companyId, c.customer_phone)
            if (depois > antes) {
              cashbackGanho = valorCash
              // Aviso ao cliente: quanto ganhou, saldo total e até quando vale. Uma mensagem só,
              // por cliente que fecha conta — nunca em lote. Falha de envio não atrapalha o fechamento.
              const dias = Number(cfg?.cashback_expira_dias) || 90
              const ate = new Date(Date.now() + dias * 86_400_000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
              const brl = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',')
              await sendCustomerWhatsApp(companyId, c.customer_phone,
                `🎁 *${company.name.trim()}* agradece a visita!\n\nVocê ganhou *${brl(valorCash)}* de cashback nesta conta. Seu saldo agora é *${brl(r2(depois))}*, para usar no próximo pedido (delivery ou aqui na mesa) até *${ate}*.\n\nÉ só informar este WhatsApp quando pedir. Veja seus saldos e extrato em trindadeonline.com.br/meu-cashback. Volte sempre! 😊`, 'aviso_pedido')
            }
          }
        }
      } catch (e) { console.error('[mesas] cashback no fechamento:', e) }
      // Prêmio do Quiz: o percentual provisório da melhor rodada do dia vira valor agora, com a conta
      // paga. Precisa de WhatsApp confirmado na conta; 1 prêmio por conta e 1 por WhatsApp a cada 7 dias.
      let premioQuiz = 0
      try {
        const { data: qc } = await sb.from('quiz_campanhas').select('ativa, premio_ativo, modo, marcos, teto_valor').eq('company_id', companyId).maybeSingle()
        if (qc?.ativa && qc.premio_ativo && c.customer_phone && await telefoneVerificado(c.id, c.customer_phone)) {
          const { count: jaTem } = await sb.from('quiz_premios').select('id', { count: 'exact', head: true }).eq('comanda_id', c.id)
          const melhor = jaTem ? null : await melhorRodadaPremiavel(sb, companyId, normalizePhone(c.customer_phone), desdeDaConta(c.aberta_em))
          if (melhor && !(await jaGanhouNosUltimosDias(sb, companyId, melhor.jogadorId))) {
            const base = Math.max(0, r2((calc?.subtotal ?? 0) - (calc?.desconto ?? 0)))
            const valor = valorDoPremio({ modo: qc.modo === 'fixo' ? 'fixo' : 'percentual', marco: melhor.marco, marcos: (qc.marcos || {}) as Record<string, number>, base, teto: Number(qc.teto_valor) || 0 })
            if (valor > 0) {
              const ins = await sb.from('quiz_premios').insert({ company_id: companyId, rodada_id: melhor.rodadaId, comanda_id: c.id, marco: melhor.marco, estado: 'liberado', valor, liberado_em: agora })
              if (!ins.error) {
                await sb.from('quiz_rodadas').update({ premiada: true, comanda_id: c.id }).eq('id', melhor.rodadaId)
                if (await creditarCashbackAvulso(sb, { companyId, phoneRaw: c.customer_phone, valor })) {
                  premioQuiz = valor
                  const brl = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',')
                  const saldo = await getSaldoCashback(sb, companyId, c.customer_phone)
                  await sendCustomerWhatsApp(companyId, c.customer_phone,
                    `🎣 Parabéns! No Quiz Pesca Premiada você garantiu *${melhor.marco}%* e ganhou *${brl(valor)}* de cashback da *${company.name.trim()}*. Seu saldo agora é *${brl(r2(saldo))}*, para usar no próximo pedido (delivery ou aqui na mesa). Ver saldo: https://www.trindadeonline.com.br/meu-cashback`)
                } else {
                  await sb.from('quiz_premios').update({ estado: 'cancelado' }).eq('rodada_id', melhor.rodadaId)
                }
              }
            }
          }
        }
      } catch (e) { console.error('[mesas] prêmio do quiz no fechamento:', e) }
      await evento(companyId, c.id, 'fechou', { total, formas, cashback: cashbackGanho || undefined, premioQuiz: premioQuiz || undefined }, c.garcom_nome)
      return NextResponse.json({ ok: true, total, cashbackGanho, premioQuiz })
    }

    if (acao === 'cancelar_comanda') {
      const c = await comandaAberta(companyId, b.comandaId)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      if ((await totalPago(c.id)) > 0) return erro('Já existe pagamento nessa comanda. Remova os pagamentos antes de cancelar.', 409)
      // Mesa zerada (nenhum pedido ativo, nenhum pagamento): o garçom libera sem PIN —
      // cliente que sentou e desistiu. Com pedido ativo, só com o PIN da supervisão.
      const { count: ativos } = await sb.from('loja_pedidos').select('id', { count: 'exact', head: true }).eq('comanda_id', c.id).neq('status', 'cancelado')
      const zerada = (ativos || 0) === 0
      if (!zerada) {
        const bad = await pinOk(company, b.pin, c.id)
        if (bad) return erro(bad, 403)
      }
      const agora = new Date().toISOString()
      await sb.from('loja_pedidos').update({ status: 'cancelado', cancelado_por: 'loja', cancelado_em: agora, updated_at: agora }).eq('comanda_id', c.id).neq('status', 'cancelado')
      await sb.from('loja_comandas').update({ status: 'cancelada', fechada_em: agora, fechada_por: c.garcom_nome, updated_at: agora }).eq('id', c.id)
      await recalcComanda(c.id)
      await evento(companyId, c.id, zerada ? 'liberada' : 'cancelou', {}, c.garcom_nome)
      return NextResponse.json({ ok: true })
    }

    // ---------- relatório de vendas: conferir PIN / reabrir / cancelar venda já fechada ----------
    // Todas pedem o PIN da supervisão: mexer em venda fechada é sensível.
    if (acao === 'pin_conferir') {
      const negado = await exigePinSupervisor(req, company, b.pin)
      if (negado) return negado
      return NextResponse.json({ ok: true })
    }

    // Reabre uma conta FECHADA para editar (acrescentar/tirar item, trocar forma de pagamento) e fechar de novo.
    if (acao === 'venda_reabrir') {
      const { data: c } = await sb.from('loja_comandas').select('*').eq('id', String(b.comandaId || '')).eq('company_id', companyId).maybeSingle()
      if (!c) return erro('Venda não encontrada.', 404)
      if (c.status === 'aberta') return NextResponse.json({ ok: true, jaAberta: true })
      if (c.status !== 'fechada') return erro('Só dá para editar venda aberta ou fechada.', 409)
      const bad = await pinOk(company, b.pin, c.id)
      if (bad) return erro(bad, 403)
      if (c.mesa_id) {
        const { data: ocupada } = await sb.from('loja_comandas').select('id').eq('mesa_id', c.mesa_id).eq('status', 'aberta').maybeSingle()
        if (ocupada) return erro('Essa mesa está com outra conta aberta agora. Feche ou libere a conta atual e tente de novo.', 409)
      }
      const agora = new Date().toISOString()
      const { error } = await sb.from('loja_comandas').update({ status: 'aberta', fechada_em: null, fechada_por: null, updated_at: agora }).eq('id', c.id).eq('status', 'fechada')
      if (error) return erro('Não consegui reabrir a venda: ' + error.message, 500)
      // Enquanto estiver aberta, as rodadas voltam a "não pagas"; o fechamento marca de novo.
      await sb.from('loja_pedidos').update({ payment_status: 'pendente', updated_at: agora }).eq('comanda_id', c.id).neq('status', 'cancelado')
      await evento(companyId, c.id, 'reaberta', { totalAntes: Number(c.total) }, c.garcom_nome)
      return NextResponse.json({ ok: true })
    }

    // Cancela a venda inteira (aberta ou já fechada): rodadas canceladas, cashback usado volta, cashback ganho sai.
    if (acao === 'venda_cancelar') {
      const { data: c } = await sb.from('loja_comandas').select('*').eq('id', String(b.comandaId || '')).eq('company_id', companyId).maybeSingle()
      if (!c) return erro('Venda não encontrada.', 404)
      if (c.status !== 'aberta' && c.status !== 'fechada') return erro('Essa venda já está cancelada.', 409)
      const bad = await pinOk(company, b.pin, c.id)
      if (bad) return erro(bad, 403)
      const rodada = await primeiraRodada(c.id)
      const { data: pgs } = await sb.from('loja_comanda_pagamentos').select('forma, valor').eq('comanda_id', c.id)
      let cashbackDevolvido = 0, cashbackRetirado = 0
      try {
        if (c.customer_phone) {
          // Cashback que o cliente GASTOU nesta conta volta para a carteira.
          const gasto = r2((pgs || []).filter(p => p.forma === 'cashback').reduce((s, p) => s + Number(p.valor), 0))
          if (gasto > 0) {
            await reembolsarCashback(sb, { companyId, phoneRaw: c.customer_phone, valor: gasto })
            await sb.from('cashback_ledger').insert({ company_id: companyId, customer_phone: c.customer_phone, pedido_id: null, tipo: 'estorno', valor: gasto })
            cashbackDevolvido = gasto
          }
          // Cashback que ele GANHOU ao fechar esta conta sai da carteira (o que ainda houver de saldo).
          if (c.status === 'fechada' && rodada) {
            const { data: cred } = await sb.from('cashback_ledger').select('valor').eq('pedido_id', rodada).eq('tipo', 'credito').maybeSingle()
            const ganho = Number(cred?.valor) || 0
            if (ganho > 0) {
              const tirado = await debitarCashback(sb, { companyId, phoneRaw: c.customer_phone, valorDesejado: ganho })
              if (tirado > 0) {
                await sb.from('cashback_ledger').insert({ company_id: companyId, customer_phone: c.customer_phone, pedido_id: rodada, tipo: 'debito', valor: tirado })
                cashbackRetirado = tirado
              }
            }
          }
        }
      } catch (e) { console.error('[mesas] cashback ao cancelar venda:', e) }
      const agora = new Date().toISOString()
      await sb.from('loja_pedidos').update({ status: 'cancelado', cancelado_por: 'loja', cancelado_em: agora, updated_at: agora }).eq('comanda_id', c.id).neq('status', 'cancelado')
      await sb.from('loja_comandas').update({ status: 'cancelada', fechada_em: c.fechada_em || agora, fechada_por: c.fechada_por || c.garcom_nome, updated_at: agora }).eq('id', c.id)
      if (c.mesa_id) await sb.from('loja_mesa_chamados').update({ status: 'atendido', atendido_em: agora, atendido_por: c.garcom_nome }).eq('mesa_id', c.mesa_id).eq('status', 'aberto')
      // Sem recalcComanda de propósito: a venda cancelada mantém o valor que tinha, para o relatório mostrar o que foi cancelado.
      await evento(companyId, c.id, 'venda_cancelada', { eraFechada: c.status === 'fechada', total: Number(c.total), motivo: String(b.motivo || '').slice(0, 40) || undefined, observacao: String(b.observacao || '').slice(0, 300) || undefined, cashbackDevolvido: cashbackDevolvido || undefined, cashbackRetirado: cashbackRetirado || undefined }, c.garcom_nome)
      return NextResponse.json({ ok: true, cashbackDevolvido, cashbackRetirado })
    }

    // ---------- transferir / juntar ----------
    if (acao === 'transferir') {
      const c = await comandaAberta(companyId, b.comandaId)
      if (!c) return erro('Essa comanda não está aberta.', 409)
      const { data: dest } = await sb.from('loja_mesas').select('id, numero, ativa').eq('id', String(b.mesaDestinoId || '')).eq('company_id', companyId).maybeSingle()
      if (!dest || !dest.ativa) return erro('Mesa de destino não encontrada.', 404)
      const { data: ocupada } = await sb.from('loja_comandas').select('id').eq('mesa_id', dest.id).eq('status', 'aberta').maybeSingle()
      if (ocupada) return erro(`A mesa ${dest.numero} está ocupada. Use "Juntar mesas".`, 409)
      const eraRetirada = c.tipo === 'retirada'
      // Retirada que vira mesa passa a ter a taxa de serviço normal da loja (o garçom ainda pode tirar).
      const upd: Record<string, unknown> = { mesa_id: dest.id, updated_at: new Date().toISOString() }
      if (eraRetirada) { upd.tipo = 'mesa'; upd.taxa_servico_pct = Number(company.loja_taxa_servico_pct) || 0; upd.taxa_servico_ativa = Number(company.loja_taxa_servico_pct) > 0 }
      const { error } = await sb.from('loja_comandas').update(upd).eq('id', c.id)
      if (error) return erro('Não consegui transferir: ' + error.message, 500)
      await sb.from('loja_pedidos').update({ customer_name: `Mesa ${dest.numero}` }).eq('comanda_id', c.id).in('status', ['recebido', 'em_preparo', 'pronto'])
      if (eraRetirada) await recalcComanda(c.id)
      await evento(companyId, c.id, eraRetirada ? 'retirada_virou_mesa' : 'transferiu', { para: dest.numero }, c.garcom_nome)
      return NextResponse.json({ ok: true })
    }

    if (acao === 'juntar') {
      const orig = await comandaAberta(companyId, b.comandaId)
      const dest = await comandaAberta(companyId, b.comandaDestinoId)
      if (!orig || !dest || orig.id === dest.id) return erro('Escolha duas mesas abertas diferentes.', 409)
      if ((await totalPago(orig.id)) > 0) return erro('A mesa de origem já tem pagamento. Feche ou remova antes de juntar.', 409)
      await sb.from('loja_pedidos').update({ comanda_id: dest.id }).eq('comanda_id', orig.id)
      const agora = new Date().toISOString()
      await sb.from('loja_comandas').update({ status: 'fechada', unida_a: dest.id, subtotal: 0, taxa_valor: 0, total: 0, desconto: 0, fechada_em: agora, fechada_por: 'unida', updated_at: agora }).eq('id', orig.id)
      const calc = await recalcComanda(dest.id)
      await evento(companyId, dest.id, 'juntou', { de: orig.id }, dest.garcom_nome)
      await evento(companyId, orig.id, 'unida', { em: dest.id }, orig.garcom_nome)
      return NextResponse.json({ ok: true, ...calc })
    }

    // ---------- pedido do cliente (QR) ----------
    // O cliente só manda o pedido; nada vai pra cozinha até o garçom confirmar aqui.
    if (acao === 'pedido_aceitar') {
      const { data: ch } = await sb.from('loja_mesa_chamados').select('*').eq('id', String(b.chamadoId || '')).eq('company_id', companyId).eq('tipo', 'pedido').maybeSingle()
      if (!ch) return erro('Pedido não encontrado.', 404)
      if (ch.status !== 'aberto') return erro('Esse pedido já foi tratado por outro aparelho.', 409)
      const itens: any[] = Array.isArray(ch.payload?.itens) ? ch.payload.itens : []
      if (itens.length === 0) return erro('Esse pedido está vazio.', 409)
      const { data: mesa } = await sb.from('loja_mesas').select('id, numero, ativa').eq('id', ch.mesa_id).maybeSingle()
      if (!mesa || !mesa.ativa) return erro('Mesa não encontrada.', 404)
      let { data: c } = await sb.from('loja_comandas').select('*').eq('mesa_id', mesa.id).eq('status', 'aberta').maybeSingle()
      if (c && ch.comanda_id && ch.comanda_id !== c.id) return erro('Esse pedido era de uma conta que já fechou. Recuse e peça para o cliente ler o QR de novo.', 409)
      // Reivindica o pedido antes de criar qualquer coisa (dois tablets não confirmam o mesmo).
      const { data: reiv } = await sb.from('loja_mesa_chamados').update({ status: 'atendido', atendido_em: new Date().toISOString(), atendido_por: b.por ? String(b.por).slice(0, 40) : null })
        .eq('id', ch.id).eq('status', 'aberto').select('id')
      if (!reiv || reiv.length === 0) return erro('Esse pedido já foi tratado por outro aparelho.', 409)
      const desfazer = async () => { await sb.from('loja_mesa_chamados').update({ status: 'aberto', atendido_em: null, atendido_por: null }).eq('id', ch.id) }
      let aberta = false
      if (!c) {
        const { data: garcom } = await sb.from('loja_garcons').select('id, nome, ativo').eq('id', String(b.garcomId || '')).eq('company_id', companyId).maybeSingle()
        if (!garcom || !garcom.ativo) { await desfazer(); return erro('Escolha o garçom da mesa.') }
        const { data: nova, error } = await sb.from('loja_comandas').insert({
          company_id: companyId, mesa_id: mesa.id, garcom_id: garcom.id, garcom_nome: garcom.nome,
          taxa_servico_ativa: Number(company.loja_taxa_servico_pct) > 0, taxa_servico_pct: Number(company.loja_taxa_servico_pct) || 0,
          sessao_secret: randomBytes(24).toString('base64url'),
          customer_phone: ch.payload?.telefone || null, customer_name: ch.payload?.nome || null,
        }).select('*').single()
        if (error || !nova) { await desfazer(); return erro('Não consegui abrir a mesa: ' + (error?.message || ''), 500) }
        c = nova; aberta = true
        await evento(companyId, nova.id, 'abriu', { mesa: mesa.numero, garcom: garcom.nome, origem: 'qr_cliente' }, garcom.nome)
        // O cliente já confirmou o WhatsApp por código antes de pedir: a conta nasce verificada.
        if (ch.payload?.verificado && ch.payload?.telefone) await evento(companyId, nova.id, 'telefone_verificado', { telefone: ch.payload.telefone }, null)
      } else if (!c.customer_phone && ch.payload?.telefone) {
        await sb.from('loja_comandas').update({ customer_phone: ch.payload.telefone, customer_name: c.customer_name || ch.payload.nome || null }).eq('id', c.id)
        if (ch.payload?.verificado) await evento(companyId, c.id, 'telefone_verificado', { telefone: ch.payload.telefone }, null)
      }
      const entrada = itens.map(i => ({ produtoId: i.produtoId, qty: i.qty, modifiers: i.modifiers, notes: i.notes }))
      const r = await criarRodada(companyId, c, entrada, ch.payload?.obs)
      if ('erro' in r) {
        await desfazer()
        if (aberta) await sb.from('loja_comandas').update({ status: 'cancelada', fechada_em: new Date().toISOString(), fechada_por: 'sistema' }).eq('id', c.id)
        return r.erro
      }
      await sb.from('loja_mesa_chamados').update({ comanda_id: c.id }).eq('id', ch.id)
      await evento(companyId, c.id, 'pedido_qr_confirmado', { pedido: r.ped.order_number, itens: r.linhas.length }, c.garcom_nome)
      return NextResponse.json({ ok: true, comandaId: c.id, pedidoId: r.ped.id, orderNumber: r.ped.order_number, mesaNumero: mesa.numero, garcomNome: c.garcom_nome, linhas: r.linhas, obs: ch.payload?.obs || null, ...r.calc })
    }

    if (acao === 'pedido_recusar') {
      const { data: ch } = await sb.from('loja_mesa_chamados').select('id, status, payload').eq('id', String(b.chamadoId || '')).eq('company_id', companyId).eq('tipo', 'pedido').maybeSingle()
      if (!ch) return erro('Pedido não encontrado.', 404)
      if (ch.status !== 'aberto') return erro('Esse pedido já foi tratado.', 409)
      const motivo = b.motivo ? String(b.motivo).slice(0, 120) : null
      const { error } = await sb.from('loja_mesa_chamados').update({
        status: 'cancelado', atendido_em: new Date().toISOString(), atendido_por: b.por ? String(b.por).slice(0, 40) : null,
        payload: { ...(ch.payload || {}), recusa: motivo || 'O garçom não pôde aceitar esse pedido.' },
      }).eq('id', ch.id).eq('status', 'aberto')
      if (error) return erro(error.message, 500)
      return NextResponse.json({ ok: true })
    }

    // ---------- chamados ----------
    if (acao === 'atender_chamado') {
      const { error } = await sb.from('loja_mesa_chamados').update({ status: 'atendido', atendido_em: new Date().toISOString(), atendido_por: b.por ? String(b.por).slice(0, 40) : null })
        .eq('id', String(b.chamadoId || '')).eq('company_id', companyId)
      if (error) return erro(error.message, 500)
      return NextResponse.json({ ok: true })
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    console.error('[mesas] falha:', e)
    return erro('Não consegui concluir agora. Tente de novo.', 500)
  }
}
