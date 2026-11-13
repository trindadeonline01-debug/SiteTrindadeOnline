import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/requireAdmin'
import { waha, wahaQr, wahaApagarSessao } from '@/lib/wa'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Lista as sessões do WAHA com a loja de cada uma (só admin). Substitui abrir o painel do WAHA por túnel SSH.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { qrDe, apagar } = await req.json().catch(() => ({}))

  // Só apaga sessão "órfã" (sem loja ligada) e nunca a da plataforma — ex.: a sessão de teste.
  if (apagar) {
    const nome = String(apagar)
    if (nome === (process.env.WA_PLATFORM_SESSION || 'plataforma')) return NextResponse.json({ error: 'essa é a sessão da plataforma' }, { status: 400 })
    const { data: ligada } = await sb.from('crm_whatsapp_instances').select('id').eq('instance_name', nome).maybeSingle()
    if (ligada) return NextResponse.json({ error: 'essa sessão pertence a uma loja' }, { status: 400 })
    await wahaApagarSessao(nome)
    return NextResponse.json({ ok: true })
  }

  if (qrDe) return NextResponse.json({ qr: await wahaQr(String(qrDe)) })

  try {
    const r = await waha('/api/sessions?all=true')
    if (!r.ok) return NextResponse.json({ error: `WAHA respondeu ${r.status}` }, { status: 502 })
    const sessoes: any[] = await r.json()
    const { data: inst } = await sb.from('crm_whatsapp_instances').select('instance_name, company_id, status, provider, phone')
    const { data: empresas } = await sb.from('companies').select('id, name').in('id', [...new Set((inst || []).map(i => i.company_id))])
    const nome = new Map((empresas || []).map(e => [e.id, String(e.name || '').trim()]))
    const porSessao = new Map((inst || []).map(i => [i.instance_name, i]))
    const lista = sessoes.map(s => {
      const i = porSessao.get(s.name)
      return {
        sessao: s.name as string,
        loja: i ? (nome.get(i.company_id) || '(loja sem nome)') : (s.name === (process.env.WA_PLATFORM_SESSION || 'plataforma') ? 'Número da plataforma' : '(sem loja)'),
        status: String(s.status || ''),
        telefone: s.me?.id ? String(s.me.id).split('@')[0].split(':')[0] : null,
        noBanco: i?.status || null,
      }
    }).sort((a, b) => a.loja.localeCompare(b.loja))
    const emEvolution = (inst || []).filter(i => i.provider !== 'waha' && i.status === 'connected').length
    return NextResponse.json({ sessoes: lista, aindaNaEvolution: emEvolution })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 })
  }
}
