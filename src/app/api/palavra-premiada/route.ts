import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cliente separado (chave anon) só pra validar o access_token do morador —
// nunca confia num user_id que viesse direto do corpo da requisição
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Normaliza pra comparação: minúsculo, sem espaço nas pontas, sem acento
const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g')
function normalize(s: string): string {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '')
}

function formatPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return '55' + digits
}

// Mesmo número usado pra notificar o admin (nova empresa, assinatura etc.) —
// é o WhatsApp pessoal do Ricardo pra onde o ganhador manda o resgate
const ADMIN_WHATSAPP = formatPhone(process.env.ADMIN_WHATSAPP_NUMBER || '21980239006')

// Código curto pro admin conferir o resgate sem precisar abrir o painel
function shortCode(id: string): string {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    // CRIAR NOVA RODADA (admin)
    if (action === 'create') {
      const { word, prize_description, max_winners } = body
      if (!word?.trim() || !prize_description?.trim()) {
        return NextResponse.json({ error: 'Preencha a palavra e a descrição do prêmio' }, { status: 400 })
      }

      // Só uma rodada ativa por vez — encerra qualquer uma anterior
      await supabase.from('prize_words').update({ status: 'inactive', completed_at: new Date().toISOString() }).eq('status', 'active')

      const { data, error } = await supabase.from('prize_words').insert({
        word: normalize(word),
        prize_description: prize_description.trim(),
        max_winners: max_winners && Number(max_winners) > 0 ? Number(max_winners) : 3
      }).select().single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, round: data })
    }

    // ENCERRAR RODADA NA MÃO (admin)
    if (action === 'close') {
      const { id } = body
      await supabase.from('prize_words').update({ status: 'inactive', completed_at: new Date().toISOString() }).eq('id', id).eq('status', 'active')
      return NextResponse.json({ ok: true })
    }

    // MARCAR PRÊMIO COMO ENTREGUE (admin)
    if (action === 'redeem') {
      const { winner_id } = body
      await supabase.from('prize_word_winners').update({ redeemed: true, redeemed_at: new Date().toISOString() }).eq('id', winner_id)
      return NextResponse.json({ ok: true })
    }

    // CONFERIR PESQUISA (chamado a cada busca no site)
    if (action === 'check') {
      const { query, access_token } = body
      const term = normalize(query || '')
      if (!term) return NextResponse.json({ match: false })

      const { data: round } = await supabase.from('prize_words').select('*').eq('status', 'active').maybeSingle()
      if (!round || round.word !== term) return NextResponse.json({ match: false })

      // Não logado: precisa entrar pra resgatar
      if (!access_token) return NextResponse.json({ match: true, needsLogin: true })

      const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(access_token)
      if (userErr || !userData?.user) return NextResponse.json({ match: true, needsLogin: true })
      const user = userData.user

      // Já ganhou essa rodada?
      const { data: already } = await supabase
        .from('prize_word_winners')
        .select('id, position, name')
        .eq('prize_word_id', round.id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (already) {
        return NextResponse.json({
          match: true, alreadyWon: true, position: already.position, prize_description: round.prize_description,
          code: shortCode(already.id), name: already.name, admin_whatsapp: ADMIN_WHATSAPP
        })
      }

      const { data: profile } = await supabase.from('profiles').select('name, phone').eq('id', user.id).single()

      // Trava por WhatsApp: mesmo número não ganha 2x na mesma rodada,
      // mesmo criando uma conta nova
      if (profile?.phone) {
        const fmt = formatPhone(profile.phone)
        const { data: winners } = await supabase.from('prize_word_winners').select('phone').eq('prize_word_id', round.id)
        const dup = (winners || []).some((w: any) => w.phone && formatPhone(w.phone) === fmt)
        if (dup) return NextResponse.json({ match: true, alreadyWon: true })
      }

      // Reivindica a vaga de forma atômica (compare-and-swap no winners_count) —
      // se duas pessoas acertarem quase juntas, só uma consegue por posição
      const { data: claimed } = await supabase
        .from('prize_words')
        .update({ winners_count: round.winners_count + 1 })
        .eq('id', round.id)
        .eq('winners_count', round.winners_count)
        .lt('winners_count', round.max_winners)
        .select('winners_count, max_winners')
        .maybeSingle()

      if (!claimed) return NextResponse.json({ match: true, soldOut: true })

      const position = claimed.winners_count

      const { data: winnerRow } = await supabase.from('prize_word_winners').insert({
        prize_word_id: round.id,
        user_id: user.id,
        name: profile?.name || null,
        phone: profile?.phone || null,
        position
      }).select('id').single()

      // Atingiu o número de ganhadores: desativa a rodada imediatamente
      if (position >= claimed.max_winners) {
        await supabase.from('prize_words').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', round.id)
      }

      return NextResponse.json({
        match: true, won: true, position, prize_description: round.prize_description,
        code: winnerRow ? shortCode(winnerRow.id) : null, name: profile?.name || null, admin_whatsapp: ADMIN_WHATSAPP
      })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Lista rodadas + ganhadores (painel admin)
export async function GET() {
  try {
    const { data: rounds } = await supabase.from('prize_words').select('*').order('created_at', { ascending: false })
    const { data: winners } = await supabase.from('prize_word_winners').select('*').order('won_at', { ascending: false })
    return NextResponse.json({ rounds: rounds || [], winners: winners || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
