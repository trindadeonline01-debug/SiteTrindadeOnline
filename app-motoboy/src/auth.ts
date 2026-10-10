import AsyncStorage from '@react-native-async-storage/async-storage'

// Mesma ideia do localStorage do painel web (TOKEN_KEY em
// src/app/motoboy/painel/page.tsx) — token opaco guardado no aparelho,
// resolvido server-side via motoboySession.ts. Não é Supabase Auth.
const TOKEN_KEY = 'motoboy_session_token'
// Preferência de login com digital (pedido do Ricardo, out/2026) — só guarda
// SE o motoboy ativou, no aparelho dele. A autenticação de verdade continua
// sendo o token acima; a digital é só um cadeado local pra liberar esse
// token já salvo, sem precisar digitar senha/código toda vez que abre o app.
const BIOMETRIC_KEY = 'motoboy_biometric_enabled'

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token)
}

export async function loadToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY)
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY)
  await AsyncStorage.removeItem(BIOMETRIC_KEY)
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BIOMETRIC_KEY)) === 'true'
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  if (on) await AsyncStorage.setItem(BIOMETRIC_KEY, 'true')
  else await AsyncStorage.removeItem(BIOMETRIC_KEY)
}
