import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'crypto'
import { moduleActive } from '@/lib/modules'
import { TEMAS_QUIZ, garantirBanco, temaValido } from '@/lib/quizBanco'
import { lerJogadorToken } from '@/lib/quizJogador'
import { pontosDaResposta } from '@/lib/quizRegras'
import {
  CODIGO_ALFABETO, GRUPO_ESPERA_MAX_MS, GRUPO_FOLGA_MS, GRUPO_MAX_JOGADORES, GRUPO_MIN_JOGADORES, GRUPO_PERGUNTAS,
  GRUPO_RESPOSTA_MS, GRUPO_REVELACAO_MS, faseDaPartida, nivelDaOrdemGrupo,
} from '@/lib/quizGrupoRegras'

// Quiz em grupo (nov/2026): sala com código, 15 perguntas iguais para todos, ranking individual e de
// grupos. SEM cashback (decisão do Ricardo) e só pelo QR da mesa (restaurante). O servidor manda em
// tudo: sorteia as perguntas, conta o tempo (relógio único da partida) e confere as respostas; a
// resposta certa só sai na fase de revelação. Desenho: docs/DESENHO_QUIZ.md.

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

const PALAVROES = ['porra', 'caralho', 'puta', 'fdp', 'buceta', 'cacete', 'merda', 'viado', 'foda', 'foder', 'nazi', 'hitler', 'racis', 'estupr', 'pedofil', 'arrombado', 'otario', 'vagabund', 'piroca', 'xereca', 'punheta']
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, '')

