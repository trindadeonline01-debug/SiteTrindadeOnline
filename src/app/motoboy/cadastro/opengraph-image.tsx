import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Seja motoboy parceiro — Trindade Entrega'

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#111111' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', background: 'linear-gradient(135deg, #1A0F00 0%, #111111 65%)' }} />

        {/* círculo dourado decorativo, atrás do emoji */}
        <div style={{ position: 'absolute', top: -120, right: -80, width: 460, height: 460, borderRadius: '50%', display: 'flex', background: 'radial-gradient(circle, rgba(255,197,49,0.28) 0%, rgba(255,197,49,0) 70%)' }} />

        <div style={{ position: 'absolute', top: 48, left: 64, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#F0EDE8' }}>TRINDADE</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#FFC531', marginLeft: 8 }}>ONLINE</span>
        </div>

        <div style={{ position: 'absolute', top: 150, right: 84, display: 'flex', width: 220, height: 220, borderRadius: '50%', background: '#FFC531', alignItems: 'center', justifyContent: 'center', fontSize: 120, boxShadow: '0 20px 50px rgba(0,0,0,0.4)' }}>
          🏍️
        </div>

        <div style={{ position: 'absolute', left: 64, top: 210, display: 'flex', flexDirection: 'column', maxWidth: 760 }}>
          <span style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: '#FFC531', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>Trindade Entrega</span>
          <span style={{ display: 'flex', fontSize: 68, fontWeight: 800, color: '#F0EDE8', lineHeight: 1.08 }}>Seja motoboy</span>
          <span style={{ display: 'flex', fontSize: 68, fontWeight: 800, color: '#F0EDE8', lineHeight: 1.08 }}>parceiro</span>
        </div>

        <div style={{ position: 'absolute', left: 64, bottom: 56, display: 'flex', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '12px 22px' }}>
            <span style={{ fontSize: 22 }}>💰</span>
            <span style={{ fontSize: 22, color: '#F0EDE8', fontWeight: 600 }}>Pagamento por corrida</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '12px 22px' }}>
            <span style={{ fontSize: 22 }}>⚡</span>
            <span style={{ fontSize: 22, color: '#F0EDE8', fontWeight: 600 }}>Cadastro pelo WhatsApp</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
