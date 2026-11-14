// "Cara" de cada jogo na página /jogos/<slug>: arte em SVG (quadrado), sem imagem externa.
// Jogo novo: acrescentar o id aqui e em `api/jogos` (lista `jogos`).

function CapaQuiz() {
  return (
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="cq-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#127B9B" /><stop offset="1" stopColor="#082B38" /></linearGradient>
        <radialGradient id="cq-ouro" cx=".35" cy=".3" r=".9"><stop offset="0" stopColor="#FFE79A" /><stop offset=".55" stopColor="#FFC531" /><stop offset="1" stopColor="#B97F06" /></radialGradient>
      </defs>
      <rect width="200" height="200" fill="url(#cq-bg)" />
      <g fill="rgba(255,255,255,.14)"><circle cx="30" cy="40" r="9" /><circle cx="52" cy="22" r="5" /><circle cx="170" cy="120" r="11" /><circle cx="150" cy="150" r="6" /><circle cx="22" cy="110" r="6" /></g>
      <circle cx="100" cy="68" r="52" fill="rgba(255,197,49,.18)" />
      <circle cx="100" cy="68" r="42" fill="url(#cq-ouro)" stroke="#8A5A00" strokeWidth="2" />
      <text x="100" y="92" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="68" fill="#2B1B00">?</text>
      <g fill="#FFE79A"><path d="M160 36l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" /><path d="M40 70l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></g>
      <g transform="translate(150 118) rotate(-12)" fill="rgba(255,255,255,.85)"><path d="M0 0c10-12 26-12 36 0-10 12-26 12-36 0z" /><path d="M34 0l14-9v18z" /><circle cx="9" cy="-2" r="2" fill="#0B3A4D" /></g>
    </svg>
  )
}

const GRADE = ['GRSLE', 'MAUPI', 'DFTCN', 'BEHOZ', 'VXLRA']
function CapaCaca() {
  const dest = new Set(['0,0', '1,1', '2,2', '3,3'])   // GATO na diagonal
  return (
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="cc-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#14876F" /><stop offset="1" stopColor="#082F2D" /></linearGradient></defs>
      <rect width="200" height="200" fill="url(#cc-bg)" />
      <rect x="34" y="12" width="132" height="132" rx="14" fill="rgba(5,29,39,.45)" stroke="rgba(255,255,255,.18)" />
      {GRADE.map((linha, r) => linha.split('').map((ch, c) => {
        const k = `${r},${c}`, ouro = dest.has(k), x = 40 + c * 24, y = 18 + r * 24
        return (
          <g key={k}>
            {ouro && <rect x={x + 1.5} y={y + 1.5} width="21" height="21" rx="6" fill="#FFC531" />}
            <text x={x + 12} y={y + 17} textAnchor="middle" fontFamily="Archivo, system-ui, sans-serif" fontWeight="700" fontSize="14" fill={ouro ? '#2B1B00' : 'rgba(255,255,255,.88)'}>{ch}</text>
          </g>
        )
      }))}
    </svg>
  )
}

export default function CapaJogo({ id }: { id: string }) {
  if (id === 'quiz') return <CapaQuiz />
  if (id === 'caca') return <CapaCaca />
  return (
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="200" height="200" fill="#0E4D64" />
      <text x="100" y="100" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="60" fill="#FFC531">?</text>
    </svg>
  )
}
