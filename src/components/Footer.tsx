'use client'
export default function Footer() {
  return (
    <footer style={{background:'#111',borderTop:'2px solid #C9951A',padding:'36px 24px 24px',marginTop:48,display:'none'}} className="site-footer-global">
      <style>{`
        @media(min-width:768px){ .site-footer-global{ display:block !important; } }
        .sfg-inner{max-width:1200px;margin:0 auto;}
        .sfg-top{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:32px;margin-bottom:32px;}
        .sfg-logo{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;text-decoration:none;letter-spacing:2px;display:block;margin-bottom:8px;}
        .sfg-logo span{color:#C9951A;}
        .sfg-desc{font-size:12px;color:#555;line-height:1.6;}
        .sfg-col-title{font-size:10px;font-weight:700;color:#C9951A;letter-spacing:1.5px;margin-bottom:10px;}
        .sfg-link{display:block;font-size:12px;color:#AAA;font-weight:700;text-decoration:none;margin-bottom:8px;}
        .sfg-link:hover{color:#C9951A;}
        .sfg-bottom{border-top:0.5px solid #1A1A1A;padding-top:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;}
        .sfg-copy{font-size:12px;color:#555;}
        .sfg-legal{display:flex;gap:16px;}
        .sfg-legal a{font-size:11px;color:#555;text-decoration:none;}
        .sfg-legal a:hover{color:#C9951A;}
      `}</style>
      <div className="sfg-inner">
        <div className="sfg-top">
          <div>
            <a className="sfg-logo" href="/">TRINDADE <span>ONLINE</span></a>
            <div className="sfg-desc">O portal digital do bairro Trindade em São Gonçalo/RJ. Conectando moradores, comércios e histórias.</div>
          </div>
          <div>
            <div className="sfg-col-title">EXPLORAR</div>
            <a className="sfg-link" href="/categoria/comercios">🏪 Comércios</a>
            <a className="sfg-link" href="/categoria/gastronomia">🍕 Gastronomia</a>
            <a className="sfg-link" href="/categoria/servicos">🔧 Serviços</a>
            <a className="sfg-link" href="/categoria/igrejas">⛪ Igrejas</a>
          </div>
          <div>
            <div className="sfg-col-title">COMUNIDADE</div>
            <a className="sfg-link" href="/desapega">🏷️ Desapega</a>
            <a className="sfg-link" href="/empregos">💼 Empregos</a>
            <a className="sfg-link" href="/imoveis">🏠 Imóveis</a>
            <a className="sfg-link" href="/achados-perdidos">📍 Achados & Perdidos</a>
          </div>
          <div>
            <div className="sfg-col-title">SUA EMPRESA</div>
            <a className="sfg-link" href="/empresa/cadastrar">+ Cadastrar empresa</a>
            <a className="sfg-link" href="/login">Entrar na plataforma</a>
            <a className="sfg-link" href="/cadastro">Criar conta grátis</a>
            <a className="sfg-link" href="/termos">Termos de Uso</a>
          </div>
        </div>
        <div className="sfg-bottom">
          <div className="sfg-copy">© 2026 Trindade Online · Trindade, São Gonçalo/RJ</div>
          <div className="sfg-legal">
            <a href="/termos">Termos</a>
            <a href="/termos">Privacidade</a>
            <a href="/termos">LGPD</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
