import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEntregaPricing } from '@/lib/entregaPricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Cria a cobrança Pix da diária avulsa, do crédito avulso (em R$), e/ou de
// ofertas (pacotes) selecionadas — tudo numa cobrança só. A carteira
// (company_delivery_wallet) só é creditada quando o Pix cai de verdade — ver
// o branch `delivery_wallet` em /api/mp/webhook e
// /api/entrega/checar-pagamento (mesma lógica nos dois, idempotente).
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, dias_avulso, credito_avulso, pacote_ids } = await req.json()
    if (!access_token || !company_id) return NextResponse.json({ error: 'dados faltando' }, { status: 400 })

    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: `sessão inválida${authError ? ' — ' + authError.message : ''}` }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id, name').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const diasAvulso = Math.max(0, Number(dias_avulso) || 0)
    const creditoAvulso = Math.max(0, Number(credito_avulso) || 0)
    const pacoteIds: string[] = Array.isArray(pacote_ids) ? pacote_ids.filter(Boolean) : []

    const pricing = await getEntregaPricing()
    let diasTotal = diasAvulso
    let creditsTotal = creditoAvulso
    let diariaValor = diasAvulso * pricing.diaria
    let creditoValor = creditoAvulso

    if (pacoteIds.length > 0) {
      const { data: pacotes } = await supabase
        .from('entrega_pacotes').select('id, categoria, quantidade, preco').in('id', pacoteIds).eq('ativo', true)
      for (const p of pacotes || []) {
        if (p.categoria === 'diaria') { diasTotal += Number(p.quantidade); diariaValor += Number(p.preco) }
        else { creditsTotal += Number(p.quantidade); creditoValor += Number(p.preco) }
      }
    }

    const value = diariaValor + creditoValor
    if (value <= 0) return NextResponse.json({ error: 'valor inválido' }, { status: 400 })

    const kind: 'diaria' | 'credito' | 'combo' = diasTotal > 0 && creditsTotal > 0 ? 'combo' : diasTotal > 0 ? 'diaria' : 'credito'

    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'mp_access_token').maybeSingle()
    const accessToken = setting?.value
    if (!accessToken) return NextResponse.json({ error: 'Mercado Pago não configurado' }, { status: 500 })

    const { data: authUser } = await supabase.auth.admin.getUserById(company.owner_id)
    const ownerEmail = authUser?.user?.email || 'lojista@trindadeonline.com.br'

    const parts: string[] = []
    if (diasTotal > 0) parts.push(diasTotal === 1 ? 'Diária' : `${diasTotal} diárias`)
    if (creditsTotal > 0) parts.push(`R$ ${creditsTotal.toFixed(2).replace('.', ',')} de crédito`)
    const description = `Trindade Entrega — ${parts.join(' + ')} (${company.name})`

    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `entrega-${company_id}-${kind}-${diasTotal}-${creditsTotal}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: value,
        description,
        payment_method_id: 'pix',
        payer: { email: ownerEmail },
        notification_url: 'https://www.trindadeonline.com.br/api/mp/webhook',
        external_reference: JSON.stringify({ type: 'delivery_wallet', company_id, kind, credits: creditsTotal, dias: diasTotal }),
      }),
    })

    const data = await res.json()
    if (data.error || !data.id) {
      return NextResponse.json({ error: data.message || 'Erro ao criar pagamento', detail: data }, { status: 500 })
    }

    await supabase.from('delivery_payments').insert({
      payment_id: String(data.id), company_id, kind, credits: creditsTotal, dias: diasTotal, value, status: 'pending',
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
