import { PALAVRAS_CACA } from '@/data/caca/palavras'

// Regras do Caça-Palavras (nov/2026). Tudo aqui é do SERVIDOR: ele monta a grade, guarda onde cada palavra está,
// conta o tempo e confere cada seleção. O celular só recebe as letras e desenha.
// Desenho aprovado em mockup: 5 níveis, 2 grades por nível (tempo zera a cada grade), palavras misturadas,
// 3 ajudas (mais tempo, embaralhar, trocar palavras) 1 vez de cada por nível, sem repetir palavra na rodada.

export type Lista = 'full' | 'dica' | 'oculta'
export type Nivel = { n: number; nome: string; size: number; count: number; minLen: number; dirs: string[]; time: number; lista: Lista; decoys: number; vies: number }
export type Palavra = { w: string; cells: [number, number][]; achada: boolean; cor: number }
export type Grade = { n: number; letras: string[]; palavras: Palavra[]; tent: number }
export type Ajudas = { tempo: number; emb: number; troca: number }

const DIRS: Record<string, [number, number]> = { E: [0, 1], S: [1, 0], SE: [1, 1], W: [0, -1], N: [-1, 0], NE: [-1, 1], SW: [1, -1], NW: [-1, -1] }
const ALL = Object.keys(DIRS)

export const NIVEIS: Nivel[] = [
  { n: 1, nome: 'Grumete', size: 9, count: 6, minLen: 4, dirs: ['E', 'S', 'SE', 'NE'], time: 120, lista: 'full', decoys: 0, vies: 0.5 },
  { n: 2, nome: 'Marujo', size: 10, count: 7, minLen: 4, dirs: ['E', 'S', 'SE', 'NE', 'W', 'N'], time: 140, lista: 'full', decoys: 0, vies: 0.6 },
  { n: 3, nome: 'Pescador', size: 11, count: 8, minLen: 5, dirs: ALL, time: 160, lista: 'full', decoys: 2, vies: 0.7 },
  { n: 4, nome: 'Mestre', size: 12, count: 9, minLen: 5, dirs: ALL, time: 180, lista: 'dica', decoys: 4, vies: 0.8 },
  { n: 5, nome: 'Capitão', size: 13, count: 10, minLen: 6, dirs: ALL, time: 200, lista: 'oculta', decoys: 6, vies: 0.85 },
]
export const PARTES = 2               // grades por nível
export const TEMPO_EXTRA = 30         // segundos da ajuda "Mais tempo"
export const AJUDAS_INICIAIS: Ajudas = { tempo: 1, emb: 1, troca: 1 }   // renovam a cada nível
export const ATRASO_INICIO_S = 2      // a contagem só começa 2 s depois de a grade chegar (tela de transição)
export const MAX_TENTATIVAS = 300     // seleções por grade (trava contra programa que tenta tudo)

export const pontosGrade = (nivel: number, restanteS: number) => 50 * nivel + 3 * Math.max(0, Math.round(restanteS))
export const estrelas = (razoes: number[]) => {
  const m = razoes.length ? razoes.reduce((a, b) => a + b, 0) / razoes.length : 0
  return m > 0.5 ? 3 : m > 0.25 ? 2 : 1
}

const rnd = (n: number) => Math.floor(Math.random() * n)
const pick = <T,>(a: T[]) => a[rnd(a.length)]
function embaralhar<T>(a: T[]): T[] { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]] } return b }
const ABC = 'ABCDEFGHIJLMNOPQRSTUVXZ'
const inverter = (w: string) => w.split('').reverse().join('')

const candidatas = (L: Nivel, proibidas: Set<string>) => PALAVRAS_CACA.filter(w => w.length >= L.minLen && w.length <= L.size - 3 && !proibidas.has(w))
// uma palavra não pode estar dentro de outra (nem ao contrário) na mesma grade
const conflita = (w: string, lista: string[]) => { const r = inverter(w); return lista.some(x => x.includes(w) || w.includes(x) || x.includes(r) || r.includes(x)) }

