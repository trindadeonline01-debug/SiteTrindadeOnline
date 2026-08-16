'use client'

type NavId = 'inicio' | 'pedidos' | 'cozinha' | 'catalogo'

const NAV_ITEMS: { id: NavId; href: string; ico: string; lbl: string }[] = [
  { id: 'inicio', href: '/painel/crm', ico: '🏠', lbl: 'Início' },
  { id: 'pedidos', href: '/painel/crm/pedidos', ico: '🧾', lbl: 'Pedidos' },
  { id: 'cozinha', href: '/painel/crm/cozinha', ico: '🍳', lbl: 'Cozinha' },
  { id: 'catalogo', href: '/painel/crm/catalogo', ico: '📋', lbl: 'Catálogo' },
]

export default function CrmShell({ active, companyName, children }: { active: NavId; companyName?: string; children: React.ReactNode }) {
  const title = NAV_ITEMS.find(n => n.id === active)?.lbl || ''
  return (
    <div className="crm-shell">
      <style>{`
        .crm-shell{display:flex;min-height:100vh;background:#F7F5F0;}
        .crm-sidebar{width:220px;background:#111;flex-shrink:0;display:none;flex-direction:column;position:sticky;top:0;height:100vh;}
        @media(min-width:768px){.crm-sidebar{display:flex;}}
        .crm-sb-logo{padding:24px 20px 16px;border-bottom:1px solid #222;}
        .crm-sb-logo-txt{font-family:'Bebas Neue',sans-serif;font-size:19px;color:#fff;letter-spacing:1.5px;}
        .crm-sb-logo-txt span{color:#C9951A;}
        .crm-sb-empresa{font-family:'Bebas Neue',sans-serif;font-size:13px;color:#C9951A;letter-spacing:1px;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .crm-sb-nav{padding:12px 0;flex:1;}
        .crm-sb-item{display:flex;align-items:center;gap:10px;padding:12px 20px;cursor:pointer;transition:all .15s;color:#888;font-size:13px;font-weight:500;border-left:3px solid transparent;text-decoration:none;}
        .crm-sb-item:hover{background:#1A1A1A;color:#fff;}
        .crm-sb-item.on{background:#1A1A1A;color:#C9951A;border-left-color:#C9951A;}
        .crm-sb-footer{padding:16px 20px;border-top:1px solid #222;}
        .crm-sb-footer a{font-size:12px;color:#888;text-decoration:none;display:flex;align-items:center;gap:6px;font-weight:600;}
        .crm-sb-footer a:hover{color:#C9951A;}
        .crm-main{flex:1;overflow-x:hidden;display:flex;flex-direction:column;min-width:0;}
        .crm-topbar{background:#fff;border-bottom:1px solid #EDE8E0;padding:16px 32px;display:none;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;}
        @media(min-width:768px){.crm-topbar{display:flex;}}
        .crm-topbar-title{font-family:'Bebas Neue',sans-serif;font-size:20px;color:#111;letter-spacing:1px;}
      `}</style>
      <aside className="crm-sidebar">
        <div className="crm-sb-logo">
          <div className="crm-sb-logo-txt">TRINDADE <span>CRM</span></div>
          {companyName && <div className="crm-sb-empresa">{companyName}</div>}
        </div>
        <nav className="crm-sb-nav">
          {NAV_ITEMS.map(n => (
            <a key={n.id} href={n.href} className={`crm-sb-item ${active === n.id ? 'on' : ''}`}>
              <span>{n.ico}</span><span>{n.lbl}</span>
            </a>
          ))}
        </nav>
        <div className="crm-sb-footer"><a href="/painel">‹ Voltar ao Painel</a></div>
      </aside>
      <div className="crm-main">
        <div className="crm-topbar"><span className="crm-topbar-title">{title}</span></div>
        {children}
      </div>
    </div>
  )
}
