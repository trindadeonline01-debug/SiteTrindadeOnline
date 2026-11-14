import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moduleActive } from '@/lib/modules'
import { lerJogadorToken } from '@/lib/quizJogador'
import {
  NIVEIS, PARTES, TEMPO_EXTRA, AJUDAS_INICIAIS, ATRASO_INICIO_S, MAX_TENTATIVAS,
  pontosGrade, estrelas, novaGrade, refazerGrade, conferirSelecao, palavrasVisiveis, type Grade, type Ajudas,
} from '@/lib/cacaPalavras'

// Caça-Palavras (página /jogos/<slug>/caca). O SERVIDOR monta a grade, guarda onde cada palavra está, conta o tempo
// e confere cada seleção; o celular só desenha. Aqui vale só o ranking da loja (nenhum cashback).
// Jogador = o mesmo do quiz (quiz_jogadores), identificado pelo token `quizjt:` que a página de jogos já guarda.

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

type R = {
  id: string; company_id: string; jogador_id: string; estado: 'jogando' | 'entre_niveis' | 'encerrada'; motivo_fim: string | null
  nivel: number; parte: number; pontos: number; pontos_nivel: number; melhor_nivel: number
  grade: Grade; usadas: string[]; ajudas: Ajudas; ratios: number[]
  tempo_total: number; grade_iniciada_em: string; tempo_usado: number; atualizada_em: string
}

// segundos que ainda sobram na grade (pode ficar negativo; passa de `tempo_total` só durante a tela de transição)
const sobraBruta = (r: R, agora = Date.now()) => r.tempo_total - (agora - Date.parse(r.grade_iniciada_em)) / 1000
const sobra = (r: R) => Math.max(0, Math.min(r.tempo_total, sobraBruta(r)))
const atraso = () => new Date(Date.now() + ATRASO_INICIO_S * 1000).toISOString()

function visao(r: R) {
  const L = NIVEIS[r.nivel - 1]
  return {
    id: r.id, estado: r.estado, fim: r.motivo_fim, nivel: r.nivel, nomeNivel: L.nome, niveis: NIVEIS.length, parte: r.parte, partes: PARTES,
    pontos: r.pontos, pontosNivel: r.pontos_nivel, melhorNivel: r.melhor_nivel,
    tamanho: r.grade.n, letras: r.grade.letras, lista: L.lista,
    total: r.tempo_total, restante: r.estado === 'jogando' ? sobra(r) : 0,
    espera: r.estado === 'jogando' ? Math.max(0, sobraBruta(r) - r.tempo_total) : 0,
    ajudas: r.ajudas, palavras: palavrasVisiveis(r.grade, L.lista),
  }
}

async function salvar(r: R, patch: Record<string, unknown>): Promise<R | null> {
  const { data } = await sb.from('caca_rodadas').update({ ...patch, atualizada_em: new Date().toISOString() })
    .eq('id', r.id).eq('atualizada_em', r.atualizada_em).select('*').maybeSingle()
  return (data as R | null) ?? null
}
const encerrar = (r: R, motivo: 'parou' | 'tempo' | 'completa') =>
  salvar(r, { estado: 'encerrada', motivo_fim: motivo, encerrada_em: new Date().toISOString() })

async function rodadaAtual(companyId: string, jogadorId: string): Promise<R | null> {
  const { data } = await sb.from('caca_rodadas').select('*').eq('company_id', companyId).eq('jogador_id', jogadorId)
    .in('estado', ['jogando', 'entre_niveis']).order('criada_em', { ascending: false }).limit(1).maybeSingle()
  return (data as R | null) ?? null
}

