// Alerta de pedido novo — a partir de set/2026 toca o som exclusivo do
// Trindade Online (gravado pelo Ricardo) em vez do bip sintetizado. Usa o
// MESMO AudioContext já destravado pro bip antigo, em vez de um <audio>
// separado — evita reabrir o problema de autoplay bloqueado sem gesto do
// usuário (ver histórico abaixo), já que decodeAudioData/AudioBufferSourceNode
// rodam por dentro desse contexto que já sabemos que funciona.
//
// AudioContext único e reaproveitado (não um novo por som) — celular
// (Safari/Chrome Android) só libera áudio depois de um gesto do usuário na
// página, e um contexto criado "do nada" dentro do callback do realtime
// (pedido chegando via WebSocket, sem gesto nenhum) nasce suspenso e nunca
// toca som. unlockAudio() é chamado no primeiro toque/clique na tela do
// painel (ver src/app/painel/layout.tsx) pra destravar esse mesmo contexto
// antes do primeiro pedido chegar — achado real do Ricardo testando no
// celular da Vivi, set/2026: chegou pedido, não fez barulho nenhum.
const SOUND_URL = '/sounds/pedido-novo.mp3'

let ctx: AudioContext | null = null
function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    return ctx
  } catch { return null }
}

// iPhone resolve o desbloqueio do AudioContext (o problema descrito acima),
// mas mesmo destravado o som continua mudo se o interruptor físico lateral
// (campainha/silencioso) estiver no modo mudo — o Safari trata áudio via Web
// Audio como categoria "ambiente" por padrão, que respeita esse interruptor.
// A AudioSession API (Safari 17+) deixa marcar explicitamente como
// "playback" — mesma categoria que apps de música usam pra tocar mesmo com o
// aparelho no silencioso. Sem efeito em navegadores que não suportam
// (Android, Safari mais antigo).
function setPlaybackAudioSession() {
  try {
    const session = (navigator as any).audioSession
    if (session) session.type = 'playback'
  } catch {}
}

// Busca e decodifica o mp3 uma vez só, reaproveita depois — chamado tanto no
// unlockAudio() (pra já estar pronto quando o primeiro pedido chegar) quanto
// no beep() em si (cobre quem entrou na tela sem passar pelo unlock, embora
// nesse caso o autoplay ainda dependa de já ter havido algum gesto antes).
let bufferPromise: Promise<AudioBuffer | null> | null = null
function loadBuffer(c: AudioContext): Promise<AudioBuffer | null> {
  if (!bufferPromise) {
    bufferPromise = fetch(SOUND_URL)
      .then(res => res.arrayBuffer())
      .then(data => c.decodeAudioData(data))
      .catch(() => null)
  }
  return bufferPromise
}

export function unlockAudio() {
  setPlaybackAudioSession()
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  loadBuffer(c)
}

// Sintetizado — só entra se o mp3 falhar ao carregar (offline, arquivo
// sumiu etc.). Era o som padrão antes de set/2026: onda quadrada, 2 toques
// em par, "ding-ding" de campainha de balcão.
function playFallback(c: AudioContext) {
  const master = c.createGain()
  master.gain.value = 0.55
  master.connect(c.destination)

  function note(freq: number, start: number, dur: number) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    osc.connect(g); g.connect(master)
    const t0 = c.currentTime + start
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(1, t0 + 0.012)
    g.gain.linearRampToValueAtTime(0, t0 + dur)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  const NOTE_A = 987.77, NOTE_B = 1318.51
  ;[[NOTE_A, 0], [NOTE_B, 0.15], [NOTE_A, 0.5], [NOTE_B, 0.65]].forEach(([freq, t]) => note(freq, t, 0.14))
}

export function beep() {
  try {
    setPlaybackAudioSession()
    const c = getCtx()
    if (!c) return
    if (c.state === 'suspended') c.resume().catch(() => {})
    loadBuffer(c).then(buffer => {
      if (!buffer) { playFallback(c); return }
      const src = c.createBufferSource()
      src.buffer = buffer
      const gain = c.createGain()
      gain.gain.value = 0.9
      src.connect(gain); gain.connect(c.destination)
      src.start()
    })
  } catch {}
}
