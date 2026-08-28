'use client'

import { useEffect, useRef } from 'react'

// Navegação única do "Modo Empresa" — desktop (sidebar agrupada) e mobile
// (barra de abas fixa + tela /painel/mais). Substitui o antigo CrmShell e a
// sidebar interna de /painel, que eram dois sistemas de menu separados.
export type EmpresaNavKey =
  | 'dashboard' | 'perfil' | 'avaliacoes' | 'destaques' | 'banners'
  | 'compartilhar' | 'catalogo' | 'pedidos' | 'cozinha' | 'entrega' | 'mensagens' | 'clientes'
  | 'interesses' | 'cupons' | 'promocoes' | 'plano'
  | 'pessoal-perfil' | 'pessoal-favoritos' | 'pessoal-avaliacoes' | 'pessoal-pedidos' | 'pessoal-anuncios' | 'pessoal-cupons'

type Company = { id: string; name: string; slug?: string }

const TITLES: Record<EmpresaNavKey, string> = {
  dashboard: 'Visão geral', perfil: 'Perfil e fotos', avaliacoes: 'Avaliações', destaques: 'Destaques',
  banners: 'Banners', compartilhar: 'Compartilhar cardápio', catalogo: 'Catálogo', pedidos: 'Pedidos',
  cozinha: 'Cozinha', entrega: 'Entrega', mensagens: 'Mensagens', clientes: 'Clientes', interesses: 'Interesses', cupons: 'Cupons', promocoes: 'Promoções', plano: 'Plano',
  'pessoal-perfil': 'Meu perfil', 'pessoal-favoritos': 'Favoritos', 'pessoal-avaliacoes': 'Minhas avaliações',
  'pessoal-pedidos': 'Meus pedidos', 'pessoal-anuncios': 'Meus anúncios', 'pessoal-cupons': 'Meus cupons',
}

// Item de sidebar que sabe ficar "trancado": função sem o módulo ativo não
// some (ESPECIFICACAO.md — "esconder economiza pixel e perde venda"), fica
// apagada com cadeado e o clique leva direto pra venda do plano.
function NavItem({ href, active, locked, badge, children }: { href: string; active: boolean; locked?: boolean; badge?: number; children: React.ReactNode }) {
  if (locked) {
    return (
      <a href="/painel?tab=plano" className="es-item es-item-locked">
        🔒 {children}
      </a>
    )
  }
  return (
    <a href={href} className={`es-item ${active ? 'on' : ''}`}>
      {children}{!!badge && <span className="es-item-badge">{badge}</span>}
    </a>
  )
}

