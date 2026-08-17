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

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

// Resposta 1:1 numa conversa do CRM — NÃO conta pro limite diário de disparo
// (crm_daily_send_count), que é só pra campanha em massa. Responder cliente
// que acabou de mandar mensagem é uso normal do WhatsApp, sem risco de bloqueio.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, contact_id, text } = await req.json()
    if (!access_token || !company_id || !contact_id || !text?.trim()) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', company_id).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return NextResponse.json({ error: 'WhatsApp não está conectado' }, { status: 400 })

    const { data: contact } = await supabase.from('crm_contacts').select('phone').eq('id', contact_id).eq('company_id', company_id).maybeSingle()
    if (!contact) return NextResponse.json({ error: 'contato não encontrado' }, { status: 404 })

    const evoRes = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number: formatPhone(contact.phone), text: text.trim() }),
    })
    if (!evoRes.ok) {
      const errText = await evoRes.text()
      return NextResponse.json({ error: `falha ao enviar (status ${evoRes.status}): ${errText.slice(0, 300)}` }, { status: 500 })
    }
    const evoData = await evoRes.json().catch(() => null)
    const waMessageId = evoData?.key?.id || null

    const now = new Date().toISOString()
    await supabase.from('crm_messages').insert({
      company_id, contact_id, direction: 'out', body: text.trim(), wa_message_id: waMessageId, sent_at: now,
    })
    await supabase.from('crm_contacts').update({ last_message_at: now, last_read_at: now }).eq('id', contact_id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao enviar' }, { status: 500 })
  }
}
