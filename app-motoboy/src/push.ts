import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { salvarPushToken } from './api'

// Push nativo (FCM) do app do motoboy — corrida nova acorda o celular mesmo
// com o app fechado e a tela apagada. Quem toca o alarme em loop é o código
// nativo (modules/alarme-motoboy); aqui só pede permissão e manda o token
// do aparelho pro servidor. Nunca lança exceção: push é reforço, o polling
// da tela continua funcionando sem ele.
export async function registrarPushMotoboy(): Promise<void> {
  try {
    if (Platform.OS !== 'android') return
    const { status: atual } = await Notifications.getPermissionsAsync()
    let status = atual
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status
    if (status !== 'granted') return
    const { data: token } = await Notifications.getDevicePushTokenAsync()
    if (!token) return
    await salvarPushToken(String(token))
  } catch {
    // silencioso de propósito
  }
}
