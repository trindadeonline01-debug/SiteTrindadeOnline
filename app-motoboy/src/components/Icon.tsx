import Svg, { Path, Circle, Polygon } from 'react-native-svg'

// Ícones de traço (estilo Lucide) usados no redesenho do app (nov/2026).
// Sem emoji: o mesmo desenho aprovado nos mockups.
type Part = { d?: string; c?: [number, number, number]; poly?: string }
const ICONS = {
  bike: [{ c: [6, 19, 2.5] }, { c: [18, 5, 2.5] }, { d: 'M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5' }],
  wallet: [{ d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1' }, { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }],
  user: [{ c: [12, 8, 4] }, { d: 'M4 21a8 8 0 0 1 16 0' }],
  store: [{ d: 'M3 9l1.5-5h15L21 9' }, { d: 'M4 9v11h16V9' }, { d: 'M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0' }, { d: 'M10 20v-6h4v6' }],
  pin: [{ d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z' }, { c: [12, 10, 3] }],
  clock: [{ c: [12, 12, 9] }, { d: 'M12 7v5l3 2' }],
  arrowRight: [{ d: 'M5 12h14M13 6l6 6-6 6' }],
  chevronRight: [{ d: 'm9 6 6 6-6 6' }],
  chevronLeft: [{ d: 'm15 6-6 6 6 6' }],
  navigate: [{ poly: '3 11 22 2 13 21 11 13 3 11' }],
  chat: [{ d: 'M21 11.5a8.4 8.4 0 0 1-12.4 7.3L3 20l1.3-5.4A8.4 8.4 0 1 1 21 11.5Z' }],
  shield: [{ d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z' }, { d: 'm9 12 2 2 4-4' }],
  check: [{ d: 'M20 6 9 17l-5-5' }],
  backspace: [{ d: 'M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z' }, { d: 'm17 9-5 6M12 9l5 6' }],
  home: [{ d: 'M3 10.5 12 3l9 7.5' }, { d: 'M5 9.5V21h14V9.5' }],
  speaker: [{ d: 'M11 5 6 9H2v6h4l5 4V5Z' }, { d: 'M15.5 8.5a5 5 0 0 1 0 7' }, { d: 'M19 5a9 9 0 0 1 0 14' }],
  bell: [{ d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' }, { d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' }],
  lock: [{ d: 'M5 11h14v10H5V11Z' }, { d: 'M8 11V7a4 4 0 0 1 8 0v4' }],
  doc: [{ d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z' }, { d: 'M14 3v5h5' }, { d: 'M9 13h6M9 17h6' }],
  card: [{ d: 'M3 6h18v12H3V6Z' }, { d: 'M3 10h18' }],
  battery: [{ d: 'M3 8h15v8H3V8Z' }, { d: 'M21 11v2' }],
  layers: [{ d: 'm12 3 9 5-9 5-9-5 9-5Z' }, { d: 'm3 13 9 5 9-5' }],
  close: [{ d: 'M6 6l12 12M18 6 6 18' }],
} satisfies Record<string, Part[]>

export type IconName = keyof typeof ICONS

export default function Icon({ name, size = 22, color = '#120F0A', stroke = 2 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  const parts: Part[] = ICONS[name]
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {parts.map((p, i) => p.d ? <Path key={i} d={p.d} /> : p.c ? <Circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.c[2]} /> : <Polygon key={i} points={p.poly} />)}
    </Svg>
  )
}
