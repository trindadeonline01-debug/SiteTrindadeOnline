import { Corrida } from './api'

// Uma "unidade" de trabalho na tela da corrida:
//  - loja: pedidos da MESMA loja ainda a retirar (retirada em grupo = um só código por pedido)
//  - cliente: um pedido já retirado, indo entregar
export type Unit = { key: string; kind: 'loja' | 'cliente'; company: string; rides: Corrida[] }

export function buildUnits(rides: Corrida[]): Unit[] {
  const porLoja = new Map<string, Corrida[]>()
  rides.filter(r => !r.pickedUp).forEach(r => porLoja.set(r.company, [...(porLoja.get(r.company) || []), r]))
  const entregar: Unit[] = rides.filter(r => r.pickedUp).map(r => ({ key: `cliente:${r.id}`, kind: 'cliente', company: r.company, rides: [r] }))
  const retirar: Unit[] = Array.from(porLoja.entries()).map(([company, rs]) => ({ key: `loja:${company}`, kind: 'loja', company, rides: rs }))
  return [...entregar, ...retirar]
}

type Ponto = { lat: number; lng: number }

// Endereços guardados sem cidade ("R. Ilhéus, 139 - Trindade") eram geocodificados
// pelo Google em qualquer outro lugar (nov/2026, caso real: rota de 5,4 km no lugar
// de 1,3 km). Completa com a cidade quando o texto não traz — mesma regra que o
// servidor usa ao geocodificar a entrega.
function enderecoCompleto(address: string) {
  return /\bRJ\b|Rio de Janeiro|S[ãa]o Gon[çc]alo/i.test(address) ? address : `${address}, São Gonçalo - RJ, Brasil`
}

// Destino por coordenadas quando existem (loja); senão endereço completo.
// Origem = posição atual do aparelho: sem ela o Maps usa "Seu local" com o que
// tiver na memória na hora de abrir, e a rota podia sair de outro ponto.
export function openMaps(address: string, destino?: Ponto | null, origem?: Ponto | null) {
  const dest = destino ? `${destino.lat},${destino.lng}` : enderecoCompleto(address)
  const org = origem ? `&origin=${origem.lat},${origem.lng}` : ''
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving${org}&destination=${encodeURIComponent(dest)}`
}

export function waLink(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('55')) digits = '55' + digits
  return `https://wa.me/${digits}`
}

export function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : p[0]?.[1] || '')).toUpperCase()
}

export function fmtMoney(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }
