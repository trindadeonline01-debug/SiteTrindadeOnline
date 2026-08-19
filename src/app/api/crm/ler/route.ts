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

// Marca como lido no nosso banco (unread badge) E manda o read receipt de
// verdade pra Evolution, pra o cliente ver o tique azul do lado dele também.
// A parte com a Evolution é best-effort: se falhar, não quebra a experiência
// no CRM — o que importa localmente é o last_read_at.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, contact_id } = await req.json()
    if (!access_token || !company_id || !contact_id) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const { data: contact } = await supabase.from('crm_contacts').select('phone, last_read_at').eq('id', contact_id).eq('company_id', company_id).maybeSingle()
    if (!contact) return NextResponse.json({ error: 'contato não encontrado' }, { status: 404 })

    const now = new Date().toISOString()

    let query = supabase.from('crm_messages').select('wa_message_id')
      .eq('company_id', company_id).eq('contact_id', contact_id).eq('direction', 'in')
      .not('wa_message_id', 'is', null)
    if (contact.last_read_at) query = query.gt('sent_at', contact.last_read_at)
    const { data: unread } = await query

    await supabase.from('crm_contacts').update({ last_read_at: now, unread_count: 0 }).eq('id', contact_id)

    if (unread && unread.length > 0) {
      const { data: instance } = await supabase
        .from('crm_whatsapp_instances').select('instance_name, api_key')
        .eq('company_id', company_id).eq('status', 'connected').limit(1).maybeSingle()
      if (instance) {
        const remoteJid = `${formatPhone(contact.phone)}@s.whatsapp.net`
        fetch(`${EVOLUTION_URL}/chat/markMessageAsRead/${encodeURIComponent(instance.instance_name)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
          body: JSON.stringify({
            readMessages: unread.map(m => ({ remoteJid, id: m.wa_message_id, fromMe: false })),
          }),
        }).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao marcar como lido' }, { status: 500 })
  }
}
