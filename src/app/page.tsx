'use client'

const categories = [
  { emoji: '🏪', name: 'Comércios',          slug: 'comercios'        },
  { emoji: '🔧', name: 'Serviços',           slug: 'servicos'         },
  { emoji: '🍽️', name: 'Gastronomia',        slug: 'gastronomia'      },
  { emoji: '💼', name: 'Empregos',           slug: 'empregos'         },
  { emoji: '🏠', name: 'Imóveis',            slug: 'imoveis'          },
  { emoji: '🏷️', name: 'Desapega',           slug: 'desapega'         },
  { emoji: '🔍', name: 'Achados & Perdidos', slug: 'achados-perdidos' },
  { emoji: '⛪', name: 'Igrejas',            slug: 'igrejas'          },
]

const destaques = [
  { emoji: '🍔', name: 'Chupeta Gourmet',   cat: 'Hambúrguer Artesanal',   stars: '4.8', top: true  },
  { emoji: '🏗️', name: 'Cunha e Velasco',   cat: 'Material de Construção', stars: '4.9', top: true  },
  { emoji: '🐟', name: 'Peixaria Trindade', cat: 'Frutos do Mar',          stars: '4.3', top: false },
  { emoji: '🥐', name: 'Padaria Emanuel',   cat: 'Padaria · Cafeteria',    stars: '4.7', top: false },
  { emoji: '💈', name: 'Barbeiro Guerota',  cat: 'Barbearia',              stars: '4.5', top: false },
  { emoji: '🍰', name: 'Doce Sabor',        cat: 'Confeitaria',            stars: '4.6', top: false },
]

const recentes = [
  { emoji: '🚗', name: 'Jair Suspensão',     cat: 'Mecânico Automotivo',    bairro: 'Trindade' },
  { emoji: '🐾', name: 'Petshop Franciele',  cat: 'Petshop · Banho e Tosa', bairro: 'Trindade' },
  { emoji: '⚡', name: 'Beto Eletricista',   cat: 'Eletricista Automotivo', bairro: 'Trindade' },
  { emoji: '🔑', name: 'Imóveis Trindade',   cat: 'Imobiliária',            bairro: 'Trindade' },
  { emoji: '📚', name: "Daniel's Inglês",    cat: 'Curso de Inglês',        bairro: 'Trindade' },
  { emoji: '🍕', name: 'Esfiharia Trindade', cat: 'Árabe · Esfiha',         bairro: 'Trindade' },
]

