import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://trindadeonline.com.br'

// Cria uma instância nova na Evolution API pra uma empresa conectar o próprio
// WhatsApp no CRM. Usa a chave GLOBAL (diferente da chave da instância "Trindade
// Online" usada pro disparo em massa do admin) porque criar instância é uma
// operação de administração da Evolution, não de uma instância específica.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id } = await req.json()
    if (!access_token || !company_id) return NextResponse.json({ error: 'dados faltando' }, { status: 400 })

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase
      .from('companies')
      .select('id, owner_id, crm_whatsapp_enabled, crm_phone_limit')
      .eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }
    if (!company.crm_whatsapp_enabled) {
      return NextResponse.json({ error: 'CRM de WhatsApp não está ativo pra essa empresa' }, { status: 403 })
    }

    const { count } = await supabase
      .from('crm_whatsapp_instances')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company_id)
    if ((count || 0) >= (company.crm_phone_limit || 1)) {
      return NextResponse.json({ error: `limite de ${company.crm_phone_limit || 1} número(s) já atingido` }, { status: 400 })
    }

    const instanceName = `crm-${company_id.replace(/-/g, '').slice(0, 12)}-${Date.now().toString(36)}`

    const evoRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_ADMIN_API_KEY || '' },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url: `${SITE_URL}/api/crm/webhook`,
          byEvents: false,
          base64: true,
          events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'PRESENCE_UPDATE'],
        },
      }),
    })

    const evoText = await evoRes.text()
    let evoData: any = null
    try { evoData = JSON.parse(evoText) } catch {}
    if (!evoRes.ok) {
      return NextResponse.json({ error: `Evolution API recusou (status ${evoRes.status}): ${evoText.slice(0, 300)}` }, { status: 500 })
    }

    const apiKey = evoData?.hash?.apikey || evoData?.hash || evoData?.instance?.apikey || ''
    const qrcodeBase64 = evoData?.qrcode?.base64 || evoData?.qrcode?.code || evoData?.qrcode || null

    const { data: inst, error: instErr } = await supabase.from('crm_whatsapp_instances').insert({
      company_id, instance_name: instanceName, api_key: apiKey, status: 'disconnected',
    }).select('id').single()
    if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, instance_id: inst.id, instance_name: instanceName, qrcode_base64: qrcodeBase64, raw: evoData })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao criar instância' }, { status: 500 })
  }
}
