import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import LoginScreen from './src/screens/LoginScreen'
import HomeScreen from './src/screens/HomeScreen'
import { loadToken, clearToken } from './src/auth'
import { getPainel, Motoboy } from './src/api'
import { colors } from './src/theme'

export default function App() {
  const [checking, setChecking] = useState(true)
  const [motoboy, setMotoboy] = useState<Motoboy | null>(null)

  useEffect(() => {
    (async () => {
      const token = await loadToken()
      if (!token) { setChecking(false); return }
      try {
        // Token salvo de uma sessão anterior — confirma que ainda é
        // válido buscando os dados do painel, em vez de só assumir.
        const data = await getPainel()
        setMotoboy({ id: data.motoboy.id, name: data.motoboy.name, phone: data.motoboy.phone, status: data.motoboy.status })
      } catch {
        await clearToken()
      } finally {
        setChecking(false)
      }
    })()
  }, [])

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    )
  }

  return (
    <>
      <StatusBar style="dark" />
      {motoboy ? (
        <HomeScreen motoboy={motoboy} onLogout={() => setMotoboy(null)} />
      ) : (
        <LoginScreen onLogin={setMotoboy} />
      )}
    </>
  )
}