function nomeGrupoProblema(n: string): string | null {
  if (n.length < 2 || n.length > 24) return 'O nome do grupo precisa ter de 2 a 24 caracteres.'
  if (!/^[\p{L}\p{N} _.!&'-]+$/u.test(n)) return 'Use só letras, números e espaço no nome do grupo.'
  if (norm(n).length < 2) return 'Escolha um nome com pelo menos 2 letras ou números.'
  if (PALAVROES.some(p => norm(n).includes(p))) return 'Esse nome não pode. Escolha outro.'
  return null
}

type SalaDb = { id: string; company_id: string; mesa_id: string | null; codigo: string; nome: string; anfitriao_id: string; tema?: string | null; estado: 'espera' | 'jogando' | 'encerrada' | 'cancelada'; iniciada_em: string | null; criada_em: string; atualizada_em: string; n_jogadores: number | null }

async function carregar(token: unknown) {
  const t = String(token || '')
  if (t.length < 10 || t.length > 80) return null
  const { data: mesa } = await sb.from('loja_mesas').select('id, numero, ativa, company_id').eq('qr_token', t).maybeSingle()
  if (!mesa || !mesa.ativa) return null
  const { data: company } = await sb.from('companies').select('id, name, slug, mesas_enabled, loja_digital_enabled, trial_modules_until').eq('id', mesa.company_id).maybeSingle()
  if (!company || !company.mesas_enabled || !moduleActive(company.loja_digital_enabled, company.trial_modules_until)) return null
  const { data: camp } = await sb.from('quiz_campanhas').select('ativa').eq('company_id', company.id).maybeSingle()
  return { mesa, company, ativa: !!camp?.ativa }
}

function inicioSemana(): string {
  const agora = new Date(Date.now() - 3 * 3600_000)
  const dia = (agora.getUTCDay() + 6) % 7
  const seg = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - dia)
  return new Date(seg + 3 * 3600_000).toISOString()
}

// Textos das perguntas ficam em memória (o banco de perguntas quase não muda).
const cachePerg = new Map<string, { enunciado: string; opcoes: string[]; categoria: string; curiosidade: string | null }>()
async function pergunta(id: string) {
  let p = cachePerg.get(id)
  if (!p) {
    const { data } = await sb.from('quiz_perguntas').select('enunciado, opcoes, categoria, curiosidade').eq('id', id).single()
    if (!data) return null
    p = { enunciado: data.enunciado as string, opcoes: data.opcoes as string[], categoria: data.categoria as string, curiosidade: (data.curiosidade as string) || null }
    if (cachePerg.size > 600) cachePerg.clear()
    cachePerg.set(id, p)
  }
  return p
}

async function jogadoresDaSala(salaId: string) {
  const { data } = await sb.from('quiz_sala_jogadores').select('jogador_id, pontos, acertos, tempo_ms, entrou_em, jogador:quiz_jogadores(apelido)').eq('sala_id', salaId).order('entrou_em')
  return ((data || []) as unknown as { jogador_id: string; pontos: number; acertos: number; tempo_ms: number; entrou_em: string; jogador: { apelido: string } | { apelido: string }[] | null }[]).map(r => ({
    id: r.jogador_id, pontos: r.pontos, acertos: r.acertos, tempoMs: Number(r.tempo_ms),
    apelido: (Array.isArray(r.jogador) ? r.jogador[0]?.apelido : r.jogador?.apelido) || 'Jogador',
  }))
}
const porPlacar = <T extends { pontos: number; tempoMs: number }>(l: T[]) => [...l].sort((a, b) => b.pontos - a.pontos || a.tempoMs - b.tempoMs)

// Sala ativa (espera/jogando) em que o jogador já está.
async function salaAtivaDoJogador(cid: string, jogadorId: string): Promise<SalaDb | null> {
  const { data: mine } = await sb.from('quiz_sala_jogadores').select('sala_id').eq('jogador_id', jogadorId).order('entrou_em', { ascending: false }).limit(10)
  const ids = (mine || []).map(m => m.sala_id as string)
  if (!ids.length) return null
  const { data: salas } = await sb.from('quiz_salas').select('*').in('id', ids).eq('company_id', cid).in('estado', ['espera', 'jogando']).order('criada_em', { ascending: false })
  for (const s of (salas || []) as SalaDb[]) {
    const v = await validarSala(s)
    if (v && (v.estado === 'espera' || v.estado === 'jogando')) return v
  }
  return null
}

// Sala parada em espera há muito tempo é cancelada; partida que passou do fim é encerrada (lazy, sem cron).
async function validarSala(s: SalaDb): Promise<SalaDb | null> {
  if (s.estado === 'espera' && Date.now() - new Date(s.atualizada_em).getTime() > GRUPO_ESPERA_MAX_MS) {
    await sb.from('quiz_salas').update({ estado: 'cancelada' }).eq('id', s.id).eq('estado', 'espera')
    return { ...s, estado: 'cancelada' }
  }
  if (s.estado === 'jogando' && s.iniciada_em && faseDaPartida(Date.now() - new Date(s.iniciada_em).getTime()).fase === 'fim') {
    return await encerrar(s)
  }
  return s
}

async function encerrar(s: SalaDb): Promise<SalaDb> {
  const js = await jogadoresDaSala(s.id)
  const total = js.reduce((x, j) => x + j.pontos, 0)
  const { data } = await sb.from('quiz_salas').update({
    estado: 'encerrada', encerrada_em: new Date().toISOString(), n_jogadores: js.length, pontos_total: total, pontos_media: js.length ? total / js.length : 0,
  }).eq('id', s.id).eq('estado', 'jogando').select('*').maybeSingle()
  return (data as SalaDb) || { ...s, estado: 'encerrada' }
}

export async function POST(req: NextRequest) {
  try {
    const b: Record<string, unknown> = await req.json().catch(() => ({}))
    const acao = String(b.acao || '')
    const ctx = await carregar(b.token)
    if (!ctx) return erro('Mesa não encontrada.', 404)
    if (!ctx.ativa) return NextResponse.json({ ativo: false })
    const cid = ctx.company.id as string

    // ---------- ranking (público para quem está na mesa) ----------
    if (acao === 'ranking') {
      const desde = String(b.aba || 'sem') !== 'sempre' ? inicioSemana() : null
      const jogadorId = lerJogadorToken(b.jt, cid)
      const [ind, grp] = await Promise.all([
        sb.rpc('quiz_ranking_duelo', { p_company: cid, p_desde: desde, p_limite: 1000 }),
        sb.rpc('quiz_ranking_grupos', { p_company: cid, p_desde: desde, p_limite: 10 }),
      ])
      const lista = (ind.data || []) as { posicao: number; jogador_id: string; apelido: string; pontos: number; acertos: number }[]
      const eu = jogadorId ? lista.find(x => x.jogador_id === jogadorId) : null
      return NextResponse.json({
        ok: true,
        individual: lista.slice(0, 10).map(x => ({ pos: Number(x.posicao), apelido: x.apelido, pontos: x.pontos, acertos: x.acertos, eu: x.jogador_id === jogadorId })),
        eu: eu ? { pos: Number(eu.posicao), apelido: eu.apelido, pontos: eu.pontos } : null,
        grupos: ((grp.data || []) as { posicao: number; nome: string; media: number; jogadores: number }[]).map(g => ({ pos: Number(g.posicao), nome: g.nome, media: g.media, jogadores: g.jogadores })),
      })
    }

    // ---------- tudo abaixo exige jogador identificado ----------
    const jogadorId = lerJogadorToken(b.jt, cid)
    if (!jogadorId) return erro('Identifique-se para jogar.', 401)
    const { data: jog } = await sb.from('quiz_jogadores').select('id, apelido').eq('id', jogadorId).maybeSingle()
    if (!jog) return erro('Identifique-se para jogar.', 401)

    // ---------- salas abertas na mesa + sala em andamento do jogador ----------
    if (acao === 'inicio') {
      const minha = await salaAtivaDoJogador(cid, jogadorId)
      const desde = new Date(Date.now() - GRUPO_ESPERA_MAX_MS).toISOString()
      const { data: abertas } = await sb.from('quiz_salas').select('id, nome, codigo, anfitriao_id, atualizada_em, tema').eq('company_id', cid).eq('mesa_id', ctx.mesa.id).eq('estado', 'espera').gte('atualizada_em', desde).order('criada_em', { ascending: false }).limit(5)
      const lista = await Promise.all((abertas || []).map(async s => {
        const { count } = await sb.from('quiz_sala_jogadores').select('jogador_id', { count: 'exact', head: true }).eq('sala_id', s.id)
        return { id: s.id as string, nome: s.nome as string, codigo: s.codigo as string, tema: (s.tema as string) || null, jogadores: count || 0, cheia: (count || 0) >= GRUPO_MAX_JOGADORES }
      }))
      return NextResponse.json({ ok: true, apelido: jog.apelido, mesa: ctx.mesa.numero, loja: ctx.company.name, slug: ctx.company.slug, temas: TEMAS_QUIZ, minha: minha ? { id: minha.id, estado: minha.estado } : null, abertas: lista.filter(s => s.id !== minha?.id) })
    }

    if (acao === 'criar') {
      const nome = String(b.nome || '').trim().replace(/\s+/g, ' ')
      const prob = nomeGrupoProblema(nome)
      if (prob) return erro(prob)
      if (await salaAtivaDoJogador(cid, jogadorId)) return erro('Você já está em uma partida. Saia dela antes de criar outra.', 409)
      for (let tent = 0; tent < 6; tent++) {
        const codigo = Array.from({ length: 4 }, () => CODIGO_ALFABETO[randomInt(0, CODIGO_ALFABETO.length)]).join('')
        const ins = await sb.from('quiz_salas').insert({ company_id: cid, mesa_id: ctx.mesa.id, codigo, nome, anfitriao_id: jogadorId, tema: temaValido(b.tema) }).select('id, codigo').single()
        if (ins.error) { if (ins.error.code === '23505') continue; return erro('Não consegui criar o grupo.', 500) }
        await sb.from('quiz_sala_jogadores').insert({ sala_id: ins.data.id, jogador_id: jogadorId })
        return NextResponse.json({ ok: true, salaId: ins.data.id, codigo: ins.data.codigo })
      }
      return erro('Não consegui gerar o código. Tente de novo.', 500)
    }

    if (acao === 'entrar') {
      const codigo = String(b.codigo || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
      const salaIdIn = String(b.salaId || '')
      let q = sb.from('quiz_salas').select('*').eq('company_id', cid).eq('estado', 'espera')
      q = salaIdIn ? q.eq('id', salaIdIn) : q.eq('codigo', codigo)
      if (!salaIdIn && codigo.length !== 4) return erro('O código tem 4 letras.')
      const { data: s0 } = await q.maybeSingle()
      const sala = s0 ? await validarSala(s0 as SalaDb) : null
      if (!sala || sala.estado !== 'espera') return erro('Não achei esse grupo. Confira o código ou peça para criarem de novo.', 404)
      const atual = await salaAtivaDoJogador(cid, jogadorId)
      if (atual && atual.id !== sala.id) {
        if (atual.estado === 'jogando') return erro('Você está em uma partida em andamento.', 409)
        await sb.from('quiz_sala_jogadores').delete().eq('sala_id', atual.id).eq('jogador_id', jogadorId)
      }
      const { count } = await sb.from('quiz_sala_jogadores').select('jogador_id', { count: 'exact', head: true }).eq('sala_id', sala.id)
      const { data: ja } = await sb.from('quiz_sala_jogadores').select('jogador_id').eq('sala_id', sala.id).eq('jogador_id', jogadorId).maybeSingle()
      if (!ja) {
        if ((count || 0) >= GRUPO_MAX_JOGADORES) return erro(`Esse grupo já tem ${GRUPO_MAX_JOGADORES} jogadores.`, 409)
        await sb.from('quiz_sala_jogadores').insert({ sala_id: sala.id, jogador_id: jogadorId })
        await sb.from('quiz_salas').update({ atualizada_em: new Date().toISOString() }).eq('id', sala.id)
      }
      return NextResponse.json({ ok: true, salaId: sala.id })
    }

    // ---------- daqui para baixo, sempre sobre uma sala em que o jogador está ----------
    const salaId = String(b.salaId || '')
    const { data: s0 } = await sb.from('quiz_salas').select('*').eq('id', salaId).eq('company_id', cid).maybeSingle()
    if (!s0) return erro('Partida não encontrada.', 404)
    const { data: meu } = await sb.from('quiz_sala_jogadores').select('jogador_id').eq('sala_id', salaId).eq('jogador_id', jogadorId).maybeSingle()
    if (!meu) return erro('Você não está nesta partida.', 403)
    const sala = (await validarSala(s0 as SalaDb)) as SalaDb
    const souAnfitriao = sala.anfitriao_id === jogadorId

    if (acao === 'sair') {
      if (sala.estado !== 'espera') return NextResponse.json({ ok: true })
      await sb.from('quiz_sala_jogadores').delete().eq('sala_id', salaId).eq('jogador_id', jogadorId)
      const resto = await jogadoresDaSala(salaId)
      if (!resto.length) await sb.from('quiz_salas').update({ estado: 'cancelada' }).eq('id', salaId).eq('estado', 'espera')
      else if (souAnfitriao) await sb.from('quiz_salas').update({ anfitriao_id: resto[0].id, atualizada_em: new Date().toISOString() }).eq('id', salaId)
      return NextResponse.json({ ok: true })
    }

    if (acao === 'iniciar') {
      if (!souAnfitriao) return erro('Só quem criou o grupo pode começar.', 403)
      if (sala.estado !== 'espera') return erro('Essa partida já começou.', 409)
      await garantirBanco(sb)
      const js = await jogadoresDaSala(salaId)
      if (js.length < GRUPO_MIN_JOGADORES) return erro(`Chame pelo menos ${GRUPO_MIN_JOGADORES} jogadores para começar.`, 409)
      // 15 perguntas: 3 de cada nível, preferindo as que ninguém do grupo viu ainda.
      const { data: vistasD } = await sb.from('quiz_vistas').select('pergunta_id').in('jogador_key', js.map(j => `j:${j.id}`))
      const vistas = new Set((vistasD || []).map(v => v.pergunta_id as string))
      const ativas = ((await sb.from('quiz_perguntas').select('id, nivel, tema').eq('ativa', true)).data || []) as { id: string; nivel: number; tema: string | null }[]
      const doTema = sala.tema ? ativas.filter(q => q.tema === sala.tema) : ativas
      const escolhidas: string[] = []
      for (let nivel = 1; nivel <= 5; nivel++) {
        let pool = doTema.filter(q => q.nivel === nivel && !vistas.has(q.id))
        if (pool.length < 3) pool = [...pool, ...doTema.filter(q => q.nivel === nivel && vistas.has(q.id))]
        if (pool.length < 3) pool = [...pool, ...doTema.filter(q => q.nivel !== nivel && !escolhidas.includes(q.id) && !pool.some(p => p.id === q.id))]
        for (let i = 0; i < 3 && pool.length; i++) { const k = randomInt(0, pool.length); escolhidas.push(pool[k].id); pool.splice(k, 1) }
      }
      if (escolhidas.length < GRUPO_PERGUNTAS) return erro('Sem perguntas suficientes agora.', 503)
      const linhas = escolhidas.map((pid, i) => {
        const ordem = [0, 1, 2, 3]
        for (let a = 3; a > 0; a--) { const c = randomInt(0, a + 1);[ordem[a], ordem[c]] = [ordem[c], ordem[a]] }
        return { sala_id: salaId, ordem: i + 1, pergunta_id: pid, ordem_opcoes: ordem }
      })
      // Só o primeiro "iniciar" vence (estado ainda em espera).
      const marca = await sb.from('quiz_salas').update({ estado: 'jogando', iniciada_em: new Date().toISOString(), atualizada_em: new Date().toISOString() }).eq('id', salaId).eq('estado', 'espera').select('id').maybeSingle()
      if (!marca.data) return erro('Essa partida já começou.', 409)
      await sb.from('quiz_sala_perguntas').insert(linhas)
      const pares = js.flatMap(j => escolhidas.map(pid => ({ jogador_key: `j:${j.id}`, pergunta_id: pid })))
      await sb.from('quiz_vistas').upsert(pares, { onConflict: 'jogador_key,pergunta_id' })
      return NextResponse.json({ ok: true })
    }

    if (acao === 'estado') {
      const js = await jogadoresDaSala(salaId)
      const base = { ok: true, sala: { id: sala.id, nome: sala.nome, codigo: sala.codigo, estado: sala.estado, tema: sala.tema || null }, souAnfitriao, eu: jogadorId, mesa: ctx.mesa.numero, slug: ctx.company.slug }
      if (sala.estado === 'cancelada') return NextResponse.json({ ...base, fase: 'cancelada' })
      if (sala.estado === 'espera') {
        await sb.from('quiz_salas').update({ atualizada_em: new Date().toISOString() }).eq('id', salaId)
        return NextResponse.json({ ...base, fase: 'espera', jogadores: js.map(j => ({ id: j.id, apelido: j.apelido, anfitriao: j.id === sala.anfitriao_id })), minimo: GRUPO_MIN_JOGADORES, maximo: GRUPO_MAX_JOGADORES })
      }
      if (sala.estado === 'encerrada') {
        const placar = porPlacar(js).map((j, i) => ({ pos: i + 1, id: j.id, apelido: j.apelido, pontos: j.pontos, acertos: j.acertos, eu: j.id === jogadorId }))
        const total = js.reduce((x, j) => x + j.pontos, 0)
        return NextResponse.json({ ...base, fase: 'fim', placar, grupo: { nome: sala.nome, media: js.length ? Math.round(total / js.length) : 0, jogadores: js.length } })
      }
      // jogando
      const t = Date.now() - new Date(sala.iniciada_em!).getTime()
      const f = faseDaPartida(t)
      if (f.fase === 'contagem') return NextResponse.json({ ...base, fase: 'contagem', restanteMs: f.restanteMs, jogadores: js.length })
      if (f.fase === 'fim') return NextResponse.json({ ...base, fase: 'aguardando_fim' })
      const { data: pp } = await sb.from('quiz_sala_perguntas').select('pergunta_id, ordem_opcoes').eq('sala_id', salaId).eq('ordem', f.ordem).single()
      if (!pp) return erro('Pergunta não encontrada.', 500)
      const perg = await pergunta(pp.pergunta_id as string)
      if (!perg) return erro('Pergunta não encontrada.', 500)
      const opsOrd = pp.ordem_opcoes as number[]
      const { data: resp } = await sb.from('quiz_sala_respostas').select('jogador_id, pos, acertou, pontos').eq('sala_id', salaId).eq('ordem', f.ordem)
      const respostas = (resp || []) as { jogador_id: string; pos: number; acertou: boolean; pontos: number }[]
      const minha = respostas.find(r => r.jogador_id === jogadorId) || null
      const comum = { ...base, ordem: f.ordem, total: GRUPO_PERGUNTAS, restanteMs: f.restanteMs, respondidos: respostas.length, jogadoresTotal: js.length }
      if (f.fase === 'pergunta') {
        return NextResponse.json({
          ...comum, fase: 'pergunta', nivel: nivelDaOrdemGrupo(f.ordem), categoria: perg.categoria, enunciado: perg.enunciado,
          opcoes: opsOrd.map(i => perg.opcoes[i]), euRespondi: !!minha,
        })
      }
      // revelação: resposta certa + o que cada um fez nesta pergunta + placar parcial
      const placar = porPlacar(js).map((j, i) => {
        const r = respostas.find(x => x.jogador_id === j.id)
        return { pos: i + 1, apelido: j.apelido, pontos: j.pontos, ganhou: r?.pontos || 0, acertou: r ? r.acertou : null, eu: j.id === jogadorId }
      })
      return NextResponse.json({
        ...comum, fase: 'revelacao', enunciado: perg.enunciado, opcoes: opsOrd.map(i => perg.opcoes[i]), certaPos: opsOrd.indexOf(0), curiosidade: perg.curiosidade,
        minha: minha ? { pos: minha.pos, acertou: minha.acertou, pontos: minha.pontos } : null, placar,
      })
    }

    if (acao === 'responder') {
      if (sala.estado !== 'jogando' || !sala.iniciada_em) return erro('A partida não está em andamento.', 409)
      const t = Date.now() - new Date(sala.iniciada_em).getTime()
      const f = faseDaPartida(t)
      const ordem = Number(b.ordem)
      const pos = Number(b.pos)
      if (![0, 1, 2, 3].includes(pos)) return erro('Resposta inválida.')
      if (f.fase !== 'pergunta' && f.fase !== 'revelacao') return erro('Tempo esgotado.', 409)
      if (f.ordem !== ordem) return erro('Tempo esgotado.', 409)
      // folga de rede: aceita até 1,2 s depois do fim da janela de resposta (já na revelação)
      if (f.fase === 'revelacao' && GRUPO_REVELACAO_MS - f.restanteMs > GRUPO_FOLGA_MS) return erro('Tempo esgotado.', 409)
      const { data: pp } = await sb.from('quiz_sala_perguntas').select('ordem_opcoes').eq('sala_id', salaId).eq('ordem', ordem).single()
      if (!pp) return erro('Pergunta não encontrada.', 404)
      const certaPos = (pp.ordem_opcoes as number[]).indexOf(0)
      const acertou = pos === certaPos
      const restante = f.fase === 'pergunta' ? f.restanteMs : 0
      const pts = acertou ? pontosDaResposta(restante) : 0
      const decorrido = f.fase === 'pergunta' ? GRUPO_RESPOSTA_MS - f.restanteMs : GRUPO_RESPOSTA_MS
      const ins = await sb.from('quiz_sala_respostas').insert({ sala_id: salaId, ordem, jogador_id: jogadorId, pos, acertou, pontos: pts, tempo_ms: decorrido })
      if (ins.error) return erro(ins.error.code === '23505' ? 'Você já respondeu essa pergunta.' : 'Não consegui registrar a resposta.', ins.error.code === '23505' ? 409 : 500)
      // soma no placar (cada jogador só mexe na própria linha)
      const { data: atual } = await sb.from('quiz_sala_jogadores').select('pontos, acertos, tempo_ms').eq('sala_id', salaId).eq('jogador_id', jogadorId).single()
      await sb.from('quiz_sala_jogadores').update({
        pontos: (atual?.pontos || 0) + pts, acertos: (atual?.acertos || 0) + (acertou ? 1 : 0), tempo_ms: Number(atual?.tempo_ms || 0) + decorrido,
      }).eq('sala_id', salaId).eq('jogador_id', jogadorId)
      return NextResponse.json({ ok: true, acertou, pontos: pts })
    }

    return erro('Ação inválida.')
  } catch (e) {
    console.error('[quiz-grupo]', e)
    return erro('Algo deu errado. Tente de novo.', 500)
  }
}
