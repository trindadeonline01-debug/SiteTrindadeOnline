import { View, Text, Pressable, StyleSheet } from 'react-native'
import { colors } from '../theme'
import Icon from './Icon'

// Teclado numérico próprio (nada de teclado do sistema cobrindo a tela).
export default function Keypad({ onDigit, onBackspace, height = 64 }: { onDigit: (d: string) => void; onBackspace: () => void; height?: number }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  return (
    <View style={s.grid}>
      {keys.map(k => (
        <Pressable key={k} style={({ pressed }) => [s.key, { height }, pressed && s.pressed]} onPress={() => onDigit(k)}>
          <Text style={s.keyTxt}>{k}</Text>
        </Pressable>
      ))}
      <View style={s.cell} />
      <Pressable style={({ pressed }) => [s.key, { height }, pressed && s.pressed]} onPress={() => onDigit('0')}>
        <Text style={s.keyTxt}>0</Text>
      </Pressable>
      <Pressable accessibilityLabel="Apagar" style={({ pressed }) => [s.key, s.back, { height }, pressed && s.pressed]} onPress={onBackspace}>
        <Icon name="backspace" size={26} />
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '31.4%' },
  key: { width: '31.4%', borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  back: { backgroundColor: colors.paperDark },
  pressed: { backgroundColor: colors.paperDark },
  keyTxt: { fontSize: 28, fontWeight: '700', color: colors.ink },
})
