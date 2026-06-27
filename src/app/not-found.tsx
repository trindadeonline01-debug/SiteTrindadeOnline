import Link from 'next/link'

export default function NotFound() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{height:100%;}
        body{font-family:'Inter',sans-serif;background:#111;color:#fff;}

        .topbar{padding:14px 24px;display:flex;align-items:center;border-bottom:0.5px solid #1A1A1A;}
        .logo{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:2px;text-decoration:none;}
        .logo span{color:#C9951A;}

        .content{min-height:calc(100vh - 53px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;text-align:center;}
        .num{font-family:'Bebas Neue',sans-serif;font-size:clamp(80px,15vw,140px);color:#C9951A;letter-spacing:8px;line-height:1;margin-bottom:8px;opacity:.9;}
        .title{font-family:'Bebas Neue',sans-serif;font-size:clamp(20px,3vw,32px);color:#fff;letter-spacing:2px;margin-bottom:12px;}
        .sub{font-size:14px;color:#666;line-height:1.8;max-width:400px;margin:0 auto 28px;}

        .btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:40px;}
        .btn-home{padding:12px 24px;background:#C9951A;color:#fff;border:none;border-radius:11px;font-size:14px;font-weight:700;text-decoration:none;display:inline-block;transition:opacity .15s;}
        .btn-home:hover{opacity:.9;}
        .btn-back{padding:12px 24px;background:transparent;color:#888;border:1px solid #333;border-radius:11px;font-size:14px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif;text-decoration:none;display:inline-block;transition:all .15s;}
        .btn-back:hover{border-color:#666;color:#fff;}

        .suggestions{border-top:0.5px solid #1A1A1A;padding-top:28px;width:100%;max-width:560px;}
        .sug-title{font-family:'Bebas Neue',sans-serif;font-size:11px;color:#333;letter-spacing:1.5px;margin-bottom:14px;}
        .sug-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}
        .sug-chip{padding:7px 14px;border-radius:20px;background:#1A1A1A;color:#666;border:0.5px solid #222;font-size:12px;text-decoration:none;transition:all .15s;display:inline-block;}
        .sug-chip:hover{border-color:#C9951A;color:#C9951A;}
      `}</style>

      <div className="topbar">
        <Link className="logo" href="/">TRINDADE <span>ONLINE</span></Link>
      </div>

      <div className="content">
        <div className="num">404</div>
        <div className="title">PÁGINA NÃO ENCONTRADA</div>
        <div className="sub">
          Essa página não existe ou foi removida.<br/>
          Mas a Trindade está cheia de coisas boas esperando por você!
        </div>

        <div className="btns">
          <Link className="btn-home" href="/">← Voltar ao início</Link>
          <Link className="btn-back" href="javascript:history.back()">Página anterior</Link>
        </div>

        <div className="suggestions">
          <div className="sug-title">EXPLORE A TRINDADE</div>
          <div className="sug-row">
            <Link className="sug-chip" href="/categoria/comercios">🏪 Comércios</Link>
            <Link className="sug-chip" href="/categoria/gastronomia">🍽️ Gastronomia</Link>
            <Link className="sug-chip" href="/desapega">🏷️ Desapega</Link>
            <Link className="sug-chip" href="/empregos">💼 Empregos</Link>
            <Link className="sug-chip" href="/imoveis">🏠 Imóveis</Link>
            <Link className="sug-chip" href="/busca">🔍 Buscar</Link>
          </div>
        </div>
      </div>
    </>
  )
}
