import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomInt, timingSafeEqual } from 'crypto'
import { normalizePhone } from '@/lib/phone'
import { moduleActive } from '@/lib/modules'
import { criarIdentToken, limparNome } from '@/lib/mesaIdent'
import { sendPlatformWhatsApp } from '@/lib/whatsapp'

// Página de jogos da loja (/jogos/<slug>) — pública, sem mesa. Aqui só se lista os jogos e se identifica
// o jogador (nome + WhatsApp confirmado por código, o mesmo token da identificação da mesa).
// Jogo aberto por aqui NUNCA vale cashback: a rodada nasce sem mesa e o servidor ignora na hora de
// pagar o prêmio (ver /api/mesa/quiz e src/lib/quizPremio.ts). Cashback só pelo QR da mesa.

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

// Semana do ranking: começa na segunda-feira 00:00 (horário de Brasília, UTC-3).
function inicioSemana(): string {
  const agora = new Date(Date.now() - 3 * 3600_000)
  const dia = (agora.getUTCDay() + 6) % 7
  const seg = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - dia)
  return new Date(seg + 3 * 3600_000).toISOString()
}

async function contar(chave: string, ms: number) {
  const { count } = await sb.from('whatsapp_verifications').select('id', { count: 'exact', head: true })
    .eq('phone', chave).gte('created_at', new Date(Date.now() - ms).toISOString())
  return count || 0
}

export async function POST(req: NextRequest) {
  try {
    const b: Record<string, unknown> = await req.json().catch(() => ({}))
    const acao = String(b.acao || '')
    const slug = String(b.slug || '').trim().toLowerCase()
    if (!slug || slug.length > 80) return erro('Loja não encontrada.', 404)
    const { data: company } = await sb.from('companies').select('id, name, slug, mesas_enabled, loja_digital_enabled, trial_modules_until').eq('slug', slug).maybeSingle()
    if (!company || !company.mesas_enabled || !moduleActive(company.loja_digital_enabled, company.trial_modules_until)) return erro('Loja não encontrada.', 404)

    if (acao === 'info') {
      const { data: camp } = await sb.from('quiz_campanhas').select('ativa').eq('company_id', company.id).maybeSingle()
      return NextResponse.json({
        ok: true,
        loja: company.name,
        logo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/loja-produtos/${company.id}/qr-logo.png`,
        // Cada jogo novo entra nesta lista (id, nome, descrição, rota).
        jogos: [
          { id: 'quiz', nome: 'Quiz Pesca Premiada', descricao: 'Responda perguntas, tente chegar ao topo do ranking da loja.', ativo: !!camp?.ativa, rota: `/jogos/${company.slug}/quiz` },
        ],
      })
    }

    // Rankings da loja: geral (soma do melhor de cada jogo) e de cada jogo, individual e de grupos.
    if (acao === 'ranking') {
      const desde = String(b.aba || 'sem') !== 'sempre' ? inicioSemana() : null
      const ind = (d: unknown) => ((d || []) as { posicao: number; apelido: string; pontos: number }[]).slice(0, 10).map(x => ({ pos: Number(x.posicao), apelido: x.apelido, pontos: x.pontos }))
      const [geral, solo, duelo, grupos] = await Promise.all([
        sb.rpc('quiz_ranking_geral', { p_company: company.id, p_desde: desde, p_limite: 10 }),
        sb.rpc('quiz_ranking', { p_company: company.id, p_desde: desde, p_limite: 10 }),
        sb.rpc('quiz_ranking_duelo', { p_company: company.id, p_desde: desde, p_limite: 10 }),
        sb.rpc('quiz_ranking_grupos', { p_company: company.id, p_desde: desde, p_limite: 10 }),
      ])
      return NextResponse.json({
        ok: true,
        geralIndividual: ind(geral.data), quizSolo: ind(solo.data), quizGrupoIndividual: ind(duelo.data),
        grupos: ((grupos.data || []) as { posicao: number; nome: string; media: number; jogadores: number }[]).map(g => ({ pos: Number(g.posicao), nome: g.nome, media: g.media, jogadores: g.jogadores })),
      })
    }

    if (acao === 'ident_enviar' || acao === 'ident_verificar') {
      const nome = limparNome(b.nome)
      if (!nome) return erro('Digite seu nome (só letras).')
      const tel = normalizePhone(String(b.telefone || ''))
      if (tel.length < 12 || tel.length > 13) return erro('Confira o número do WhatsApp (com DDD).')

      if (acao === 'ident_enviar') {
        const ip = (req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim()
        const chaveIp = `idip:${ip}`
        if ((await contar(chaveIp, 3_600_000)) >= 10) return erro('Muitos pedidos de código. Tente de novo mais tarde.', 429)
        if ((await contar(`id:${tel}`, 60_000)) >= 1) return erro('Aguarde 1 minuto para pedir outro código.', 429)
        if ((await contar(`id:${tel}`, 3_600_000)) >= 3) return erro('Muitos códigos pedidos para este número. Tente de novo mais tarde.', 429)
        const venc = new Date(Date.now() + 10 * 60_000).toISOString()
        await sb.from('whatsapp_verifications').insert({ phone: chaveIp, code: 'ip', expires_at: venc, used: true })
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
        await sb.from('whatsapp_verifications').insert({ phone: `id:${tel}`, code, expires_at: venc })
        const r = await sendPlatformWhatsApp(tel, `🔐 Seu código Trindade Online (${company.name}): *${code}*\n\nVale por 10 minutos. Não compartilhe com ninguém.`)
        if (!r.ok) return erro('Não consegui enviar o código agora. Tente de novo em instantes.', 502)
        return NextResponse.json({ ok: true })
      }

      if ((await contar(`idx:${tel}`, 10 * 60_000)) >= 5) return erro('Muitas tentativas erradas. Peça um código novo daqui a alguns minutos.', 429)
      const dig = String(b.codigo || '').replace(/\D/g, '')
      const { data: rec } = await sb.from('whatsapp_verifications').select('id, code').eq('phone', `id:${tel}`).eq('used', false)
        .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!rec || dig.length !== 6 || !igual(dig, String(rec.code))) {
        await sb.from('whatsapp_verifications').insert({ phone: `idx:${tel}`, code: 'erro', expires_at: new Date(Date.now() + 600_000).toISOString(), used: true })
        return erro('Código incorreto ou vencido.')
      }
      await sb.from('whatsapp_verifications').update({ used: true }).eq('id', rec.id)
      return NextResponse.json({ ok: true, token: criarIdentToken(tel, nome), nome, telefone: tel })
    }

    return erro('Ação inválida.')
  } catch (e) {
    console.error('[jogos]', e)
    return erro('Algo deu errado. Tente de novo.', 500)
  }
}
