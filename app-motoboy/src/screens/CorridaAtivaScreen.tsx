import { View, Text, Pressable, StyleSheet, Linking, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '../theme'
import Icon from '../components/Icon'
import { Unit, openMaps, waLink, iniciais } from '../rides'

type Props = { unit: Unit; onCodigo: () => void; onMenu: () => void }

// Tela da corrida em andamento: "indo à loja" (retirar) e "indo ao cliente"
// (entregar) — redesenho aprovado (nov/2026). O mapa embutido fica para uma
// próxima etapa; por enquanto o botão abre o Google Maps na rota certa.
export default function CorridaAtivaScreen({ unit, onCodigo, onMenu }: Props) {
  const loja = unit.kind === 'loja'
  const ride = unit.rides[0]
  const total = unit.rides.reduce((a, r) => a + (parseFloat(String(r.valueLabel).replace('.', '').replace(',', '.')) || 0), 0)
  const endereco = loja ? ride.pickupAddress : ride.dropoffAddress
  const nomeDestino = loja ? unit.company : ride.customerName
  const nPedidos = unit.rides.length

  return (
    <SafeAreaView style={s.wrap} edges={['top', 'bottom']}>
      <View style={s.hero}>
        <View style={s.topRow}>
          <Pressable style={s.menuBtn} onPress={onMenu} accessibilityLabel="Abrir menu">
            <Icon name="chevronLeft" size={16} color="#fff" stroke={2.6} />
            <Text style={s.menuTxt}>Menu</Text>
          </Pressable>
          <View style={s.valor}><Text style={s.valorTxt}>R$ {total.toFixed(2).replace('.', ',')}</Text></View>
        </View>
        <View style={s.heroCenter}>
          <View style={s.heroIcon}><Icon name={loja ? 'store' : 'pin'} size={34} color={colors.ink} stroke={2.2} /></View>
          <Text style={s.heroLabel}>{loja ? 'INDO À LOJA' : 'INDO AO CLIENTE'}</Text>
          <Text style={s.heroDest} numberOfLines={2}>{nomeDestino}</Text>
        </View>
      </View>

      <View style={s.sheet}>
        <View style={s.handle} />
        <ScrollView contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          <View style={s.steps}>
            {loja ? <View style={[s.stepDot, { backgroundColor: colors.gold }]}><Text style={s.stepNum}>1</Text></View>
              : <View style={[s.stepDot, { backgroundColor: colors.ink }]}><Icon name="check" size={16} color={colors.gold} stroke={3} /></View>}
            <Text style={[s.stepTxt, !loja && { color: colors.muted, fontWeight: '700' }]}>{loja ? 'Retirar' : 'Retirado'}</Text>
            <View style={[s.stepLine, !loja && { backgroundColor: colors.gold }]} />
            {loja ? <View style={[s.stepDot, s.stepOff]}><Text style={[s.stepNum, { color: colors.muted, fontWeight: '700' }]}>2</Text></View>
              : <View style={[s.stepDot, { backgroundColor: colors.gold }]}><Text style={s.stepNum}>2</Text></View>}
            <Text style={[s.stepTxt, loja && { color: colors.muted, fontWeight: '600' }]}>Entregar</Text>
          </View>

          <View style={s.dest}>
            {loja
              ? <View style={s.destIconSq}><Icon name="store" size={26} color={colors.gold} /></View>
              : <View style={s.destAvatar}><Text style={s.destAvatarTxt}>{iniciais(ride.customerName)}</Text></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.destName} numberOfLines={2}>{nomeDestino}</Text>
              <Text style={s.destAddr} numberOfLines={3}>{endereco || ride.bairro || 'Endereço não informado'}</Text>
              {loja && nPedidos > 1 && <Text style={s.grupo}>{nPedidos} pedidos para retirar juntos</Text>}
            </View>
          </View>

          {endereco ? (
            <Pressable style={s.navBtn} onPress={() => Linking.openURL(openMaps(endereco))}>
              <Icon name="navigate" size={22} stroke={2.4} />
              <Text style={s.navTxt}>{loja ? 'Navegar até a loja' : 'Navegar até o cliente'}</Text>
            </Pressable>
          ) : null}
          <View style={s.note}>
            <Icon name="shield" size={16} color={colors.good} stroke={2.2} />
            <Text style={s.noteTxt}>{loja ? 'Sua posição é compartilhada durante a corrida, mesmo com o Google Maps aberto.' : 'O cliente acompanha você no mapa, ao vivo.'}</Text>
          </View>
        </ScrollView>

        <View style={s.bottomBtns}>
          {!loja && ride.customerPhone ? (
            <Pressable style={s.secBtn} onPress={() => Linking.openURL(waLink(ride.customerPhone!))}>
              <Icon name="chat" size={18} stroke={2.2} /><Text style={s.secTxt}>WhatsApp</Text>
            </Pressable>
          ) : null}
          <Pressable style={s.codeBtn} onPress={onCodigo}>
            <Text style={s.codeTxt}>{loja ? 'Digitar código de retirada' : 'Digitar código de entrega'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  hero: { height: 230, paddingHorizontal: 16, paddingTop: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(18,15,10,.92)', borderRadius: 999, borderWidth: 1, borderColor: colors.inkLine, paddingVertical: 9, paddingHorizontal: 12 },
  menuTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  valor: { backgroundColor: colors.gold, borderRadius: 12, paddingHorizontal: 14, paddingTop: 7, paddingBottom: 3 },
  valorTxt: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  heroCenter: { alignItems: 'center', marginTop: 12, paddingHorizontal: 20 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 14, elevation: 6 },
  heroLabel: { marginTop: 10, fontSize: 12, letterSpacing: 1.6, color: colors.mutedDark, fontWeight: '700' },
  heroDest: { marginTop: 2, fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center' },
  sheet: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  handle: { width: 44, height: 4, borderRadius: 4, backgroundColor: colors.btnBorder, alignSelf: 'center' },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepOff: { borderWidth: 2, borderColor: '#CFC9BB' },
  stepNum: { fontWeight: '800', fontSize: 14, color: colors.ink },
  stepTxt: { fontSize: 14, fontWeight: '800', color: colors.ink },
  stepLine: { flex: 1, height: 2, backgroundColor: '#E4E0D4' },
  dest: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18 },
  destIconSq: { width: 54, height: 54, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  destAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  destAvatarTxt: { fontWeight: '800', fontSize: 18, color: colors.ink },
  destName: { fontSize: 20, fontWeight: '800', color: colors.ink, lineHeight: 23 },
  destAddr: { fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 },
  grupo: { marginTop: 4, fontSize: 12, fontWeight: '800', color: colors.goldDark },
  navBtn: { marginTop: 18, height: 60, borderRadius: 16, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  navTxt: { fontSize: 17, fontWeight: '800', color: colors.ink },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  noteTxt: { flex: 1, fontSize: 12, color: colors.muted, fontWeight: '500' },
  bottomBtns: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  secBtn: { flex: 1, height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: colors.btnBorder, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secTxt: { fontSize: 15, fontWeight: '700', color: colors.ink },
  codeBtn: { flex: 1.5, height: 54, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  codeTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