// Escolhe `n` palavras que ainda não saíram na rodada. Só relaxa o tamanho se faltar palavra nova; repetir é o último recurso.
export function escolherPalavras(L: Nivel, n: number, usadas: string[], manter: string[] = []): string[] {
  const proibidas = new Set(usadas)
  const passos = [
    () => candidatas(L, proibidas),
    () => PALAVRAS_CACA.filter(w => w.length >= 4 && w.length <= L.size - 2 && !proibidas.has(w)),
    () => PALAVRAS_CACA.filter(w => w.length >= 4 && w.length <= L.size - 2),
  ]
  const out: string[] = []
  for (let p = 0; p < passos.length && out.length < n; p++) {
    for (const w of embaralhar(passos[p]())) {
      if (out.length >= n) break
      if (!out.includes(w) && !conflita(w, out.concat(manter))) out.push(w)
    }
  }
  return out
}

type Mat = string[][]
const vazia = (n: number): Mat => Array.from({ length: n }, () => new Array<string>(n).fill(''))

function colocarLinha(g: Mat, n: number, dirs: string[], w: string, bloq: Set<string> | null): [number, number][] | null {
  for (let t = 0; t < 500; t++) {
    const d = DIRS[pick(dirs)], r0 = rnd(n), c0 = rnd(n)
    const er = r0 + d[0] * (w.length - 1), ec = c0 + d[1] * (w.length - 1)
    if (er < 0 || er >= n || ec < 0 || ec >= n) continue
    let ok = true
    for (let i = 0; i < w.length; i++) {
      const rr = r0 + d[0] * i, cc = c0 + d[1] * i
      if (bloq && bloq.has(rr + ',' + cc)) { ok = false; break }
      const ch = g[rr][cc]
      if (ch && ch !== w[i]) { ok = false; break }
    }
    if (!ok) continue
    const cells: [number, number][] = []
    for (let j = 0; j < w.length; j++) { g[r0 + d[0] * j][c0 + d[1] * j] = w[j]; cells.push([r0 + d[0] * j, c0 + d[1] * j]) }
    return cells
  }
  return null
}
function enchimento(g: Mat, n: number, letras: string, vies: number) {
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (!g[a][b]) g[a][b] = Math.random() < vies ? letras[rnd(letras.length)] : ABC[rnd(ABC.length)]
}
const paraLetras = (g: Mat) => g.map(l => l.join(''))

// Monta uma grade nova. Palavras nunca ocupam a grade de ponta a ponta (no máximo tamanho-3 letras), o enchimento usa
// muita letra das próprias palavras e os níveis altos recebem "falsos começos" (palavra quase inteira, que não fecha).
export function novaGrade(L: Nivel, usadas: string[]): Grade | null {
  const n = L.size
  for (let tent = 0; tent < 60; tent++) {
    const g = vazia(n)
    const words = escolherPalavras(L, L.count, usadas)
    if (words.length < L.count) return null
    const ordem = words.slice().sort((a, b) => b.length - a.length)
    const pos = new Map<string, [number, number][]>()
    let falhou = false
    for (const w of ordem) { const c = colocarLinha(g, n, L.dirs, w, null); if (!c) { falhou = true; break } pos.set(w, c) }
    if (falhou) continue
    for (let q = 0; q < L.decoys; q++) { const dw = pick(words); colocarLinha(g, n, L.dirs, dw.slice(0, Math.max(3, dw.length - 2)), null) }
    enchimento(g, n, words.join(''), L.vies)
    const palavras: Palavra[] = embaralhar(words).map((w, i) => ({ w, cells: pos.get(w)!, achada: false, cor: i % 9 }))
    return { n, letras: paraLetras(g), palavras, tent: 0 }
  }
  return null
}

