// Modo Atendimento (ESPECIFICACAO.md §4.4/§10) — o mesmo inbox de
// /painel/mensagens, mas em tela cheia: sem sidebar, sem topbar, sem
// tabbar do painel. "Modo não é página de menu — ocupa a tela toda",
// mesmo tratamento já dado a /painel/cozinha. O componente detecta o
// pathname e troca só o wrapper externo (ver src/app/painel/mensagens/page.tsx).
export { default } from '../painel/mensagens/page'