export default function Home() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; color: #111; }

        /* ── HEADER ── */
        .site-header {
          background: #fff;
          border-bottom: 1px solid #EDE8E0;
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .header-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 12px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo {
          display: flex;
          align-items: baseline;
          flex-shrink: 0;
          text-decoration: none;
        }
        .logo-guia { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: #111; letter-spacing: 2px; }
        .logo-dot  { font-family: 'Bebas Neue', sans-serif; font-size: 18px; color: #DDD; margin: 0 5px; }
        .logo-tri  { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: #C9951A; letter-spacing: 2px; }

        .search-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #F5F2EC;
          border: 1.5px solid #C9951A;
          border-radius: 30px;
          padding: 9px 16px;
        }
        .search-wrap input {
          flex: 1; border: none; background: transparent;
          font-size: 14px; font-family: 'Inter', sans-serif; color: #222; outline: none;
        }
        .search-wrap input::placeholder { color: #BBB; }
        .search-btn {
          width: 28px; height: 28px; border-radius: 50%;
          background: #C9951A; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }

        /* Ícone pessoa — só mobile */
        .btn-login-icon {
          width: 36px; height: 36px; border-radius: 50%;
          border: 1.5px solid #C9951A; color: #C9951A;
          display: flex; align-items: center; justify-content: center;
          text-decoration: none; flex-shrink: 0; transition: background .15s;
        }
        .btn-login-icon:hover { background: #FEF3E2; }

        /* Botão "Entrar" texto — só desktop */
        .btn-entrar {
          display: none;
          align-items: center; gap: 5px;
          background: transparent; color: #C9951A;
          border: 1.5px solid #C9951A; border-radius: 10px;
          padding: 8px 16px; font-size: 13px; font-weight: 600;
          font-family: 'Inter', sans-serif; cursor: pointer;
          white-space: nowrap; flex-shrink: 0; text-decoration: none;
          transition: background .15s;
        }
        .btn-entrar:hover { background: #FEF3E2; }

        /* Botão "Cadastrar empresa" — só desktop */
        .btn-cadastrar {
          display: none;
          background: #C9951A; color: #fff;
          border: none; border-radius: 10px;
          padding: 9px 16px; font-size: 13px; font-weight: 600;
          font-family: 'Inter', sans-serif; cursor: pointer;
          white-space: nowrap; flex-shrink: 0; text-decoration: none;
          transition: background .15s;
        }
        .btn-cadastrar:hover { background: #B8841A; }

        @media (min-width: 768px) {
          .btn-login-icon { display: none; }
          .btn-entrar     { display: flex; }
          .btn-cadastrar  { display: block; }
        }

        /* ── HERO ── */
        .hero {
          background: linear-gradient(160deg, #fff 0%, #FEF8EC 60%, #FEF3E2 100%);
          padding: 40px 20px 36px;
          text-align: center;
          border-bottom: 1px solid #EDE8E0;
        }
        .hero-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(42px, 6vw, 72px);
          letter-spacing: 4px; line-height: 1;
          margin-bottom: 8px; display: none;
        }
        .hero-title span { color: #C9951A; }
        .hero-sub { font-size: clamp(14px, 2vw, 16px); color: #888; margin-bottom: 24px; display: none; }
        .hero-search {
          max-width: 600px; margin: 0 auto;
          display: flex; align-items: center; gap: 8px;
          background: #fff; border: 2px solid #C9951A; border-radius: 50px;
          padding: 12px 20px; box-shadow: 0 4px 20px rgba(201,149,26,.15);
        }
        .hero-search input {
          flex: 1; border: none; background: transparent;
          font-size: 15px; font-family: 'Inter', sans-serif; color: #222; outline: none;
        }
        .hero-search input::placeholder { color: #BBB; }
        .hero-search-btn {
          background: #C9951A; border: none; border-radius: 50px;
          padding: 8px 20px; color: #fff; font-size: 14px; font-weight: 600;
          font-family: 'Inter', sans-serif; cursor: pointer;
        }
        @media (min-width: 768px) {
          .hero-title { display: block; }
          .hero-sub   { display: block; }
          .hero { padding: 60px 20px 50px; }
        }

        /* ── LAYOUT ── */
        .main-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .sec-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; margin-top: 28px; }
        .sec-title { font-family: 'Bebas Neue', sans-serif; font-size: 13px; color: #999; letter-spacing: 2px; }
        .sec-link { font-size: 12px; color: #C9951A; font-weight: 500; cursor: pointer; text-decoration: none; }
        .sec-link:hover { text-decoration: underline; }
        .divider { height: 1px; background: #F0EDE8; margin: 28px 0 0; }

        /* ── CATEGORIAS ── */
        .cat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        @media (min-width: 1024px) { .cat-grid { grid-template-columns: repeat(8, 1fr); gap: 14px; } }
        .cat-card {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 14px 8px; border-radius: 14px;
          border: 1px solid #EDE8E0; background: #FAFAF8;
          cursor: pointer; transition: all .18s; text-align: center;
        }
        .cat-card:hover { border-color: #C9951A; background: #FEF3E2; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(201,149,26,.15); }
        .cat-emoji { font-size: 28px; line-height: 1; }
        .cat-name  { font-size: 11px; font-weight: 500; color: #444; line-height: 1.3; }
        @media (min-width: 1024px) { .cat-card { padding: 18px 10px; } .cat-emoji { font-size: 32px; } .cat-name { font-size: 12px; } }

        /* ── DESTAQUES ── */
        .dest-grid { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .dest-grid::-webkit-scrollbar { display: none; }
        @media (min-width: 768px)  { .dest-grid { display: grid; grid-template-columns: repeat(3, 1fr); overflow: visible; } }
        @media (min-width: 1024px) { .dest-grid { grid-template-columns: repeat(6, 1fr); } }
        .dest-card {
          flex-shrink: 0; width: 148px; background: #fff;
          border: 0.5px solid #E0DDD8; border-radius: 14px;
          overflow: hidden; cursor: pointer; transition: all .18s;
        }
        .dest-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,.1); border-color: #C9951A; }
        @media (min-width: 768px) { .dest-card { width: auto; } }
        .dest-img { height: 90px; background: #FEF3E2; display: flex; align-items: center; justify-content: center; font-size: 36px; position: relative; }
        .dest-top-badge { position: absolute; top: 7px; right: 7px; background: #C9951A; color: #fff; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 8px; }
        .dest-body  { padding: 10px 11px; }
        .dest-name  { font-size: 12px; font-weight: 600; color: #222; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dest-cat   { font-size: 10px; color: #AAA; margin-bottom: 5px; }
        .dest-stars { font-size: 11px; color: #C9951A; font-weight: 600; }

        /* ── RECENTES ── */
        .rec-grid { display: flex; flex-direction: column; border: 0.5px solid #EDE8E0; border-radius: 14px; overflow: hidden; background: #fff; }
        @media (min-width: 768px)  { .rec-grid { display: grid; grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1024px) { .rec-grid { grid-template-columns: repeat(3, 1fr); } }
        .rec-item { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-bottom: 0.5px solid #F5F2EC; cursor: pointer; transition: background .15s; }
        .rec-item:hover { background: #FAFAF8; }
        .rec-icon { width: 44px; height: 44px; border-radius: 11px; background: #F0EDE8; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; border: 0.5px solid #E0DDD8; }
        .rec-name  { font-size: 13px; font-weight: 600; color: #222; margin-bottom: 2px; }
        .rec-cat   { font-size: 11px; color: #999; margin-bottom: 3px; }
        .rec-new   { font-size: 10px; color: #0F8050; font-weight: 600; }

        /* ── CTA ── */
        .cta-section {
          margin: 36px 0 48px;
          background: linear-gradient(135deg, #1A1A1A, #333);
          border-radius: 20px; padding: 36px 32px;
          display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px;
        }
        @media (min-width: 768px) { .cta-section { flex-direction: row; text-align: left; justify-content: space-between; padding: 36px 48px; } }
        .cta-title { font-family: 'Bebas Neue', sans-serif; font-size: clamp(22px, 3vw, 30px); color: #fff; letter-spacing: 1px; margin-bottom: 6px; }
        .cta-title span { color: #C9951A; }
        .cta-sub  { font-size: 13px; color: #AAA; }
        .cta-btn  { background: #C9951A; color: #fff; border: none; border-radius: 12px; padding: 14px 28px; font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; text-decoration: none; display: inline-block; transition: background .15s; }
        .cta-btn:hover { background: #B8841A; }
        .cta-note { font-size: 11px; color: #888; margin-top: 4px; }

        /* ── FOOTER ── */
        .site-footer { background: #111; color: #888; text-align: center; font-size: 12px; padding: 20px; }
        .site-footer span { color: #C9951A; }
      `}</style>

      {/* HEADER */}
      <header className="site-header">
        <div className="header-inner">
          <a className="logo" href="/">
            <span className="logo-guia">TRINDADE</span>
            <span className="logo-dot">·</span>
            <span className="logo-tri">ONLINE</span>
          </a>

          <div className="search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#AAA" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Empresa, produto, serviço..." />
            <button className="search-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          {/* Ícone pessoa — mobile */}
          <a className="btn-login-icon" href="/login" title="Entrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </a>

          {/* Botão Entrar — desktop */}
          <a className="btn-entrar" href="/login">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Entrar
          </a>

          {/* Botão Cadastrar — desktop */}
          <a className="btn-cadastrar" href="/cadastro?tipo=empresa">+ Cadastrar empresa</a>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <h1 className="hero-title">TRINDADE <span>ONLINE</span></h1>
        <p className="hero-sub">Conectando moradores, comércios e serviços do bairro Trindade</p>
        <div className="hero-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="O que você está procurando?" />
          <button className="hero-search-btn">Buscar</button>
        </div>
      </section>

      {/* CONTEÚDO */}
      <div className="main-wrap">

        <div className="sec-hdr">
          <span className="sec-title">CATEGORIAS</span>
        </div>
        <div className="cat-grid">
          {categories.map(cat => (
            <div key={cat.slug} className="cat-card" onClick={() => window.location.href = `/categoria/${cat.slug}`}>
              <div className="cat-emoji">{cat.emoji}</div>
              <div className="cat-name">{cat.name}</div>
            </div>
          ))}
        </div>

        <div className="divider" />

        <div className="sec-hdr">
          <span className="sec-title">EM DESTAQUE</span>
          <a className="sec-link" href="#">Ver todos</a>
        </div>
        <div className="dest-grid">
          {destaques.map((d, i) => (
            <div key={i} className="dest-card">
              <div className="dest-img">
                {d.emoji}
                {d.top && <div className="dest-top-badge">★ TOP</div>}
              </div>
              <div className="dest-body">
                <div className="dest-name">{d.name}</div>
                <div className="dest-cat">{d.cat}</div>
                <div className="dest-stars">★ {d.stars}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="divider" />

        <div className="sec-hdr">
          <span className="sec-title">RECÉM CADASTRADOS</span>
          <a className="sec-link" href="#">Ver todos</a>
        </div>
        <div className="rec-grid">
          {recentes.map((r, i) => (
            <div key={i} className="rec-item">
              <div className="rec-icon">{r.emoji}</div>
              <div>
                <div className="rec-name">{r.name}</div>
                <div className="rec-cat">{r.cat}</div>
                <div className="rec-new">● Novo · {r.bairro}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="cta-section">
          <div>
            <div className="cta-title">SEU NEGÓCIO NO <span>TRINDADE ONLINE</span></div>
            <div className="cta-sub">Alcance milhares de moradores do bairro todos os dias</div>
            <div className="cta-note">30 dias grátis · Sem cartão de crédito</div>
          </div>
          <a className="cta-btn" href="/cadastro?tipo=empresa">+ Cadastrar minha empresa</a>
        </div>

      </div>

      <footer className="site-footer">
        © 2026 <span>Trindade Online</span> · trindadeonline.com.br
      </footer>

    </>
  )
}