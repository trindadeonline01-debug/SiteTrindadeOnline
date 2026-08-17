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

// Reage com emoji numa mensagem (nossa ou do cliente). emoji vazio remove a
// reação. Contrato do /message/sendReaction não está 100% confirmado nas
// versões da doc — grava o erro cru se recusar, pra ajustar rápido.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, message_id, emoji } = await req.json()
    if (!access_token || !company_id || !message_id || emoji === undefined) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const { data: msg } = await supabase
      .from('crm_messages').select('id, contact_id, direction, wa_message_id')
      .eq('id', message_id).eq('company_id', company_id).maybeSingle()
    if (!msg) return NextResponse.json({ error: 'mensagem não encontrada' }, { status: 404 })
    if (!msg.wa_message_id) return NextResponse.json({ error: 'mensagem sem id do WhatsApp' }, { status: 400 })

    const { data: contact } = await supabase.from('crm_contacts').select('phone').eq('id', msg.contact_id).maybeSingle()
    if (!contact) return NextResponse.json({ error: 'contato não encontrado' }, { status: 404 })

    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', company_id).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return NextResponse.json({ error: 'WhatsApp não está conectado' }, { status: 400 })

    const remoteJid = `${formatPhone(contact.phone)}@s.whatsapp.net`
    const evoRes = await fetch(`${EVOLUTION_URL}/message/sendReaction/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({
        key: { remoteJid, fromMe: msg.direction === 'out', id: msg.wa_message_id },
        reaction: emoji,
      }),
    })
    if (!evoRes.ok) {
      const errText = await evoRes.text().catch(() => '')
      return NextResponse.json({ error: `falha ao reagir (status ${evoRes.status}): ${errText.slice(0, 300)}` }, { status: 500 })
    }

    await supabase.from('crm_messages').update({
      reaction: emoji || null, reaction_by: emoji ? 'out' : null,
    }).eq('id', message_id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao reagir' }, { status: 500 })
  }
}
