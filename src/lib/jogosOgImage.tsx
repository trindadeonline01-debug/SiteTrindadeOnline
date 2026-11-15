import { ImageResponse } from 'next/og'

export const jogosOgSize = { width: 1200, height: 630 }

// Prévia do link de jogos no WhatsApp (15/nov/2026): em vez da imagem genérica do site, mostra o nome da loja,
// um pedaço de caça-palavras e um cartão de pergunta do quiz — a pessoa entende na hora que é um jogo.
// Sem emoji nem foto (o gerador não depende de baixar nada).
const GRADE = ['QUIZXP', 'AJOGOR', 'TEMPOE', 'BLOKRM', 'PEIXIO', 'SORTEN']
// células da palavra "JOGO" (linha 1, colunas 1-4) e "QUIZ" (linha 0, colunas 0-3)
const MARCADAS = new Set(['0,0', '0,1', '0,2', '0,3', '1,1', '1,2', '1,3', '1,4'])

// Dois temas: 'escuro' (link "enquanto espera", só diversão) e 'ouro' (link do cashback — mais chamativo).
export function jogosOgImage(loja: string, chamada: string, sub: string, tema: 'escuro' | 'ouro' = 'escuro') {
  const ouro = tema === 'ouro'
  const fundo = ouro ? 'linear-gradient(135deg, #FFD54A 0%, #F2A900 55%, #C9951A 100%)' : 'linear-gradient(135deg, #1A0F00 0%, #111111 70%)'
  const texto = ouro ? '#111111' : '#F0EDE8'
  const destaque = ouro ? '#7A2E00' : '#FFC531'
  const nome = loja.trim().length > 26 ? loja.trim().slice(0, 25) + '…' : loja.trim()
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: fundo, color: texto, padding: 64 }}>
        <div style={{ width: 560, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>TRINDADE</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: destaque, marginLeft: 8 }}>ONLINE</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignSelf: 'flex-start', background: ouro ? '#111' : '#C9951A', color: ouro ? '#FFC531' : '#111', fontSize: 26, fontWeight: 800, padding: '8px 18px', borderRadius: 999, letterSpacing: 2 }}>{ouro ? 'CASHBACK' : 'JOGOS'}</div>
            <div style={{ display: 'flex', fontSize: 62, fontWeight: 800, lineHeight: 1.1, marginTop: 22, maxWidth: 540 }}>{chamada}</div>
            <div style={{ display: 'flex', fontSize: 28, color: destaque, marginTop: 18, maxWidth: 500 }}>{sub}</div>
          </div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700 }}>{nome}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: '#1E1E1E', border: ouro ? '4px solid #111' : '2px solid #3A3A3A', borderRadius: 24, padding: 18, boxShadow: ouro ? '0 16px 40px rgba(0,0,0,.35)' : 'none' }}>
            {GRADE.map((linha, r) => (
              <div key={r} style={{ display: 'flex' }}>
                {linha.split('').map((ch, c) => {
                  const on = MARCADAS.has(`${r},${c}`)
                  return <div key={c} style={{ width: 62, height: 56, margin: 2, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 800, background: on ? (ouro ? '#FFC531' : '#C9951A') : '#2A2A2A', color: on ? '#111' : '#BDB7AC' }}>{ch}</div>
                })}
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', left: 10, bottom: 6, display: 'flex', flexDirection: 'column', background: '#F0EDE8', color: '#111', borderRadius: 18, padding: '16px 20px', width: 290, boxShadow: '0 12px 30px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', fontSize: 18, fontWeight: 800, color: '#8A6410' }}>QUIZ · PERGUNTA 1</div>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, marginTop: 6 }}>Quantas patas tem um caranguejo?</div>
            <div style={{ display: 'flex', marginTop: 10 }}>
              {['8', '10', '6'].map((o, i) => <div key={o} style={{ display: 'flex', fontSize: 20, fontWeight: 800, padding: '6px 16px', marginRight: 8, borderRadius: 10, background: i === 1 ? '#16A34A' : '#E5E2DC', color: i === 1 ? '#fff' : '#111' }}>{o}</div>)}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...jogosOgSize }
  )
}

// Prévia do link do CASHBACK (15/nov/2026, Ricardo: "cashback remete a ganhar e a dinheiro"): fundo verde-dinheiro,
// moedas de R$ douradas e o "até X%" grande. O jogo aparece só como apoio (Quiz/Caça-Palavras).
function Moeda({ d, x, y, rot = 0 }: { d: number; x: number; y: number; rot?: number }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: d, height: d, borderRadius: d, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFE48A 0%, #F5B800 50%, #B8860B 100%)', border: `${Math.round(d / 18)}px solid #8A6410`, boxShadow: '0 14px 30px rgba(0,0,0,.35)', transform: `rotate(${rot}deg)` }}>
      <div style={{ width: d * 0.74, height: d * 0.74, borderRadius: d, border: `${Math.max(3, Math.round(d / 30))}px solid rgba(138,100,16,.55)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(d * 0.34), fontWeight: 800, color: '#7A4E00' }}>R$</div>
    </div>
  )
}

export function cashbackOgImage(loja: string, maxPct: number) {
  const nome = loja.trim().length > 26 ? loja.trim().slice(0, 25) + '…' : loja.trim()
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: 'radial-gradient(circle at 75% 45%, #1FA35C 0%, #0B6B3A 45%, #04391F 100%)', color: '#FFFFFF', padding: 64, position: 'relative' }}>
        <div style={{ width: 600, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>TRINDADE</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#FFD54A', marginLeft: 8 }}>ONLINE</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#D9F99D' }}>Jogue e ganhe</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 4 }}>
              <span style={{ fontSize: 44, fontWeight: 800, color: '#FFD54A', marginBottom: 22, marginRight: 10 }}>até</span>
              <span style={{ fontSize: 150, fontWeight: 800, color: '#FFD54A', lineHeight: 1 }}>{maxPct}%</span>
            </div>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, marginTop: 4 }}>de volta no seu pedido</div>
            <div style={{ display: 'flex', fontSize: 26, color: '#BBF7D0', marginTop: 16 }}>Quiz ou Caça-Palavras · cai na hora no seu saldo</div>
          </div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700 }}>{nome}</div>
        </div>
        <Moeda d={250} x={800} y={150} rot={-12} />
        <Moeda d={170} x={700} y={330} rot={10} />
        <Moeda d={130} x={990} y={380} rot={-4} />
        <Moeda d={90} x={1010} y={70} rot={14} />
        <div style={{ position: 'absolute', right: 64, bottom: 54, display: 'flex', background: '#FFFFFF', color: '#0B6B3A', fontSize: 24, fontWeight: 800, padding: '10px 20px', borderRadius: 999 }}>VALE A 1ª JOGADA</div>
      </div>
    ),
    { ...jogosOgSize }
  )
}
