// Lista única da navegação do painel usada tanto em /painel/mais (menu
// completo do celular) quanto na gaveta do menu hambúrguer global
// (MobileMenu.tsx) quando o usuário está no modo empresarial — as duas
// telas mostravam listas hardcoded e independentes, e uma ficava
// desatualizada em relação à outra sempre que uma função nova entrava
// (achado real do Ricardo, set/2026: "Meus motoboys" só tinha ido pra
// sidebar desktop). Uma lista só, usada nos dois lugares.
export type PainelNavLockKey = 'loja' | 'crm' | 'entrega'
export type PainelNavItem = {
  href: string; icon: string; label: string; lockKey?: PainelNavLockKey
  // Diferente de lockKey (item aparece travado/cadeado pra todo mundo e
  // vende o plano): isso é pra feature em piloto com 1 cliente só — some de
  // vez de quem não tem a flag, em vez de aparecer cadeado à toa (não é
  // função paga ainda, não faz sentido "vender" ela).
  requiresFlag?: 'atendimentoPilot' | 'vendasPilot'
}
export type PainelNavGroup = { label: string; items: PainelNavItem[] }

// Mesma ordem e mesmos grupos da sidebar preta do desktop (EmpresaShell) —
// agrupado por frequência de uso (ESPECIFICACAO.md §4.3). Mexeu lá, mexe aqui.
export const PAINEL_NAV_GROUPS: PainelNavGroup[] = [
  {
    label: 'Todo dia',
    items: [
      { href: '/painel/pedidos', icon: '🧾', label: 'Pedidos', lockKey: 'loja' },
      { href: '/painel/pdv', icon: '🖥️', label: 'PDV', lockKey: 'loja' },
      { href: '/painel/interesses', icon: '🔔', label: 'Interesses', lockKey: 'loja' },
      { href: '/painel/mensagens', icon: '💬', label: 'Mensagens', lockKey: 'crm' },
      { href: '/atendimento', icon: '🎧', label: 'Modo Atendimento', lockKey: 'crm' },
      { href: '/painel/cozinha', icon: '🍳', label: 'Cozinha', lockKey: 'loja' },
    ],
  },
  {
    label: 'Minha loja',
    items: [
      { href: '/painel/catalogo', icon: '📋', label: 'Cardápio', lockKey: 'loja' },
      { href: '/painel/compartilhar', icon: '⚙️', label: 'Configurar cardápio', lockKey: 'loja' },
      { href: '/painel?tab=perfil', icon: '✏️', label: 'Perfil e fotos' },
      { href: '/painel/entrega', icon: '🏍️', label: 'Entrega e retirada', lockKey: 'entrega' },
      { href: '/painel/motoboys', icon: '🏍️', label: 'Meus motoboys', lockKey: 'loja' },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { href: '/painel/clientes', icon: '👥', label: 'CRM', lockKey: 'crm' },
      { href: '/painel/atendimento', icon: '📊', label: 'Atendimento', requiresFlag: 'atendimentoPilot' },
      { href: '/painel/radar', icon: '📡', label: 'Radar de clientes', requiresFlag: 'vendasPilot' },
      { href: '/painel?tab=avaliacoes', icon: '⭐', label: 'Avaliações' },
    ],
  },
  {
    label: 'Crescer',
    items: [
      { href: '/painel?tab=cupons', icon: '🎟️', label: 'Cupons' },
      { href: '/painel?tab=promocoes', icon: '🏷️', label: 'Promoções' },
      { href: '/painel?tab=destaques', icon: '🌟', label: 'Destaques' },
      { href: '/painel?tab=banners', icon: '🖼️', label: 'Banners' },
    ],
  },
  {
    label: 'Conta',
    items: [
      { href: '/painel?tab=plano', icon: '💳', label: 'Plano e pagamento' },
      { href: '/painel/pagamentos', icon: '🏦', label: 'Pagamentos', lockKey: 'loja' },
    ],
  },
]

export type PainelNavCompanyFlags = {
  loja_digital_enabled: boolean
  crm_whatsapp_enabled: boolean
  entrega_enabled: boolean
  crm_atendimento_pilot?: boolean
  crm_vendas_pilot?: boolean
}

export function isPainelNavItemLocked(item: PainelNavItem, flags: PainelNavCompanyFlags): boolean {
  if (!item.lockKey) return false
  if (item.lockKey === 'loja') return !flags.loja_digital_enabled
  if (item.lockKey === 'crm') return !flags.crm_whatsapp_enabled
  return !flags.entrega_enabled
}

// Pra uso com .filter() antes de mapear os itens de um grupo — item com
// requiresFlag não satisfeito nem aparece (diferente de "locked", que
// aparece apagado com cadeado).
export function isPainelNavItemVisible(item: PainelNavItem, flags: PainelNavCompanyFlags): boolean {
  if (item.requiresFlag === 'atendimentoPilot') return !!flags.crm_atendimento_pilot
  if (item.requiresFlag === 'vendasPilot') return !!flags.crm_vendas_pilot
  return true
}
