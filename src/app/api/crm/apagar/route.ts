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

// Apaga pra todos (só mensagem própria, mandada pelo CRM). Mantém a linha no
// banco (não deleta) marcando deleted_at, igual o WhatsApp mostra "você
// apagou essa mensagem" em vez de sumir sem rastro.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id, message_id } = await req.json()
    if (!access_token || !company_id || !message_id) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company || company.owner_id !== userData.user.id) {
      return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const { data: msg } = await supabase
      .from('crm_messages').select('id, contact_id, direction, wa_message_id, deleted_at')
      .eq('id', message_id).eq('company_id', company_id).maybeSingle()
    if (!msg) return NextResponse.json({ error: 'mensagem não encontrada' }, { status: 404 })
    if (msg.direction !== 'out') return NextResponse.json({ error: 'só dá pra apagar mensagem que você mandou' }, { status: 403 })
    if (msg.deleted_at) return NextResponse.json({ ok: true }) // já apagada

    if (msg.wa_message_id) {
      const { data: contact } = await supabase.from('crm_contacts').select('phone').eq('id', msg.contact_id).maybeSingle()
      const { data: instance } = await supabase
        .from('crm_whatsapp_instances').select('instance_name, api_key')
        .eq('company_id', company_id).eq('status', 'connected').limit(1).maybeSingle()
      if (contact && instance) {
        try {
          await fetch(`${EVOLUTION_URL}/chat/deleteMessageForEveryone/${encodeURIComponent(instance.instance_name)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
            body: JSON.stringify({ id: msg.wa_message_id, remoteJid: `${formatPhone(contact.phone)}@s.whatsapp.net`, fromMe: true }),
          })
        } catch {}
        // Best-effort: mesmo se a Evolution recusar (ex: passou do prazo de apagar
        // pra todos), ainda apaga do nosso lado — não trava o lojista por isso.
      }
    }

    await supabase.from('crm_messages').update({
      deleted_at: new Date().toISOString(), body: null, media_type: null, media_url: null,
    }).eq('id', message_id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao apagar' }, { status: 500 })
  }
}
