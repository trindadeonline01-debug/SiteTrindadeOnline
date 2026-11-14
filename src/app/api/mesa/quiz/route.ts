import { jaGanhouNosUltimosDias } from '@/lib/quizPremio'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import { normalizePhone } from '@/lib/phone'
import { lerIdentToken, nomeRanking } from '@/lib/mesaIdent'
import { sendPlatformWhatsApp } from '@/lib/whatsapp'
import { moduleActive } from '@/lib/modules'
import {
  QUIZ_FOLGA_MS, QUIZ_PULOS, QUIZ_PENSAR, QUIZ_TEMPO_S, QUIZ_TEMPO_PENSAR_S, QUIZ_PORTAO,
  aposAcerto, aposErro, aposDecisao, nivelPorAcertos, pontosDaResposta, type Rodada,
} from '@/lib/quizRegras'
import { BANCO_COMPLETO, TEMAS_QUIZ, garantirBanco as garantirBancoLib, temaValido } from '@/lib/quizBanco'

// Quiz Pesca Premiada — jogo de verdade (nov/2026). Público, sem login: o QR identifica a mesa
// (e por ela a loja) e o jogador se identifica por apelido + WhatsApp confirmado por código.
// O SERVIDOR manda em tudo: sorteia a pergunta, conta o tempo, confere a resposta e aplica as
// regras (src/lib/quizRegras.ts). A resposta certa nunca vai ao celular antes de o jogador
// responder. Desenho: docs/DESENHO_QUIZ.md.

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
const RETOMAR_MS = 2 * 60_000          // queda de conexão: 2 minutos para voltar à rodada
const SESSAO_MS = 60 * 86_400_000       // login do jogador no aparelho: 60 dias

const BANCO = BANCO_COMPLETO
const garantirBanco = () => garantirBancoLib(sb)

// ---------- sessão do jogador (token assinado, sem estado) ----------
function assinar(jid: string, cid: string, exp: number) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`quiz-jogador|${jid}|${cid}|${exp}`).digest('hex').slice(0, 40)
}
const criarToken = (jid: string, cid: string) => { const exp = Date.now() + SESSAO_MS; return `${jid}.${cid}.${exp}.${assinar(jid, cid, exp)}` }
function lerToken(token: unknown, cid: string): string | null {
  const [jid, c, expS, sig] = String(token || '').split('.')
  const exp = Number(expS)
  if (!jid || c !== cid || !exp || !sig || exp < Date.now()) return null
  return igual(sig, assinar(jid, c, exp)) ? jid : null
}

// ---------- apelido ----------
const PALAVROES = ['porra', 'caralho', 'puta', 'fdp', 'buceta', 'cacete', 'merda', 'viado', 'cu', 'pau', 'foda', 'foder', 'nazi', 'hitler', 'racis', 'estupr', 'pedofil', 'arrombado', 'otario', 'vagabund', 'piroca', 'rola', 'xereca', 'punheta', 'corno']
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const normApelido = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, '')
function apelidoProblema(ap: string): string | null {
  if (ap.length < 3 || ap.length > 16) return 'O apelido precisa ter de 3 a 16 caracteres.'
  if (!/^[\p{L}\p{N} _.-]+$/u.test(ap)) return 'Use só letras, números, espaço, _ . ou -.'
  const n = normApelido(ap)
  if (n.length < 3) return 'Escolha um apelido com pelo menos 3 letras ou números.'
  if (PALAVROES.some(p => n.includes(p))) return 'Esse apelido não pode. Escolha outro.'
  return null
}

