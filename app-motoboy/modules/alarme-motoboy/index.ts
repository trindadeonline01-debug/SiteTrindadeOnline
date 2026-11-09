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

// ---- Configuração dos alertas (tela Perfil → "Alertas de corrida") ----
// Cada item devolve true quando está OK. Em build antigo sem o módulo nativo
// tudo conta como OK (não mostra aviso falso).
function seguro(fn: () => unknown, padrao = true): boolean {
  try { return Native ? !!fn() : padrao } catch { return padrao }
}
export function notificacoesLigadas(): boolean { return seguro(() => Native.notificationsEnabled()) }
export function abrirAjusteNotificacoes(): void { try { Native?.openNotificationSettings() } catch {} }
export function podeTelaCheia(): boolean { return seguro(() => Native.canUseFullScreenIntent()) }
export function abrirAjusteTelaCheia(): void { try { Native?.openFullScreenSettings() } catch {} }
export function semEconomiaBateria(): boolean { return seguro(() => Native.ignoringBatteryOptimizations()) }
export function abrirAjusteBateria(): void { try { Native?.openBatterySettings() } catch {} }

export type StatusAlertas = { notificacoes: boolean; sobrepor: boolean; telaCheia: boolean; bateria: boolean; tudoOk: boolean }
export function statusAlertas(): StatusAlertas {
  const notificacoes = notificacoesLigadas()
  const sobrepor = podeSobrepor()
  const telaCheia = podeTelaCheia()
  const bateria = semEconomiaBateria()
  return { notificacoes, sobrepor, telaCheia, bateria, tudoOk: notificacoes && sobrepor && telaCheia && bateria }
}
