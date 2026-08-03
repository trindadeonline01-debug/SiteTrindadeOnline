import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Permite a funcao serverless continuar rodando em segundo plano (via after())
// pelo tempo necessario pra terminar o disparo de uma campanha
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'trindade2024'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

// Delay aleatório em ms
function randomDelay(min: number, max: number): Promise<void> {
  const ms = (Math.floor(Math.random() * (max - min + 1)) + min) * 1000
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Vercel mata a função depois de maxDuration (300s). Paramos de pegar novos
// contatos bem antes disso e encadeamos uma nova chamada pra continuar —
// sem isso a campanha ficava travada em "running" e exigia pausar/retomar
// na mão pra seguir depois de cada janela de 300s.
const SAFE_BUDGET_MS = 260_000

interface MessageVariation {
  text: string
  media_url?: string | null
  media_type?: string | null
}

// Sorteia uma variação (texto + midia propria) e substitui variáveis no texto
function pickVariation(messages: MessageVariation[], nome: string, empresa: string): { text: string; media_url: string | null; media_type: string | null } {
  if (!messages || messages.length === 0) return { text: '', media_url: null, media_type: null }
  const idx = Math.floor(Math.random() * messages.length)
  const v = messages[idx]
  return {
    text: (v.text || '').replace(/\{\{nome\}\}/g, nome).replace(/\{\{empresa\}\}/g, empresa),
    media_url: v.media_url || null,
    media_type: v.media_type || null
  }
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
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
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

// Envia imagem ou video (com legenda opcional) via Evolution API
async function sendMedia(phone: string, mediaUrl: string, mediaType: 'image' | 'video', caption: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const formatted = formatPhone(phone)
    const res = await fetch(`${EVOLUTION_URL}/message/sendMedia/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({
        number: formatted,
        mediatype: mediaType,
        media: mediaUrl,
        caption: caption || undefined
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

// Envia audio como nota de voz via Evolution API
async function sendAudio(phone: string, mediaUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const formatted = formatPhone(phone)
    const res = await fetch(`${EVOLUTION_URL}/message/sendWhatsAppAudio/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({
        number: formatted,
        audio: mediaUrl
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
      const { name, messages, filter, delay_min, delay_max, scheduled_at, list_id, list_name } = data

      // Busca contatos conforme filtro
      let contacts: { phone: string; name: string; company: string; owner_id?: string }[] = []

      if (filter === 'broadcast_list') {
        const { data: members } = await supabase.from('broadcast_list_members').select('phone, name, company').eq('list_id', list_id)
        contacts = [...contacts, ...(members || []).map((m: any) => ({ phone: m.phone, name: m.name || '', company: m.company || '' }))]
      }

      if (filter === 'all' || filter === 'companies' || filter === 'paid' || filter === 'unpaid') {
        // Empresas
        let query = supabase.from('companies').select('name, phone, plan').not('phone', 'is', null).neq('phone', '')
        if (filter === 'paid') query = query.eq('plan', 'paid')
        if (filter === 'unpaid') query = query.neq('plan', 'paid')
        const { data: companies } = await query
        contacts = [...contacts, ...(companies || []).map((c: any) => ({ phone: c.phone, name: c.name, company: c.name }))]
      }

      if (filter === 'no_group') {
        // Empresas cujo dono ainda não está marcado como "Grupo WA"
        const { data: companies } = await supabase
          .from('companies')
          .select('name, phone, owner_id, owner:profiles(whatsapp_group)')
          .not('phone', 'is', null).neq('phone', '')
        const withoutGroup = (companies || []).filter((c: any) => {
          const owner = Array.isArray(c.owner) ? c.owner[0] : c.owner
          return !owner?.whatsapp_group
        })
        contacts = [...contacts, ...withoutGroup.map((c: any) => ({ phone: c.phone, name: c.name, company: c.name, owner_id: c.owner_id }))]
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
        list_id: filter === 'broadcast_list' ? (list_id || null) : null,
        list_name: filter === 'broadcast_list' ? (list_name || null) : null,
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
        owner_id: c.owner_id || null,
        status: 'pending'
      }))
      await supabase.from('blast_logs').insert(logs)

      return NextResponse.json({ ok: true, campaign_id: campaign.id, total: contacts.length })
    }

    // INICIAR ou CONTINUAR DISPARO
    // 'start' é chamado pelo usuário (Iniciar/Retomar). 'continue' é uso
    // interno: a própria função se rechama antes de bater no maxDuration,
    // então não passa pela checagem de "já está rodando".
    if (action === 'start' || action === 'continue') {
      const { data: campaign } = await supabase.from('blast_campaigns').select('*').eq('id', campaign_id).single()
      if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })

      if (action === 'start') {
        // Evita loops duplicados: só inicia um novo loop se a campanha não estiver rodando
        if (campaign.status === 'running') {
          return NextResponse.json({ ok: true, message: 'Campanha já está em andamento' })
        }
        await supabase.from('blast_campaigns').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', campaign_id)
      } else {
        // continue: se foi pausada/cancelada nesse meio tempo, não reinicia sozinha
        if (campaign.status !== 'running') return NextResponse.json({ ok: true, message: 'Campanha não está em execução' })
      }

      // Busca logs pendentes
      const { data: logs } = await supabase.from('blast_logs').select('*').eq('campaign_id', campaign_id).eq('status', 'pending')
      const origin = new URL(req.url).origin

      // Disparo assíncrono — after() garante pra Vercel que este trabalho em
      // segundo plano precisa continuar rodando mesmo depois da resposta HTTP
      // ja ter sido enviada (sem isso, a funcao podia ser encerrada no meio do loop)
      after(async () => {
        const loopStart = Date.now()
        let ranOutOfTime = false

        for (const log of (logs || [])) {
          // Encerra essa invocação bem antes do limite de maxDuration e
          // encadeia a continuação numa nova chamada — sem isso a campanha
          // trava em "running" ao bater os 300s, e só volta pausando/retomando
          // na mão
          if (Date.now() - loopStart > SAFE_BUDGET_MS) { ranOutOfTime = true; break }

          // Verifica se campanha foi pausada
          const { data: current } = await supabase.from('blast_campaigns').select('status').eq('id', campaign_id).single()
          if (current?.status === 'paused') return

          // Reivindica o contato de forma atômica: só segue se conseguir mudar
          // de 'pending' pra 'sending' — evita que outro loop concorrente
          // (ex: retomar clicado enquanto o loop anterior ainda está de pé) envie de novo
          const { data: claimed } = await supabase
            .from('blast_logs')
            .update({ status: 'sending' })
            .eq('id', log.id)
            .eq('status', 'pending')
            .select('id')
          if (!claimed || claimed.length === 0) continue

          const picked = pickVariation(campaign.messages, log.contact_name || 'Cliente', log.company_name || '')
          const message = picked.text
          let result: { ok: boolean; error?: string }
          if (picked.media_type === 'image' || picked.media_type === 'video') {
            result = await sendMedia(log.phone, picked.media_url!, picked.media_type as 'image' | 'video', message)
          } else if (picked.media_type === 'audio') {
            result = await sendAudio(log.phone, picked.media_url!)
            if (result.ok && message) await sendWhatsApp(log.phone, message)
          } else {
            result = await sendWhatsApp(log.phone, message)
          }

          // Marca o Grupo WA logo apos o envio confirmado, antes de qualquer outra
          // escrita — se o processo for interrompido em seguida (comum em loop
          // longo rodando em background no serverless), o que importa de verdade
          // (o convite foi entregue) ja fica registrado
          if (result.ok && campaign.filter === 'no_group' && log.owner_id) {
            await supabase.from('profiles').update({
              whatsapp_group: true,
              whatsapp_group_at: new Date().toISOString()
            }).eq('id', log.owner_id)
          }

          await supabase.from('blast_logs').update({
            status: result.ok ? 'sent' : 'failed',
            message_sent: message,
            error_message: result.error || null,
            sent_at: new Date().toISOString()
          }).eq('id', log.id)

          // Le a contagem atual antes de incrementar (evita contador "congelado"
          // quando ha mais de uma leva de envios na mesma campanha)
          const { data: freshCampaign } = await supabase.from('blast_campaigns').select('sent_count, failed_count').eq('id', campaign_id).single()
          if (result.ok) {
            await supabase.from('blast_campaigns').update({ sent_count: (freshCampaign?.sent_count || 0) + 1 }).eq('id', campaign_id)
          } else {
            await supabase.from('blast_campaigns').update({ failed_count: (freshCampaign?.failed_count || 0) + 1 }).eq('id', campaign_id)
          }

          // Delay aleatório
          await randomDelay(campaign.delay_min, campaign.delay_max)
        }

        if (ranOutOfTime) {
          // Encadeia a próxima leva antes de sair — a campanha continua
          // "running", só quem processa o resto é a próxima invocação
          try {
            await fetch(`${origin}/api/blast`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'continue', campaign_id })
            })
          } catch {}
          return
        }

        // Finaliza
        const { data: final } = await supabase.from('blast_campaigns').select('status').eq('id', campaign_id).single()
        if (final?.status === 'running') {
          await supabase.from('blast_campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', campaign_id)
        }
      })

      return NextResponse.json({ ok: true, message: action === 'start' ? 'Disparo iniciado' : 'Continuando disparo' })
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