// ---------- contexto: mesa → loja → campanha ----------
// Dois modos (nov/2026): "mesa" (QR da mesa — pode valer cashback, só pago no fechamento da conta) e
// "loja" (token `loja:<slug>`, página /jogos/<slug> — SEM mesa, nunca vale cashback, só ranking).
// A regra é do servidor: rodada sem mesa_id nunca entra em melhorRodadaPremiavel (src/lib/quizPremio.ts).
type MesaQ = { id: string; numero: number | string; ativa: boolean; company_id: string }
async function carregar(token: unknown) {
  const t = String(token || '')
  if (t.length < 5 || t.length > 90) return null
  const modoLoja = t.startsWith('loja:')
  let mesa: MesaQ | null = null
  let companyId: string | null = null
  if (modoLoja) {
    const { data: c0 } = await sb.from('companies').select('id').eq('slug', t.slice(5)).maybeSingle()
    if (!c0) return null
    companyId = c0.id as string
  } else {
    if (t.length < 10) return null
    const { data: m } = await sb.from('loja_mesas').select('id, numero, ativa, company_id').eq('qr_token', t).maybeSingle()
    if (!m || !m.ativa) return null
    mesa = m as MesaQ
    companyId = m.company_id as string
  }
  const { data: company } = await sb.from('companies').select('id, name, slug, mesas_enabled, loja_digital_enabled, trial_modules_until').eq('id', companyId).maybeSingle()
  if (!company || !company.mesas_enabled || !moduleActive(company.loja_digital_enabled, company.trial_modules_until)) return null
  const { data: camp } = await sb.from('quiz_campanhas').select('ativa, premio_ativo').eq('company_id', company.id).maybeSingle()
  return { mesa, modoLoja, company, camp: camp as { ativa: boolean; premio_ativo: boolean } | null }
}

async function contar(chave: string, ms: number) {
  const { count } = await sb.from('whatsapp_verifications').select('id', { count: 'exact', head: true }).eq('phone', chave).gte('created_at', new Date(Date.now() - ms).toISOString())
  return count || 0
}

// Semana do ranking: começa na segunda-feira 00:00 (horário de Brasília, UTC-3).
function inicioSemana(): string {
  const agora = new Date(Date.now() - 3 * 3600_000)
  const dia = (agora.getUTCDay() + 6) % 7                       // 0 = segunda
  const seg = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - dia)
  return new Date(seg + 3 * 3600_000).toISOString()
}

type RodadaDb = { id: string; company_id: string; jogador_id: string; estado: Rodada['estado']; acertos: number; pontos: number; marco: number; erros: number; pulos_usados: number; pensar_usados: number; atualizada_em: string; mesa_id: string | null; tema?: string | null }
const paraRegras = (r: RodadaDb): Rodada => ({ estado: r.estado, acertos: r.acertos, pontos: r.pontos, marco: r.marco, erros: r.erros })
const publico = (r: RodadaDb) => ({ id: r.id, estado: r.estado, acertos: r.acertos, pontos: r.pontos, marco: r.marco, erros: r.erros, pulos: QUIZ_PULOS - r.pulos_usados, pensar: QUIZ_PENSAR - r.pensar_usados })

async function salvarRodada(id: string, novo: Rodada, extra: Record<string, unknown> = {}) {
  const fim = novo.estado === 'encerrada'
  await sb.from('quiz_rodadas').update({
    estado: novo.estado, acertos: novo.acertos, pontos: novo.pontos, marco: novo.marco, erros: novo.erros,
    atualizada_em: new Date().toISOString(), ...(fim ? { encerrada_em: new Date().toISOString() } : {}), ...extra,
  }).eq('id', id)
}

type ItemDb = { id: string; rodada_id: string; ordem: number; pergunta_id: string; ordem_opcoes: number[]; prazo: string; pensar: boolean; resposta: number | null; acertou: boolean | null }

// Resolve a rodada aberta do jogador: encerra como abandono se passou dos 2 minutos sem atividade.
async function rodadaAberta(jogadorId: string): Promise<RodadaDb | null> {
  const { data } = await sb.from('quiz_rodadas').select('*').eq('jogador_id', jogadorId).neq('estado', 'encerrada').order('iniciada_em', { ascending: false }).limit(5)
  let valida: RodadaDb | null = null
  for (const r of (data || []) as RodadaDb[]) {
    if (!valida && Date.now() - new Date(r.atualizada_em).getTime() <= RETOMAR_MS) { valida = r; continue }
    await sb.from('quiz_rodadas').update({ estado: 'encerrada', motivo_fim: 'abandono', marco: 0, encerrada_em: new Date().toISOString() }).eq('id', r.id)
  }
  return valida
}

