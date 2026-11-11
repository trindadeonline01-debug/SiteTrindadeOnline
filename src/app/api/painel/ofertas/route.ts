import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from '@/lib/requireAdmin'
import { requireCompanyAccess } from '@/lib/requireUser'
import { normalizePhone } from '@/lib/phone'
import { ORIGENS_DELIVERY } from '@/lib/canais'
import { DIAS_SEM_REPETIR, inicioDoDiaBR, LIMITE_OFERTAS_DIA, lojaConectada, personalizar, RODAPE_SAIR } from '@/lib/ofertas'

// Ofertas por WhatsApp da Inteligência de consumo (nov/2026).
//  estado   → a loja está conectada? IA ligada? quantas já saíram hoje? produtos para oferecer
//  sugerir  → 3 mensagens curtas (IA) terminando numa pergunta de gatilho
//  criar    → cria a campanha e põe cada destinatário na fila (o envio é do cron /api/cron/ofertas-fila)
//  listar   → campanhas com o resultado (enviadas, responderam, pediram, vendeu)
//  cancelar → para o que ainda não saiu
// A IA NUNCA cria pedido: quando o cliente responde, ela só manda o link do produto (ver crmIA.ts).

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic()
const MAX_POR_CAMPANHA = 300
const HORAS_ATRIBUICAO = 72

type Dest = { phone: string; nome?: string | null }

function modelosPadrao(produto: string, loja: string, tipo: string): string[] {
  if (tipo === 'carrinho') return [
    `{nome}, vi que você separou ${produto} aqui na ${loja} e não finalizou. Quer que eu deixe separado pra você?`,
    `Oi {nome}! Ficou ${produto} no seu carrinho na ${loja}. Posso separar pra você hoje?`,
    `{nome}, o ${produto} que você escolheu na ${loja} ainda está disponível. Separo pra você?`,
  ]
  return [
    `Oi {nome}, tudo bem? Hoje é dia de ${produto} aqui na ${loja}. Já posso separar o seu? Quantos você vai querer?`,
    `{nome}, sentimos sua falta na ${loja}! ${produto[0].toUpperCase() + produto.slice(1)} hoje, bem fresquinho. Posso separar pra você?`,
    `Opa {nome}! Lembrei de você: ${produto} na ${loja} hoje. Quer que eu separe? É só me dizer a quantidade.`,
  ]
}

