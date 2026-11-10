import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { enviarPosicao, pararPosicao } from './api'

// Rastreio da corrida em segundo plano (nov/2026). O motoboy abre o Google
// Maps por cima do app; sem um serviço em primeiro plano o Android congela o
// app e a posição para. Aqui o GPS roda como serviço do Android (com a
// notificação fixa "Corrida em andamento") e manda a posição ao servidor a
// cada ~10-15 s. Liga ao aceitar a corrida e desliga ao entregar/cancelar —
// fora da corrida o GPS fica desligado (bateria + privacidade).
export const TASK_POSICAO = 'trindade-motoboy-posicao'

// defineTask precisa rodar no carregamento do app (index.ts importa este
// arquivo) — o Android pode acordar a tarefa sem a interface aberta.
if (!TaskManager.isTaskDefined(TASK_POSICAO)) {
  TaskManager.defineTask(TASK_POSICAO, async ({ data, error }) => {
    if (error) return
    const locs = (data as { locations?: Location.LocationObject[] } | undefined)?.locations
    const last = locs && locs[locs.length - 1]
    if (!last) return
    try {
      await enviarPosicao({
        lat: last.coords.latitude, lng: last.coords.longitude,
        accuracy: last.coords.accuracy ?? undefined,
        heading: last.coords.heading ?? undefined,
        speed: last.coords.speed ?? undefined,
      })
    } catch {}
  })
}

export type StatusLocalizacao = {
  /** Permissão "enquanto usa o app" concedida. */
  primeiroPlano: boolean
  /** Permissão "o tempo todo" concedida — a que o rastreio precisa. */
  segundoPlano: boolean
}

export async function statusLocalizacao(): Promise<StatusLocalizacao> {
  try {
    const fg = await Location.getForegroundPermissionsAsync()
    if (!fg.granted) return { primeiroPlano: false, segundoPlano: false }
    const bg = await Location.getBackgroundPermissionsAsync()
    return { primeiroPlano: true, segundoPlano: bg.granted }
  } catch {
    return { primeiroPlano: false, segundoPlano: false }
  }
}

/**
 * Pede a localização. Android não deixa o app se conceder o "o tempo todo":
 * 1º pede "enquanto usa o app" (caixa do sistema); 2º manda pra tela de
 * ajustes do app (Android 11+) onde o motoboy marca "Permitir o tempo todo".
 */
export async function pedirLocalizacao(): Promise<StatusLocalizacao> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync()
    if (!fg.granted) return { primeiroPlano: false, segundoPlano: false }
    const bg = await Location.requestBackgroundPermissionsAsync()
    return { primeiroPlano: true, segundoPlano: bg.granted }
  } catch {
    return statusLocalizacao()
  }
}

export async function rastreioLigado(): Promise<boolean> {
  try { return await Location.hasStartedLocationUpdatesAsync(TASK_POSICAO) } catch { return false }
}

export async function ligarRastreio(): Promise<void> {
  try {
    if (await rastreioLigado()) return
    const st = await statusLocalizacao()
    if (!st.segundoPlano) return
    await Location.startLocationUpdatesAsync(TASK_POSICAO, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10000,
      distanceInterval: 15,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Corrida em andamento',
        notificationBody: 'Trindade Online está compartilhando sua localização com a loja e o cliente.',
        notificationColor: '#FFC531',
      },
    })
  } catch {}
}

export async function desligarRastreio(): Promise<void> {
  try {
    if (await rastreioLigado()) await Location.stopLocationUpdatesAsync(TASK_POSICAO)
  } catch {}
  try { await pararPosicao() } catch {}
}

// Quando a localização está faltando o app deixa o motoboy offline no servidor
// (não recebe corrida). Esta marca lembra que FOI o app que o deixou offline,
// pra colocá-lo online sozinho quando a permissão voltar — se ele mesmo tinha
// ficado offline por vontade própria, continua offline.
const FORCADO_KEY = 'motoboy_offline_por_localizacao'
export async function marcarOfflineForcado(on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(FORCADO_KEY, '1')
    else await AsyncStorage.removeItem(FORCADO_KEY)
  } catch {}
}
export async function estavaOfflineForcado(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(FORCADO_KEY)) === '1' } catch { return false }
}