export default function EmpresaShell({
  active, companyName, companySlug, lojaDigitalEnabled, crmEnabled, entregaEnabled,
  avaliacoesBadge, mensagensBadge, companies, onSwitchCompany, children,
}: {
  active: EmpresaNavKey
  companyName?: string
  companySlug?: string
  lojaDigitalEnabled?: boolean
  crmEnabled?: boolean
  entregaEnabled?: boolean
  avaliacoesBadge?: number
  mensagensBadge?: number
  companies?: Company[]
  onSwitchCompany?: (c: Company) => void
  children: React.ReactNode
}) {
  const initials = (companyName || '').trim().slice(0, 2).toUpperCase() || 'ST'
  const isPessoal = active.startsWith('pessoal-')

  // Mede a altura REAL da barra fixa (varia por aparelho — home indicator do
  // iPhone, gesto do Android, 74px era só um chute que sobrava/faltava
  // dependendo do device) e publica numa CSS var pro resto da página
  // reservar exatamente esse espaço, sem faixa em branco nem sobreposição.
  const tabbarRef = useRef<HTMLElement>(null)
  const topbarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const cleanups: (() => void)[] = []
    ;[{ ref: tabbarRef, varName: '--es-tabbar-h' }, { ref: topbarRef, varName: '--es-topbar-h' }].forEach(({ ref, varName }) => {
      const el = ref.current
      if (!el) return
      const update = () => {
        if (el.offsetHeight > 0) document.documentElement.style.setProperty(varName, `${el.offsetHeight}px`)
      }
      update()
      const ro = new ResizeObserver(update)
      ro.observe(el)
      window.addEventListener('orientationchange', update)
      cleanups.push(() => { ro.disconnect(); window.removeEventListener('orientationchange', update) })
    })
    return () => cleanups.forEach(fn => fn())
  }, [])

  // Abas do rodapé mobile: se a loja tem cardápio digital/CRM, mostra os
  // atalhos operacionais; senão mostra os itens mais úteis do plano simples.
  // Em página pessoal (dentro do painel), mostra atalhos pessoais.
  const mobileTabs: { key: EmpresaNavKey; href: string; ico: string; lbl: string; badge?: number }[] = isPessoal
    ? [
        { key: 'pessoal-perfil', href: '/painel/pessoal', ico: '👤', lbl: 'Perfil' },
        { key: 'pessoal-favoritos', href: '/painel/pessoal?tab=favoritos', ico: '❤️', lbl: 'Favoritos' },
        { key: 'pessoal-pedidos', href: '/painel/pessoal?tab=pedidos', ico: '🧾', lbl: 'Pedidos' },
      ]
    : crmEnabled
    ? [
        { key: 'dashboard', href: '/painel', ico: '🏠', lbl: 'Início' },
        { key: 'pedidos', href: '/painel/pedidos', ico: '🧾', lbl: 'Pedidos' },
        { key: 'mensagens', href: '/painel/mensagens', ico: '💬', lbl: 'Mensagens', badge: mensagensBadge },
        { key: 'catalogo', href: '/painel/catalogo', ico: '📋', lbl: 'Catálogo' },
      ]
    : [
        { key: 'dashboard', href: '/painel', ico: '🏠', lbl: 'Início' },
        { key: 'avaliacoes', href: '/painel?tab=avaliacoes', ico: '⭐', lbl: 'Avaliações', badge: avaliacoesBadge },
        { key: 'cupons', href: '/painel?tab=cupons', ico: '🎟️', lbl: 'Cupons' },
      ]
  const mobileTabKeys = mobileTabs.map(t => t.key)
  const maisActive = !mobileTabKeys.includes(active)

  return (
    <div className="es-shell">
      <style>{`
        .es-shell{display:flex;min-height:100vh;background:var(--concrete);}
        .es-sidebar{width:246px;background:var(--ink);flex-shrink:0;display:none;flex-direction:column;position:sticky;top:0;height:100vh;}
        @media(min-width:768px){.es-sidebar{display:flex;}}
        .es-logo{padding:22px 20px 16px;border-bottom:1px solid #222;}
        .es-logo-txt{font-family:'Anton',sans-serif;font-size:19px;color:#fff;letter-spacing:1px;text-transform:uppercase;}
        .es-logo-txt span{color:var(--sign);}
        .es-switch-list{margin-top:6px;background:var(--ink-2);border-radius:8px;overflow:hidden;}
        .es-switch-item{padding:7px 10px;font-size:11.5px;color:#999;cursor:pointer;border-top:1px solid #222;}
        .es-switch-item:first-child{border-top:none;}
        .es-switch-item.on{color:var(--sign);font-weight:700;}
        .es-idswitcher{display:flex;flex-direction:column;gap:6px;margin-top:14px;}
        .es-idcard{display:flex;align-items:center;gap:9px;background:var(--ink-2);border-radius:10px;padding:9px 10px;text-decoration:none;border:1.5px solid transparent;}
        .es-idcard.on{border-color:var(--sign);}
        .es-idico{width:26px;height:26px;border-radius:7px;background:#333;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex:none;}
        .es-idcard.on .es-idico{background:var(--sign);color:var(--ink);}
        .es-idname{color:#fff;font-size:12px;font-weight:700;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;}
        .es-idtag{margin-left:auto;font-size:9px;font-weight:800;color:var(--sign);flex:none;}
        .es-nav{padding:14px 0;flex:1;overflow-y:auto;}
        .es-group-lbl{font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.35);padding:16px 20px 8px;}
        .es-group-lbl:first-child{padding-top:4px;}
        .es-item{display:flex;align-items:center;gap:10px;padding:10px 20px;color:#999;font-size:13px;font-weight:500;border-left:3px solid transparent;text-decoration:none;font-family:'Archivo',sans-serif;}
        .es-item:hover{background:var(--ink-2);color:#fff;}
        .es-item.on{background:var(--ink-2);color:var(--sign);border-left-color:var(--sign);font-weight:700;}
        .es-item-locked{color:rgba(255,255,255,.35);}
        .es-item-locked:hover{color:rgba(255,255,255,.6);background:var(--ink-2);}
        .es-item-badge{margin-left:auto;background:var(--sign);color:var(--ink);font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:8px;}
        .es-footer{padding:14px 20px;border-top:1px solid #222;display:flex;align-items:center;justify-content:space-between;gap:8px;}
        .es-btn{display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;font-weight:700;font-family:'Archivo',sans-serif;border-radius:10px;border:none;cursor:pointer;min-width:0;white-space:nowrap;}
        .es-btn-secondary{background:var(--ink-2);color:#fff;border:1px solid #333;padding:10px 14px;font-size:12px;}
        .es-btn-secondary:hover{border-color:var(--sign);color:var(--sign);}
        .es-btn-small{background:none;color:#888;padding:5px 8px;font-size:11px;font-weight:600;flex:none;}
        .es-btn-small:hover{color:var(--alert);}

        .es-main{flex:1;overflow-x:hidden;display:flex;flex-direction:column;min-width:0;}
        .es-topbar{background:#fff;border-bottom:1px solid #EDE8E0;padding:16px 32px;display:none;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;}
        @media(min-width:768px){.es-topbar{display:flex;}}
        .es-topbar-title{font-family:'Anton',sans-serif;font-size:20px;color:var(--ink);letter-spacing:1px;text-transform:uppercase;}
        .es-content{flex:1;min-width:0;}
        @media(max-width:767px){.es-content{padding-bottom:var(--es-tabbar-h, 74px);}}

        .es-tabbar{position:fixed;left:0;right:0;bottom:0;background:var(--ink);display:flex;align-items:center;z-index:9999;padding:6px 4px env(safe-area-inset-bottom);}
        @media(min-width:768px){.es-tabbar{display:none;}}
        .es-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px 0 8px;position:relative;text-decoration:none;}
        .es-tab-ico{font-size:20px;line-height:1;}
        .es-tab-lbl{font-size:9.5px;font-weight:600;font-family:'Archivo',sans-serif;color:rgba(255,255,255,.55);}
        .es-tab.on .es-tab-lbl{color:var(--sign);font-weight:700;}
        .es-tab-dot{position:absolute;top:2px;right:calc(50% - 15px);width:7px;height:7px;background:#E24B4A;border-radius:50%;border:1.5px solid var(--ink);}
      `}</style>

      <aside className="es-sidebar">
        <div className="es-logo">
          <div className="es-logo-txt">TRINDADE <span>EMPRESA</span></div>
          <div className="es-idswitcher">
            <a href="/painel/pessoal" className={`es-idcard ${isPessoal ? 'on' : ''}`}>
              <span className="es-idico">👤</span>
              <span className="es-idname">Pessoal</span>
              {isPessoal && <span className="es-idtag">● aqui</span>}
            </a>
            {companyName && (
              <a href="/painel" className={`es-idcard ${!isPessoal ? 'on' : ''}`}>
                <span className="es-idico">{initials}</span>
                <span className="es-idname">{companyName}</span>
                {!isPessoal && <span className="es-idtag">● aqui</span>}
              </a>
            )}
          </div>
          {!isPessoal && companies && companies.length > 1 && (
            <div className="es-switch-list">
              {companies.map(c => (
                <div key={c.id} className={`es-switch-item ${c.name === companyName ? 'on' : ''}`} onClick={() => onSwitchCompany?.(c)}>{c.name}</div>
              ))}
            </div>
          )}
        </div>
        <nav className="es-nav">
          {isPessoal ? (
            <>
              <div className="es-group-lbl">Minha conta</div>
              <NavItem href="/painel/pessoal" active={active === 'pessoal-perfil'}>👤 Meu perfil</NavItem>
              <NavItem href="/painel/pessoal?tab=favoritos" active={active === 'pessoal-favoritos'}>❤️ Favoritos</NavItem>
              <NavItem href="/painel/pessoal?tab=avaliacoes" active={active === 'pessoal-avaliacoes'}>⭐ Minhas avaliações</NavItem>
              <NavItem href="/painel/pessoal?tab=pedidos" active={active === 'pessoal-pedidos'}>🧾 Meus pedidos</NavItem>

              <div className="es-group-lbl">Meus anúncios</div>
              <NavItem href="/painel/pessoal?tab=anuncios" active={active === 'pessoal-anuncios'}>📋 Desapega, vagas, imóveis</NavItem>

              <div className="es-group-lbl">Vantagens</div>
              <NavItem href="/painel/pessoal?tab=cupons" active={active === 'pessoal-cupons'}>🎟️ Meus cupons</NavItem>
            </>
          ) : (
            <>
              <a href="/painel" className={`es-item ${active === 'dashboard' ? 'on' : ''}`}>📊 Visão geral</a>

              {/* Agrupado por frequência de uso, não por assunto —
                  ESPECIFICACAO.md §4.3. Função sem módulo ativo não some: fica
                  com cadeado e leva pra tela de venda do plano — esconder
                  economiza pixel e perde venda. */}
              <div className="es-group-lbl">Todo dia</div>
              <NavItem href="/painel/pedidos" active={active === 'pedidos'} locked={!lojaDigitalEnabled}>🧾 Pedidos</NavItem>
              <NavItem href="/painel/interesses" active={active === 'interesses'} locked={!lojaDigitalEnabled}>🔔 Interesses</NavItem>
              <NavItem href="/painel/mensagens" active={active === 'mensagens'} locked={!crmEnabled} badge={mensagensBadge}>💬 Mensagens</NavItem>
              <NavItem href="/atendimento" active={false} locked={!crmEnabled}>🎧 Modo Atendimento</NavItem>
              <NavItem href="/painel/cozinha" active={active === 'cozinha'} locked={!lojaDigitalEnabled}>🍳 Cozinha</NavItem>

              <div className="es-group-lbl">Minha loja</div>
              <NavItem href="/painel/catalogo" active={active === 'catalogo'} locked={!lojaDigitalEnabled}>📋 Catálogo</NavItem>
              <NavItem href="/painel?tab=perfil" active={active === 'perfil'}>✏️ Perfil e fotos</NavItem>
              {companySlug && <NavItem href={`/empresa/${companySlug}`} active={false}>🔗 Página da loja</NavItem>}
              <NavItem href="/painel/compartilhar" active={active === 'compartilhar'} locked={!lojaDigitalEnabled}>🔗 Compartilhar cardápio</NavItem>
              <NavItem href="/painel/entrega" active={active === 'entrega'} locked={!entregaEnabled}>🏍️ Entrega e retirada</NavItem>

              <div className="es-group-lbl">Clientes</div>
              <NavItem href="/painel/clientes" active={active === 'clientes'} locked={!crmEnabled}>👥 CRM</NavItem>
              <NavItem href="/painel?tab=avaliacoes" active={active === 'avaliacoes'} badge={avaliacoesBadge}>⭐ Avaliações</NavItem>

              <div className="es-group-lbl">Crescer</div>
              <NavItem href="/painel?tab=cupons" active={active === 'cupons'}>🎟️ Cupons</NavItem>
              <NavItem href="/painel?tab=destaques" active={active === 'destaques'}>🌟 Destaques</NavItem>
              <NavItem href="/painel?tab=banners" active={active === 'banners'}>🖼️ Banners</NavItem>

              <div className="es-group-lbl">Conta</div>
              <NavItem href="/painel?tab=plano" active={active === 'plano'}>💳 Plano e pagamento</NavItem>
            </>
          )}
        </nav>
        <div className="es-footer">
          <a className="es-btn es-btn-secondary" href="/">🏠 Home</a>
          <a className="es-btn es-btn-small" href="/sair">🚪 Sair</a>
        </div>
      </aside>

      <div className="es-main">
        <div className="es-topbar" ref={topbarRef}><span className="es-topbar-title">{TITLES[active]}</span></div>
        <div className="es-content">{children}</div>
      </div>

      <nav className="es-tabbar" ref={tabbarRef}>
        {mobileTabs.map(t => (
          <a key={t.key} href={t.href} className={`es-tab ${active === t.key ? 'on' : ''}`}>
            <span className="es-tab-ico">{t.ico}</span>
            <span className="es-tab-lbl">{t.lbl}</span>
            {!!t.badge && <span className="es-tab-dot" />}
          </a>
        ))}
        <a href="/painel/mais" className={`es-tab ${maisActive ? 'on' : ''}`}>
          <span className="es-tab-ico">☰</span>
          <span className="es-tab-lbl">Mais</span>
        </a>
      </nav>
    </div>
  )
}
