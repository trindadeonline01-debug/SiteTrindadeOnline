import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ASAAS_API_KEY = process.env.ASAAS_API_KEY as string
const ASAAS_BASE_URL = 'https://api.asaas.com/v3'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLANS: Record<string, { value: number; days: number; description: string }> = {
  mensal:     { value: 29.90,  days: 30,  description: 'Trindade Online — Plano Mensal' },
  trimestral: { value: 79.90,  days: 90,  description: 'Trindade Online — Plano Trimestral' },
  semestral:  { value: 149.90, days: 180, description: 'Trindade Online — Plano Semestral' },
}

export async function POST(req: NextRequest) {
  try {
    const { plan, company_id, owner_name, owner_email, cpf_cnpj } = await req.json()
    const planData = PLANS[plan]
    if (!planData) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })

    let asaasCustomerId: string
    const searchRes = await fetch(`${ASAAS_BASE_URL}/customers?email=${encodeURIComponent(owner_email)}`, {
      headers: { 'access_token': ASAAS_API_KEY }
    })
    const searchData = await searchRes.json()
    if (searchData.data?.length > 0) {
      asaasCustomerId = searchData.data[0].id
      // Atualiza CPF se não tiver
      if (!searchData.data[0].cpfCnpj && cpf_cnpj) {
        await fetch(`${ASAAS_BASE_URL}/customers/${asaasCustomerId}`, {
          method: 'PUT',
          headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ cpfCnpj: cpf_cnpj.replace(/\D/g, '') })
        })
      }
    } else {
      const createRes = await fetch(`${ASAAS_BASE_URL}/customers`, {
        method: 'POST',
        headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: owner_name || 'Lojista', email: owner_email, cpfCnpj: cpf_cnpj ? cpf_cnpj.replace(/\D/g, '') : undefined })
      })
      const customerData = await createRes.json()
      asaasCustomerId = customerData.id
    }

    const due = new Date(Date.now() + 30 * 60 * 1000).toISOString().split('T')[0]
    const chargeRes = await fetch(`${ASAAS_BASE_URL}/payments`, {
      method: 'POST',
      headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: 'PIX',
        value: planData.value,
        dueDate: due,
        description: planData.description,
        externalReference: JSON.stringify({ company_id, plan, days: planData.days }),
      })
    })
    const chargeData = await chargeRes.json()
    if (!chargeData.id) return NextResponse.json({ error: 'Erro ao criar cobrança', detail: chargeData }, { status: 500 })

    const pixRes = await fetch(`${ASAAS_BASE_URL}/payments/${chargeData.id}/pixQrCode`, {
      headers: { 'access_token': ASAAS_API_KEY }
    })
    const pixData = await pixRes.json()

    await supabase.from('payments').insert({
      company_id, asaas_payment_id: chargeData.id,
      plan, value: planData.value, days: planData.days, status: 'pending',
    })

    return NextResponse.json({
      payment_id: chargeData.id,
      value: planData.value,
      qr_code_image: pixData.encodedImage,
      pix_copy_paste: pixData.payload,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
