import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native'
import { colors, spacing, radius } from '../theme'
import { setDisponibilidade, Motoboy } from '../api'
import CorridasScreen from './CorridasScreen'
import GanhosScreen from './GanhosScreen'
import PerfilScreen from './PerfilScreen'

type Tab = 'corridas' | 'ganhos' | 'perfil'
type Props = { motoboy: Motoboy; onLogout: () => void }

export default function HomeScreen({ motoboy, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('corridas')
  const [online, setOnline] = useState(false)

  async function toggleOnline() {
    const next = !online
    setOnline(next)
    try { await setDisponibilidade(next) } catch { setOnline(!next) }
  }

  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.header}>
        <Pressable style={[s.onlinePill, online ? s.onlineOn : s.onlineOff]} onPress={toggleOnline}>
          <Text style={[s.onlineTxt, online && { color: colors.good }]}>{online ? '🟢 Online' : '⚫ Offline'}</Text>
        </Pressable>
        <Text style={s.headerName}>{motoboy.name}</Text>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'corridas' && <CorridasScreen />}
        {tab === 'ganhos' && <GanhosScreen />}
        {tab === 'perfil' && <PerfilScreen motoboy={motoboy} onLogout={onLogout} />}
      </View>

      <View style={s.bottomNav}>
        <Pressable onPress={() => setTab('corridas')}><Text style={[s.navTxt, tab === 'corridas' && s.navOn]}>🏠 Corridas</Text></Pressable>
        <Pressable onPress={() => setTab('ganhos')}><Text style={[s.navTxt, tab === 'ganhos' && s.navOn]}>💰 Ganhos</Text></Pressable>
        <Pressable onPress={() => setTab('perfil')}><Text style={[s.navTxt, tab === 'perfil' && s.navOn]}>👤 Perfil</Text></Pressable>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.card },
  onlinePill: { borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1 },
  onlineOn: { backgroundColor: colors.goodBg, borderColor: colors.good },
  onlineOff: { backgroundColor: colors.paperDark, borderColor: colors.line },
  onlineTxt: { fontWeight: '700', fontSize: 12.5, color: colors.muted },
  headerName: { fontWeight: '700', color: colors.ink },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card },
  navTxt: { fontSize: 12, color: colors.muted },
  navOn: { color: colors.goldDark, fontWeight: '800' },
})
