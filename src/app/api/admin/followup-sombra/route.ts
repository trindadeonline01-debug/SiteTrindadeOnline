import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/requireAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Lojas do piloto (docs/DESENHO_FOLLOWUP.md, decisão 8) — sempre listadas na tela,
// mesmo desligadas, pra o Ricardo poder ligar o modo sombra.
const PILOTO = [
  'd3373bd7-fa9b-490f-a077-c8f2980028c1', // Calçada do Peixe
  '89a82ce2-59ff-4caf-9e57-3062e9a9cbde', // Restaurante Mineroca
]

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  const desde = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()

  const [{ data: lojas }, { data: itens }, { data: recentes }] = await Promise.all([
    supabase.from('companies').select('id, name, followup_modo').or(`id.in.(${PILOTO.join(',')}),followup_modo.neq.off`),
    supabase.from('crm_followups')
      .select('id, company_id, contact_id, passo, ancora_msg_id, status, motivo, texto_gerado, processado_em, revisao, revisao_motivo, revisao_grave, revisado_em, companies(name), crm_contacts(name, phone)')
      .eq('status', 'simulado').order('processado_em', { ascending: false }).limit(60),
    supabase.from('crm_followups').select('status, motivo, revisao, revisao_grave').gte('criado_em', desde).limit(5000),
  ])

  // Trecho da conversa de cada item (até a âncora), numa consulta só.
  const ids = Array.from(new Set((itens || []).map((i: any) => i.contact_id)))
  const trechos: Record<string, { direction: string; body: string | null; sent_at: string; origem: string | null }[]> = {}
  if (ids.length) {
    const { data: msgs } = await supabase
      .from('crm_messages').select('contact_id, direction, body, sent_at, origem')
      .in('contact_id', ids).not('body', 'is', null).order('sent_at', { ascending: false }).limit(1200)
    for (const m of (msgs || []) as any[]) {
      const arr = (trechos[m.contact_id] ||= [])
      if (arr.length < 10) arr.push(m)
    }
  }

  const porMotivo: Record<string, number> = {}
  let simulados = 0, revisados = 0, ok = 0, graves = 0
  for (const r of (recentes || []) as any[]) {
    const k = `${r.status}:${r.motivo || '-'}`
    porMotivo[k] = (porMotivo[k] || 0) + 1
    if (r.status === 'simulado') {
      simulados++
      if (r.revisao) { revisados++; if (r.revisao === 'ok') ok++; if (r.revisao_grave) graves++ }
    }
  }

  return NextResponse.json({
    lojas: lojas || [],
    itens: (itens || []).map((i: any) => ({ ...i, conversa: (trechos[i.contact_id] || []).slice().reverse() })),
    resumo: { simulados, revisados, ok, graves, porMotivo },
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const body = await req.json().catch(() => ({}))

  if (body.acao === 'revisar') {
    if (!body.id || !['ok', 'ruim'].includes(body.revisao)) return NextResponse.json({ error: 'dados inválidos' }, { status: 400 })
    const { error } = await supabase.from('crm_followups').update({
      revisao: body.revisao,
      revisao_motivo: body.revisao === 'ruim' ? String(body.motivo || '').slice(0, 500) : null,
      revisao_grave: body.revisao === 'ruim' && !!body.grave,
      revisado_em: new Date().toISOString(),
    }).eq('id', body.id).eq('status', 'simulado')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.acao === 'modo') {
    if (!body.company_id || !['off', 'sombra'].includes(body.modo)) return NextResponse.json({ error: 'dados inválidos' }, { status: 400 })
    const { error } = await supabase.from('companies').update({ followup_modo: body.modo }).eq('id', body.company_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (body.modo === 'off') {
      await supabase.from('crm_followups').update({ status: 'cancelado', motivo: 'loja_desligada', processado_em: new Date().toISOString() })
        .eq('company_id', body.company_id).eq('status', 'pendente')
    }
    return NextResponse.json({ ok: true })
  }

  // Botão de emergência: desliga o follow-up de todas as lojas e cancela a fila.
  if (body.acao === 'desligar_tudo') {
    await supabase.from('companies').update({ followup_modo: 'off' }).neq('followup_modo', 'off')
    await supabase.from('crm_followups').update({ status: 'cancelado', motivo: 'emergencia', processado_em: new Date().toISOString() }).eq('status', 'pendente')
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'ação desconhecida' }, { status: 400 })
}
