// Alerta de pedido novo — o beep antigo (um sine bem baixinho, gain 0.12)
// passava despercebido na correria da cozinha. Onda quadrada (mais "elétrica"/
// alarme que sine) + volume bem mais alto + 2 toques em par, repetidos, pra
// ficar com cara de campainha de pedido chegando, não de notificação discreta.
export function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)

    function note(freq: number, start: number, dur: number) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = freq
      osc.connect(g); g.connect(master)
      const t0 = ctx.currentTime + start
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
