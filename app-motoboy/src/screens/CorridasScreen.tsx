import { useCallback, useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import Svg, { Circle, G, Path } from 'react-native-svg'
import { colors, fonts } from '../theme'
import Icon from '../components/Icon'
import OnlinePill from '../components/OnlinePill'
import { getPainel } from '../api'
import { periodRange } from '../periodFilter'
import { Unit, iniciais, fmtMoney } from '../rides'

type Props = {
  nome: string
  online: boolean
  onToggleOnline: () => void
  units: Unit[]
  onOpenUnit: (key: string) => void
  alertasOk: boolean
  onConfigurar: () => void
  reload: () => Promise<void>
}

// Aba Corridas fora da tela da corrida: "aguardando" (online/offline) ou a lista
// das corridas em andamento. A oferta nova e a corrida aberta ocupam a tela toda
// e moram no HomeScreen — redesenho aprovado (nov/2026).
export default function CorridasScreen({ nome, online, onToggleOnline, units, onOpenUnit, alertasOk, onConfigurar, reload }: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const [hoje, setHoje] = useState<{ total: number; corridas: number } | null>(null)

  const carregarHoje = useCallback(async () => {
    try {
      const { from } = periodRange('today')
      const d = await getPainel(from ? { from, to: '' } : undefined)
      setHoje({
        total: (d.periodAReceber || 0) + (d.periodRecebido || 0),
        corridas: d.recentOrders.filter(o => o.status === 'entregue').length,
      })
    } catch {}
  }, [])
  useEffect(() => {
    carregarHoje()
    const id = setInterval(carregarHoje, 60000)
    return () => clearInterval(id)
  }, [carregarHoje])

  async function onRefresh() { setRefreshing(true); await Promise.all([reload(), carregarHoje()]); setRefreshing(false) }
  const primeiro = nome.trim().split(/\s+/)[0] || nome
  const nomeBonito = primeiro.charAt(0) + primeiro.slice(1).toLowerCase()

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={s.header}>
        <View style={s.who}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{iniciais(nome)}</Text></View>
          <View>
            <Text style={s.hello}>Bom trabalho,</Text>
            <Text style={s.name}>{nomeBonito}</Text>
          </View>
        </View>
        <OnlinePill online={online} onPress={onToggleOnline} />
      </View>

      <View style={s.hero}>
        <Text style={s.heroLabel}>GANHOS DE HOJE</Text>
        <Text style={s.heroValor}>{fmtMoney(hoje?.total || 0)}</Text>
        <View style={s.heroRow}>
          <View><Text style={s.heroN}>{hoje?.corridas ?? 0}</Text><Text style={s.heroS}>corridas</Text></View>
          <View><Text style={s.heroN}>{hoje && hoje.corridas > 0 ? fmtMoney(hoje.total / hoje.corridas) : '—'}</Text><Text style={s.heroS}>por corrida</Text></View>
        </View>
      </View>

      {units.length === 0 ? (
        <>
          <View style={s.radarBox}>
            <Svg width={210} height={210} viewBox="0 0 210 210">
              <Circle cx={105} cy={105} r={100} fill="none" stroke={online ? colors.gold : colors.btnBorder} strokeOpacity={online ? 0.16 : 0.6} strokeWidth={2} />
              <Circle cx={105} cy={105} r={72} fill="none" stroke={online ? colors.gold : colors.btnBorder} strokeOpacity={online ? 0.32 : 0.8} strokeWidth={2} />
              <Circle cx={105} cy={105} r={46} fill={online ? colors.gold : colors.btnBorder} fillOpacity={online ? 0.22 : 0.4} />
              <Circle cx={105} cy={105} r={32} fill={online ? colors.gold : colors.btnBorder} />
              <G transform="translate(105 105) scale(1.1) translate(-12 -12)" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Circle cx={6} cy={17} r={3} /><Circle cx={18} cy={17} r={3} /><Path d="M6 17 9 11h5l4 6" /><Path d="M14 11l1.5-3H18" /><Path d="M4 9h5v3H4z" />
              </G>
            </Svg>
            <Text style={s.radarTit}>{online ? 'Procurando corridas' : 'Você está offline'}</Text>
            <Text style={s.radarTxt}>
              {online ? 'Você está online. Quando chegar uma corrida, o alarme toca — mesmo com a tela apagada.' : 'Toque em “Offline” no topo para voltar a receber corridas.'}
            </Text>
          </View>

          <Pressable style={s.health} onPress={alertasOk ? undefined : onConfigurar}>
            <View style={[s.healthIcon, !alertasOk && { backgroundColor: '#FFF1CC' }]}>
              <Icon name="shield" size={22} color={alertasOk ? colors.good : colors.goldDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.healthTit}>{alertasOk ? 'Tudo pronto para receber corridas' : 'Falta configurar alguns alertas'}</Text>
              <Text style={s.healthSub}>{alertasOk ? 'Localização, alertas e bateria configurados' : 'Toque para ver o que falta no Perfil'}</Text>
            </View>
            {!alertasOk && <Icon name="chevronRight" size={18} color={colors.muted} />}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={s.sec}>Em andamento</Text>
          {units.map(u => {
            const r = u.rides[0]
            const loja = u.kind === 'loja'
            const valor = u.rides.reduce((a, x) => a + (parseFloat(String(x.valueLabel).replace('.', '').replace(',', '.')) || 0), 0)
            return (
              <Pressable key={u.key} style={s.card} onPress={() => onOpenUnit(u.key)}>
                <View style={[s.cardIcon, loja ? { backgroundColor: colors.ink } : { backgroundColor: colors.gold }]}>
                  <Icon name={loja ? 'store' : 'pin'} size={22} color={loja ? colors.gold : colors.ink} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.cardPhase}>{loja ? 'RETIRAR' : 'ENTREGAR'}</Text>
                  <Text style={s.cardTit} numberOfLines={1}>{loja ? u.company : r.customerName}</Text>
                  <Text style={s.cardSub} numberOfLines={1}>{loja ? (u.rides.length > 1 ? `${u.rides.length} pedidos juntos` : r.bairro || r.pickupAddress || '') : r.bairro || r.dropoffAddress || ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.cardValor}>{fmtMoney(valor)}</Text>
                  <Icon name="chevronRight" size={18} color={colors.muted} />
                </View>
              </Pressable>
            )
          })}
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontWeight: '800', fontSize: 16, color: colors.ink },
  hello: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  name: { fontSize: 19, fontWeight: '800', color: colors.ink, lineHeight: 22 },
  hero: { marginTop: 20, backgroundColor: colors.ink, borderRadius: 24, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 20 },
  heroLabel: { fontSize: 12, letterSpacing: 1.2, color: colors.mutedDark, fontWeight: '600' },
  heroValor: { fontFamily: fonts.display, fontSize: 76, lineHeight: 80, color: colors.gold, marginTop: 4 },
  heroRow: { flexDirection: 'row', gap: 28, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.inkLine },
  heroN: { fontSize: 20, fontWeight: '700', color: '#fff' },
  heroS: { fontSize: 12, color: colors.mutedDark },
  radarBox: { alignItems: 'center', marginTop: 22 },
  radarTit: { marginTop: 6, fontSize: 21, fontWeight: '800', color: colors.ink },
  radarTxt: { marginTop: 6, fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', maxWidth: 290 },
  health: { marginTop: 20, backgroundColor: '#fff', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border },
  healthIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.goodBg, alignItems: 'center', justifyContent: 'center' },
  healthTit: { fontSize: 14, fontWeight: '700', color: colors.ink },
  healthSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  sec: { marginTop: 22, marginBottom: 10, fontSize: 15, fontWeight: '800', color: colors.ink },
  card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  cardIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardPhase: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', color: colors.goldDark },
  cardTit: { fontSize: 17, fontWeight: '800', color: colors.ink },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  cardValor: { fontSize: 16, fontWeight: '800', color: colors.ink },
})
