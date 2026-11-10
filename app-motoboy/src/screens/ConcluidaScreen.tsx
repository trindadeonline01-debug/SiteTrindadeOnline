import { View, Text, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '../theme'
import Icon from '../components/Icon'

export type Concluida = { company: string; customerName: string; bairro: string | null; valueLabel: string }
type Props = { dados: Concluida; hoje: string | null; onVoltar: () => void; onGanhos: () => void }

export default function ConcluidaScreen({ dados, hoje, onVoltar, onGanhos }: Props) {
  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.halo}>
        <View style={s.haloRing} />
        <View style={s.circle}><Icon name="check" size={58} stroke={3.2} /></View>
      </View>
      <Text style={s.titulo}>Entrega concluída</Text>
      <Text style={s.label}>VOCÊ GANHOU</Text>
      <Text style={s.valor}>R$ {dados.valueLabel}</Text>

      <View style={s.card}>
        <Row k="Loja" v={dados.company} />
        <Row k="Cliente" v={dados.bairro ? `${dados.customerName} · ${dados.bairro}` : dados.customerName} border={!!hoje} />
        {hoje ? <Row k="Hoje até agora" v={hoje} gold last /> : null}
      </View>

      <View style={s.btns}>
        <Pressable style={s.primary} onPress={onVoltar}><Text style={s.primaryTxt}>Voltar às corridas</Text></Pressable>
        <Pressable style={s.secondary} onPress={onGanhos}><Text style={s.secondaryTxt}>Ver meus ganhos</Text></Pressable>
      </View>
    </SafeAreaView>
  )
}

function Row({ k, v, gold, border = true, last }: { k: string; v: string; gold?: boolean; border?: boolean; last?: boolean }) {
  return (
    <View style={[s.row, border && !last && s.rowBorder]}>
      <Text style={s.rowK}>{k}</Text>
      <Text style={[s.rowV, gold && { color: colors.gold }]} numberOfLines={2}>{v}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: 22, paddingTop: 56, paddingBottom: 14, alignItems: 'center' },
  halo: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  haloRing: { position: 'absolute', width: 144, height: 144, borderRadius: 72, backgroundColor: colors.gold, opacity: 0.14 },
  circle: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  titulo: { marginTop: 30, fontSize: 28, fontWeight: '800', color: '#fff' },
  label: { marginTop: 14, fontSize: 12, letterSpacing: 1.7, color: colors.mutedDark, fontWeight: '600' },
  valor: { fontFamily: fonts.display, fontSize: 112, lineHeight: 116, color: colors.gold },
  card: { marginTop: 22, width: '100%', backgroundColor: colors.ink2, borderRadius: 20, borderWidth: 1, borderColor: colors.inkLine, paddingHorizontal: 18, paddingVertical: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.inkLine },
  rowK: { fontSize: 14, color: colors.mutedDark },
  rowV: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: '#fff' },
  btns: { marginTop: 'auto', width: '100%', gap: 10 },
  primary: { height: 64, borderRadius: 18, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  primaryTxt: { fontSize: 17, fontWeight: '800', color: colors.ink },
  secondary: { height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: '#4A4030', alignItems: 'center', justifyContent: 'center' },
  secondaryTxt: { fontSize: 15, fontWeight: '600', color: '#fff' },
})
