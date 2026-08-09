import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'trindade2024'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

function formatPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  return digits.startsWith('55') ? digits : '55' + digits
}

async function sendWhatsApp(phone: string, message: string) {
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
      body: JSON.stringify({ number: formatPhone(phone), text: message })
    })
  } catch {
    // best-effort — nunca derruba o fluxo de criação da subcategoria
  }
}

function buildMessage(subcategoryName: string): string {
  return `🎉 Boa notícia! A subcategoria que você sugeriu — *${subcategoryName}* — já foi criada aqui no Trindade Online.\n\nAgora sua loja já pode usar essa subcategoria pra aparecer nas buscas certas. Acesse seu painel: https://trindadeonline.com.br/painel`
}

// Chamado quando o admin cria uma subcategoria a partir de uma sugestão.
// Notifica TODAS as empresas que sugeriram esse mesmo nome (pode ter mais
// de uma pedindo a mesma coisa) e limpa as sugestões correspondentes
export async function POST(req: NextRequest) {
  try {
    const { subcategory_name } = await req.json()
    const name = (subcategory_name || '').trim()
    if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })

    const { data: matches } = await supabase
      .from('subcategory_suggestions')
      .select('id, company:companies(name, phone)')
      .ilike('suggestion', name)

    const rows = matches || []
    let notified = 0
    for (const row of rows as any[]) {
      const company = Array.isArray(row.company) ? row.company[0] : row.company
      if (company?.phone) {
        await sendWhatsApp(company.phone, buildMessage(name))
        notified++
      }
    }

    const ids = rows.map((r: any) => r.id)
    if (ids.length > 0) {
      await supabase.from('subcategory_suggestions').delete().in('id', ids)
    }

    return NextResponse.json({ ok: true, notified, removed: ids.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
