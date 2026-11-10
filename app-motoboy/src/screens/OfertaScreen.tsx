import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { colors, fonts } from '../theme'
import Icon from '../components/Icon'
import { Oferta, aceitarOferta, recusarOferta } from '../api'

const TOTAL = 120 // a oferta vale 2 minutos
function fmtTempo(s: number) { const m = Math.floor(s / 60); const sec = s % 60; return `${m}:${sec < 10 ? '0' : ''}${sec}` }

type Props = { offer: Oferta; pauseAlert: () => void; reload: () => Promise<void> }

// Oferta em tela cheia, escura, com o tempo grande — redesenho aprovado (nov/2026).
// O som (N1) continua tocando no HomeScreen enquanto a oferta existir.
export default function OfertaScreen({ offer, pauseAlert, reload }: Props) {
  const [left, setLeft] = useState(0)
  const [busy, setBusy] = useState<'aceitar' | 'recusar' | null>(null)

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [offer])

  async function aceitar() {
    setBusy('aceitar'); pauseAlert()
    try { await aceitarOferta() } catch {} finally { setBusy(null); reload() }
  }
  async function recusar() {
    setBusy('recusar'); pauseAlert()
    try { await recusarOferta() } catch {} finally { setBusy(null); reload() }
  }

  const frac = Math.min(1, left / TOTAL)
  const C = 2 * Math.PI * 88
  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.top}>
        <View style={s.kicker}><View style={s.kdot} /><Text style={s.kickerTxt}>NOVA CORRIDA</Text></View>
        <Text style={s.brand}>Trindade Entregas</Text>
      </View>

      <View style={s.ringWrap}>
        <Svg width={186} height={186} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
          <Circle cx={100} cy={100} r={88} fill="none" stroke={colors.inkLine} strokeWidth={10} />
          <Circle cx={100} cy={100} r={88} fill="none" stroke={colors.gold} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={`${C}`} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 100 100)" />
        </Svg>
        <View style={s.ringCenter}>
          <Text style={s.time}>{fmtTempo(left)}</Text>
          <Text style={s.timeSub}>para aceitar</Text>
        </View>
      </View>

      <View style={s.valueBox}>
        <Text style={s.valueLabel}>VOCÊ RECEBE</Text>
        <Text style={s.value}>R$ {offer.valueLabel}</Text>
      </View>

      <View style={s.route}>
        <View style={s.stop}>
          <View style={s.railCol}>
            <View style={[s.badge, { backgroundColor: colors.gold }]}><Icon name="store" size={20} stroke={2.2} /></View>
            <View style={s.dash} />
          </View>
          <View style={{ flex: 1, paddingBottom: 14 }}>
            <Text style={s.stopLabel}>RETIRAR</Text>
            <Text style={s.stopName}>{offer.company}</Text>
          </View>
        </View>
        <View style={s.stop}>
          <View style={[s.badge, { backgroundColor: '#fff' }]}><Icon name="pin" size={20} stroke={2.2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stopLabel}>ENTREGAR</Text>
            <Text style={s.stopName}>{offer.bairro || 'Destino do cliente'}</Text>
          </View>
        </View>
      </View>

      <View style={s.btns}>
        <Pressable style={[s.accept, busy && { opacity: 0.7 }]} disabled={!!busy} onPress={aceitar}>
          {busy === 'aceitar' ? <ActivityIndicator color={colors.ink} /> : (
            <><Text style={s.acceptTxt}>ACEITAR CORRIDA</Text><Icon name="arrowRight" size={22} stroke={2.6} /></>
          )}
        </Pressable>
        <Pressable style={[s.decline, busy && { opacity: 0.7 }]} disabled={!!busy} onPress={recusar}>
          <Text style={s.declineTxt}>Recusar</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.gold, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  kdot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink },
  kickerTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: colors.ink },
  brand: { fontSize: 12, color: colors.mutedDark, fontWeight: '600' },
  ringWrap: { width: 186, height: 186, alignSelf: 'center', marginTop: 20 },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  time: { fontFamily: fonts.display, fontSize: 74, lineHeight: 78, color: '#fff' },
  timeSub: { fontSize: 12, color: colors.mutedDark, fontWeight: '600', marginTop: -2 },
  valueBox: { alignItems: 'center', marginTop: 12 },
  valueLabel: { fontSize: 12, letterSpacing: 1.4, color: colors.mutedDark, fontWeight: '600' },
  value: { fontFamily: fonts.display, fontSize: 92, lineHeight: 96, color: colors.gold },
  route: { marginTop: 14, backgroundColor: colors.ink2, borderRadius: 20, borderWidth: 1, borderColor: colors.inkLine, padding: 18 },
  stop: { flexDirection: 'row', gap: 14 },
  railCol: { alignItems: 'center' },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dash: { flex: 1, borderLeftWidth: 2, borderColor: '#4A4030', borderStyle: 'dashed', marginVertical: 4, minHeight: 22 },
  stopLabel: { fontSize: 11, letterSpacing: 1.4, color: colors.mutedDark, fontWeight: '700' },
  stopName: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 2 },
  btns: { marginTop: 'auto', gap: 10 },
  accept: { height: 64, borderRadius: 18, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  acceptTxt: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5, color: colors.ink },
  decline: { height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: '#4A4030', alignItems: 'center', justifyContent: 'center' },
  declineTxt: { fontSize: 16, fontWeight: '600', color: '#fff' },
})
