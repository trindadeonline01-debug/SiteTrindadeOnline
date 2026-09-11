// Lista única da navegação do painel usada tanto em /painel/mais (menu
// completo do celular) quanto na gaveta do menu hambúrguer global
// (MobileMenu.tsx) quando o usuário está no modo empresarial — as duas
// telas mostravam listas hardcoded e independentes, e uma ficava
// desatualizada em relação à outra sempre que uma função nova entrava
// (achado real do Ricardo, set/2026: "Meus motoboys" só tinha ido pra
// sidebar desktop). Uma lista só, usada nos dois lugares.
export type PainelNavLockKey = 'loja' | 'crm' | 'entrega'
export type PainelNavItem = { href: string; icon: string; label: string; lockKey?: PainelNavLockKey }
export type PainelNavGroup = { label: string; items: PainelNavItem[] }

export const PAINEL_NAV_GROUPS: PainelNavGroup[] = [
  {
    label: 'Minha loja',
    items: [
      { href: '/painel?tab=perfil', icon: '✏️', label: 'Perfil e fotos' },
      { href: '/painel?tab=avaliacoes', icon: '⭐', label: 'Avaliações' },
      { href: '/painel?tab=destaques', icon: '🌟', label: 'Destaques' },
      { href: '/painel?tab=banners', icon: '🖼️', label: 'Banners' },
    ],
  },
  {
    label: 'Cardápio & vendas',
    items: [
      { href: '/painel/catalogo', icon: '📋', label: 'Cardápio', lockKey: 'loja' },
      { href: '/painel/compartilhar', icon: '⚙️', label: 'Configurar cardápio', lockKey: 'loja' },
      { href: '/painel/pedidos', icon: '🧾', label: 'Pedidos', lockKey: 'loja' },
      { href: '/painel/interesses', icon: '🔔', label: 'Interesses', lockKey: 'loja' },
      { href: '/painel/cozinha', icon: '🍳', label: 'Cozinha', lockKey: 'loja' },
      { href: '/painel/relatorios', icon: '📈', label: 'Relatórios', lockKey: 'loja' },
    ],
  },
  {
    label: 'Entrega',
    items: [
      { href: '/painel/entrega', icon: '🏍️', label: 'Entrega', lockKey: 'entrega' },
      { href: '/painel/motoboys', icon: '🏍️', label: 'Meus motoboys', lockKey: 'loja' },
    ],
  },
  {
    label: 'Relacionamento',
    items: [
      { href: '/painel/mensagens', icon: '💬', label: 'Mensagens', lockKey: 'crm' },
      { href: '/painel/clientes', icon: '👥', label: 'Clientes', lockKey: 'crm' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/painel?tab=cupons', icon: '🎟️', label: 'Cupons' },
      { href: '/painel?tab=promocoes', icon: '🏷️', label: 'Promoções' },
      { href: '/painel?tab=plano', icon: '💳', label: 'Plano' },
    ],
  },
]

export type PainelNavCompanyFlags = {
  loja_digital_enabled: boolean
  crm_whatsapp_enabled: boolean
  entrega_enabled: boolean
}

export function isPainelNavItemLocked(item: PainelNavItem, flags: PainelNavCompanyFlags): boolean {
  if (!item.lockKey) return false
  if (item.lockKey === 'loja') return !flags.loja_digital_enabled
  if (item.lockKey === 'crm') return !flags.crm_whatsapp_enabled
  return !flags.entrega_enabled
}
