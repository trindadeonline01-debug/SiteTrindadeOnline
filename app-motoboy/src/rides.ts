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

export function openMaps(address: string) {
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(address)}`
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
