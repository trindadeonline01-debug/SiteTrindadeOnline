import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
// SafeAreaView do pacote 'react-native' não respeita a barra de navegação
// do Android (só funciona de verdade no iOS) — achado real do Ricardo,
// out/2026: a barra de baixo do app (Corridas/Ganhos/Perfil) ficava embaixo
// dos botões de navegação do sistema, sem dar pra clicar. Essa versão (do
// pacote safe-area-context) calcula a área segura nos dois sistemas.
import { SafeAreaView } from 'react-native-safe-area-context'
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
        {/* Nome à esquerda, botão de online/offline à direita — ordem
            trocada a pedido do Ricardo, out/2026 (estava ao contrário). */}
        <Text style={s.headerName}>{motoboy.name}</Text>
        <Pressable style={[s.onlinePill, online ? s.onlineOn : s.onlineOff]} onPress={toggleOnline}>
          <Text style={[s.onlineTxt, online && { color: colors.good }]}>{online ? '🟢 Online' : '⚫ Offline'}</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'corridas' && <CorridasScreen />}
        {tab === 'ganhos' && <GanhosScreen />}
        {tab === 'perfil' && <PerfilScreen motoboy={motoboy} onLogout={onLogout} />}
      </View>

      <View style={s.bottomNav}>
        <Pressable style={s.navItem} onPress={() => setTab('corridas')}><Text style={[s.navTxt, tab === 'corridas' && s.navOn]}>🏠 Corridas</Text></Pressable>
        <Pressable style={s.navItem} onPress={() => setTab('ganhos')}><Text style={[s.navTxt, tab === 'ganhos' && s.navOn]}>💰 Ganhos</Text></Pressable>
        <Pressable style={s.navItem} onPress={() => setTab('perfil')}><Text style={[s.navTxt, tab === 'perfil' && s.navOn]}>👤 Perfil</Text></Pressable>
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
  // Área de toque ~35% mais alta que antes (era só o texto solto, sem
  // padding — ficava estreito demais pra clicar, achado do Ricardo,
  // out/2026). Padding mora no item, não no container, pra cada aba ter
  // sua própria área de toque cheia em vez de dividir um espaço comum.
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  navTxt: { fontSize: 12, color: colors.muted },
  navOn: { color: colors.goldDark, fontWeight: '800' },
})
