import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { normalizePhone } from '@/lib/phone'
import { sendCustomerWhatsApp } from '@/lib/whatsapp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Status = 'recebido' | 'em_preparo' | 'pronto' | 'saiu_entrega' | 'entregue' | 'cancelado'

function buildStatusMessage(status: Status, deliveryType: string | null): string | null {
  // Servidor roda em UTC (Vercel) — sem timeZone explícito aqui a mensagem
  // saía com a hora certa em Londres, não na Trindade.
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  switch (status) {
    case 'em_preparo': return '👨‍🍳 Seu pedido já está em preparo!'
    case 'pronto': return deliveryType === 'retirada' ? '✅ Seu pedido está pronto! Pode vir retirar.' : '✅ Seu pedido está pronto e já vai sair para entrega!'
    case 'saiu_entrega': return '🚴 Seu pedido acabou de sair para entrega!'
    case 'entregue': return deliveryType === 'retirada'
      ? `📦 Retirada confirmada às ${hora}. Obrigado pela preferência!`
      : '🎉 Pedido entregue! Obrigado pela preferência, bom apetite!'
    case 'cancelado': return '❌ Seu pedido foi cancelado.'
    default: return null
  }
}

// Chamado (fire-and-forget) sempre que o lojista avança o status de um pedido
// em /painel/pedidos ou /painel/cozinha — manda a atualização como
// mensagem de WhatsApp de verdade pro cliente, além do push já existente.
//
// O recibo completo (itens, pagamento, taxa, total) só sai UMA vez, na
// confirmação do pedido (registrar-pedido) — mandar de novo aqui quando o
// pedido entra em preparo duplicava a mensagem inteira pro cliente, o que
// o Ricardo pediu pra tirar (set/2026): a partir daqui é só status curto.
export async function POST(req: NextRequest) {
  try {
    const { companyId, pedidoId, phone: rawPhone, status, deliveryType } = await req.json()
    if (!companyId || !rawPhone || !status) return NextResponse.json({ error: 'dados obrigatórios' }, { status: 400 })
    const phone = normalizePhone(rawPhone)

    const text = buildStatusMessage(status, deliveryType || null)
    if (!text) return NextResponse.json({ ok: true })

    // Código de confirmação sai numa mensagem SEPARADA, logo depois da de
    // status — só aqui, quando a LOJA de fato marca saiu_entrega, nunca
    // antes disso. Cobre os dois motoboys possíveis: PRÓPRIO (código gerado
    // em /painel/pedidos ao atribuir) ou da PLATAFORMA/Trindade Entrega
    // (código em delivery_orders, motoboy aceita por conta própria via
    // WhatsApp e pode aceitar antes do pedido ficar pronto — por isso esse
    // aviso não pode disparar na hora do aceite, bug real reportado pelo
    // Ricardo, set/2026). Mandar separado (em vez de grudado no texto de
    // status) é pedido do Ricardo, set/2026: repete o código que já foi
    // mandado lá na confirmação do pedido, pra reforçar antes do motoboy
    // chegar — o cliente não pode esquecer de informar.
    let codeText: string | null = null
    if (status === 'saiu_entrega' && pedidoId) {
      const { data: pedido } = await supabase
        .from('loja_pedidos').select('delivery_confirm_code, motoboy_id').eq('id', pedidoId).eq('company_id', companyId).maybeSingle()
      if (pedido?.motoboy_id && pedido.delivery_confirm_code) {
        codeText = `🔑 Lembrando: quando o entregador chegar, informe este código pra ele: *${pedido.delivery_confirm_code}*`
      } else {
        const { data: entrega } = await supabase
          .from('delivery_orders').select('delivery_code, motoboy_name').eq('pedido_id', pedidoId).eq('company_id', companyId).maybeSingle()
        if (entrega?.delivery_code) {
          codeText = `🏍️ ${entrega.motoboy_name ? `${entrega.motoboy_name} está a caminho.\n` : ''}🔑 Lembrando: quando o motoboy chegar, informe este código pra ele: *${entrega.delivery_code}*`
        }
      }
    }

    const { data: company } = await supabase.from('companies').select('crm_whatsapp_enabled, trial_modules_until, slug').eq('id', companyId).maybeSingle()
    if (!company || !moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)) return NextResponse.json({ ok: true })

    // sendCustomerWhatsApp (lib/whatsapp.ts) já resolve sozinha — usa a
    // instância da loja se tiver conectada, senão cai pro número da
    // plataforma. Antes essa rota tinha seu próprio envio local, preso a um
    // `if (!instance) return` — loja sem WhatsApp escaneado não mandava
    // NENHUMA atualização de status pro cliente (achado real, out/2026:
    // JBurger sem escanear).
    await sendCustomerWhatsApp(companyId, phone, text)
    // Mensagem do código sempre à parte, nunca grudada na de status —
    // pedido do Ricardo, set/2026.
    if (codeText) await sendCustomerWhatsApp(companyId, phone, codeText)
    // Pedido de avaliação, também à parte — só na entrega/retirada de
    // verdade (nunca em cancelado), enquanto a experiência tá fresca.
    // Precisa de login pra avaliar; quem não tem conta cai no "Entrar para
    // avaliar" normal (Ricardo, set/2026).
    if (status === 'entregue' && company.slug) {
      const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'
      await sendCustomerWhatsApp(companyId, phone, `⭐ Como foi sua experiência? Avalia a gente: ${site}/empresa/${company.slug}?avaliar=1`)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[status-pedido] falha geral:', err?.message || err)
    return NextResponse.json({ error: 'falha ao notificar' }, { status: 500 })
  }
}