// Ajudas que refazem a grade mantendo no lugar as palavras já achadas. `trocar` também troca as palavras que faltam.
export function refazerGrade(grade: Grade, L: Nivel, usadas: string[], trocar: boolean): { grade: Grade; novas: string[] } | null {
  const n = grade.n
  const achadas = grade.palavras.filter(p => p.achada), resto = grade.palavras.filter(p => !p.achada)
  if (!resto.length) return null
  const bloq = new Set<string>(), base = vazia(n)
  achadas.forEach(p => p.cells.forEach(([r, c]) => { bloq.add(r + ',' + c); base[r][c] = grade.letras[r][c] }))
  let novas = resto.map(p => p.w)
  let trocadas: string[] = []
  if (trocar) {
    const proib = usadas.concat(achadas.map(p => p.w))
    novas = escolherPalavras(L, resto.length, proib, achadas.map(p => p.w))
    if (novas.length < resto.length) return null
    trocadas = novas
  }
  for (let tent = 0; tent < 60; tent++) {
    const g = base.map(l => l.slice())
    const ordem = novas.slice().sort((a, b) => b.length - a.length)
    const pos = new Map<string, [number, number][]>()
    let ok = true
    for (const w of ordem) { const c = colocarLinha(g, n, L.dirs, w, bloq); if (!c) { ok = false; break } pos.set(w, c) }
    if (!ok) continue
    for (let q = 0; q < L.decoys; q++) { const dw = pick(novas); colocarLinha(g, n, L.dirs, dw.slice(0, Math.max(3, dw.length - 2)), bloq) }
    enchimento(g, n, novas.concat(achadas.map(p => p.w)).join(''), L.vies)
    const palavras: Palavra[] = grade.palavras.map(p => p.achada ? p : null as unknown as Palavra)
    let k = 0
    for (let i = 0; i < palavras.length; i++) {
      if (palavras[i]) continue
      const w = novas[k++]
      palavras[i] = { w, cells: pos.get(w)!, achada: false, cor: grade.palavras[i].cor }
    }
    return { grade: { n, letras: paraLetras(g), palavras, tent: grade.tent }, novas: trocadas }
  }
  return null
}

// Confere uma seleção (lista de [linha, coluna]): precisa ser uma linha reta contínua dentro da grade.
// Devolve o índice da palavra (ainda não achada) que a seleção forma, ou -1.
export function conferirSelecao(grade: Grade, cells: unknown): number {
  if (!Array.isArray(cells) || cells.length < 2 || cells.length > grade.n) return -1
  const pts: [number, number][] = []
  for (const c of cells) {
    if (!Array.isArray(c) || c.length !== 2 || !Number.isInteger(c[0]) || !Number.isInteger(c[1])) return -1
    if (c[0] < 0 || c[0] >= grade.n || c[1] < 0 || c[1] >= grade.n) return -1
    pts.push([c[0], c[1]])
  }
  const dr = pts[1][0] - pts[0][0], dc = pts[1][1] - pts[0][1]
  if (Math.abs(dr) > 1 || Math.abs(dc) > 1 || (!dr && !dc)) return -1
  for (let i = 1; i < pts.length; i++) if (pts[i][0] - pts[i - 1][0] !== dr || pts[i][1] - pts[i - 1][1] !== dc) return -1
  const s = pts.map(([r, c]) => grade.letras[r][c]).join(''), rs = inverter(s)
  return grade.palavras.findIndex(p => !p.achada && (p.w === s || p.w === rs))
}

// O que o celular vê da grade. Na lista "oculta" ele não recebe nem o texto nem o tamanho das palavras que faltam.
export function palavrasVisiveis(grade: Grade, lista: Lista) {
  const out = grade.palavras.map((p, id) => ({
    id, cor: p.cor, achada: p.achada,
    texto: p.achada || lista === 'full' ? p.w : undefined,
    dica: !p.achada && lista === 'dica' ? p.w[0] : undefined,
    tam: !p.achada && lista !== 'oculta' ? p.w.length : undefined,
    cells: p.achada ? p.cells : undefined,
  }))
  return lista === 'oculta' ? out : out.sort((a, b) => ((a.texto ?? a.dica ?? '') < (b.texto ?? b.dica ?? '') ? -1 : 1))
}
