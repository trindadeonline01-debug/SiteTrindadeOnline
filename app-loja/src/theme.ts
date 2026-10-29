// Mesmos tokens do design system atual do site ("placa de comércio de
// bairro", ESPECIFICACAO.md §11.2) — não os do app-motoboy (que usa a
// paleta antiga "gold"), porque este app é uma extensão do painel do
// lojista, que já usa esses tokens há meses.
export const colors = {
  ink: '#151210',
  inkLight: '#232019',
  sign: '#FFC531',
  signDark: '#A87200',
  paper: '#F5F6F2',
  card: '#FFFFFF',
  muted: '#6F6C67',
  mutedLight: '#A79E8B',
  good: '#0F8A57',
  goodBg: '#E4F3EC',
  bad: '#D6392B',
  badBg: '#FBEAEA',
  info: '#2A4E7A',
  line: '#DCDDD6',
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 18, xl: 28 }

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 }

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Algo deu errado.'
}
