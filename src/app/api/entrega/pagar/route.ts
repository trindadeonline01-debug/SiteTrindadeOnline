import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTodayValues } from '@/lib/entregaPricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Cria a cobrança Pix da diária (1 dia ou pacote de N dias com desconto),
// de um pacote de créditos, ou dos dois juntos numa cobrança só ("combo").
// A carteira (company_delivery_wallet) só é creditada quando o Pix cai de
// verdade — ver o branch `delivery_wallet` em /api/mp/webhook e
// /api/entrega/checar-pagamento (mesma lógica nos dois, idempotente).
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, kind, credits, dias } = await req.json()
    if (!access_token || !company_id || !kind) return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    if (kind !== 'diaria' && kind !== 'credito' && kind !== 'combo') return NextResponse.json({ error: 'kind inválido' }, { status: 400 })

    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: `sessão inválida${authError ? ' — ' + authError.message : ''}` }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id, name').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const { pricing, diaria: diariaHoje, entrega: entregaHoje } = await getTodayValues()
    const diasToBuy = kind === 'credito' ? 0 : Math.max(1, Number(dias) || 1)
    const creditsToBuy = kind === 'diaria' ? 0 : Number(credits) || 0
    if (kind !== 'diaria' && creditsToBuy <= 0) return NextResponse.json({ error: 'quantidade de créditos inválida' }, { status: 400 })

    // Pacote semanal: N diárias de uma vez saem com desconto fixo configurado
    // no admin — o desconto só se aplica quando compra exatamente o tamanho
    // do pacote configurado (ex: 5 dias), não em qualquer quantidade.
    const diariaTotal = diasToBuy * diariaHoje
    const desconto = diasToBuy === pricing.pacote_dias ? pricing.pacote_desconto : 0
    const creditoTotal = creditsToBuy * entregaHoje
    const value = Math.max(0, diariaTotal - desconto) + creditoTotal
    if (value <= 0) return NextResponse.json({ error: 'valor inválido' }, { status: 400 })

    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'mp_access_token').maybeSingle()
    const accessToken = setting?.value
    if (!accessToken) return NextResponse.json({ error: 'Mercado Pago não configurado' }, { status: 500 })

    const { data: authUser } = await supabase.auth.admin.getUserById(company.owner_id)
    const ownerEmail = authUser?.user?.email || 'lojista@trindadeonline.com.br'

    const parts: string[] = []
    if (diasToBuy > 0) parts.push(diasToBuy === 1 ? 'Diária' : `${diasToBuy} diárias`)
    if (creditsToBuy > 0) parts.push(`${creditsToBuy} entregas`)
    const description = `Trindade Entrega — ${parts.join(' + ')} (${company.name})`

    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `entrega-${company_id}-${kind}-${diasToBuy}-${creditsToBuy}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: value,
        description,
        payment_method_id: 'pix',
        payer: { email: ownerEmail },
        notification_url: 'https://www.trindadeonline.com.br/api/mp/webhook',
        external_reference: JSON.stringify({ type: 'delivery_wallet', company_id, kind, credits: creditsToBuy, dias: diasToBuy }),
      }),
    })

    const data = await res.json()
    if (data.error || !data.id) {
      return NextResponse.json({ error: data.message || 'Erro ao criar pagamento', detail: data }, { status: 500 })
    }

    await supabase.from('delivery_payments').insert({
      payment_id: String(data.id), company_id, kind, credits: creditsToBuy, dias: diasToBuy, value, status: 'pending',
    })

    const pixData = data.point_of_interaction?.transaction_data
    return NextResponse.json({
      payment_id: data.id,
      value,
      qr_code_image: pixData?.qr_code_base64 || null,
      pix_copy_paste: pixData?.qr_code || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao criar cobrança' }, { status: 500 })
  }
}
