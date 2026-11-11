// Lista ÚNICA da navegação do painel, usada nos TRÊS lugares: sidebar preta do
// desktop (EmpresaShell), /painel/mais (☰ Mais do celular) e a gaveta do menu
// hambúrguer global (MobileMenu.tsx). Antes cada um tinha lista própria e uma
// ficava desatualizada em relação às outras sempre que uma função nova entrava
// (achado real do Ricardo, set/2026 e nov/2026: Mesas e "Página da loja" só
// existiam na sidebar). Função nova: entra AQUI e aparece nos três.
export type PainelNavLockKey = 'loja' | 'crm' | 'entrega'
export type PainelNavItem = {
  href: string; icon: string; label: string; lockKey?: PainelNavLockKey
  // Chave da aba ativa na sidebar (EmpresaNavKey) e badge — só a sidebar usa.
  key?: string
  // Link pra fora do painel (página pública da loja): não leva ?empresa= do admin.
  external?: boolean
  // Diferente de lockKey (item aparece travado/cadeado pra todo mundo e
  // vende o plano): isso é pra feature em piloto com 1 cliente só — some de
  // vez de quem não tem a flag, em vez de aparecer cadeado à toa (não é
  // função paga ainda, não faz sentido "vender" ela).
  requiresFlag?: 'atendimentoPilot' | 'vendasPilot' | 'mesas' | 'slug'
}
export type PainelNavGroup = { label: string; items: PainelNavItem[] }

// Mesma ordem e mesmos grupos da sidebar preta do desktop (EmpresaShell) —
// agrupado por frequência de uso (ESPECIFICACAO.md §4.3). Mexeu lá, mexe aqui.
export const PAINEL_NAV_GROUPS: PainelNavGroup[] = [
  {
    label: 'Todo dia',
    items: [
      { href: '/painel/pedidos', key: 'pedidos', icon: '🧾', label: 'Pedidos', lockKey: 'loja' },
      { href: '/painel/pdv', key: 'pdv', icon: '🖥️', label: 'PDV', lockKey: 'loja' },
      { href: '/painel/mesas', key: 'mesas', icon: '🍽️', label: 'Mesas', requiresFlag: 'mesas' },
      { href: '/painel/vendas', key: 'vendas', icon: '📈', label: 'Vendas por canal', lockKey: 'loja' },
      { href: '/painel/cashback', key: 'cashback', icon: '🎁', label: 'Cashback', lockKey: 'loja' },
      { href: '/painel/interesses', key: 'interesses', icon: '🔔', label: 'Interesses', lockKey: 'loja' },
      { href: '/painel/mensagens', key: 'mensagens', icon: '💬', label: 'Mensagens', lockKey: 'crm' },
      { href: '/atendimento', icon: '🎧', label: 'Modo Atendimento', lockKey: 'crm' },
      { href: '/painel/cozinha', key: 'cozinha', icon: '🍳', label: 'Cozinha', lockKey: 'loja' },
    ],
  },
  {
    label: 'Minha loja',
    items: [
      { href: '/painel/catalogo', key: 'catalogo', icon: '📋', label: 'Cardápio', lockKey: 'loja' },
      { href: '/painel/compartilhar', key: 'compartilhar', icon: '⚙️', label: 'Configurar cardápio', lockKey: 'loja' },
      { href: '/painel?tab=perfil', key: 'perfil', icon: '✏️', label: 'Perfil e fotos' },
      { href: '/empresa/:slug', icon: '🔗', label: 'Página da loja', external: true, requiresFlag: 'slug' },
      { href: '/painel/entrega', key: 'entrega', icon: '🏍️', label: 'Entrega e retirada', lockKey: 'entrega' },
      { href: '/painel/motoboys', key: 'motoboys', icon: '🏍️', label: 'Meus motoboys', lockKey: 'loja' },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { href: '/painel/clientes', key: 'clientes', icon: '👥', label: 'CRM', lockKey: 'crm' },
      { href: '/painel/inteligencia', key: 'inteligencia', icon: '🧠', label: 'Inteligência de consumo', lockKey: 'loja' },
      { href: '/painel/atendimento', key: 'atendimento', icon: '📊', label: 'Atendimento', requiresFlag: 'atendimentoPilot' },
      { href: '/painel/radar', key: 'radar', icon: '📡', label: 'Radar de clientes', requiresFlag: 'vendasPilot' },
      { href: '/painel?tab=avaliacoes', key: 'avaliacoes', icon: '⭐', label: 'Avaliações' },
    ],
  },
  {
    label: 'Crescer',
    items: [
      { href: '/painel?tab=cupons', key: 'cupons', icon: '🎟️', label: 'Cupons' },
      { href: '/painel?tab=promocoes', key: 'promocoes', icon: '🏷️', label: 'Promoções' },
      { href: '/painel?tab=destaques', key: 'destaques', icon: '🌟', label: 'Destaques' },
      { href: '/painel?tab=banners', key: 'banners', icon: '🖼️', label: 'Banners' },
    ],
  },
  {
    label: 'Conta',
    items: [
      { href: '/painel?tab=plano', key: 'plano', icon: '💳', label: 'Plano e pagamento' },
      { href: '/painel/pagamentos', key: 'pagamentos', icon: '🏦', label: 'Pagamentos', lockKey: 'loja' },
    ],
  },
]

// Item solto no topo (acima dos grupos), igual na sidebar.
export const PAINEL_NAV_HOME: PainelNavItem = { href: '/painel', key: 'dashboard', icon: '📊', label: 'Visão geral' }

export type PainelNavCompanyFlags = {
  loja_digital_enabled: boolean
  crm_whatsapp_enabled: boolean
  entrega_enabled: boolean
  crm_atendimento_pilot?: boolean
  crm_vendas_pilot?: boolean
  mesas_enabled?: boolean
  slug?: string | null
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
  if (item.requiresFlag === 'mesas') return !!flags.mesas_enabled
  if (item.requiresFlag === 'slug') return !!flags.slug
  return true
}

// href final do item (troca :slug pela loja).
export function painelNavHref(item: PainelNavItem, flags: PainelNavCompanyFlags): string {
  return item.href.replace(':slug', flags.slug || '')
}
