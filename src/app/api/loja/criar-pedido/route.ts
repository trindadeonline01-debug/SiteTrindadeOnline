import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPlatformWhatsApp, notifyOwnerNewOrder } from '@/lib/whatsapp'
import { buildOwnerMessage } from '@/lib/orderMessages'
import { debitarCashback, registrarDebitoCashback, reembolsarCashback } from '@/lib/cashback'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ItemIn = { produtoId: string; name: string; unitPrice: number; qty: number; modifiers?: { name: string; price: number }[] }

// Cria o pedido no cardápio público — roda com service role de propósito:
// é o que abre o checkout completo pra quem NÃO tem conta (só nome +
// WhatsApp, sem senha, sem redirect pro login), já que a policy de INSERT
// em loja_pedidos exige auth.uid() e um cliente anônimo nunca teria isso
// direto do navegador. A validação de quem pode pedir o quê mora aqui
// dentro, não na RLS.
export async function POST(req: NextRequest) {
  try {
    const {
      access_token, companyId, customerName, customerPhone,
      items, deliveryType, address, scheduledFor, paymentMethod, notes,
      subtotal, deliveryFee, total, couponId, origin: pedidoOrigin, useCashback,
    } = await req.json()

    if (!companyId) return NextResponse.json({ error: 'empresa obrigatória' }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'carrinho vazio' }, { status: 400 })

    // Chave-geral do admin (aba "Peça Agora", site_settings.peca_agora_enabled)
    // — desligada, NENHUMA loja aceita pedido, nem pelo link direto do
    // cardápio. Checagem aqui, não só na tela: essa é a ÚNICA rota que cria
    // pedido (tanto "Confirmar pedido" quanto "Pedir pelo WhatsApp" caem
    // aqui), então é o único lugar que precisa travar pra valer o site
    // inteiro. Pedido do Ricardo, out/2026 — "não é só pra tirar lá da
    // frente, é pra desativar qualquer possibilidade de compra".
    const { data: pecaAgoraSetting } = await supabase.from('site_settings').select('value').eq('key', 'peca_agora_enabled').maybeSingle()
    if (pecaAgoraSetting?.value !== 'true') {
      return NextResponse.json({ error: 'Pedidos pausados no momento em toda a plataforma — tenta de novo daqui a pouco.' }, { status: 503 })
    }

    let customerId: string | null = null
    let finalName = (customerName || '').trim()
    let finalPhone = (customerPhone || '').trim()

    if (access_token) {
      const { data: userData } = await supabaseAuth.auth.getUser(access_token)
      if (userData?.user) {
        customerId = userData.user.id
        const { data: profile } = await supabase.from('profiles').select('name, phone').eq('id', customerId).maybeSingle()
        finalName = finalName || profile?.name || 'Cliente'
        finalPhone = finalPhone || profile?.phone || ''
      }
    }

    // Sem conta: nome e WhatsApp passam a ser obrigatórios — antes disso a
    // loja só tinha o endereço pra tentar achar quem fez o pedido.
    if (!customerId) {
      if (!finalName) return NextResponse.json({ error: 'Informe seu nome.' }, { status: 400 })
      if (finalPhone.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Informe um WhatsApp válido.' }, { status: 400 })
    }

    const { data: company } = await supabase.from('companies')
      .select('id, name, owner_id, status, loja_digital_enabled, store_paused, pix_mp_enabled, cashback_enabled')
      .eq('id', companyId).maybeSingle()
    if (!company || company.status !== 'active' || !company.loja_digital_enabled) {
      return NextResponse.json({ error: 'Essa loja não está disponível pra pedidos agora.' }, { status: 400 })
    }
    if (company.store_paused) {
      return NextResponse.json({ error: 'A loja pausou o recebimento de pedidos no momento.' }, { status: 400 })
    }

    // Cashback — debita da carteira (desse telefone, nessa loja) ANTES de
    // calcular Pix/total, pra tudo rio abaixo (cobrança real, valor salvo no
    // pedido, mensagem pro dono) já refletir o desconto. Nunca confia no
    // valor que o cliente mandou — relê o saldo real aqui e usa o menor
    // entre saldo e total, então um saldo "inventado" no front não desconta
    // nada além do que existe de verdade.
    let cashbackUsado = 0
    if (useCashback && company.cashback_enabled && finalPhone) {
      cashbackUsado = await debitarCashback(supabase, { companyId, phoneRaw: finalPhone, valorDesejado: Number(total || 0) })
    }
    const totalComCashback = Math.max(0, Number(total || 0) - cashbackUsado)

    // Pix de verdade (Mercado Pago Connect) — só no fluxo normal de
    // "Confirmar pedido" (nunca em origin 'conversa', que é o botão "Pedir
    // pelo WhatsApp": esse continua exatamente como sempre foi, combinando
    // por fora). Gera a cobrança ANTES de criar o pedido — se o Mercado
    // Pago recusar, não sobra pedido órfão sem jeito nenhum de pagar.
    let mpPaymentId: string | null = null
    let mpQrBase64: string | null = null
    let mpQrCopiaCola: string | null = null
    if (paymentMethod === 'pix' && company.pix_mp_enabled && pedidoOrigin !== 'conversa') {
      const { data: contaMp } = await supabase.from('company_mp_accounts')
        .select('mp_access_token, application_fee_pct').eq('company_id', companyId).eq('status', 'connected').maybeSingle()
      if (contaMp) {
        try {
          const feeValue = Number((totalComCashback * (Number(contaMp.application_fee_pct) / 100)).toFixed(2))
          const origemReq = new URL(req.url).origin
          const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${contaMp.mp_access_token}`,
              'Content-Type': 'application/json',
              'X-Idempotency-Key': `pedido-${companyId}-${Date.now()}`,
            },
            body: JSON.stringify({
              transaction_amount: totalComCashback,
              description: `Pedido — ${company.name}`,
              payment_method_id: 'pix',
              payer: { email: 'cliente@trindadeonline.com.br' },
              application_fee: feeValue,
              notification_url: `${origemReq}/api/mp/webhook-loja`,
            }),
          })
          const mpData = await mpRes.json()
          if (mpRes.ok && mpData.id) {
            mpPaymentId = String(mpData.id)
            mpQrBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64 || null
            mpQrCopiaCola = mpData.point_of_interaction?.transaction_data?.qr_code || null
          } else {
            console.error('[criar-pedido] mp recusou pagamento', mpData)
            if (cashbackUsado > 0) await reembolsarCashback(supabase, { companyId, phoneRaw: finalPhone, valor: cashbackUsado })
            return NextResponse.json({ error: 'Não deu pra gerar o Pix agora — tenta de novo ou escolhe outra forma de pagamento.' }, { status: 502 })
          }
        } catch (err) {
          console.error('[criar-pedido] falha ao criar pagamento mp', err)
          if (cashbackUsado > 0) await reembolsarCashback(supabase, { companyId, phoneRaw: finalPhone, valor: cashbackUsado })
          return NextResponse.json({ error: 'Não deu pra gerar o Pix agora — tenta de novo ou escolhe outra forma de pagamento.' }, { status: 502 })
        }
      }
      // Sem conta conectada apesar do flag (desconectou entre o carregamento
      // da página e o clique) — segue sem Pix real, vira o rótulo de sempre,
      // nunca trava o cliente no meio do checkout por isso.
    }

    const { data: pedido, error: pedidoError } = await supabase.from('loja_pedidos').insert({
      company_id: companyId, customer_id: customerId,
      customer_name: finalName || 'Cliente', customer_phone: finalPhone || null,
      delivery_address: deliveryType === 'entrega' ? (address || null) : null,
      delivery_type: deliveryType === 'retirada' ? 'retirada' : 'entrega',
      scheduled_for: scheduledFor || null,
      // 'conversa' é o mesmo rótulo que o painel já usa pro pedido criado
      // manualmente dentro de uma conversa do CRM (/painel/mensagens) — aqui
      // é o botão "Prefiro pedir pelo WhatsApp" do cardápio público, mas pro
      // lojista o que importa é a MESMA coisa: veio por fora do site, não
      // pelo botão normal (pedido do Ricardo, out/2026 — unificar pedido de
      // WhatsApp com pedido de verdade, com o mesmo badge "💬 WhatsApp").
      origin: pedidoOrigin === 'conversa' ? 'conversa' : 'cardapio_publico', payment_method: paymentMethod || null,
      subtotal: Number(subtotal || 0), total: totalComCashback, delivery_fee: Number(deliveryFee || 0),
      notes: notes || null, mp_payment_id: mpPaymentId,
    }).select('id, order_number').single()
    // Mesmo cuidado que já existia quando esse insert rodava no navegador:
    // se der erro aqui, não pode passar pro cliente como se tivesse dado certo.
    if (pedidoError || !pedido) {
      console.error('[criar-pedido] falha ao criar pedido:', pedidoError)
      if (cashbackUsado > 0) await reembolsarCashback(supabase, { companyId, phoneRaw: finalPhone, valor: cashbackUsado })
      return NextResponse.json({ error: 'Não deu pra enviar seu pedido agora. Tenta de novo em alguns segundos.' }, { status: 500 })
    }

    const { error: itensError } = await supabase.from('loja_pedido_itens').insert(
      (items as ItemIn[]).map(l => ({
        pedido_id: pedido.id, produto_id: l.produtoId, product_name: l.name, unit_price: l.unitPrice, qty: l.qty,
        selected_options: l.modifiers || [],
      }))
    )
    if (itensError) {
      console.error('[criar-pedido] falha ao salvar itens:', itensError)
      await supabase.from('loja_pedidos').delete().eq('id', pedido.id)
      if (cashbackUsado > 0) await reembolsarCashback(supabase, { companyId, phoneRaw: finalPhone, valor: cashbackUsado })
      return NextResponse.json({ error: 'Não deu pra enviar seu pedido agora. Tenta de novo em alguns segundos.' }, { status: 500 })
    }
    // Ledger do débito só grava aqui, com o pedido já garantido de verdade
    // (itens inclusos) — evita registrar "usou cashback" pra um pedido que
    // acabou sendo apagado um instante depois por falha nos itens.
    if (cashbackUsado > 0) await registrarDebitoCashback(supabase, { companyId, phoneRaw: finalPhone, pedidoId: pedido.id, valor: cashbackUsado })

    // Resgate de cupom só fica registrado (e conta pra limite de uso) pra
    // quem tem conta — convidado ainda recebe o desconto no `total` que já
    // veio calculado, só não trava reuso. Mesma regra que "Enviar no
    // WhatsApp" (interesse anônimo) já seguia.
    if (couponId && customerId) {
      const code = 'TRD-' + Math.random().toString(36).substring(2, 6).toUpperCase()
      await supabase.from('coupon_redemptions').insert({ coupon_id: couponId, user_id: customerId, code, status: 'used', used_at: new Date().toISOString() })
    }

    // Confirmação por WhatsApp (cliente + dono), contador de produto,
    // chamada do motoboy da plataforma, push do dono e alerta do(s)
    // admin(s) — tudo disparado em paralelo, mas com AWAIT no conjunto
    // antes de responder. Sem isso a função serverless da Vercel pode
    // congelar/matar o processo assim que devolve a resposta, cortando
    // fetch ainda em voo (mesma lição já documentada pro webhook do MP —
    // bug real, Ricardo set/2026: pedido chegou na Calçada do Peixe e nem
    // o dono nem o admin foram avisados, tudo silencioso, sem erro).
    const origin = new URL(req.url).origin
    const valorFmt = `R$ ${totalComCashback.toFixed(2).replace('.', ',')}`
    const notifyJobs: Promise<any>[] = []

    notifyJobs.push(
      fetch(new URL('/api/loja/registrar-pedido', req.url), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, pedidoId: pedido.id, phone: finalPhone || null, name: finalName || 'Cliente',
          address: deliveryType === 'entrega' ? address : null, total: totalComCashback, subtotal: Number(subtotal || 0), deliveryFee: Number(deliveryFee || 0),
          paymentMethod: paymentMethod || null, deliveryType, notes: notes || null,
          items: (items as ItemIn[]).map(l => ({ produtoId: l.produtoId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, modifiers: l.modifiers || [] })),
          // O aviso pro dono já sai direto, no próprio processo, logo
          // abaixo — não deixa essa rota mandar de novo (ver o porquê em
          // notifyOwnerNewOrder, src/lib/whatsapp.ts).
          skipOwnerNotify: true,
        }),
      }).catch(err => console.error('[criar-pedido] falha registrar-pedido', err))
    )

    // Aviso pro WhatsApp da própria loja — chamado DIRETO aqui (mesmo
    // processo, sem fetch servidor-pra-servidor pra outra function), igual
    // ao aviso de admin logo abaixo, que já funciona assim. Achado real,
    // out/2026 (Michelly Bem Doce, pedido #2): instância conectada, telefone
    // certo no perfil, módulo ativo — mesmo assim o aviso nunca chegou.
    // Testado na mão contra a Evolution API direto (mesma instância/número):
    // enviou normal. A causa não era configuração — era esse aviso depender
    // de registrar-pedido ser chamado via fetch (acima) rodando como OUTRA
    // function serverless, sem log nenhum se esse fetch falhasse de verdade
    // ou fosse descartado. Mandar direto daqui tira esse elo frágil do meio.
    notifyJobs.push(
      notifyOwnerNewOrder(companyId, buildOwnerMessage({
        items: (items as ItemIn[]).map(l => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice, modifiers: l.modifiers || [] })),
        total: totalComCashback, paymentMethod: paymentMethod || null, deliveryType: deliveryType || null,
        address: deliveryType === 'entrega' ? (address || null) : null, notes: notes || null,
        orderNumber: pedido.order_number ?? null, customerName: finalName || 'Cliente', customerPhone: finalPhone || null,
      })).then(result => {
        if (!result.ok) console.error('[criar-pedido] aviso pro dono falhou:', result.detail)
      })
    )

    if (company.owner_id) {
      notifyJobs.push(
        fetch(new URL('/api/push/send', req.url), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `Novo pedido — ${company.name}`,
            body: `${finalName || 'Cliente'} pediu ${valorFmt}`,
            target: 'external_user_id', userId: company.owner_id,
            url: `${origin}/painel/pedidos`,
          }),
        }).catch(err => console.error('[criar-pedido] falha push dono', err))
      )
    }

    // Alerta pro(s) admin(s) da plataforma em TODO pedido novo, de
    // qualquer loja — push (mesma musiquinha que ele já recebe hoje como
    // admin) + WhatsApp da instância da plataforma. Pedido do Ricardo,
    // set/2026: quer saber na hora, independente de qual loja for, sem
    // precisar ficar de olho em cada painel separado.
    notifyJobs.push((async () => {
      try {
        const { data: admins } = await supabase.from('profiles').select('id, phone').eq('user_type', 'admin')
        if (!admins?.length) return
        const pushUrl = `${origin}/painel/pedidos?empresa=${companyId}`
        await Promise.allSettled(admins.flatMap(admin => [
          fetch(new URL('/api/push/send', req.url), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `🔔 Novo pedido — ${company.name}`,
              body: `${finalName || 'Cliente'} pediu ${valorFmt}`,
              target: 'external_user_id', userId: admin.id, url: pushUrl,
            }),
          }).catch(err => console.error('[criar-pedido] falha push admin', err)),
          admin.phone
            ? sendPlatformWhatsApp(admin.phone, `🔔 *Novo pedido na Trindade Online!*\n\nLoja: *${company.name}*\nCliente: ${finalName || 'Cliente'}\nValor: ${valorFmt}\n\n${pushUrl}`).catch(err => console.error('[criar-pedido] falha whatsapp admin', err))
            : Promise.resolve(),
        ]))
      } catch (err) {
        console.error('[criar-pedido] falha ao notificar admin', err)
      }
    })())

    await Promise.allSettled(notifyJobs)

    return NextResponse.json({
      ok: true, pedidoId: pedido.id, orderNumber: pedido.order_number, total: totalComCashback, cashbackUsado,
      pix: mpPaymentId ? { paymentId: mpPaymentId, qrCodeBase64: mpQrBase64, qrCode: mpQrCopiaCola } : null,
    })
  } catch (err: any) {
    console.error('[criar-pedido] falha geral:', err?.message || err)
    return NextResponse.json({ error: 'Não deu pra enviar seu pedido agora. Tenta de novo em alguns segundos.' }, { status: 500 })
  }
}
