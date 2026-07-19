import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://taste-relocation-recording-decided.trycloudflare.com'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'trindade2024'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

// Delay aleatório em ms
function randomDelay(min: number, max: number): Promise<void> {
  const ms = (Math.floor(Math.random() * (max - min + 1)) + min) * 1000
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Sorteia uma mensagem aleatória e substitui variáveis
function buildMessage(messages: string[], nome: string, empresa: string): string {
  const idx = Math.floor(Math.random() * messages.length)
  return messages[idx]
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{empresa\}\}/g, empresa)
}

// Formata número para padrão internacional
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return '55' + digits
}

// Envia mensagem via Evolution API
async function sendWhatsApp(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const formatted = formatPhone(phone)
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_KEY
      },
      body: JSON.stringify({
        number: formatted,
        text: message
      })
    })
    if (!res.ok) {
      const err = await res.text()
      return { ok: false, error: err }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, campaign_id, ...data } = body

    // CRIAR CAMPANHA
    if (action === 'create') {
      const { name, messages, filter, delay_min, delay_max, scheduled_at } = data

      // Busca contatos conforme filtro
      let contacts: { phone: string; name: string; company: string }[] = []

      if (filter === 'all' || filter === 'paid' || filter === 'unpaid') {
        // Empresas
        let query = supabase.from('companies').select('name, phone, plan').not('phone', 'is', null).neq('phone', '')
        if (filter === 'paid') query = query.eq('plan', 'paid')
        if (filter === 'unpaid') query = query.neq('plan', 'paid')
        const { data: companies } = await query
        contacts = [...contacts, ...(companies || []).map((c: any) => ({ phone: c.phone, name: c.name, company: c.name }))]
      }

      if (filter === 'all' || filter === 'residents') {
        // Moradores
        const { data: residents } = await supabase
          .from('profiles')
          .select('name, phone')
          .eq('user_type', 'user')
          .not('phone', 'is', null)
          .neq('phone', '')
        contacts = [...contacts, ...(residents || []).map((r: any) => ({ phone: r.phone, name: r.name, company: '' }))]
      }

      // Remove blacklist
      const { data: blacklist } = await supabase.from('blast_blacklist').select('phone')
      const blacklisted = new Set((blacklist || []).map((b: any) => formatPhone(b.phone)))
      contacts = contacts.filter(c => !blacklisted.has(formatPhone(c.phone)))

      // Remove duplicatas por phone
      const seen = new Set<string>()
      contacts = contacts.filter(c => {
        const f = formatPhone(c.phone)
        if (seen.has(f)) return false
        seen.add(f)
        return true
      })

      // Cria campanha
      const { data: campaign, error } = await supabase.from('blast_campaigns').insert({
        name,
        messages,
        filter,
        delay_min: delay_min || 10,
        delay_max: delay_max || 60,
        total_contacts: contacts.length,
        scheduled_at: scheduled_at || null,
        status: scheduled_at ? 'pending' : 'pending'
      }).select().single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Cria logs pendentes
      const logs = contacts.map(c => ({
        campaign_id: campaign.id,
        phone: c.phone,
        contact_name: c.name,
        company_name: c.company,
        status: 'pending'
      }))
      await supabase.from('blast_logs').insert(logs)

      return NextResponse.json({ ok: true, campaign_id: campaign.id, total: contacts.length })
    }

    // INICIAR DISPARO
    if (action === 'start') {
      const { data: campaign } = await supabase.from('blast_campaigns').select('*').eq('id', campaign_id).single()
      if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })

      // Atualiza status
      await supabase.from('blast_campaigns').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', campaign_id)

      // Busca logs pendentes
      const { data: logs } = await supabase.from('blast_logs').select('*').eq('campaign_id', campaign_id).eq('status', 'pending')

      // Disparo assíncrono
      ;(async () => {
        for (const log of (logs || [])) {
          // Verifica se campanha foi pausada
          const { data: current } = await supabase.from('blast_campaigns').select('status').eq('id', campaign_id).single()
          if (current?.status === 'paused') break

          const message = buildMessage(campaign.messages, log.contact_name || 'Cliente', log.company_name || '')
          const result = await sendWhatsApp(log.phone, message)

          await supabase.from('blast_logs').update({
            status: result.ok ? 'sent' : 'failed',
            message_sent: message,
            error_message: result.error || null,
            sent_at: new Date().toISOString()
          }).eq('id', log.id)

          if (result.ok) {
            await supabase.from('blast_campaigns').update({ sent_count: campaign.sent_count + 1 }).eq('id', campaign_id)
          } else {
            await supabase.from('blast_campaigns').update({ failed_count: campaign.failed_count + 1 }).eq('id', campaign_id)
          }

          // Delay aleatório
          await randomDelay(campaign.delay_min, campaign.delay_max)
        }

        // Finaliza
        const { data: final } = await supabase.from('blast_campaigns').select('status').eq('id', campaign_id).single()
        if (final?.status === 'running') {
          await supabase.from('blast_campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', campaign_id)
        }
      })()

      return NextResponse.json({ ok: true, message: 'Disparo iniciado' })
    }

    // PAUSAR
    if (action === 'pause') {
      await supabase.from('blast_campaigns').update({ status: 'paused' }).eq('id', campaign_id)
      return NextResponse.json({ ok: true })
    }

    // RETOMAR
    if (action === 'resume') {
      return NextResponse.json({ ok: true, message: 'Use action: start para retomar' })
    }

    // CANCELAR
    if (action === 'cancel') {
      await supabase.from('blast_campaigns').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', campaign_id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const campaign_id = searchParams.get('campaign_id')

    if (campaign_id) {
      // Detalhes de uma campanha
      const { data: campaign } = await supabase.from('blast_campaigns').select('*').eq('id', campaign_id).single()
      const { data: logs } = await supabase.from('blast_logs').select('*').eq('campaign_id', campaign_id).order('created_at', { ascending: false }).limit(100)
      return NextResponse.json({ campaign, logs })
    }

    // Lista todas as campanhas
    const { data: campaigns } = await supabase.from('blast_campaigns').select('*').order('created_at', { ascending: false })
    return NextResponse.json({ campaigns })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}