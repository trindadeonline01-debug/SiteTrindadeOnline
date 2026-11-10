// Paleta e tipos compartilhados — mesmos tokens de marca do site
// (docs/KNOWLEDGE_BASE.md §2), adaptados pro app nativo do motoboy.
export const colors = {
  ink: '#120F0A',
  inkLight: '#1D1810',
  gold: '#FFC531',
  goldDark: '#8A6410',
  paper: '#F2F1ED',
  paperDark: '#E9E5D8',
  card: '#FFFFFF',
  muted: '#6B6558',
  good: '#12805C',
  goodBg: '#E3F4EC',
  bad: '#B23B2E',
  badBg: '#F6DCD6',
  wait: '#8A6410',
  waitBg: '#F6E9CE',
  line: '#E0DCD0',
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 18, xl: 28 }

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 }

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Algo deu errado.'
}
