import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, Linking, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, radius } from '../theme'
import { pedirLocalizacao, StatusLocalizacao } from '../localizacao'

type Props = { status: StatusLocalizacao; onChange: (s: StatusLocalizacao) => void }

// Tela obrigatória (nov/2026): sem a localização "o tempo todo" o motoboy não
// recebe corrida. O Android não deixa o app se conceder essa permissão sozinho
// — a partir do Android 11 só dá pra abrir a tela de ajustes do app, onde o
// motoboy marca "Permitir o tempo todo". Esta tela explica o porquê (exigência
// do Google Play) e leva direto pro lugar certo.
export default function LocalizacaoScreen({ status, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const jaTemPrimeiroPlano = status.primeiroPlano

  async function permitir() {
    setBusy(true)
    try {
      const r = await pedirLocalizacao()
      onChange(r)
      // Se o sistema não mostrou caixa nova (negado antes), manda pros ajustes.
      if (!r.segundoPlano) Linking.openSettings().catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.card}>
        <Text style={s.emoji}>📍</Text>
        <Text style={s.titulo}>Localização durante a corrida</Text>
        <Text style={s.txt}>
          Para receber corridas, o Trindade Online precisa da sua localização <Text style={s.b}>mesmo com o app fechado ou com o Google Maps aberto</Text>.
        </Text>
        <Text style={s.txt}>
          Ela só é usada <Text style={s.b}>durante uma corrida aceita</Text>, para a loja e o cliente acompanharem a entrega. Quando você entrega, o compartilhamento para.
        </Text>

        <View style={s.passo}>
          <Text style={s.passoTit}>Como liberar</Text>
          <Text style={s.passoTxt}>1. Toque em “Permitir localização”.</Text>
          <Text style={s.passoTxt}>2. Se abrir os ajustes, escolha <Text style={s.b}>Localização → Permitir o tempo todo</Text>.</Text>
          <Text style={s.passoTxt}>3. Volte para o app.</Text>
        </View>

        {jaTemPrimeiroPlano && (
          <Text style={s.aviso}>⚠️ Falta só marcar “Permitir o tempo todo”. “Somente com o app em uso” não funciona com o Maps aberto.</Text>
        )}

        <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={permitir} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={s.btnTxt}>Permitir localização</Text>}
        </Pressable>
        <Pressable onPress={() => Linking.openSettings().catch(() => {})}>
          <Text style={s.link}>Abrir ajustes do app</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  emoji: { fontSize: 38, textAlign: 'center' },
  titulo: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  txt: { fontSize: 14.5, color: colors.ink, lineHeight: 21 },
  b: { fontWeight: '800' },
  passo: { backgroundColor: colors.paper, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  passoTit: { fontWeight: '800', color: colors.ink, marginBottom: 2 },
  passoTxt: { fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  aviso: { fontSize: 13, color: colors.goldDark, fontWeight: '700' },
  btn: { backgroundColor: colors.gold, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
  btnTxt: { fontWeight: '800', fontSize: 15.5, color: colors.ink },
  link: { textAlign: 'center', color: colors.goldDark, fontWeight: '700', paddingVertical: spacing.sm },
})
