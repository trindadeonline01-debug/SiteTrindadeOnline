// Paleta e tipos compartilhados — mesmos tokens de marca do site
// (docs/KNOWLEDGE_BASE.md §2), adaptados pro app nativo do motoboy.
export const colors = {
  ink: '#1A0F00',
  inkLight: '#2A1B08',
  gold: '#C9951A',
  goldDark: '#8A6410',
  paper: '#F0EDE8',
  paperDark: '#E3DCCB',
  card: '#FFFFFF',
  muted: '#7A6E57',
  good: '#1F7A4D',
  goodBg: '#E1F2E8',
  bad: '#B23B2E',
  badBg: '#F6DCD6',
  wait: '#8A6410',
  waitBg: '#F6E9CE',
  line: '#D8CFBA',
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 18, xl: 28 }

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 }

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Algo deu errado.'
}
