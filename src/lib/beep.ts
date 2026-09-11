// Alerta de pedido novo — o beep antigo (um sine bem baixinho, gain 0.12)
// passava despercebido na correria da cozinha. Onda quadrada (mais "elétrica"/
// alarme que sine) + volume bem mais alto + 2 toques em par, repetidos, pra
// ficar com cara de campainha de pedido chegando, não de notificação discreta.
//
// AudioContext único e reaproveitado (não um novo por beep) — celular
// (Safari/Chrome Android) só libera áudio depois de um gesto do usuário na
// página, e um contexto criado "do nada" dentro do callback do realtime
// (pedido chegando via WebSocket, sem gesto nenhum) nasce suspenso e nunca
// toca som. unlockAudio() é chamado no primeiro toque/clique na tela do
// painel (ver src/app/painel/layout.tsx) pra destravar esse mesmo contexto
// antes do primeiro pedido chegar — achado real do Ricardo testando no
// celular da Vivi, set/2026: chegou pedido, não fez barulho nenhum.
let ctx: AudioContext | null = null
function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    return ctx
  } catch { return null }
}

// iPhone resolve o desbloqueio do AudioContext (o problema descrito acima),
// mas mesmo destravado o som de onda quadrada continua mudo se o
// interruptor físico lateral (campainha/silencioso) estiver no modo mudo —
// o Safari trata som sintetizado via Web Audio como categoria "ambiente" por
// padrão, que respeita esse interruptor. A AudioSession API (Safari 17+)
// deixa marcar explicitamente como "playback" — mesma categoria que apps
// de música usam pra tocar mesmo com o aparelho no silencioso. Sem efeito
// em navegadores que não suportam (Android, Safari mais antigo).
function setPlaybackAudioSession() {
  try {
    const session = (navigator as any).audioSession
    if (session) session.type = 'playback'
  } catch {}
}

export function unlockAudio() {
  setPlaybackAudioSession()
  const c = getCtx()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
}

export function beep() {
  try {
    setPlaybackAudioSession()
    const c = getCtx()
    if (!c) return
    if (c.state === 'suspended') c.resume().catch(() => {})
    const master = c.createGain()
    master.gain.value = 0.55
    master.connect(c.destination)

    function note(freq: number, start: number, dur: number) {
      const osc = c!.createOscillator()
      const g = c!.createGain()
      osc.type = 'square'
      osc.frequency.value = freq
      osc.connect(g); g.connect(master)
      const t0 = c!.currentTime + start
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(1, t0 + 0.012)
      g.gain.linearRampToValueAtTime(0, t0 + dur)
      osc.start(t0)
      osc.stop(t0 + dur + 0.02)
    }

    // B5 → E6, duas vezes — padrão de "ding-ding" de campainha de balcão
    const NOTE_A = 987.77, NOTE_B = 1318.51
    ;[[NOTE_A, 0], [NOTE_B, 0.15], [NOTE_A, 0.5], [NOTE_B, 0.65]].forEach(([freq, t]) => note(freq, t, 0.14))
  } catch {}
}
