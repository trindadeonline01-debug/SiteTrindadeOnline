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

// Busca a foto de perfil real do contato na Evolution API e guarda em cache
// no nosso banco — evita chamar a Evolution de novo toda vez que a lista
// de conversas renderiza. Retorna null quando o contato não tem foto
// (perfil privado ou sem foto), o que também fica em cache pra não ficar
// tentando de novo a cada carregamento.
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

    const { data: contact } = await supabase.from('crm_contacts').select('phone').eq('id', contact_id).eq('company_id', company_id).maybeSingle()
    if (!contact) return NextResponse.json({ error: 'contato não encontrado' }, { status: 404 })

    const { data: instance } = await supabase
      .from('crm_whatsapp_instances').select('instance_name, api_key')
      .eq('company_id', company_id).eq('status', 'connected').limit(1).maybeSingle()
    if (!instance) return NextResponse.json({ url: null })

    const number = formatPhone(contact.phone)
    const res = await fetch(`${EVOLUTION_URL}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance.instance_name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: instance.api_key },
      body: JSON.stringify({ number }),
    })
    const data = await res.json().catch(() => null)
    const url: string | null = data?.profilePictureUrl || data?.picture || null

    await supabase.from('crm_contacts').update({ avatar_url: url }).eq('id', contact_id)
    return NextResponse.json({ url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao buscar foto de perfil' }, { status: 500 })
  }
}