async function itemPendente(rodadaId: string): Promise<ItemDb | null> {
  const { data } = await sb.from('quiz_rodada_itens').select('*').eq('rodada_id', rodadaId).is('resposta', null).is('acertou', null).order('ordem', { ascending: false }).limit(1).maybeSingle()
  return (data as ItemDb) || null
}

async function mostrarItem(item: ItemDb, r: RodadaDb) {
  const { data: p } = await sb.from('quiz_perguntas').select('enunciado, opcoes, categoria').eq('id', item.pergunta_id).single()
  const ops = p!.opcoes as string[]
  return {
    itemId: item.id, ordem: item.ordem, nivel: nivelPorAcertos(r.acertos), categoria: p!.categoria, enunciado: p!.enunciado,
    opcoes: item.ordem_opcoes.map(i => ops[i]), restanteMs: Math.max(0, new Date(item.prazo).getTime() - Date.now()), pensando: item.pensar,
  }
}

// Aplica erro ou tempo esgotado na pergunta pendente (mesma regra).
async function aplicarErro(r: RodadaDb, item: ItemDb, motivo: 'erro' | 'tempo', pos: number | null) {
  const novo = aposErro(paraRegras(r))
  const { data: p } = await sb.from('quiz_perguntas').select('opcoes, curiosidade').eq('id', item.pergunta_id).single()
  const ops = p!.opcoes as string[]
  const certaPos = item.ordem_opcoes.indexOf(0)
  await sb.from('quiz_rodada_itens').update({ resposta: pos, acertou: false, pontos: 0, respondida_em: new Date().toISOString() }).eq('id', item.id)
  await salvarRodada(r.id, novo, novo.estado === 'encerrada' ? { motivo_fim: motivo } : {})
  return { ok: false, motivo, certaPos, certaTexto: ops[0], curiosidade: p!.curiosidade, pontos: 0, rodada: { ...publico({ ...r, ...{ estado: novo.estado, acertos: novo.acertos, pontos: novo.pontos, marco: novo.marco, erros: novo.erros } }) }, fim: novo.estado === 'encerrada' }
}

