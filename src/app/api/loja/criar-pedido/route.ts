import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPlatformWhatsApp } from '@/lib/whatsapp'

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
      subtotal, deliveryFee, total, couponId,
    } = await req.json()

    if (!companyId) return NextResponse.json({ error: 'empresa obrigatória' }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'carrinho vazio' }, { status: 400 })

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
      .select('id, name, owner_id, status, loja_digital_enabled, store_paused')
      .eq('id', companyId).maybeSingle()
    if (!company || company.status !== 'active' || !company.loja_digital_enabled) {
      return NextResponse.json({ error: 'Essa loja não está disponível pra pedidos agora.' }, { status: 400 })
    }
    if (company.store_paused) {
      return NextResponse.json({ error: 'A loja pausou o recebimento de pedidos no momento.' }, { status: 400 })
    }

    const { data: pedido, error: pedidoError } = await supabase.from('loja_pedidos').insert({
      company_id: companyId, customer_id: customerId,
      customer_name: finalName || 'Cliente', customer_phone: finalPhone || null,
      delivery_address: deliveryType === 'entrega' ? (address || null) : null,
      delivery_type: deliveryType === 'retirada' ? 'retirada' : 'entrega',
      scheduled_for: scheduledFor || null,
      origin: 'cardapio_publico', payment_method: paymentMethod || null,
      subtotal: Number(subtotal || 0), total: Number(total || 0), delivery_fee: Number(deliveryFee || 0),
      notes: notes || null,
    }).select('id').single()
    // Mesmo cuidado que já existia quando esse insert rodava no navegador:
    // se der erro aqui, não pode passar pro cliente como se tivesse dado certo.
    if (pedidoError || !pedido) {
      console.error('[criar-pedido] falha ao criar pedido:', pedidoError)
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
      return NextResponse.json({ error: 'Não deu pra enviar seu pedido agora. Tenta de novo em alguns segundos.' }, { status: 500 })
    }

    // Resgate de cupom só fica registrado (e conta pra limite de uso) pra
    // quem tem conta — convidado ainda recebe o desconto no `total` que já
    // veio calculado, só não trava reuso. Mesma regra que "Enviar no
    // WhatsApp" (interesse anônimo) já seguia.
    if (couponId && customerId) {
      const code = 'TRD-' + Math.random().toString(36).substring(2, 6).toUpperCase()
      await supabase.from('coupon_redemptions').insert({ coupon_id: couponId, user_id: customerId, code, status: 'used', used_at: new Date().toISOString() })
    }

    // Confirmação por WhatsApp (cliente + dono), contador de produto e
    // chamada do motoboy da plataforma — tudo centralizado nessa rota, que
    // já fazia isso quando o insert acontecia direto no navegador.
    fetch(new URL('/api/loja/registrar-pedido', req.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId, pedidoId: pedido.id, phone: finalPhone || null, name: finalName || 'Cliente',
        address: deliveryType === 'entrega' ? address : null, total: Number(total || 0), subtotal: Number(subtotal || 0), deliveryFee: Number(deliveryFee || 0),
        paymentMethod: paymentMethod || null, deliveryType, notes: notes || null,
        items: (items as ItemIn[]).map(l => ({ produtoId: l.produtoId, name: l.name, qty: l.qty, unitPrice: l.unitPrice, modifiers: l.modifiers || [] })),
      }),
    }).catch(() => {})

    if (company.owner_id) {
      fetch(new URL('/api/push/send', req.url), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Novo pedido — ${company.name}`,
          body: `${finalName || 'Cliente'} pediu R$ ${Number(total || 0).toFixed(2).replace('.', ',')}`,
          target: 'external_user_id', userId: company.owner_id,
          url: `${new URL(req.url).origin}/painel/pedidos`,
        }),
      }).catch(() => {})
    }

    // Alerta pro(s) admin(s) da plataforma em TODO pedido novo, de
    // qualquer loja — push (mesma musiquinha que ele já recebe hoje como
    // admin) + WhatsApp da instância da plataforma. Pedido do Ricardo,
    // set/2026: quer saber na hora, independente de qual loja for, sem
    // precisar ficar de olho em cada painel separado.
    ;(async () => {
      try {
        const { data: admins } = await supabase.from('profiles').select('id, phone').eq('user_type', 'admin')
        if (!admins?.length) return
        const origin = new URL(req.url).origin
        const valorFmt = `R$ ${Number(total || 0).toFixed(2).replace('.', ',')}`
        const pushUrl = `${origin}/painel/pedidos?empresa=${companyId}`
        for (const admin of admins) {
          fetch(new URL('/api/push/send', req.url), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `🔔 Novo pedido — ${company.name}`,
              body: `${finalName || 'Cliente'} pediu ${valorFmt}`,
              target: 'external_user_id', userId: admin.id, url: pushUrl,
            }),
          }).catch(() => {})
          if (admin.phone) {
            sendPlatformWhatsApp(admin.phone, `🔔 *Novo pedido na Trindade Online!*\n\nLoja: *${company.name}*\nCliente: ${finalName || 'Cliente'}\nValor: ${valorFmt}\n\n${pushUrl}`).catch(() => {})
          }
        }
      } catch (err) {
        console.error('[criar-pedido] falha ao notificar admin', err)
      }
    })()

    return NextResponse.json({ ok: true, pedidoId: pedido.id })
  } catch (err: any) {
    console.error('[criar-pedido] falha geral:', err?.message || err)
    return NextResponse.json({ error: 'Não deu pra enviar seu pedido agora. Tenta de novo em alguns segundos.' }, { status: 500 })
  }
}
