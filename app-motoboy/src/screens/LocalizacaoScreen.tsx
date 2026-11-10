import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, Linking, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, radius } from '../theme'
import { pedirLocalizacao, StatusLocalizacao } from '../localizacao'

type Props = { status: StatusLocalizacao; onChange: (s: StatusLocalizacao) => void }

// Tela obrigatória (nov/2026): sem a localização o motoboy não recebe corrida.
// Basta "Durante o uso do app": o rastreio roda como serviço em primeiro plano
// (notificação fixa "Corrida em andamento"), iniciado com o app aberto, e o
// Android mantém a posição mesmo com o Google Maps por cima. Antes pedíamos
// "o tempo todo", que o app não consegue conceder sozinho e deixava o motoboy
// preso nesta tela (caso real, Samsung, 10/nov).
export default function LocalizacaoScreen({ onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [negou, setNegou] = useState(false)

  async function permitir() {
    setBusy(true)
    try {
      const r = await pedirLocalizacao()
      onChange(r)
      if (!r.primeiroPlano) {
        // Negou ou o sistema não mostrou mais a caixa: só nos ajustes.
        setNegou(true)
        Linking.openSettings().catch(() => {})
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.card}>
        <Text style={s.emoji}>📍</Text>
        <Text style={s.titulo}>Ative a localização</Text>
        <Text style={s.txt}>
          Para receber corridas, o Trindade Entregas precisa da sua localização. Ela só é compartilhada <Text style={s.b}>durante uma corrida aceita</Text>, para a loja e o cliente acompanharem a entrega.
        </Text>

        <View style={s.passo}>
          <Text style={s.passoTit}>Como liberar</Text>
          <Text style={s.passoTxt}>1. Toque em “Permitir localização”.</Text>
          <Text style={s.passoTxt}>2. Na caixa do Android, escolha <Text style={s.b}>“Durante o uso do app”</Text> (ou “Permitir somente com o app em uso”).</Text>
        </View>

        {negou && (
          <View style={s.passo}>
            <Text style={s.passoTit}>Se a caixa não aparecer</Text>
            <Text style={s.passoTxt}>1. Nos ajustes que abriram, toque em <Text style={s.b}>Permissões → Localização</Text>.</Text>
            <Text style={s.passoTxt}>2. Marque <Text style={s.b}>“Permitir somente com o app em uso”</Text> e ative <Text style={s.b}>“Usar localização precisa”</Text>.</Text>
            <Text style={s.passoTxt}>3. Volte para o app — ele libera sozinho.</Text>
          </View>
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
  btn: { backgroundColor: colors.gold, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
  btnTxt: { fontWeight: '800', fontSize: 15.5, color: colors.ink },
  link: { textAlign: 'center', color: colors.goldDark, fontWeight: '700', paddingVertical: spacing.sm },
})
