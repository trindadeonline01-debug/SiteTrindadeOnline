import AsyncStorage from '@react-native-async-storage/async-storage'

// Mesma ideia do localStorage do painel web (TOKEN_KEY em
// src/app/motoboy/painel/page.tsx) — token opaco guardado no aparelho,
// resolvido server-side via motoboySession.ts. Não é Supabase Auth.
const TOKEN_KEY = 'motoboy_session_token'

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token)
}

export async function loadToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY)
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY)
}
