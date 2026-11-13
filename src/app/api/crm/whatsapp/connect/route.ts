import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { wahaCriarSessao, wahaQr, wahaSessao, wahaApagarSessao } from '@/lib/wa'

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
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id } = await req.json()
    if (!access_token || !company_id) return NextResponse.json({ error: 'dados faltando' }, { status: 400 })

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase
      .from('companies')
      .select('id, owner_id, crm_whatsapp_enabled, crm_phone_limit, trial_modules_until, wa_provider')
      .eq('id', company_id).maybeSingle()
    if (!company) return NextResponse.json({ error: 'empresa não encontrada' }, { status: 404 })
    if (company.owner_id !== userData.user.id) {
      // Admin pode conectar o WhatsApp de qualquer empresa (Modo admin em
      // /painel/mensagens?empresa=<id>) — só o dono da empresa não passa aqui.
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
      if (profile?.user_type !== 'admin') {
        return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
      }
    }
    if (!moduleActive(company.crm_whatsapp_enabled, company.trial_modules_until)) {
      return NextResponse.json({ error: 'CRM de WhatsApp não está ativo pra essa empresa' }, { status: 403 })
    }

    // Conta só instância CONECTADA de verdade — contar toda linha da tabela
    // (inclusive "disconnected") travava pra sempre quem tentou conectar uma
    // vez, não completou o QR code (ou desconectou depois) e nunca mais
    // conseguia gerar um QR novo, mesmo tendo zero número ativo.
    const { count } = await supabase
      .from('crm_whatsapp_instances')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company_id)
      .eq('status', 'connected')
    if ((count || 0) >= (company.crm_phone_limit || 1)) {
      return NextResponse.json({ error: `limite de ${company.crm_phone_limit || 1} número(s) já atingido` }, { status: 400 })
    }
    // Limpa instâncias antigas desconectadas dessa empresa antes de criar
    // uma nova — sem isso a tabela acumula uma linha morta a cada tentativa
    // que não completou o QR code.
    const { data: antigas } = await supabase.from('crm_whatsapp_instances').select('instance_name, provider').eq('company_id', company_id).eq('status', 'disconnected')
    for (const a of antigas || []) if (a.provider === 'waha') await wahaApagarSessao(a.instance_name)
    await supabase.from('crm_whatsapp_instances').delete().eq('company_id', company_id).eq('status', 'disconnected')

    const instanceName = `crm-${company_id.replace(/-/g, '').slice(0, 12)}-${Date.now().toString(36)}`

    // Loja marcada como 'waha' conecta pelo WAHA (sessão + QR); as demais seguem na Evolution.
    if (company.wa_provider === 'waha') {
      const criada = await wahaCriarSessao(instanceName)
      if (!criada.ok) return NextResponse.json({ error: criada.detail || 'falha ao criar sessão' }, { status: 500 })
      const { data: inst, error: instErr } = await supabase.from('crm_whatsapp_instances').insert({
        company_id, instance_name: instanceName, api_key: 'waha', provider: 'waha', status: 'disconnected', webhook_v2: true,
      }).select('id').single()
      if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 })
      // A sessão leva alguns segundos até mostrar o QR.
      let qr: string | null = null
      for (let i = 0; i < 12 && !qr; i++) {
        await new Promise(r => setTimeout(r, 1500))
        const st = await wahaSessao(instanceName)
        if (st?.status === 'SCAN_QR_CODE') qr = await wahaQr(instanceName)
      }
      return NextResponse.json({ ok: true, instance_id: inst.id, instance_name: instanceName, qrcode_base64: qr })
    }

    const evoRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_ADMIN_API_KEY || '' },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          enabled: true,
          url: `${SITE_URL}/api/crm/webhook`,
          byEvents: false,
          // base64:false de propósito — ver comentário em /api/crm/webhook (erro 413 da Vercel com mídia grande).
          base64: false,
          events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'PRESENCE_UPDATE', 'CHATS_UPDATE', 'CHATS_UPSERT'],
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
      company_id, instance_name: instanceName, api_key: apiKey, status: 'disconnected', webhook_v2: true,
    }).select('id').single()
    if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, instance_id: inst.id, instance_name: instanceName, qrcode_base64: qrcodeBase64, raw: evoData })
  } catch (err: any) {
    console.error('[crm/whatsapp/connect]', err)
    return NextResponse.json({ error: 'falha ao criar instância' }, { status: 500 })
  }
}
