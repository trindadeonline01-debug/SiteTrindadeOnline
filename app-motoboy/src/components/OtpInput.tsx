import { useRef } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { colors, spacing, radius } from '../theme'

// Campo de código em caixinhas separadas, estilo iFood/99 (pedido do
// Ricardo, out/2026 — o campo de texto corrido antes era largo, fino e
// alinhado à esquerda, nada parecido com o que ele queria). Um TextInput
// invisível por cima captura o teclado numérico; as caixinhas embaixo são
// só a representação visual do valor dele.
type Props = { length?: number; value: string; onChangeText: (t: string) => void; autoFocus?: boolean }

export default function OtpInput({ length = 6, value, onChangeText, autoFocus }: Props) {
  const inputRef = useRef<TextInput>(null)
  const digits = value.split('')

  return (
    <Pressable style={s.wrap} onPress={() => inputRef.current?.focus()}>
      {Array.from({ length }).map((_, i) => (
        <View key={i} style={[s.box, digits[i] != null && s.boxFilled, value.length === i && s.boxActive]}>
          <Text style={s.digit}>{digits[i] ?? '—'}</Text>
        </View>
      ))}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={t => onChangeText(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        style={s.hiddenInput}
        caretHidden
      />
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, position: 'relative' },
  box: { width: 44, height: 54, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  boxFilled: { borderColor: colors.gold },
  boxActive: { borderColor: colors.goldDark, borderWidth: 2 },
  digit: { fontSize: 22, fontWeight: '800', color: colors.ink },
  hiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },
})