async function sugerirComIA(produto: string, loja: string, tipo: string): Promise<string[] | null> {
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5', max_tokens: 500,
      system: 'Você escreve mensagens CURTAS de WhatsApp em nome de uma loja de bairro, em português informal e caloroso. Cada mensagem: no máximo 220 caracteres, começa chamando o cliente por {nome}, cita o produto e a loja, e TERMINA com uma pergunta fácil de responder (ex: "quantos kg você vai querer?" ou "separo pra você?"). Sem link, sem preço, sem inventar promoção ou desconto, no máximo 1 emoji, sem pressão. Responda SOMENTE um array JSON com 3 strings diferentes entre si.',
      messages: [{ role: 'user', content: `Loja: ${loja}\nProduto: ${produto}\nSituação: ${tipo === 'carrinho' ? 'cliente deixou o produto no carrinho e não finalizou' : 'cliente que já comprou antes e parou de pedir'}` }],
    })
    const t = r.content.find(b => b.type === 'text')
    const txt = t && t.type === 'text' ? t.text : ''
    const m = txt.match(/\[[\s\S]*\]/)
    if (!m) return null
    const arr = (JSON.parse(m[0]) as unknown[]).map(x => String(x).trim()).filter(x => x.length > 10 && x.length <= 300)
    return arr.length >= 2 ? arr.slice(0, 3) : null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 }) }
  const action = String(b.action || '')
  const companyId = String(b.companyId || '')
  const todasLojas = b.all === true && action === 'listar'
  if (todasLojas) { const a = await requireAdmin(req); if (a instanceof NextResponse) return a }
  else {
    if (!companyId) return NextResponse.json({ error: 'Empresa não informada' }, { status: 400 })
    const a = await requireCompanyAccess(req, companyId); if (a instanceof NextResponse) return a
  }

  if (action === 'estado') {
    const { data: c } = await sb.from('companies').select('name, slug, crm_ia_enabled').eq('id', companyId).maybeSingle()
    if (!c) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    const conectada = !!(await lojaConectada(companyId))
    const { count: hoje } = await sb.from('crm_campaign_logs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'enviado').gte('enviado_em', inicioDoDiaBR())
    const { count: naFila } = await sb.from('crm_campaign_logs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pendente')
    const { data: prods } = await sb.from('loja_produtos').select('id, name, sale_price').eq('company_id', companyId).eq('active', true).eq('canal_delivery', true).order('name').limit(150)
    return NextResponse.json({
      loja: c.name, conectada, iaLigada: !!c.crm_ia_enabled, enviadosHoje: hoje || 0, naFila: naFila || 0, limite: LIMITE_OFERTAS_DIA,
      produtos: (prods || []).map(p => ({ id: p.id, nome: p.name, preco: Number(p.sale_price) })),
    })
  }

  if (action === 'sugerir') {
    const produto = String(b.produtoNome || '').slice(0, 80).trim()
    const tipo = b.tipo === 'carrinho' ? 'carrinho' : 'retorno'
    if (!produto) return NextResponse.json({ error: 'Escolha o produto' }, { status: 400 })
    const { data: c } = await sb.from('companies').select('name').eq('id', companyId).maybeSingle()
    const loja = (c?.name || 'nossa loja').trim()
    const ia = await sugerirComIA(produto.toLowerCase(), loja, tipo)
    return NextResponse.json({ sugestoes: ia || modelosPadrao(produto.toLowerCase(), loja, tipo), ia: !!ia })
  }

  if (action === 'criar') {
    const mensagem = String(b.mensagem || '').trim()
    if (mensagem.length < 15) return NextResponse.json({ error: 'Escreva a mensagem (mínimo 15 letras).' }, { status: 400 })
    if (mensagem.length > 400) return NextResponse.json({ error: 'Mensagem muito longa (máximo 400 letras). Mensagem curta tem mais resposta.' }, { status: 400 })
    if (/https?:\/\//i.test(mensagem)) return NextResponse.json({ error: 'Não coloque link na 1ª mensagem. A IA manda o link quando o cliente responder.' }, { status: 400 })
    if (!(await lojaConectada(companyId))) return NextResponse.json({ error: 'O WhatsApp da loja não está conectado. Conecte em Mensagens antes de enviar ofertas.' }, { status: 400 })

    const { data: c } = await sb.from('companies').select('slug, name').eq('id', companyId).maybeSingle()
    if (!c) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    let produtoNome: string | null = null, link: string | null = null
    const produtoId = typeof b.produtoId === 'string' && b.produtoId ? b.produtoId : null
    if (produtoId) {
      const { data: p } = await sb.from('loja_produtos').select('id, name').eq('id', produtoId).eq('company_id', companyId).maybeSingle()
      if (p) { produtoNome = p.name; link = `https://trindadeonline.com.br/empresa/${c.slug}/item/${p.id}` }
    }

    // Destinatários: limpa, tira duplicados, quem pediu pra sair e quem já recebeu oferta recentemente.
    const bruto = (Array.isArray(b.destinatarios) ? b.destinatarios : []) as Dest[]
    const vistos = new Map<string, string | null>()
    let semNumero = 0
    for (const d of bruto) {
      const tel = normalizePhone(String(d?.phone || ''))
      if (tel.length < 12 || tel.endsWith('0551')) { semNumero++; continue }
      if (!vistos.has(tel)) vistos.set(tel, d.nome ? String(d.nome).slice(0, 60) : null)
    }
    let tels = [...vistos.keys()].slice(0, MAX_POR_CAMPANHA)
    const { data: optouts } = await sb.from('crm_contacts').select('phone').eq('company_id', companyId).eq('followup_optout', true).in('phone', tels.length ? tels : ['x'])
    const sairam = new Set((optouts || []).map(o => o.phone))
    const desde = new Date(Date.now() - DIAS_SEM_REPETIR * 86400000).toISOString()
    const { data: recentes } = await sb.from('crm_campaign_logs').select('phone').eq('company_id', companyId).in('status', ['enviado', 'pendente']).gte('created_at', desde).in('phone', tels.length ? tels : ['x'])
    const jaRecebeu = new Set((recentes || []).map(r => r.phone))
    const ignOptout = tels.filter(t => sairam.has(t)).length
    const ignRecentes = tels.filter(t => !sairam.has(t) && jaRecebeu.has(t)).length
    tels = tels.filter(t => !sairam.has(t) && !jaRecebeu.has(t))
    if (tels.length === 0) return NextResponse.json({ error: 'Ninguém para enviar: todos já receberam oferta nos últimos ' + DIAS_SEM_REPETIR + ' dias ou pediram para não receber.', ignorados: { optout: ignOptout, recentes: ignRecentes, semNumero } }, { status: 400 })

    const nomeCampanha = String(b.nome || '').slice(0, 80) || (produtoNome ? 'Oferta · ' + produtoNome : 'Oferta')
    const { data: camp, error: eC } = await sb.from('crm_campaigns').insert({
      company_id: companyId, nome: nomeCampanha, mensagem, produto_id: produtoId && produtoNome ? produtoId : null, produto_nome: produtoNome, link,
      ia_responde: true, status: 'enviando', total: tels.length, criado_por: null,
    }).select('id').maybeSingle()
    if (eC || !camp) return NextResponse.json({ error: 'Não consegui criar a campanha. Tente de novo.' }, { status: 500 })
    const linhas = tels.map(t => ({ campaign_id: camp.id, company_id: companyId, phone: t, nome: vistos.get(t) || null, texto: personalizar(mensagem, vistos.get(t)) + RODAPE_SAIR, status: 'pendente' as const }))
    for (let i = 0; i < linhas.length; i += 100) await sb.from('crm_campaign_logs').insert(linhas.slice(i, i + 100))

    const { count: hoje } = await sb.from('crm_campaign_logs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'enviado').gte('enviado_em', inicioDoDiaBR())
    const restaHoje = Math.max(0, LIMITE_OFERTAS_DIA - (hoje || 0))
    const dias = tels.length <= restaHoje ? 1 : 1 + Math.ceil((tels.length - restaHoje) / LIMITE_OFERTAS_DIA)
    return NextResponse.json({ ok: true, campanhaId: camp.id, aceitos: tels.length, ignorados: { optout: ignOptout, recentes: ignRecentes, semNumero }, dias })
  }

  if (action === 'cancelar') {
    const id = String(b.campanhaId || '')
    const { data: camp } = await sb.from('crm_campaigns').select('id').eq('id', id).eq('company_id', companyId).maybeSingle()
    if (!camp) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    await sb.from('crm_campaigns').update({ status: 'cancelada', concluida_em: new Date().toISOString() }).eq('id', id)
    await sb.from('crm_campaign_logs').update({ status: 'pulado', erro: 'Campanha cancelada' }).eq('campaign_id', id).eq('status', 'pendente')
    return NextResponse.json({ ok: true })
  }

  if (action === 'listar') {
    let q = sb.from('crm_campaigns').select('id, company_id, nome, mensagem, produto_nome, status, total, created_at').order('created_at', { ascending: false }).limit(30)
    if (!todasLojas) q = q.eq('company_id', companyId)
    const { data: camps } = await q
    if (!camps?.length) return NextResponse.json({ campanhas: [] })
    const ids = camps.map(c => c.id)
    const { data: logs } = await sb.from('crm_campaign_logs').select('campaign_id, company_id, phone, status, enviado_em').in('campaign_id', ids).limit(5000)
    const empresas = [...new Set(camps.map(c => c.company_id))]
    const { data: nomes } = await sb.from('companies').select('id, name').in('id', empresas)
    const nomeLoja = new Map((nomes || []).map(n => [n.id, n.name as string]))

    // Quem respondeu e quem pediu depois da oferta (72 h).
    const desde = new Date(Math.min(...camps.map(c => new Date(c.created_at).getTime())) - 60000).toISOString()
    const msgsPor = new Map<string, string[]>() // phone+company → datas de mensagens recebidas
    const pedidosPor = new Map<string, { t: number; v: number }[]>()
    for (const emp of empresas) {
      const tels = [...new Set((logs || []).filter(l => l.company_id === emp && l.status === 'enviado').map(l => l.phone))]
      if (!tels.length) continue
      const { data: cts } = await sb.from('crm_contacts').select('id, phone').eq('company_id', emp).in('phone', tels)
      const idPorTel = new Map((cts || []).map(c => [c.id, c.phone as string]))
      if (idPorTel.size) {
        const { data: ms } = await sb.from('crm_messages').select('contact_id, sent_at').eq('company_id', emp).eq('direction', 'in').gte('sent_at', desde).in('contact_id', [...idPorTel.keys()])
        for (const m of ms || []) { const k = emp + '|' + idPorTel.get(m.contact_id); const l = msgsPor.get(k) || []; l.push(m.sent_at); msgsPor.set(k, l) }
      }
      const { data: ps } = await sb.from('loja_pedidos').select('customer_phone, total, created_at').eq('company_id', emp).in('origin', [...ORIGENS_DELIVERY]).neq('status', 'cancelado').gte('created_at', desde)
      for (const p of ps || []) { const k = emp + '|' + normalizePhone(p.customer_phone || ''); const l = pedidosPor.get(k) || []; l.push({ t: new Date(p.created_at).getTime(), v: Number(p.total || 0) }); pedidosPor.set(k, l) }
    }
    const janela = HORAS_ATRIBUICAO * 3600000
    const out = camps.map(c => {
      const ls = (logs || []).filter(l => l.campaign_id === c.id)
      const env = ls.filter(l => l.status === 'enviado')
      let resp = 0, ped = 0, vendeu = 0
      for (const l of env) {
        const t0 = new Date(l.enviado_em as string).getTime()
        const k = c.company_id + '|' + l.phone
        if ((msgsPor.get(k) || []).some(d => { const t = new Date(d).getTime(); return t > t0 && t - t0 <= janela })) resp++
        const pp = (pedidosPor.get(k) || []).filter(p => p.t > t0 && p.t - t0 <= janela)
        if (pp.length) { ped++; vendeu += pp.reduce((a, p) => a + p.v, 0) }
      }
      return {
        id: c.id, nome: c.nome, mensagem: c.mensagem, produto: c.produto_nome, status: c.status, criada: c.created_at, loja: nomeLoja.get(c.company_id) || '—',
        total: c.total, enviadas: env.length, pendentes: ls.filter(l => l.status === 'pendente').length, falhas: ls.filter(l => l.status === 'falhou').length,
        puladas: ls.filter(l => l.status === 'pulado').length, responderam: resp, pediram: ped, vendeu: Math.round(vendeu * 100) / 100,
      }
    })
    return NextResponse.json({ campanhas: out })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
