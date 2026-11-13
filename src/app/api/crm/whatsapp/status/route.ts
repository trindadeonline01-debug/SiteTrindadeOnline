import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { wahaSessao, wahaQr } from '@/lib/wa'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

// Consulta o estado da conexão de WhatsApp da loja. Para instâncias do WAHA pergunta direto ao WAHA
// (fonte da verdade, sem depender do webhook) e devolve o QR atualizado enquanto a sessão espera leitura.
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id } = await req.json()
    if (!access_token || !company_id) return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })
    const { data: company } = await supabase.from('companies').select('owner_id').eq('id', company_id).maybeSingle()
    if (!company) return NextResponse.json({ error: 'empresa não encontrada' }, { status: 404 })
    if (company.owner_id !== userData.user.id) {
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
      if (profile?.user_type !== 'admin') return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
    }

    const { data: inst } = await supabase.from('crm_whatsapp_instances')
      .select('id, instance_name, status, provider').eq('company_id', company_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!inst) return NextResponse.json({ status: 'none' })
    if (inst.provider !== 'waha') return NextResponse.json({ status: inst.status })

    const st = await wahaSessao(inst.instance_name)
    if (!st) return NextResponse.json({ status: inst.status })
    if (st.status === 'WORKING') {
      if (inst.status !== 'connected') {
        await supabase.from('crm_whatsapp_instances').update({ status: 'connected', connected_at: new Date().toISOString(), ...(st.phone ? { phone: st.phone } : {}) }).eq('id', inst.id)
      }
      return NextResponse.json({ status: 'connected' })
    }
    if (inst.status === 'connected' && (st.status === 'FAILED' || st.status === 'STOPPED')) {
      await supabase.from('crm_whatsapp_instances').update({ status: 'disconnected' }).eq('id', inst.id)
    }
    const qr = st.status === 'SCAN_QR_CODE' ? await wahaQr(inst.instance_name) : null
    return NextResponse.json({ status: 'disconnected', waha: st.status, qrcode_base64: qr })
  } catch (err) {
    console.error('[crm/whatsapp/status]', err)
    return NextResponse.json({ error: 'falha ao consultar' }, { status: 500 })
  }
}
