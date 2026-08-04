import { ImageResponse } from 'next/og'

export const ogSize = { width: 1200, height: 630 }
export const ogContentType = 'image/png'

// Imagem de preview (WhatsApp/redes sociais) padrão pras seções do site —
// cada rota só passa titulo/subtitulo/emoji, mantendo a identidade visual
// (fundo escuro + dourado) igual em todas
export function sectionOgImage(title: string, subtitle: string, emoji?: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #1A0F00 0%, #111111 100%)',
          padding: 80,
          color: '#F0EDE8',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 34, fontWeight: 700, color: '#F0EDE8' }}>TRINDADE</span>
          <span style={{ fontSize: 34, fontWeight: 700, color: '#C9951A', marginLeft: 10 }}>ONLINE</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {emoji && <div style={{ display: 'flex', fontSize: 90, marginBottom: 16 }}>{emoji}</div>}
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, lineHeight: 1.15, maxWidth: 1000 }}>{title}</div>
          <div style={{ display: 'flex', fontSize: 32, color: '#C9951A', marginTop: 22, maxWidth: 940 }}>{subtitle}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#F0EDE8', opacity: 0.7 }}>trindadeonline.com.br</div>
      </div>
    ),
    { ...ogSize }
  )
}
