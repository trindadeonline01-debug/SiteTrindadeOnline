import { Pressable, Text, View, StyleSheet } from 'react-native'
import { colors } from '../theme'

export default function OnlinePill({ online, onPress }: { online: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.pill, online ? s.on : s.off]} onPress={onPress}>
      <View style={[s.dot, { backgroundColor: online ? colors.good : colors.muted }, online && s.halo]} />
      <Text style={[s.txt, { color: online ? colors.goodDark : colors.muted }]}>{online ? 'Online' : 'Offline'}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 1.5, paddingVertical: 9, paddingHorizontal: 14 },
  on: { backgroundColor: colors.goodBg, borderColor: colors.good },
  off: { backgroundColor: colors.paperDark, borderColor: colors.btnBorder },
  dot: { width: 10, height: 10, borderRadius: 5 },
  halo: { borderWidth: 0, shadowColor: colors.good, shadowOpacity: 0.4, shadowRadius: 4, elevation: 2 },
  txt: { fontWeight: '700', fontSize: 14 },
})