export async function POST(req: NextRequest) {
  try {
    const b: Record<string, unknown> = await req.json().catch(() => ({}))
    const acao = String(b.acao || '')
    const ctx = await carregar(b.token)
    if (!ctx) return erro('Mesa não encontrada.', 404)
    if (!ctx.camp?.ativa) return NextResponse.json({ ativo: false })
    const cid = ctx.company.id as string
    const jogadorId = lerToken(b.jt, cid)

    // ================= entrada =================
    if (acao === 'estado') {
      await garantirBanco()
      let jogador: { apelido: string } | null = null
      let retomar = false
      if (jogadorId) {
        const { data: j } = await sb.from('quiz_jogadores').select('apelido').eq('id', jogadorId).maybeSingle()
        jogador = j || null
        if (j) retomar = !!(await rodadaAberta(jogadorId))
      }
      return NextResponse.json({ ativo: true, modo: ctx.modoLoja ? 'loja' : 'mesa', slug: ctx.company.slug, premio: ctx.modoLoja ? false : !!ctx.camp.premio_ativo, premioDaLoja: !!ctx.camp.premio_ativo, loja: ctx.company.name, mesa: ctx.mesa?.numero ?? null, jogador, retomar, perguntas: BANCO.length, temas: TEMAS_QUIZ })
    }

    // ================= cadastro pela identificação única (nome + WhatsApp já confirmado) =================
    // O ranking mostra o primeiro nome + inicial do sobrenome ("Maria S."). Quem já jogou aqui com este
    // WhatsApp volta com o mesmo nome de antes. Repetiu o nome na loja: ganha " 2", " 3"…
    if (acao === 'cadastro_ident') {
      const id = lerIdentToken(b.ident)
      if (!id) return erro('Identifique-se com seu nome e WhatsApp para jogar.', 401)
      if (!b.idade || !b.aceite) return erro('Para jogar, confirme que tem 18 anos ou mais e aceite aparecer no ranking.')
      let { data: j } = await sb.from('quiz_jogadores').select('id, apelido').eq('company_id', cid).eq('telefone', id.tel).maybeSingle()
      if (!j) {
        const base = nomeRanking(id.nome)
        const norm = normApelido(base)
        // Só barra palavrão "de verdade" (termos curtos como "cu" pegariam nomes normais, ex.: Marcus).
        if (norm.length < 2 || PALAVROES.some(p => p.length >= 5 && norm.includes(p))) return erro('Esse nome não pode aparecer no ranking. Use seu nome verdadeiro.')
        for (let n = 1; n <= 9 && !j; n++) {
          const ap = n === 1 ? base : `${base} ${n}`
          const ins = await sb.from('quiz_jogadores').insert({ company_id: cid, apelido: ap, apelido_norm: normApelido(ap), telefone: id.tel, maior_idade: true, aceite_ranking: true }).select('id, apelido').single()
          if (!ins.error) { j = ins.data; break }
          if (ins.error.code !== '23505') return erro('Não consegui salvar o cadastro.', 500)
          // 23505 pode ser o apelido repetido (tenta o próximo número) ou o mesmo WhatsApp criado agora há pouco.
          const { data: ja } = await sb.from('quiz_jogadores').select('id, apelido').eq('company_id', cid).eq('telefone', id.tel).maybeSingle()
          if (ja) j = ja
        }
        if (!j) return erro('Não consegui salvar o cadastro.', 500)
      }
      return NextResponse.json({ ok: true, jt: criarToken(j.id, cid), apelido: j.apelido })
    }

    // ================= cadastro: apelido + WhatsApp + código =================
    if (acao === 'cadastro_enviar') {
      const ap = String(b.apelido || '').trim().replace(/\s+/g, ' ')
      const tel = normalizePhone(String(b.telefone || ''))
      if (!b.idade) return erro('O quiz é para maiores de 18 anos.')
      if (!b.aceite) return erro('Para jogar, aceite aparecer no ranking com o seu apelido.')
      if (tel.length < 12 || tel.length > 13) return erro('Confira o número do WhatsApp (com DDD).')
      const { data: existente } = await sb.from('quiz_jogadores').select('apelido').eq('company_id', cid).eq('telefone', tel).maybeSingle()
      if (!existente) {
        const prob = apelidoProblema(ap)
        if (prob) return erro(prob)
        const { data: ocupado } = await sb.from('quiz_jogadores').select('id').eq('company_id', cid).eq('apelido_norm', normApelido(ap)).maybeSingle()
        if (ocupado) return erro('Esse apelido já está em uso nesta loja. Escolha outro.', 409)
      }
      const ip = (req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim()
      if ((await contar(`qzip:${ip}`, 3_600_000)) >= 10) return erro('Muitos pedidos de código. Tente de novo mais tarde.', 429)
      if ((await contar(`qz:${tel}`, 60_000)) >= 1) return erro('Aguarde 1 minuto para pedir outro código.', 429)
      if ((await contar(`qz:${tel}`, 3_600_000)) >= 3) return erro('Muitos códigos pedidos para este número. Tente de novo mais tarde.', 429)
      const venc = new Date(Date.now() + 10 * 60_000).toISOString()
      await sb.from('whatsapp_verifications').insert({ phone: `qzip:${ip}`, code: 'ip', expires_at: venc, used: true })
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      await sb.from('whatsapp_verifications').insert({ phone: `qz:${tel}`, code, expires_at: venc })
      const r = await sendPlatformWhatsApp(tel, `🎣 Seu código do *Quiz ${ctx.company.name.trim()}* (Trindade Online): *${code}*\n\nVale por 10 minutos. Se não foi você, ignore.`)
      if (!r.ok) return erro('Não consegui enviar o código agora. Tente de novo em instantes.', 502)
      await sb.from('whatsapp_verifications').delete().or('phone.like.qz:*,phone.like.qzx:*,phone.like.qzip:*').lt('created_at', new Date(Date.now() - 86_400_000).toISOString())
      return NextResponse.json({ ok: true, jaCadastrado: existente?.apelido || null })
    }

    if (acao === 'cadastro_verificar') {
      const tel = normalizePhone(String(b.telefone || ''))
      if (tel.length < 12 || tel.length > 13) return erro('Confira o número do WhatsApp (com DDD).')
      if ((await contar(`qzx:${tel}`, 10 * 60_000)) >= 5) return erro('Muitas tentativas erradas. Peça um código novo daqui a alguns minutos.', 429)
      const dig = String(b.codigo || '').replace(/\D/g, '')
      const { data: rec } = await sb.from('whatsapp_verifications').select('id, code').eq('phone', `qz:${tel}`).eq('used', false).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!rec || dig.length !== 6 || !igual(dig, String(rec.code))) {
        await sb.from('whatsapp_verifications').insert({ phone: `qzx:${tel}`, code: 'erro', expires_at: new Date(Date.now() + 600_000).toISOString(), used: true })
        return erro('Código incorreto ou vencido.')
      }
      await sb.from('whatsapp_verifications').update({ used: true }).eq('id', rec.id)
      let { data: j } = await sb.from('quiz_jogadores').select('id, apelido').eq('company_id', cid).eq('telefone', tel).maybeSingle()
      if (!j) {
        const ap = String(b.apelido || '').trim().replace(/\s+/g, ' ')
        const prob = apelidoProblema(ap)
        if (prob) return erro(prob)
        const ins = await sb.from('quiz_jogadores').insert({ company_id: cid, apelido: ap, apelido_norm: normApelido(ap), telefone: tel, maior_idade: true, aceite_ranking: true }).select('id, apelido').single()
        if (ins.error) return erro(ins.error.code === '23505' ? 'Esse apelido acabou de ser usado. Escolha outro.' : 'Não consegui salvar o cadastro.', ins.error.code === '23505' ? 409 : 500)
        j = ins.data
      }
      return NextResponse.json({ ok: true, jt: criarToken(j!.id, cid), apelido: j!.apelido })
    }

    // ================= ranking =================
    if (acao === 'ranking') {
      const sem = String(b.aba || 'sem') !== 'sempre'
      const { data } = await sb.rpc('quiz_ranking', { p_company: cid, p_desde: sem ? inicioSemana() : null, p_limite: 1000 })
      const lista = (data || []) as { posicao: number; jogador_id: string; apelido: string; pontos: number; acertos: number; total: number }[]
      const eu = jogadorId ? lista.find(x => x.jogador_id === jogadorId) : null
      return NextResponse.json({
        ok: true, total: lista[0]?.total ? Number(lista[0].total) : 0,
        top: lista.slice(0, 10).map(x => ({ pos: Number(x.posicao), apelido: x.apelido, pontos: x.pontos, acertos: x.acertos, eu: x.jogador_id === jogadorId })),
        eu: eu ? { pos: Number(eu.posicao), apelido: eu.apelido, pontos: eu.pontos, acertos: eu.acertos } : null,
        // Jogador que já ganhou prêmio nos últimos 7 dias: nesta rodada só vale o ranking.
        premioBloqueado: !ctx.modoLoja && ctx.camp.premio_ativo && jogadorId ? await jaGanhouNosUltimosDias(sb, cid, jogadorId) : false,
      })
    }

    // ================= daqui para baixo, só jogador identificado =================
    if (!jogadorId) return erro('Faça o cadastro para jogar.', 401)
    const { data: jog } = await sb.from('quiz_jogadores').select('id').eq('id', jogadorId).maybeSingle()
    if (!jog) return erro('Faça o cadastro para jogar.', 401)
    await garantirBanco()

    if (acao === 'iniciar') {
      const tema = temaValido(b.tema)
      let r = await rodadaAberta(jogadorId)
      let retomada = true
      if (!r) {
        retomada = false
        const ins = await sb.from('quiz_rodadas').insert({ company_id: cid, comanda_id: null, jogador_key: `j:${jogadorId}`, jogador_id: jogadorId, mesa_id: ctx.mesa?.id ?? null, premiada: false, tema }).select('*').single()
        if (ins.error) return erro('Não consegui começar a rodada.', 500)
        r = ins.data as RodadaDb
      }
      const item = await itemPendente(r.id)
      return NextResponse.json({ ok: true, retomada, rodada: publico(r), tema: r.tema ?? null, item: item ? await mostrarItem(item, r) : null, tempoS: QUIZ_TEMPO_S })
    }

    // As demais ações trabalham na rodada aberta do jogador.
    const r = await rodadaAberta(jogadorId)
    if (!r) return erro('Rodada encerrada.', 409)
    await sb.from('quiz_rodadas').update({ atualizada_em: new Date().toISOString() }).eq('id', r.id)

    if (acao === 'pergunta') {
      const pend = await itemPendente(r.id)
      if (pend && Date.now() > new Date(pend.prazo).getTime() + QUIZ_FOLGA_MS) {
        // venceu enquanto o jogador estava fora: conta como tempo esgotado
        const res = await aplicarErro(r, pend, 'tempo', null)
        return NextResponse.json({ ok: true, vencida: res })
      }
      if (pend) return NextResponse.json({ ok: true, rodada: publico(r), item: await mostrarItem(pend, r) })
      if (r.estado === 'portao') return NextResponse.json({ ok: true, rodada: publico(r), decisao: true })
      const nivel = nivelPorAcertos(r.acertos)
      const chave = `j:${jogadorId}`
      const { data: vistasD } = await sb.from('quiz_vistas').select('pergunta_id').eq('jogador_key', chave)
      const vistas = new Set((vistasD || []).map(v => v.pergunta_id as string))
      const ativas = ((await sb.from('quiz_perguntas').select('id, nivel, tema').eq('ativa', true)).data || []).filter(q => !r.tema || q.tema === r.tema)
      let pool = ativas.filter(q => q.nivel === nivel && !vistas.has(q.id))
      if (!pool.length) pool = ativas.filter(q => !vistas.has(q.id) && q.nivel <= nivel).sort((a, c) => c.nivel - a.nivel)
      if (!pool.length) pool = ativas.filter(q => !vistas.has(q.id))
      if (!pool.length) { await sb.from('quiz_vistas').delete().eq('jogador_key', chave); pool = ativas.filter(q => q.nivel === nivel) }
      if (!pool.length) return erro('Sem perguntas disponíveis agora.', 503)
      const topo = pool[0].nivel
      const escolhida = pool.filter(q => q.nivel === topo)[randomInt(0, pool.filter(q => q.nivel === topo).length)]
      const ordem = [0, 1, 2, 3]
      for (let i = 3; i > 0; i--) { const j = randomInt(0, i + 1);[ordem[i], ordem[j]] = [ordem[j], ordem[i]] }
      const { count } = await sb.from('quiz_rodada_itens').select('id', { count: 'exact', head: true }).eq('rodada_id', r.id)
      const prazo = new Date(Date.now() + QUIZ_TEMPO_S * 1000).toISOString()
      const ins = await sb.from('quiz_rodada_itens').insert({ rodada_id: r.id, ordem: (count || 0) + 1, pergunta_id: escolhida.id, ordem_opcoes: ordem, prazo }).select('*').single()
      if (ins.error) return erro('Não consegui sortear a pergunta.', 500)
      await sb.from('quiz_vistas').upsert({ jogador_key: chave, pergunta_id: escolhida.id }, { onConflict: 'jogador_key,pergunta_id' })
      return NextResponse.json({ ok: true, rodada: publico(r), item: await mostrarItem(ins.data as ItemDb, r) })
    }

    if (acao === 'responder' || acao === 'tempo' || acao === 'pular' || acao === 'pensar') {
      const { data: it } = await sb.from('quiz_rodada_itens').select('*').eq('id', String(b.itemId || '')).eq('rodada_id', r.id).maybeSingle()
      const item = it as ItemDb | null
      if (!item || item.resposta !== null || item.acertou !== null) return erro('Essa pergunta já foi respondida.', 409)
      const prazoMs = new Date(item.prazo).getTime()
      const agora = Date.now()

      if (acao === 'pular') {
        if (r.pulos_usados >= QUIZ_PULOS) return erro('Seus pulos acabaram.', 409)
        if (agora > prazoMs + QUIZ_FOLGA_MS) return erro('O tempo acabou.', 409)
        await sb.from('quiz_rodada_itens').update({ acertou: null, resposta: -1, respondida_em: new Date().toISOString() }).eq('id', item.id)
        await sb.from('quiz_rodadas').update({ pulos_usados: r.pulos_usados + 1 }).eq('id', r.id)
        return NextResponse.json({ ok: true, rodada: publico({ ...r, pulos_usados: r.pulos_usados + 1 }) })
      }
      if (acao === 'pensar') {
        if (r.pensar_usados >= QUIZ_PENSAR || item.pensar) return erro('Você já usou o Pensar.', 409)
        if (agora > prazoMs) return erro('O tempo acabou.', 409)
        const novo = new Date(prazoMs + (QUIZ_TEMPO_PENSAR_S - QUIZ_TEMPO_S) * 1000).toISOString()
        await sb.from('quiz_rodada_itens').update({ pensar: true, prazo: novo }).eq('id', item.id)
        await sb.from('quiz_rodadas').update({ pensar_usados: r.pensar_usados + 1 }).eq('id', r.id)
        return NextResponse.json({ ok: true, restanteMs: Math.max(0, new Date(novo).getTime() - agora), rodada: publico({ ...r, pensar_usados: r.pensar_usados + 1 }) })
      }
      if (acao === 'tempo') {
        if (agora < prazoMs - 800) return erro('Ainda há tempo.', 409)
        return NextResponse.json({ ...(await aplicarErro(r, item, 'tempo', null)) })
      }
      // responder
      if (r.estado === 'portao') return erro('Decida antes: parar ou continuar.', 409)
      const pos = Number(b.pos)
      if (![0, 1, 2, 3].includes(pos)) return erro('Resposta inválida.')
      if (agora > prazoMs + QUIZ_FOLGA_MS) return NextResponse.json({ ...(await aplicarErro(r, item, 'tempo', null)) })
      const certaPos = item.ordem_opcoes.indexOf(0)
      if (pos !== certaPos) return NextResponse.json({ ...(await aplicarErro(r, item, 'erro', pos)) })
      const pts = pontosDaResposta(prazoMs - agora)
      const novo = aposAcerto(paraRegras(r), pts)
      await sb.from('quiz_rodada_itens').update({ resposta: pos, acertou: true, pontos: pts, respondida_em: new Date().toISOString() }).eq('id', item.id)
      await salvarRodada(r.id, novo)
      const { data: p } = await sb.from('quiz_perguntas').select('curiosidade').eq('id', item.pergunta_id).single()
      return NextResponse.json({ ok: true, acertou: true, pontos: pts, certaPos, curiosidade: p?.curiosidade || null, rodada: publico({ ...r, estado: novo.estado, acertos: novo.acertos, pontos: novo.pontos, marco: novo.marco, erros: novo.erros }), fim: false })
    }

    if (acao === 'decidir') {
      if (r.estado !== 'portao') return erro('Não há decisão a tomar agora.', 409)
      const parar = !!b.parar
      const novo = aposDecisao(paraRegras(r), parar)
      await salvarRodada(r.id, novo, parar ? { motivo_fim: 'parou' } : {})
      return NextResponse.json({ ok: true, rodada: publico({ ...r, estado: novo.estado, marco: novo.marco }), fim: novo.estado === 'encerrada' })
    }

    // Parar num marco antes do portão (10 e 20 acertos): encerra a rodada e leva o marco já garantido.
    if (acao === 'parar') {
      if (r.estado !== 'jogando' || r.marco <= 0 || r.acertos >= QUIZ_PORTAO) return erro('Não há como parar agora.', 409)
      const novo = aposDecisao(paraRegras(r), true)
      await salvarRodada(r.id, novo, { motivo_fim: 'parou' })
      return NextResponse.json({ ok: true, rodada: publico({ ...r, estado: novo.estado, marco: novo.marco }), fim: true })
    }

    if (acao === 'sair') {
      // Sair no meio perde tudo e não entra no ranking.
      await sb.from('quiz_rodadas').update({ estado: 'encerrada', motivo_fim: 'abandono', marco: 0, encerrada_em: new Date().toISOString() }).eq('id', r.id)
      return NextResponse.json({ ok: true })
    }

    return erro('Ação inválida.')
  } catch (e) {
    console.error('[quiz]', e)
    return erro('Algo deu errado. Tente de novo.', 500)
  }
}
