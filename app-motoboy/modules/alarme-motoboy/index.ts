import { requireOptionalNativeModule } from 'expo-modules-core'

// Módulo nativo local (só Android). Opcional: num build antigo sem o módulo
// tudo aqui vira no-op em vez de derrubar o app.
const Native = requireOptionalNativeModule('AlarmeMotoboy')

// Para o som em loop e a notificação de tela cheia da corrida nova.
// Chamado quando o app abre e quando a oferta é respondida/vence.
export function pararAlarme(): void {
  try { Native?.stopAlarm() } catch {}
}

// "Sobrepor a outros apps": sem ela o Android não deixa o alarme abrir o
// app por cima do Waze/WhatsApp — só mostra a notificação.
export function podeSobrepor(): boolean {
  try { return Native ? !!Native.canDrawOverlays() : true } catch { return true }
}

export function abrirAjusteSobrepor(): void {
  try { Native?.openOverlaySettings() } catch {}
}