export async function POST(req: NextRequest) {
  try {
    const b: Record<string, unknown> = await req.json().catch(() => ({}))
    const acao = String(b.acao || '')
    const slug = String(b.slug || '').trim().toLowerCase()
    if (!slug || slug.length > 80) return erro('Loja não encontrada.', 404)
    const { data: company } = await sb.from('companies').select('id, mesas_enabled, loja_digital_enabled, trial_modules_until').eq('slug', slug).maybeSingle()
    if (!company || !company.mesas_enabled || !moduleActive(company.loja_digital_enabled, company.trial_modules_until)) return erro('Loja não encontrada.', 404)
    const jogadorId = lerJogadorToken(b.jt, company.id)
    if (!jogadorId) return erro('Sua identificação venceu. Confirme seu WhatsApp de novo.', 401)

    const melhorDoJogador = async () => {
      const { data } = await sb.from('caca_rodadas').select('pontos, melhor_nivel').eq('company_id', company.id).eq('jogador_id', jogadorId).order('pontos', { ascending: false }).limit(1).maybeSingle()
      return { pontos: data?.pontos ?? 0, nivel: data?.melhor_nivel ?? 0 }
    }

    // ---------- estado: retoma a rodada em andamento (e encerra por tempo se já passou) ----------
    if (acao === 'estado') {
      let r = await rodadaAtual(company.id, jogadorId)
      if (r && r.estado === 'jogando' && sobraBruta(r) <= -0.5) r = (await encerrar(r, 'tempo')) ?? r
      return NextResponse.json({ ok: true, rodada: r && r.estado !== 'encerrada' ? visao(r) : null, melhor: await melhorDoJogador() })
    }

    // ---------- iniciar: rodada nova (fecha a anterior, se houver) ----------
    if (acao === 'iniciar') {
      const { count } = await sb.from('caca_rodadas').select('id', { count: 'exact', head: true }).eq('jogador_id', jogadorId)
        .gte('criada_em', new Date(Date.now() - 3_600_000).toISOString())
      if ((count || 0) >= 30) return erro('Muitas rodadas seguidas. Respire e tente de novo em alguns minutos.', 429)
      const antiga = await rodadaAtual(company.id, jogadorId)
      if (antiga) await encerrar(antiga, 'parou')
      const L = NIVEIS[0]
      const g = novaGrade(L, [])
      if (!g) return erro('Não consegui montar a grade agora. Tente de novo.', 500)
      const { data, error } = await sb.from('caca_rodadas').insert({
        company_id: company.id, jogador_id: jogadorId, nivel: 1, parte: 1, grade: g, usadas: g.palavras.map(p => p.w),
        ajudas: AJUDAS_INICIAIS, tempo_total: L.time, grade_iniciada_em: atraso(),
      }).select('*').single()
      if (error || !data) return erro('Não consegui começar agora. Tente de novo.', 500)
      return NextResponse.json({ ok: true, rodada: visao(data as R) })
    }

    const r = await rodadaAtual(company.id, jogadorId)
    if (!r) return erro('Nenhuma rodada em andamento.', 409)

    // tempo acabou (com 1,5 s de folga para a rede)
    const acabou = r.estado === 'jogando' && sobraBruta(r) < -1.5
    if (acabou && acao !== 'parar') {
      const fin = (await encerrar(r, 'tempo')) ?? r
      return NextResponse.json({ ok: true, fim: 'tempo', rodada: visao(fin) })
    }

    // ---------- parar ----------
    if (acao === 'parar') {
      const fin = (await encerrar(r, 'parou')) ?? r
      return NextResponse.json({ ok: true, rodada: visao(fin) })
    }

    // ---------- continuar para o próximo nível ----------
    if (acao === 'continuar') {
      if (r.estado !== 'entre_niveis' || r.nivel >= NIVEIS.length) return erro('Não há próximo nível agora.', 409)
      const L = NIVEIS[r.nivel]
      const g = novaGrade(L, r.usadas)
      if (!g) return erro('Não consegui montar a grade agora. Tente de novo.', 500)
      const n = await salvar(r, {
        estado: 'jogando', nivel: r.nivel + 1, parte: 1, pontos_nivel: 0, tempo_usado: 0, ratios: [], ajudas: AJUDAS_INICIAIS,
        grade: g, usadas: r.usadas.concat(g.palavras.map(p => p.w)), tempo_total: L.time, grade_iniciada_em: atraso(),
      })
      if (!n) return erro('Tente de novo.', 409)
      return NextResponse.json({ ok: true, rodada: visao(n) })
    }

    if (r.estado !== 'jogando') return erro('Não há grade em andamento.', 409)
    const L = NIVEIS[r.nivel - 1]

    // ---------- ajudas (1 de cada por nível) ----------
    if (acao === 'ajuda') {
      const tipo = String(b.tipo || '') as keyof Ajudas
      if (!['tempo', 'emb', 'troca'].includes(tipo)) return erro('Ajuda inválida.')
      if (!(r.ajudas[tipo] > 0)) return erro('Você já usou essa ajuda neste nível.', 409)
      const ajudas = { ...r.ajudas, [tipo]: 0 }
      let n: R | null
      if (tipo === 'tempo') {
        n = await salvar(r, { ajudas, tempo_total: r.tempo_total + TEMPO_EXTRA })
      } else {
        const novo = refazerGrade(r.grade, L, r.usadas, tipo === 'troca')
        if (!novo) return erro('Não deu para refazer agora. Tente de novo.', 500)
        n = await salvar(r, { ajudas, grade: novo.grade, usadas: r.usadas.concat(novo.novas) })
      }
      if (!n) return erro('Tente de novo.', 409)
      return NextResponse.json({ ok: true, rodada: visao(n) })
    }

    // ---------- selecionar: o jogador arrastou sobre uma linha de letras ----------
    if (acao === 'selecionar') {
      const g = r.grade
      if (g.tent >= MAX_TENTATIVAS) return erro('Muitas tentativas nesta grade.', 429)
      const idx = conferirSelecao(g, b.cells)
      if (idx < 0) {
        g.tent += 1
        await salvar(r, { grade: g })
        return NextResponse.json({ ok: true, acerto: false })
      }
      g.palavras[idx].achada = true
      const p = g.palavras[idx]
      const palavra = { id: idx, texto: p.w, cells: p.cells, cor: p.cor }
      const rest = sobra(r)
      if (!g.palavras.every(x => x.achada)) {
        const n = await salvar(r, { grade: g })
        if (!n) return erro('Tente de novo.', 409)
        return NextResponse.json({ ok: true, acerto: true, palavra, rodada: visao(n) })
      }
      // grade completa
      const pts = pontosGrade(r.nivel, rest)
      const ratios = r.ratios.concat(rest / r.tempo_total)
      const base = { pontos: r.pontos + pts, pontos_nivel: r.pontos_nivel + pts, ratios, tempo_usado: r.tempo_usado + Math.round(r.tempo_total - rest) }
      if (r.parte < PARTES) {
        const ng = novaGrade(L, r.usadas)
        if (!ng) return erro('Não consegui montar a próxima grade. Tente de novo.', 500)
        const n = await salvar(r, { ...base, parte: r.parte + 1, grade: ng, usadas: r.usadas.concat(ng.palavras.map(x => x.w)), tempo_total: L.time, grade_iniciada_em: atraso() })
        if (!n) return erro('Tente de novo.', 409)
        return NextResponse.json({ ok: true, acerto: true, palavra, parteConcluida: { parte: r.parte, pontos: pts }, rodada: visao(n) })
      }
      const ultimo = r.nivel >= NIVEIS.length
      const n = await salvar(r, {
        ...base, grade: g, melhor_nivel: r.nivel,
        estado: ultimo ? 'encerrada' : 'entre_niveis', motivo_fim: ultimo ? 'completa' : null, encerrada_em: ultimo ? new Date().toISOString() : null,
      })
      if (!n) return erro('Tente de novo.', 409)
      return NextResponse.json({
        ok: true, acerto: true, palavra,
        nivelConcluido: { nivel: r.nivel, nome: L.nome, pontosNivel: base.pontos_nivel, tempoUsado: base.tempo_usado, estrelas: estrelas(ratios), ultimo },
        rodada: visao(n),
      })
    }

    return erro('Ação inválida.')
  } catch (e) {
    console.error('[jogos/caca]', e)
    return erro('Algo deu errado. Tente de novo.', 500)
  }
}
