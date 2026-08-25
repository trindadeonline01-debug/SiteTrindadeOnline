'use client'

import { useEffect, useRef } from 'react'

// Navegação única do "Modo Empresa" — desktop (sidebar agrupada) e mobile
// (barra de abas fixa + tela /painel/mais). Substitui o antigo CrmShell e a
// sidebar interna de /painel, que eram dois sistemas de menu separados.
export type EmpresaNavKey =
  | 'dashboard' | 'perfil' | 'avaliacoes' | 'destaques' | 'banners'
  | 'compartilhar' | 'catalogo' | 'pedidos' | 'cozinha' | 'entrega' | 'mensagens' | 'clientes'
  | 'cupons' | 'promocoes' | 'plano'

type Company = { id: string; name: string; slug?: string }

const TITLES: Record<EmpresaNavKey, string> = {
  dashboard: 'Dashboard', perfil: 'Perfil e fotos', avaliacoes: 'Avaliações', destaques: 'Destaques',
  banners: 'Banners', compartilhar: 'Compartilhar cardápio', catalogo: 'Catálogo', pedidos: 'Pedidos',
  cozinha: 'Cozinha', entrega: 'Entrega', mensagens: 'Mensagens', clientes: 'Clientes', cupons: 'Cupons', promocoes: 'Promoções', plano: 'Plano',
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
  const mobileTabs: { key: EmpresaNavKey; href: string; ico: string; lbl: string; badge?: number }[] = crmEnabled
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
        { key: 'promocoes', href: '/painel?tab=promocoes', ico: '🏷️', lbl: 'Promoções' },
      ]
  const mobileTabKeys = mobileTabs.map(t => t.key)
  const maisActive = !mobileTabKeys.includes(active)

  return (
    <div className="es-shell">
      <style>{`
        .es-shell{display:flex;min-height:100vh;background:#F7F5F0;}
        .es-sidebar{width:246px;background:#111;flex-shrink:0;display:none;flex-direction:column;position:sticky;top:0;height:100vh;}
        @media(min-width:768px){.es-sidebar{display:flex;}}
        .es-logo{padding:22px 20px 16px;border-bottom:1px solid #222;}
        .es-logo-txt{font-family:'Bebas Neue',sans-serif;font-size:19px;color:#fff;letter-spacing:1.5px;}
        .es-logo-txt span{color:#C9951A;}
        .es-company{display:flex;align-items:center;gap:10px;margin-top:14px;background:#1A1A1A;border-radius:10px;padding:9px 10px;}
        .es-company-avatar{width:30px;height:30px;border-radius:8px;background:#C9951A;color:#1A1610;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex:none;}
        .es-company-name{color:#fff;font-size:12px;font-weight:700;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;}
        .es-company-switch{color:rgba(255,255,255,.4);font-size:10px;margin-top:1px;cursor:pointer;}
        .es-switch-list{margin-top:6px;background:#1A1A1A;border-radius:8px;overflow:hidden;}
        .es-switch-item{padding:7px 10px;font-size:11.5px;color:#999;cursor:pointer;border-top:1px solid #222;}
        .es-switch-item:first-child{border-top:none;}
        .es-switch-item.on{color:#C9951A;font-weight:700;}
        .es-nav{padding:14px 0;flex:1;overflow-y:auto;}
        .es-group-lbl{font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.35);padding:16px 20px 8px;}
        .es-group-lbl:first-child{padding-top:4px;}
        .es-item{display:flex;align-items:center;gap:10px;padding:10px 20px;color:#999;font-size:13px;font-weight:500;border-left:3px solid transparent;text-decoration:none;}
        .es-item:hover{background:#1A1A1A;color:#fff;}
        .es-item.on{background:#1A1A1A;color:#C9951A;border-left-color:#C9951A;font-weight:700;}
        .es-item-badge{margin-left:auto;background:#C9951A;color:#1A1610;font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:8px;}
        .es-footer{padding:14px 20px;border-top:1px solid #222;display:flex;flex-direction:column;gap:10px;}
        .es-footer a{color:#999;text-decoration:none;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;}
        .es-footer a:hover{color:#C9951A;}

        .es-main{flex:1;overflow-x:hidden;display:flex;flex-direction:column;min-width:0;}
        .es-topbar{background:#fff;border-bottom:1px solid #EDE8E0;padding:16px 32px;display:none;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;}
        @media(min-width:768px){.es-topbar{display:flex;}}
        .es-topbar-title{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#111;letter-spacing:1px;}
        .es-content{flex:1;min-width:0;}
        @media(max-width:767px){.es-content{padding-bottom:var(--es-tabbar-h, 74px);}}

        .es-tabbar{position:fixed;left:0;right:0;bottom:0;background:#111;display:flex;align-items:center;z-index:9999;padding:6px 4px env(safe-area-inset-bottom);}
        @media(min-width:768px){.es-tabbar{display:none;}}
        .es-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px 0 8px;position:relative;text-decoration:none;}
        .es-tab-ico{font-size:20px;line-height:1;}
        .es-tab-lbl{font-size:9.5px;font-weight:600;font-family:'Inter',sans-serif;color:rgba(255,255,255,.55);}
        .es-tab.on .es-tab-lbl{color:#C9951A;font-weight:700;}
        .es-tab-dot{position:absolute;top:2px;right:calc(50% - 15px);width:7px;height:7px;background:#E24B4A;border-radius:50%;border:1.5px solid #111;}
      `}</style>

      <aside className="es-sidebar">
        <div className="es-logo">
          <div className="es-logo-txt">TRINDADE <span>EMPRESA</span></div>
          {companyName && (
            <div className="es-company">
              <div className="es-company-avatar">{initials}</div>
              <div className="es-company-name">{companyName}</div>
            </div>
          )}
          {companies && companies.length > 1 && (
            <div className="es-switch-list">
              {companies.map(c => (
                <div key={c.id} className={`es-switch-item ${c.name === companyName ? 'on' : ''}`} onClick={() => onSwitchCompany?.(c)}>{c.name}</div>
              ))}
            </div>
          )}
        </div>
        <nav className="es-nav">
          <div className="es-group-lbl">Minha loja</div>
          <a href="/painel" className={`es-item ${active === 'dashboard' ? 'on' : ''}`}>📊 Dashboard</a>
          <a href="/painel?tab=perfil" className={`es-item ${active === 'perfil' ? 'on' : ''}`}>✏️ Perfil e fotos</a>
          <a href="/painel?tab=avaliacoes" className={`es-item ${active === 'avaliacoes' ? 'on' : ''}`}>
            ⭐ Avaliações{!!avaliacoesBadge && <span className="es-item-badge">{avaliacoesBadge}</span>}
          </a>
          <a href="/painel?tab=destaques" className={`es-item ${active === 'destaques' ? 'on' : ''}`}>🌟 Destaques</a>
          <a href="/painel?tab=banners" className={`es-item ${active === 'banners' ? 'on' : ''}`}>🖼️ Banners</a>

          {lojaDigitalEnabled && (
            <>
              <div className="es-group-lbl">Cardápio &amp; vendas</div>
              <a href="/painel/compartilhar" className={`es-item ${active === 'compartilhar' ? 'on' : ''}`}>🔗 Compartilhar cardápio</a>
              <a href="/painel/catalogo" className={`es-item ${active === 'catalogo' ? 'on' : ''}`}>📋 Catálogo</a>
              <a href="/painel/pedidos" className={`es-item ${active === 'pedidos' ? 'on' : ''}`}>🧾 Pedidos</a>
              <a href="/painel/cozinha" className={`es-item ${active === 'cozinha' ? 'on' : ''}`}>🍳 Cozinha</a>
            </>
          )}
          {entregaEnabled && (
            <>
              <div className="es-group-lbl">Entrega</div>
              <a href="/painel/entrega" className={`es-item ${active === 'entrega' ? 'on' : ''}`}>🏍️ Entrega</a>
            </>
          )}
          {crmEnabled && (
            <>
              <div className="es-group-lbl">Relacionamento</div>
              <a href="/painel/mensagens" className={`es-item ${active === 'mensagens' ? 'on' : ''}`}>
                💬 Mensagens{!!mensagensBadge && <span className="es-item-badge">{mensagensBadge}</span>}
              </a>
              <a href="/painel/clientes" className={`es-item ${active === 'clientes' ? 'on' : ''}`}>👥 Clientes</a>
            </>
          )}

          <div className="es-group-lbl">Marketing &amp; conta</div>
          <a href="/painel?tab=cupons" className={`es-item ${active === 'cupons' ? 'on' : ''}`}>🎟️ Cupons</a>
          <a href="/painel?tab=promocoes" className={`es-item ${active === 'promocoes' ? 'on' : ''}`}>🏷️ Promoções</a>
          <a href="/painel?tab=plano" className={`es-item ${active === 'plano' ? 'on' : ''}`}>💳 Plano</a>
        </nav>
        <div className="es-footer">
          {companySlug && <a href={`/empresa/${companySlug}`}>↗ Ver site</a>}
          <a href="/">🧭 Modo Explorar</a>
          <a href="/sair">🚪 Sair</a>
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
