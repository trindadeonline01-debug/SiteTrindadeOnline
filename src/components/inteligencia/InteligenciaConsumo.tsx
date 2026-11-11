'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { formatPhoneDisplay } from '@/lib/phone'
import { periodRange, type PeriodSel } from '@/lib/periodFilter'
import PeriodFilterBar from '@/components/admin/PeriodFilterBar'
import OfertaComposer, { type DestOferta } from '@/components/inteligencia/OfertaComposer'
import { BAIRRO_PATHS, BAIRRO_ROTULO, MAPA_IMAGEM, MAPA_VIEWBOX } from '@/data/mapaSaoGoncalo'

// Inteligência de consumo (nov/2026, mockup aprovado pelo Ricardo): quem comprou o quê, quando e de onde,
// com TODOS os filtros conectados (loja, bairro, produto, dia/hora, período, grupo de clientes). Os dados
// vêm de /api/painel/inteligencia (delivery apenas); toda a filtragem é feita aqui no navegador.
// Pendente (próximas etapas): botão "Enviar oferta" (WhatsApp da loja + IA), funil por origem e carrinho
// abandonado (ainda não gravamos esses dados).

type Linha = { l: number; d: string; h: number; w: number; b: string; t: number; p: string; n: string; it: string[] }
type Prazo = { l: number; n: number; prazo: number; ret: number; ent: number; passou: number | null }
type Funil = { total: { abriu: number; add: number; feito: number }; porOrigem: { origem: string; abriu: number; add: number; feito: number }[]; abandonados: { l: number; phone: string; itens: { n: string; q: number }[]; quando: string }[]; temDados: boolean }
type Dados = {
  hoje: string; lojas: { id: string; nome: string; prazo: number }[]; pedidos: Linha[]; prazos: Prazo[]
  perdida: { l: number; tot: number; sd: number }[]; funil: Funil; media: { tk: number; vol: number; lojas: number } | null
}
type Campanha = { id: string; nome: string; produto: string | null; status: string; criada: string; loja: string; total: number; enviadas: number; pendentes: number; falhas: number; puladas: number; responderam: number; pediram: number; vendeu: number }
const ORIGEM_TXT: Record<string, string> = { direto: 'Link direto', instagram: 'Instagram', facebook: 'Facebook', google: 'Google', whatsapp: 'WhatsApp', tiktok: 'TikTok', peca_agora: 'Peça Agora', perfil: 'Página da loja', site: 'Outras páginas do site', outro_site: 'Outro site', qr: 'QR code', cartao: 'Cartão', adesivo: 'Adesivo', flyer: 'Flyer', sacola: 'Sacola' }
type Situacao = 'ativo' | 'novo' | 'hora' | 'sumiu' | 'uma'
type Cliente = {
  key: string; phone: string; nome: string; l: number; rows: Linha[]; n: number; gasto: number
  ult: Linha; desde: number; gap: number; st: Situacao; fav: string; bairro: string
}
type Filtros = { loja: number | null; bairro: string | null; produto: string | null; dow: number | null; hora: number | null; status: string }

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const DOW_DE_DIA = [1, 2, 3, 4, 5, 6, 0] // posição na grade → getUTCDay
const HORAS = Array.from({ length: 16 }, (_, i) => i + 8)
const ST_TXT: Record<Situacao, string> = { ativo: 'Ativo', novo: 'Novo', hora: 'Na hora de voltar', sumiu: 'Sumiu', uma: 'Pediu 1 vez' }
const ST_NAO: Situacao[] = ['hora', 'sumiu', 'uma']
const SEGS: [string, string][] = [['todos', 'Todos'], ['nao', 'Não voltaram'], ['hora', 'Na hora de voltar'], ['sumiu', 'Sumiram'], ['uma', 'Pediram 1 vez'], ['ativo', 'Ativos']]
const RAMPA = ['#FFF0C2', '#FFD25A', '#E0A000', '#A56F00', '#6B4300']
const HEAT = ['#E6E7DF', '#FFF3CC', '#FFE699', '#FFC531', '#D99A00', '#151210']

const brl = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const brl2 = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',')
const dm = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)
const limpo = (s: string) => s.replace(/\s*\(?c[óo]pia\)?/gi, '').replace(/\s{2,}/g, ' ').trim()
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
const ymdBR = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const mediana = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

function corRampa(t: number): string {
  const q = Math.max(0, Math.min(1, t)) * (RAMPA.length - 1)
  const i = Math.min(RAMPA.length - 2, Math.floor(q)), u = q - i
  const c = (h: string) => [1, 3, 5].map(k => parseInt(h.substr(k, 2), 16))
  const A = c(RAMPA[i]), B = c(RAMPA[i + 1])
  return 'rgb(' + A.map((v, k) => Math.round(v + (B[k] - v) * u)).join(',') + ')'
}

export default function InteligenciaConsumo({ companyId, admin }: { companyId?: string | null; admin?: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [periodo, setPeriodo] = useState<PeriodSel>({ kind: 'all' })
  const [f, setF] = useState<Filtros>({ loja: null, bairro: null, produto: null, dow: null, hora: null, status: 'todos' })
  const [ficha, setFicha] = useState<string | null>(null)
  const [todos, setTodos] = useState(false)
  const [oferta, setOferta] = useState<{ tipo: 'retorno' | 'carrinho'; dest: DestOferta[]; produto?: string; lojaIdx: number } | null>(null)
  const [aviso, setAviso] = useState('')
  const [campanhas, setCampanhas] = useState<Campanha[] | null>(null)

  const carregar = useCallback(() => {
    if (!admin && !companyId) return
    adminFetch('/api/painel/inteligencia', { method: 'POST', body: JSON.stringify(admin ? { all: true } : { companyId }) })
      .then(async r => { const j = await r.json(); if (!r.ok) setErro(j.error || 'Não consegui carregar.'); else { setErro(''); setDados(j) } })
      .catch(() => setErro('Não consegui carregar. Tente de novo.'))
  }, [admin, companyId])
  useEffect(() => { carregar() }, [carregar])
  const carregarCampanhas = useCallback(() => {
    if (!admin && !companyId) return
    adminFetch('/api/painel/ofertas', { method: 'POST', body: JSON.stringify(admin ? { all: true, action: 'listar' } : { companyId, action: 'listar' }) })
      .then(async r => { const j = await r.json(); if (r.ok) setCampanhas(j.campanhas || []) })
      .catch(() => {})
  }, [admin, companyId])
  useEffect(() => { carregarCampanhas() }, [carregarCampanhas])
  const cancelarCampanha = async (c: Campanha, lojaId: string) => {
    if (!confirm('Parar este envio? O que ainda não saiu será cancelado.')) return
    await adminFetch('/api/painel/ofertas', { method: 'POST', body: JSON.stringify({ companyId: lojaId, action: 'cancelar', campanhaId: c.id }) }).catch(() => {})
    carregarCampanhas()
  }

  const setFiltro = (p: Partial<Filtros>) => setF(x => ({ ...x, ...p }))
  const alterna = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setF(x => ({ ...x, [k]: x[k] === v ? null : v } as Filtros))

  // Todos os clientes (por WhatsApp + loja), com a situação calculada sobre o histórico inteiro.
  const clientes = useMemo(() => {
    const m = new Map<string, Cliente>()
    if (!dados) return m
    for (const r of dados.pedidos) {
      if (!r.p) continue
      const key = r.p + '-' + r.l
      let c = m.get(key)
      if (!c) { c = { key, phone: r.p, nome: '', l: r.l, rows: [], n: 0, gasto: 0, ult: r, desde: 0, gap: 0, st: 'novo', fav: '', bairro: '' }; m.set(key, c) }
      c.rows.push(r)
    }
    for (const c of m.values()) {
      c.rows.sort((a, b) => (a.d + String(a.h).padStart(2, '0')).localeCompare(b.d + String(b.h).padStart(2, '0')))
      c.n = c.rows.length
      c.gasto = c.rows.reduce((a, r) => a + r.t, 0)
      c.ult = c.rows[c.n - 1]
      c.desde = diasEntre(c.ult.d, dados.hoje)
      const gaps: number[] = []
      for (let i = 1; i < c.n; i++) gaps.push(Math.max(0, diasEntre(c.rows[i - 1].d, c.rows[i].d)))
      c.gap = mediana(gaps)
      if (c.n >= 2) { const ratio = c.desde / Math.max(c.gap, 2); c.st = ratio < 1 ? 'ativo' : ratio < 2.5 ? 'hora' : 'sumiu' }
      else c.st = c.desde < 7 ? 'novo' : 'uma'
      const cnt: Record<string, number> = {}
      c.rows.forEach(r => r.it.forEach(i => { const k = limpo(i); cnt[k] = (cnt[k] || 0) + 1 }))
      c.fav = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 2).join(' · ')
      c.nome = [...c.rows].reverse().find(r => r.n)?.n || ''
      c.bairro = [...c.rows].reverse().find(r => r.b)?.b || ''
    }
    return m
  }, [dados])

  const { from, to } = useMemo(() => periodRange(periodo), [periodo])
  const fromD = from ? ymdBR(from) : null
  const toD = to ? ymdBR(to) : null // exclusivo

  // Linhas que passam pelos filtros. `pula` deixa uma faceta de fora (pra ranking mostrar as demais opções).
  const passa = useCallback((r: Linha, pula?: string): boolean => {
    if (!dados) return false
    if (pula !== 'loja' && f.loja != null && r.l !== f.loja) return false
    if (pula !== 'bairro' && f.bairro && r.b !== f.bairro) return false
    if (pula !== 'produto' && f.produto && !r.it.some(i => limpo(i) === f.produto)) return false
    if (pula !== 'heat') { if (f.dow != null && r.w !== f.dow) return false; if (f.hora != null && r.h !== f.hora) return false }
    if (fromD && r.d < fromD) return false
    if (toD && r.d >= toD) return false
    if (pula !== 'status' && f.status !== 'todos') {
      const c = clientes.get(r.p + '-' + r.l)
      if (!c) return false
      const ok = f.status === 'nao' ? ST_NAO.includes(c.st) : f.status === 'ativo' ? (c.st === 'ativo' || c.st === 'novo') : c.st === f.status
      if (!ok) return false
    }
    return true
  }, [dados, f, fromD, toD, clientes])

  const rowsF = useMemo(() => (dados ? dados.pedidos.filter(r => passa(r)) : []), [dados, passa])
  const fat = rowsF.reduce((a, r) => a + r.t, 0)
  const audAll = useMemo(() => {
    const ks = new Set<string>()
    ;(dados?.pedidos || []).forEach(r => { if (r.p && passa(r, 'status')) ks.add(r.p + '-' + r.l) })
    return [...ks].map(k => clientes.get(k)!).filter(Boolean)
  }, [dados, passa, clientes])
  const contaSt = (set: Situacao[] | null) => audAll.filter(c => !set || set.includes(c.st)).length
  const nVolt = audAll.filter(c => c.n >= 2).length
  const nNao = contaSt(ST_NAO)

  const audLista = useMemo(() => {
    const filtrados = audAll.filter(c => f.status === 'todos' ? true : f.status === 'nao' ? ST_NAO.includes(c.st) : f.status === 'ativo' ? (c.st === 'ativo' || c.st === 'novo') : c.st === f.status)
    const rk: Record<Situacao, number> = { hora: 0, sumiu: 1, uma: 2, ativo: 3, novo: 4 }
    return filtrados.sort((a, b) => (rk[a.st] - rk[b.st]) || (b.desde - a.desde))
  }, [audAll, f.status])

  // Rankings
  const rankBairro = useMemo(() => {
    const c: Record<string, number> = {}
    ;(dados?.pedidos || []).forEach(r => { if (passa(r, 'bairro') && r.b) c[r.b] = (c[r.b] || 0) + 1 })
    return Object.entries(c).sort((a, b) => b[1] - a[1])
  }, [dados, passa])
  const semBairro = useMemo(() => (dados?.pedidos || []).filter(r => passa(r, 'bairro') && !r.b).length, [dados, passa])
  const rankProd = useMemo(() => {
    const c: Record<string, number> = {}
    ;(dados?.pedidos || []).forEach(r => { if (passa(r, 'produto')) r.it.forEach(i => { const k = limpo(i); c[k] = (c[k] || 0) + 1 }) })
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 9)
  }, [dados, passa])
  const rankLoja = useMemo(() => {
    const c = (dados?.lojas || []).map(() => ({ n: 0, fat: 0 }))
    ;(dados?.pedidos || []).forEach(r => { if (passa(r, 'loja')) { c[r.l].n++; c[r.l].fat += r.t } })
    return (dados?.lojas || []).map((l, i) => ({ i, nome: l.nome, ...c[i] })).filter(x => x.n > 0 || f.loja != null).sort((a, b) => b.n - a.n)
  }, [dados, passa, f.loja])

  // Mapa de calor dia x hora
  const heat = useMemo(() => {
    const g: number[][] = DIAS.map(() => HORAS.map(() => 0))
    ;(dados?.pedidos || []).forEach(r => {
      if (!passa(r, 'heat')) return
      const di = DOW_DE_DIA.indexOf(r.w), hi = HORAS.indexOf(r.h)
      if (di >= 0 && hi >= 0) g[di][hi]++
    })
    return g
  }, [dados, passa])
  const heatMax = Math.max(1, ...heat.flat())

  // Leituras extras (usam a loja escolhida, não os demais filtros)
  const sust = useMemo(() => {
    const ps = [...clientes.values()].filter(c => f.loja == null || c.l === f.loja)
    const n = ps.length
    const topN = Math.max(1, Math.ceil(n * 0.2))
    const totG = ps.reduce((a, c) => a + c.gasto, 0) || 1
    const topG = [...ps].sort((a, b) => b.gasto - a.gasto).slice(0, topN).reduce((a, c) => a + c.gasto, 0)
    const volt = ps.filter(c => c.n >= 2)
    const g2 = (c: Cliente) => diasEntre(c.rows[0].d, c.rows[1].d)
    const v30 = volt.filter(c => g2(c) <= 30).length, v60 = volt.filter(c => g2(c) <= 60).length
    const porProd: Record<string, { n: number; v: number }> = {}
    ps.forEach(c => c.rows[0].it.forEach(i => { const k = limpo(i); const o = porProd[k] || (porProd[k] = { n: 0, v: 0 }); o.n++; if (c.n >= 2) o.v++ }))
    const porta = Object.keys(porProd).filter(k => porProd[k].n >= 3).map(k => ({ k, n: porProd[k].n, t: porProd[k].v / porProd[k].n }))
      .sort((a, b) => b.t - a.t || b.n - a.n).slice(0, 3)
    return { n, topN, wCli: n ? Math.round(topN / n * 100) : 0, wRec: n ? Math.round(topG / totG * 100) : 0, volt: volt.length, v30, v60, porta, umaVez: n - volt.length }
  }, [clientes, f.loja])

  const comparativo = useMemo(() => {
    if (!dados) return [] as { nome: string; tk: string; n: number; vol: string; me: boolean }[]
    const por = dados.lojas.map((l, i) => {
      const rs = dados.pedidos.filter(r => r.l === i)
      const cs = [...clientes.values()].filter(c => c.l === i)
      return { i, nome: l.nome, n: rs.length, fat: rs.reduce((a, r) => a + r.t, 0), vol: cs.length ? Math.round(cs.filter(c => c.n >= 2).length / cs.length * 100) : null }
    }).filter(x => x.n > 0)
    if (admin) return por.sort((a, b) => b.n - a.n).map(x => ({ nome: x.nome, tk: brl2(x.fat / x.n), n: x.n, vol: x.vol != null ? x.vol + '%' : '—', me: false }))
    const eu = por[0]
    const linhas = [{ nome: 'Sua loja', tk: eu ? brl2(eu.fat / eu.n) : '—', n: eu ? eu.n : 0, vol: eu && eu.vol != null ? eu.vol + '%' : '—', me: true }]
    if (dados.media) linhas.push({ nome: 'Média de ' + dados.media.lojas + ' outras lojas', tk: brl2(dados.media.tk), n: 0, vol: dados.media.vol + '%', me: false })
    return linhas
  }, [dados, clientes, admin])

  // Bairros: pedidos por bairro com o filtro atual (o mapa usa o mesmo número do ranking)
  const bairroMax = rankBairro.length ? rankBairro[0][1] : 1
  const comPoligono = rankBairro.filter(([b]) => BAIRRO_PATHS[b])
  const foraMapa = rankBairro.filter(([b]) => !BAIRRO_PATHS[b])

  const chips: { txt: string; fn: () => void }[] = []
  if (admin && f.loja != null && dados) chips.push({ txt: 'Loja: ' + dados.lojas[f.loja].nome, fn: () => setFiltro({ loja: null }) })
  if (f.bairro) chips.push({ txt: 'Bairro: ' + f.bairro, fn: () => setFiltro({ bairro: null }) })
  if (f.produto) chips.push({ txt: 'Produto: ' + f.produto, fn: () => setFiltro({ produto: null }) })
  if (f.dow != null) chips.push({ txt: 'Dia: ' + DIAS[DOW_DE_DIA.indexOf(f.dow)], fn: () => setFiltro({ dow: null }) })
  if (f.hora != null) chips.push({ txt: 'Hora: ' + f.hora + 'h', fn: () => setFiltro({ hora: null }) })
  if (f.status !== 'todos') chips.push({ txt: 'Clientes: ' + (SEGS.find(s => s[0] === f.status)?.[1] || ''), fn: () => setFiltro({ status: 'todos' }) })
  if (periodo.kind !== 'all') chips.push({ txt: 'Período filtrado', fn: () => setPeriodo({ kind: 'all' }) })

  const baixarCsv = () => {
    const cab = ['Cliente', 'WhatsApp', 'Bairro', 'Loja', 'Pedidos', 'Gastou', 'Último pedido', 'Costuma pedir', 'Situação']
    const esc = (s: string | number) => '"' + String(s).replace(/"/g, '""') + '"'
    const linhas = audLista.map(c => [c.nome || '', c.phone, c.bairro, dados?.lojas[c.l]?.nome || '', c.n, c.gasto.toFixed(2).replace('.', ','), c.ult.d, c.fav, ST_TXT[c.st]].map(esc).join(';'))
    const blob = new Blob(['﻿' + [cab.map(esc).join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'clientes.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  // Abre a janela de oferta. Um envio sempre sai pelo WhatsApp de UMA loja: no admin, escolha a loja antes.
  const abrirOferta = (tipo: 'retorno' | 'carrinho', lista: { phone: string; nome: string; l: number; item?: string }[]) => {
    setAviso('')
    if (!dados || lista.length === 0) return
    const lojasEnv = [...new Set(lista.map(x => x.l))]
    if (lojasEnv.length > 1) { setAviso('Cada envio sai pelo WhatsApp de uma loja só. Clique numa loja no ranking "Lojas" para escolher qual.'); return }
    const cont: Record<string, number> = {}
    lista.forEach(x => { if (x.item) cont[x.item] = (cont[x.item] || 0) + 1 })
    const produto = Object.keys(cont).sort((a, b) => cont[b] - cont[a])[0]
    setOferta({ tipo, dest: lista.map(x => ({ phone: x.phone, nome: x.nome })), produto, lojaIdx: lojasEnv[0] })
  }
  const destRetorno = audLista.filter(c => f.status === 'ativo' || (c.st !== 'ativo' && c.st !== 'novo'))
    .map(c => ({ phone: c.phone, nome: c.nome, l: c.l, item: c.fav.split(' · ')[0] || undefined }))

  if (erro) return <div className="ic-erro">{erro} <button onClick={() => { setErro(''); carregar() }}>Tentar de novo</button><style>{CSS}</style></div>
  if (!dados) return <div className="ic-load">Carregando os pedidos…<style>{CSS}</style></div>
  if (dados.pedidos.length === 0) return <div className="ic-load">Ainda não há pedidos de delivery para analisar.<style>{CSS}</style></div>

  const fichaC = ficha ? clientes.get(ficha) : null
  const lojaNome = (i: number) => dados.lojas[i]?.nome || '—'
  const lista = todos ? audLista : audLista.slice(0, 8)
  const gcols = admin ? '1.25fr 1fr .9fr .5fr .7fr 1.1fr 1fr 1.5fr 1.2fr' : '1.25fr 1fr .5fr .7fr 1.1fr 1fr 1.5fr 1.2fr'

  return (
    <div className="ic">
      <style>{CSS}</style>
      <div className="ic-head">
        <h1>Inteligência de consumo</h1>
        <p>{admin ? 'Todas as lojas juntas. Escolha bairro, loja, produto ou horário e veja quem parou de pedir.' : 'Seus clientes, o que pedem e quando. Escolha um grupo para ver quem parou de pedir.'}</p>
      </div>

      <div className="ic-card ic-per"><PeriodFilterBar value={periodo} onChange={setPeriodo} /></div>

      <div className="ic-fbar">
        <b className="ic-fl">Filtrando por</b>
        {chips.length === 0 && <span className="ic-hint">Nada filtrado. Clique em qualquer bairro, produto, horário, loja ou grupo de clientes: tudo na tela acompanha.</span>}
        {chips.map(c => <button key={c.txt} className="ic-chip" onClick={c.fn}>{c.txt} ✕</button>)}
        {chips.length > 0 && <button className="ic-link" onClick={() => { setF({ loja: null, bairro: null, produto: null, dow: null, hora: null, status: 'todos' }); setPeriodo({ kind: 'all' }) }}>Limpar tudo</button>}
      </div>

      <div className="ic-kpis">
        <div className="ic-kpi"><small>Pedidos</small><strong>{rowsF.length}</strong><em>delivery, sem cancelados</em></div>
        <div className="ic-kpi"><small>Faturamento</small><strong>{brl(fat)}</strong><em>vendido pelo cardápio</em></div>
        <div className="ic-kpi"><small>Ticket médio</small><strong>{rowsF.length ? brl2(fat / rowsF.length) : '—'}</strong><em>por pedido</em></div>
        <div className="ic-kpi"><small>Clientes</small><strong>{audAll.length}</strong><em>por WhatsApp</em></div>
        <div className="ic-kpi"><small>Voltaram a pedir</small><strong>{nVolt}</strong><em>{audAll.length ? Math.round(nVolt / audAll.length * 100) + '% dos clientes' : '—'}</em></div>
        <button className={'ic-kpi ic-kchase' + (f.status === 'nao' ? ' on' : '')} onClick={() => setFiltro({ status: f.status === 'nao' ? 'todos' : 'nao' })}>
          <small>Não voltaram</small><strong>{nNao}</strong><em>clique para ver quem são</em>
        </button>
      </div>

      <div className="ic-grid2">
        <section className="ic-card ic-g1">
          <h2>De onde vêm os pedidos</h2>
          <div className="ic-sub">Clique num bairro do mapa ou numa linha para filtrar a tela inteira. Quanto mais escuro, mais pedidos.</div>
          <div className="ic-map">
            <img src={MAPA_IMAGEM} alt="Mapa de São Gonçalo com os bairros numerados" />
            <svg viewBox={MAPA_VIEWBOX} role="group" aria-label="Pedidos por bairro">
              {[...comPoligono].sort((a, b) => (f.bairro === a[0] ? 1 : 0) - (f.bairro === b[0] ? 1 : 0)).map(([b, n]) => {
                const i = comPoligono.findIndex(x => x[0] === b)
                const sel = f.bairro === b, apagado = f.bairro != null && !sel
                const t = comPoligono.length > 1 ? 1 - i / (comPoligono.length - 1) : 1
                return <path key={b} d={BAIRRO_PATHS[b]} fillRule="evenodd" strokeLinejoin="round" style={{ cursor: 'pointer', mixBlendMode: sel || apagado ? 'normal' : 'multiply' }}
                  fill={apagado ? 'rgba(255,255,255,0)' : sel ? '#E0A000' : corRampa(t)} stroke={sel ? '#151210' : apagado ? 'rgba(0,0,0,0)' : '#6B4300'} strokeWidth={sel ? 5 : 1.5}
                  onClick={() => alterna('bairro', b)}><title>{b + ': ' + n + ' pedidos'}</title></path>
              })}
              {comPoligono.filter(([b, n]) => (f.bairro == null ? n >= 3 : f.bairro === b)).map(([b, n]) => {
                const p = BAIRRO_ROTULO[b]
                return p ? <text key={b} x={p[0]} y={p[1] + 8} textAnchor="middle" fontSize="25" fontWeight="700" fill="#151210" stroke="#fff" strokeWidth="6" paintOrder="stroke" pointerEvents="none">{b + ' · ' + n}</text> : null
              })}
            </svg>
          </div>
          <div className="ic-legenda"><span>menos pedidos</span><i /><span>mais pedidos</span></div>
          <div className="ic-nt">{semBairro ? semBairro + ' pedidos sem bairro reconhecido ficam fora do mapa. ' : ''}{foraMapa.length ? 'Sem contorno no mapa: ' + foraMapa.map(([b, n]) => b + ' (' + n + ')').join(', ') + '.' : ''}</div>
          <div className="ic-rank">
            {rankBairro.slice(0, 8).map(([b, n]) => (
              <button key={b} className={'ic-row' + (f.bairro === b ? ' sel' : '')} onClick={() => alterna('bairro', b)}>
                <span className="nm">{b}</span><div className="bar"><b style={{ width: Math.round(n / bairroMax * 100) + '%' }} /></div><span className="n">{n}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="ic-g2">
          <section className="ic-card">
            <h2>O que pedem</h2>
            <div className="ic-sub">Pedidos que levaram o produto. Clique para filtrar.</div>
            <div className="ic-rank">
              {rankProd.map(([p, n]) => (
                <button key={p} className={'ic-row' + (f.produto === p ? ' sel' : '')} onClick={() => alterna('produto', p)}>
                  <span className="nm">{p}</span><div className="bar"><b style={{ width: Math.round(n / (rankProd[0]?.[1] || 1) * 100) + '%' }} /></div><span className="n">{n}</span>
                </button>
              ))}
            </div>
          </section>
          {admin && (
            <section className="ic-card">
              <h2>Lojas</h2>
              <div className="ic-sub">Clique numa loja para ver só ela.</div>
              <div className="ic-rank">
                {rankLoja.map(l => (
                  <button key={l.i} className={'ic-row' + (f.loja === l.i ? ' sel' : '')} onClick={() => alterna('loja', l.i)}>
                    <span className="nm">{l.nome}<span className="ic-s2"> · {brl(l.fat)}</span></span><div className="bar"><b style={{ width: Math.round(l.n / (rankLoja[0]?.n || 1) * 100) + '%' }} /></div><span className="n">{l.n}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <section className="ic-card">
        <h2>Quando pedem</h2>
        <div className="ic-sub">Clique numa célula, num dia ou numa hora. Horário de Brasília.</div>
        <div className="ic-scroll">
          <div className="ic-heat">
            <div />
            {HORAS.map(h => <button key={h} className={'ic-hh' + (f.hora === h ? ' sel' : '')} onClick={() => alterna('hora', h)}>{h}h</button>)}
            {DIAS.map((d, di) => (
              <div key={d} style={{ display: 'contents' }}>
                <button className={'ic-dl' + (f.dow === DOW_DE_DIA[di] ? ' sel' : '')} onClick={() => alterna('dow', DOW_DE_DIA[di])}>{d}</button>
                {HORAS.map((h, hi) => {
                  const v = heat[di][hi]
                  const k = v === 0 ? 0 : Math.min(5, 1 + Math.floor((v / heatMax) * 4.999))
                  const sel = f.dow === DOW_DE_DIA[di] && f.hora === h
                  return <button key={h} className="ic-c" title={v + ' pedidos'} style={{ background: HEAT[k], color: k >= 4 ? '#fff' : '#151210', outline: sel ? '2px solid #151210' : 'none' }}
                    onClick={() => { if (sel) setFiltro({ dow: null, hora: null }); else setFiltro({ dow: DOW_DE_DIA[di], hora: h }) }}>{v || ''}</button>
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="ic-scale"><span>menos</span>{HEAT.map(c => <i key={c} style={{ background: c }} />)}<span>mais</span></div>
      </section>

      <h2 className="ic-sec">Mais leituras para decidir</h2>
      <div className="ic-insg">
        <section className="ic-card">
          <h2>Quem sustenta a loja <span className="ic-src real">dado real</span></h2>
          <div className="ic-sub">{sust.n} clientes identificados. Segue a loja escolhida lá em cima.</div>
          <div className="ic-sl">1 · Poucos clientes fazem a maior parte da venda</div>
          <div className="ic-nt">{sust.n ? `Os ${sust.topN} clientes que mais gastam (${sust.wCli}%) trazem ${sust.wRec}% de tudo que a loja vendeu.` : 'Sem clientes neste filtro.'}</div>
          <div className="ic-nt">Clientes</div>
          <div className="ic-sk"><b className="dk" style={{ width: sust.wCli + '%' }}>{sust.topN} mais fiéis · {sust.wCli}%</b><b className="lt" style={{ width: (100 - sust.wCli) + '%' }}>demais {sust.n - sust.topN} · {100 - sust.wCli}%</b></div>
          <div className="ic-nt">Receita</div>
          <div className="ic-sk"><b className="dk" style={{ width: sust.wRec + '%' }}>{sust.wRec}% da receita</b><b className="lt" style={{ width: (100 - sust.wRec) + '%' }}>{100 - sust.wRec}%</b></div>
          <div className="ic-sl">2 · Quantos voltam a pedir</div>
          <div className="ic-nt">Contando a partir do 1º pedido de cada cliente.</div>
          {[['Compraram', sust.n], ['Voltaram a pedir', sust.volt], ['…em até 30 dias', sust.v30], ['…em até 60 dias', sust.v60]].map(([nome, v]) => (
            <div key={nome as string} className="ic-ln"><span className="nm">{nome}</span><div className="bar"><b style={{ width: Math.max(2, sust.n ? Math.round((v as number) / sust.n * 100) : 0) + '%' }} /></div><span className="v">{v}<small>{sust.n ? Math.round((v as number) / sust.n * 100) : 0}%</small></span></div>
          ))}
          <div className="ic-sl">3 · Qual produto traz a 2ª compra</div>
          <div className="ic-nt">Entre quem começou por este produto, quantos voltaram.</div>
          {sust.porta.map(x => (
            <div key={x.k} className="ic-ln"><span className="nm">{x.k}</span><div className="bar"><b style={{ width: Math.max(3, Math.round(x.t * 100)) + '%' }} /></div><span className="v">{Math.round(x.t * 100)}% voltaram<small>{x.n} clientes</small></span></div>
          ))}
          {sust.porta.length === 0 && <div className="ic-hint">Ainda sem produtos com 3 ou mais primeiras compras neste filtro.</div>}
          <div className="ic-hl"><b>O que fazer:</b> {sust.n ? `${sust.umaVez} clientes pediram só uma vez. Eles são o público da oferta de retorno${sust.porta.length ? ', começando por quem comprou ' + sust.porta[0].k : ''}.` : 'Escolha uma loja com clientes identificados.'}</div>
        </section>

        <section className="ic-card">
          <h2>Prazo prometido x real <span className="ic-src real">dado real</span></h2>
          <div className="ic-sub">Entregas concluídas, últimos 60 dias. Do pedido feito até o motoboy retirar (inclui a espera pelo motoboy).</div>
          {dados.prazos.length === 0 ? <div className="ic-hint" style={{ marginTop: 12 }}>Ainda sem entregas suficientes (mínimo 3) para medir.</div> : (
            <div className="ic-mt">
              <div className="r h" style={{ gridTemplateColumns: admin ? '1.5fr .7fr .8fr .8fr .9fr' : '.7fr .8fr .8fr .9fr' }}>{admin && <span>Loja</span>}<span>Prometido</span><span>Até retirar</span><span>Entrega</span><span>Passou do prazo</span></div>
              {dados.prazos.map(z => (
                <div key={z.l} className="r" style={{ gridTemplateColumns: admin ? '1.5fr .7fr .8fr .8fr .9fr' : '.7fr .8fr .8fr .9fr' }}>
                  {admin && <span><b>{lojaNome(z.l)}</b><span className="ic-s2"> · {z.n} entregas</span></span>}
                  <span>{z.prazo ? z.prazo + ' min' : '—'}</span><span>{z.ret} min</span><span>{z.ent} min</span><span><b>{z.passou != null ? z.passou + '%' : '—'}</b></span>
                </div>
              ))}
            </div>
          )}
          <div className="ic-nt">Mediana, não média. {!admin && dados.prazos[0] ? `Foram ${dados.prazos[0].n} entregas medidas.` : ''}</div>
        </section>

        <section className="ic-card">
          <h2>Demanda perdida <span className="ic-src real">dado real</span></h2>
          <div className="ic-sub">Mensagens recebidas por WhatsApp em dias de loja fechada (segunda e domingo), últimos 30 dias.</div>
          {dados.perdida.length === 0 ? <div className="ic-hint" style={{ marginTop: 12 }}>Sem mensagens recebidas no período.</div> : (
            <div className="ic-mt">
              <div className="r h" style={{ gridTemplateColumns: admin ? '1.6fr 1fr 1fr 1fr' : '1fr 1fr 1fr' }}>{admin && <span>Loja</span>}<span>Mensagens</span><span>Seg e dom</span><span>% do total</span></div>
              {dados.perdida.map(z => (
                <div key={z.l} className="r" style={{ gridTemplateColumns: admin ? '1.6fr 1fr 1fr 1fr' : '1fr 1fr 1fr' }}>
                  {admin && <span><b>{lojaNome(z.l)}</b></span>}<span>{z.tot}</span><span>{z.sd}</span><span><b>{Math.round(z.sd / z.tot * 100)}%</b></span>
                </div>
              ))}
            </div>
          )}
          <div className="ic-nt">Inclui conversa de quem já é cliente, então não é tudo venda perdida. Ainda falta registrar perguntas sem resposta da IA e produtos pedidos que a loja não tem.</div>
        </section>

        <section className="ic-card">
          <h2>{admin ? 'Comparativo entre as lojas' : 'Sua loja'} <span className="ic-src real">dado real</span></h2>
          <div className="ic-sub">{admin ? 'Todas as lojas lado a lado (só o admin vê os nomes).' : 'Ticket médio, pedidos e quem volta a pedir.'}</div>
          <div className="ic-mt">
            <div className="r h" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr' }}><span>Loja</span><span>Ticket médio</span><span>Pedidos</span><span>Voltam a pedir</span></div>
            {comparativo.map(z => (
              <div key={z.nome} className={'r' + (z.me ? ' me' : '')} style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr' }}><span><b>{z.nome}</b></span><span>{z.tk}</span><span>{z.n || '—'}</span><span>{z.vol}</span></div>
            ))}
          </div>
          {!admin && <div className="ic-nt">{dados.media ? 'A média das outras lojas é anônima: nunca aparece o nome nem o dado de uma loja específica. Pedidos da média: últimos 180 dias.' : 'A média das outras lojas (sem mostrar quem é quem) aparece quando houver lojas suficientes.'}</div>}
        </section>

        <section className="ic-card">
          <h2>Resultado das ofertas enviadas <span className="ic-src real">dado real</span></h2>
          <div className="ic-sub">Quem respondeu e quem pediu em até 72 horas depois de receber a mensagem.</div>
          {!campanhas || campanhas.length === 0 ? <div className="ic-hint" style={{ marginTop: 12 }}>Nenhuma oferta enviada ainda. Use o botão “Enviar oferta” lá embaixo.</div> : (
            <div className="ic-scroll">
              <div className="ic-mt" style={{ minWidth: 560 }}>
                <div className="r h" style={{ gridTemplateColumns: '1.8fr .7fr .8fr .7fr .9fr .6fr' }}><span>Oferta</span><span>Enviadas</span><span>Responderam</span><span>Pediram</span><span>Vendeu</span><span /></div>
                {campanhas.map(c => (
                  <div key={c.id} className="r" style={{ gridTemplateColumns: '1.8fr .7fr .8fr .7fr .9fr .6fr' }}>
                    <span><b>{c.nome}</b><span className="ic-s2"> · {admin ? c.loja + ' · ' : ''}{dm(c.criada.slice(0, 10))}{c.status === 'enviando' ? ' · enviando (' + c.pendentes + ' na fila)' : c.status === 'cancelada' ? ' · cancelada' : ''}{c.falhas ? ' · ' + c.falhas + ' falhas' : ''}</span></span>
                    <span>{c.enviadas}/{c.total}</span><span>{c.responderam}</span><span>{c.pediram}</span><span><b>{brl(c.vendeu)}</b></span>
                    <span>{c.status === 'enviando' && <button className="ic-link" style={{ padding: 0 }} onClick={() => { const l = dados.lojas.find(x => x.nome === c.loja); cancelarCampanha(c, l?.id || companyId || '') }}>parar</button>}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="ic-nt">“Vendeu” soma os pedidos de quem recebeu a oferta nas 72 horas seguintes. É o que aconteceu depois, não prova de que foi só a mensagem.</div>
        </section>

        <section className="ic-card">
          <h2>Funil: de onde veio e onde parou {dados.funil.temDados ? <span className="ic-src real">dado real</span> : <span className="ic-src aw">aguardando dados</span>}</h2>
          <div className="ic-sub">Últimos 30 dias, por visita ao cardápio. Começamos a gravar agora: os números crescem a cada dia.</div>
          <div className="ic-fn">
            {[['Abriu o cardápio', dados.funil.total.abriu], ['Adicionou ao carrinho', dados.funil.total.add], ['Finalizou o pedido', dados.funil.total.feito]].map(([nome, v], i) => (
              <div key={nome as string} style={dados.funil.temDados ? { borderStyle: 'solid', background: '#fff', color: '#151210' } : undefined}>
                <strong>{dados.funil.temDados ? v : '—'}</strong><small>{nome}</small>
                {dados.funil.temDados && i > 0 && <small style={{ display: 'block' }}>{dados.funil.total.abriu ? Math.round((v as number) / dados.funil.total.abriu * 100) : 0}% de quem abriu</small>}
              </div>
            ))}
          </div>
          {dados.funil.porOrigem.length > 0 && (
            <div className="ic-mt">
              <div className="r h" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1fr' }}><span>De onde veio</span><span>Abriu</span><span>Carrinho</span><span>Pediu</span></div>
              {dados.funil.porOrigem.map(o => (
                <div key={o.origem} className="r" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1fr' }}><span><b>{ORIGEM_TXT[o.origem] || o.origem}</b></span><span>{o.abriu}</span><span>{o.add}</span><span>{o.feito}</span></div>
              ))}
            </div>
          )}
          <div className="ic-sl">Carrinhos deixados para trás</div>
          {(() => {
            const aband = dados.funil.abandonados.filter(x => !admin || f.loja == null || x.l === f.loja)
            if (aband.length === 0) return <div className="ic-hint" style={{ marginTop: 6 }}>Nenhum carrinho abandonado com WhatsApp ainda. Só entram clientes que já tinham digitado o número.</div>
            return (
              <>
                <div className="ic-nt">{aband.length} cliente(s) montaram o carrinho, deixaram o WhatsApp e não pediram.</div>
                <div className="ic-rank">
                  {aband.slice(-6).reverse().map((x, i) => (
                    <div key={i} className="ic-ln" style={{ gridTemplateColumns: '1.2fr 1.6fr auto' }}><span className="nm">{formatPhoneDisplay(x.phone)}</span><span>{x.itens.map(it => it.q + 'x ' + it.n).join(', ')}</span><span className="v">{dm(x.quando)}</span></div>
                  ))}
                </div>
                <button className="ic-cta" style={{ marginTop: 12 }} onClick={() => abrirOferta('carrinho', aband.map(x => ({ phone: x.phone, nome: '', l: x.l, item: x.itens[0]?.n })))}>Lembrar estes {aband.length} do carrinho</button>
              </>
            )
          })()}
        </section>
      </div>

      <section className="ic-card">
        <h2>Quem são os clientes deste filtro</h2>
        <div className="ic-sub">Clique num cliente para ver tudo o que ele comprou, ou escolha um grupo para chamar de volta.</div>
        <div className="ic-seg">
          {SEGS.map(([k, nome]) => (
            <button key={k} className={'ic-sg' + (f.status === k ? ' on' : '')} onClick={() => setFiltro({ status: k })}>
              {nome} <b>{k === 'todos' ? contaSt(null) : k === 'nao' ? contaSt(ST_NAO) : k === 'ativo' ? contaSt(['ativo', 'novo']) : contaSt([k as Situacao])}</b>
            </button>
          ))}
        </div>
        <div className="ic-scroll">
          <div className="ic-ahead" style={{ gridTemplateColumns: gcols }}><span>Cliente</span><span>Bairro</span>{admin && <span>Loja</span>}<span>Pedidos</span><span>Gastou</span><span>Último pedido</span><span>Ritmo</span><span>Costuma pedir</span><span>Situação</span></div>
          {lista.map(c => (
            <button key={c.key} className="ic-arow" style={{ gridTemplateColumns: gcols }} onClick={() => setFicha(c.key)}>
              <span><b>{c.nome || formatPhoneDisplay(c.phone)}</b></span><span>{c.bairro || '—'}</span>{admin && <span>{lojaNome(c.l)}</span>}
              <span>{c.n}</span><span>{brl(c.gasto)}</span><span>{dm(c.ult.d)} · há {c.desde} d</span>
              <span>{c.n >= 2 ? 'a cada ' + Math.max(c.gap, 1) + ' dias' : '—'}</span><span>{c.fav || '—'}</span>
              <span><span className={'ic-pst ' + c.st}>{ST_TXT[c.st]}</span></span>
            </button>
          ))}
        </div>
        {audLista.length > 8 && <button className="ic-link" onClick={() => setTodos(!todos)}>{todos ? 'Mostrar menos' : 'Ver todos os ' + audLista.length + ' clientes'}</button>}
        {audLista.length === 0 && <div className="ic-hint" style={{ padding: '14px 8px' }}>Ninguém neste filtro. Tire um filtro acima.</div>}
      </section>

      <div className="ic-act">
        <div><b>{audLista.length} clientes neste filtro</b><span>{destRetorno.length} podem receber uma oferta para voltar a pedir. {aviso ? '' : 'A oferta sai pelo WhatsApp da loja, uma por vez.'}{aviso && <em style={{ color: '#FFC531', fontStyle: 'normal' }}> {aviso}</em>}</span></div>
        <button className="ic-sec2" onClick={baixarCsv} disabled={audLista.length === 0}>Baixar lista (CSV)</button>
        <button className="ic-cta" onClick={() => abrirOferta('retorno', destRetorno)} disabled={destRetorno.length === 0}>Enviar oferta para {destRetorno.length}</button>
      </div>

      {oferta && (
        <OfertaComposer companyId={dados.lojas[oferta.lojaIdx]?.id || companyId || ''} lojaNome={dados.lojas[oferta.lojaIdx]?.nome || ''} tipo={oferta.tipo} dest={oferta.dest} produtoSugerido={oferta.produto}
          onClose={() => setOferta(null)} onEnviado={carregarCampanhas} />
      )}

      {fichaC && (
        <div className="ic-ov" onClick={() => setFicha(null)}>
          <aside className="ic-dr" onClick={e => e.stopPropagation()} aria-label="Ficha do cliente">
            <div className="ic-dh"><h3>{fichaC.nome || formatPhoneDisplay(fichaC.phone)}</h3><button onClick={() => setFicha(null)}>Fechar</button></div>
            <div className="ic-fk">
              <div><small>WhatsApp</small><strong>{formatPhoneDisplay(fichaC.phone)}</strong></div>
              <div><small>Situação</small><strong>{ST_TXT[fichaC.st]}</strong></div>
              <div><small>Pedidos</small><strong>{fichaC.n}</strong></div>
              <div><small>Gastou</small><strong>{brl2(fichaC.gasto)}</strong></div>
              <div><small>Ritmo</small><strong>{fichaC.n >= 2 ? Math.max(fichaC.gap, 1) + ' dias' : 'só 1 pedido'}</strong></div>
              <div><small>Último pedido</small><strong>há {fichaC.desde} dias</strong></div>
            </div>
            <div className="ic-ho-wrap">
              {[...fichaC.rows].reverse().map((r, i) => (
                <div key={i} className="ic-ho"><span><b>{dm(r.d)}</b><span className="g">{r.h}h{admin ? ' · ' + lojaNome(r.l) : ''}</span></span><span>{r.it.map(limpo).join(', ') || '—'}{r.b ? <span className="g">{r.b}</span> : null}</span><b>{brl2(r.t)}</b></div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

const CSS = `
.ic{display:flex;flex-direction:column;gap:18px;color:#151210;font-family:inherit;font-size:14px;line-height:1.45;padding-bottom:84px}
.ic button{font-family:inherit;cursor:pointer}
.ic-load,.ic-erro{padding:40px 16px;color:#3E3B37}
.ic-erro button{margin-left:8px}
.ic-head h1{margin:0;font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:40px;line-height:1;letter-spacing:.01em}
.ic-head p{margin:6px 0 0;color:#3E3B37;max-width:720px}
.ic-card{background:#fff;border:1px solid #A9AAA0;border-radius:14px;padding:18px 20px;box-shadow:0 1px 3px rgba(21,18,16,.14)}
.ic-card h2{margin:0;font-size:16px;font-weight:700}
.ic-per{padding:12px}
.ic-sub{color:#3E3B37;font-size:13px;margin-top:2px}
.ic-hint{color:#3E3B37;font-size:13px}
.ic-nt{font-size:12px;color:#3E3B37;margin-top:8px;line-height:1.5}
.ic-fbar{background:#fff;border:1px solid #A9AAA0;border-radius:12px;padding:10px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-height:44px;box-shadow:0 1px 3px rgba(21,18,16,.14)}
.ic-fl{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#3E3B37;margin-right:4px}
.ic-chip{border:0;background:#151210;color:#FFC531;border-radius:999px;padding:7px 13px;font:600 13px inherit;min-height:36px}
.ic-link{border:0;background:none;color:#8A5E00;font:700 13px inherit;text-decoration:underline;padding:8px}
.ic-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.ic-kpi{background:#fff;border:1px solid #A9AAA0;border-radius:12px;padding:14px 16px;text-align:left;box-shadow:0 1px 3px rgba(21,18,16,.14)}
.ic-kpi small{display:block;color:#3E3B37;font-size:12px;letter-spacing:.04em;text-transform:uppercase;font-weight:600}
.ic-kpi strong{display:block;font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:30px;line-height:1.1;margin-top:6px}
.ic-kpi em{display:block;font-style:normal;font-size:12px;color:#3E3B37;margin-top:2px}
.ic-kchase{background:#FFF7DA;border-color:#E3B63C;cursor:pointer}
.ic-kchase.on{background:#151210;border-color:#151210}
.ic-kchase.on small,.ic-kchase.on em{color:#E6DFC9}
.ic-kchase.on strong{color:#FFC531}
.ic-grid2{display:flex;gap:18px;flex-wrap:wrap;align-items:stretch}
.ic-g1{flex:1.55 1 560px;min-width:0}
.ic-g2{flex:1 1 340px;min-width:0;display:flex;flex-direction:column;gap:18px}
.ic-map{position:relative;margin-top:12px;border-radius:10px;overflow:hidden;border:1px solid #A9AAA0;background:#fff}
.ic-map img{display:block;width:100%;height:auto}
.ic-map svg{position:absolute;left:0;top:0;width:100%;height:100%}
.ic-legenda{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:12px;color:#3E3B37}
.ic-legenda i{flex:1;max-width:260px;height:10px;border-radius:5px;border:1px solid #A9AAA0;background:linear-gradient(90deg,#FFF0C2,#FFD25A,#E0A000,#A56F00,#6B4300)}
.ic-rank{display:flex;flex-direction:column;gap:4px;margin-top:12px}
.ic-row{display:grid;grid-template-columns:minmax(90px,150px) 1fr 40px;gap:10px;align-items:center;font-size:13px;border:1px solid transparent;background:none;border-radius:8px;padding:5px 8px;text-align:left;width:100%}
.ic-row:hover{background:#E6E7DF}
.ic-row.sel{background:#FFF0C2;border-color:#E3B63C}
.ic-row .nm{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar{height:10px;background:#D9DAD1;border-radius:3px;overflow:hidden}
.bar b{display:block;height:100%;background:#FFC531;border-radius:3px}
.ic-row .n{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.ic-s2{font-size:11px;color:#3E3B37;font-weight:500}
.ic-scroll{overflow-x:auto;margin-top:12px}
.ic-heat{display:grid;grid-template-columns:40px repeat(16,minmax(28px,1fr));gap:3px;min-width:560px}
.ic-hh{font-size:11px;color:#3E3B37;text-align:center;border:0;background:none;padding:2px 0;font-weight:600}
.ic-hh.sel{color:#151210;background:#FFF0C2;border-radius:4px}
.ic-dl{font-size:12px;font-weight:700;border:0;background:none;text-align:left;padding:0 4px}
.ic-dl.sel{background:#FFF0C2;border-radius:4px}
.ic-c{height:28px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:0;padding:0}
.ic-scale{display:flex;gap:6px;align-items:center;margin-top:10px;font-size:12px;color:#3E3B37;flex-wrap:wrap}
.ic-scale i{width:20px;height:12px;border-radius:3px;display:inline-block;border:1px solid #A9AAA0}
.ic-sec{margin:6px 0 -6px;font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:28px;letter-spacing:.01em}
.ic-insg{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:18px}
.ic-src{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:4px;margin-left:8px;vertical-align:middle}
.ic-src.real{background:#DDF1E7;color:#0B6B43}
.ic-src.aw{background:#E8E9E3;color:#3F3C38}
.ic-mt{display:grid;margin-top:12px;font-size:13px;overflow-x:auto}
.ic-mt .r{display:grid;gap:8px;padding:8px 4px;border-bottom:1px solid #CBCCC3;align-items:center;min-width:380px}
.ic-mt .r.h{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#3E3B37;font-weight:700;border-bottom:2px solid #A9AAA0}
.ic-mt .r span:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
.ic-mt .r.me{background:#FFF7DA}
.ic-ln{display:grid;grid-template-columns:minmax(130px,1.25fr) 1.5fr auto;gap:10px;align-items:center;font-size:13px;padding:7px 0;border-bottom:1px solid #CBCCC3}
.ic-ln:last-of-type{border-bottom:0}
.ic-ln .nm{font-weight:600;line-height:1.3}
.ic-ln .v{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.ic-ln .v small{display:block;font-weight:500;color:#3E3B37;font-size:11px}
.ic-sk{display:flex;height:28px;border-radius:6px;overflow:hidden;border:1px solid #8E8F85;margin-top:6px}
.ic-sk b{display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden}
.ic-sk .dk{background:#151210;color:#FFC531}
.ic-sk .lt{background:#E6E7DF;color:#151210}
.ic-sl{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#3E3B37;margin-top:16px}
.ic-hl{background:#FFF7DA;border:1px solid #E3B63C;border-radius:10px;padding:10px 12px;font-size:13px;margin-top:14px}
.ic-fn{display:flex;gap:6px;margin-top:12px}
.ic-fn div{flex:1;background:#E6E7DF;border:1px dashed #8E8F85;border-radius:8px;padding:10px;text-align:center;color:#5B5852}
.ic-fn strong{display:block;font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:22px}
.ic-fn small{font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.ic-seg{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 8px}
.ic-sg{border:1px solid #8E8F85;background:#fff;color:#151210;border-radius:8px;padding:8px 12px;font:600 13px inherit;min-height:40px;display:flex;gap:8px;align-items:center}
.ic-sg b{color:#3E3B37}
.ic-sg.on{background:#151210;color:#FFC531;border-color:#151210}
.ic-sg.on b{color:#FFC531}
.ic-ahead,.ic-arow{display:grid;grid-template-columns:1.25fr 1fr repeat(6,auto);gap:10px;align-items:center;padding:10px;font-size:13px;min-width:900px}
.ic-ahead{grid-template-columns:1.25fr 1fr .5fr .7fr 1.1fr 1fr 1.5fr 1.2fr;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#3E3B37;font-weight:700;border-bottom:2px solid #A9AAA0;padding-top:6px}
.ic-arow{grid-template-columns:1.25fr 1fr .5fr .7fr 1.1fr 1fr 1.5fr 1.2fr;width:100%;text-align:left;border:0;border-bottom:1px solid #CBCCC3;background:none;color:#151210;box-sizing:border-box}
.ic-arow:hover{background:#E6E7DF}
.ic-arow>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ic-pst{display:inline-block;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}
.ic-pst.hora{background:#FFF0C2;color:#6B4A00}
.ic-pst.sumiu{background:#FBE3E0;color:#9C2417}
.ic-pst.uma{background:#E8E9E3;color:#3F3C38}
.ic-pst.ativo,.ic-pst.novo{background:#DDF1E7;color:#0B6B43}
.ic-act{position:fixed;left:0;right:0;bottom:0;z-index:40;background:#151210;color:#fff;padding:12px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;box-shadow:0 -6px 18px rgba(21,18,16,.18)}
.ic-act div{flex:1 1 300px}
.ic-act b{font-size:16px}
.ic-act span{display:block;color:#D8D5CD;font-size:13px}
.ic-cta{border:0;background:#FFC531;color:#151210;border-radius:10px;padding:12px 20px;font:800 15px inherit;min-height:48px}
.ic-sec2{border:1px solid #8E8F85;background:transparent;color:#fff;border-radius:10px;padding:12px 16px;font:700 14px inherit;min-height:48px}
.ic-sec2:disabled{opacity:.5;cursor:not-allowed}
.ic-cta:disabled{background:#4A443D;color:#F2EFE8;cursor:not-allowed}
.ic-ov{position:fixed;inset:0;background:rgba(21,18,16,.55);z-index:60;display:flex;justify-content:flex-end}
.ic-dr{background:#E6E7DF;width:100%;max-width:560px;height:100%;overflow-y:auto}
.ic-dh{background:#151210;color:#fff;padding:16px 24px;display:flex;align-items:center;gap:14px;position:sticky;top:0}
.ic-dh h3{margin:0;font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:24px}
.ic-dh button{margin-left:auto;border:1px solid #4A443D;background:transparent;color:#fff;border-radius:8px;min-height:40px;padding:0 14px;font:600 13px inherit}
.ic-fk{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:18px 24px 0}
.ic-fk div{background:#fff;border:1px solid #A9AAA0;border-radius:10px;padding:10px 12px}
.ic-fk small{display:block;font-size:11px;color:#3E3B37;text-transform:uppercase;letter-spacing:.04em;font-weight:700}
.ic-fk strong{font-size:16px;font-weight:700}
.ic-ho-wrap{margin:14px 24px 28px;background:#fff;border:1px solid #A9AAA0;border-radius:12px;padding:4px 14px}
.ic-ho{display:grid;grid-template-columns:70px 1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid #CBCCC3;font-size:13px}
.ic-ho:last-child{border-bottom:0}
.ic-ho .g{display:block;font-size:11px;color:#3E3B37}
@media (max-width:900px){.ic-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ic-act{padding:12px 16px}}
`
