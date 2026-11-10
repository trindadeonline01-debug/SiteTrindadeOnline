import { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native'
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg'
import { colors, fonts } from '../theme'
import OnlinePill from '../components/OnlinePill'
import { getPainel, PainelData } from '../api'
import { PeriodKind, PERIODS, periodRange } from '../periodFilter'
import { fmtMoney } from '../rides'

const STATUS_LABEL: Record<string, string> = {
  buscando_motoboy: 'Chamando motoboy', a_caminho: 'A caminho', entregue: 'Entregue', cancelada: 'Cancelada', sem_credito: 'Sem crédito',
}
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

type Props = { online: boolean; onToggleOnline: () => void }

export default function GanhosScreen({ online, onToggleOnline }: Props) {
  const [data, setData] = useState<PainelData | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Filtro de período (pedido do Ricardo, out/2026) — o backend já aceita from/to.
  const [period, setPeriod] = useState<PeriodKind>('week')

  const load = useCallback(async (p: PeriodKind) => {
    try {
      const { from, to } = periodRange(p)
      // "Tudo" não manda data → o servidor devolvia só as 15 últimas corridas na lista.
      setData(await getPainel(from ? { from, to: to || '' } : p === 'all' ? { from: '2020-01-01T00:00:00.000Z', to: '' } : undefined))
    } catch {}
  }, [])
  useEffect(() => { load(period) }, [load, period])
  async function onRefresh() { setRefreshing(true); await load(period); setRefreshing(false) }

  const label = PERIODS.find(p => p.kind === period)?.label || ''
  const mostrarGrafico = period === 'week' || period === 'last_week'
  // Ganho por dia da semana, a partir das corridas já carregadas do período.
  const porDia = DIAS.map((_, i) => {
    if (!data) return 0
    return data.recentOrders
      .filter(o => o.status === 'entregue' || (o.status === 'cancelada' && o.repasse != null))
      .filter(o => { const d = new Date(o.created_at).getDay(); return (d === 0 ? 6 : d - 1) === i })
      .reduce((a, o) => a + (o.repasse != null ? Number(o.repasse) : Number(o.fee)), 0)
  })
  const max = Math.max(...porDia, 1)
  const hojeIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1 })()

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={s.header}>
        <Text style={s.h1}>Ganhos</Text>
        <OnlinePill online={online} onPress={onToggleOnline} />
      </View>

      <View style={s.hero}>
        <Text style={s.heroLabel}>A RECEBER</Text>
        <Text style={s.heroValor}>{fmtMoney(data?.aReceber || 0)}</Text>
        <View style={s.heroRow}>
          <View style={{ flex: 1 }}><Text style={s.heroS}>Já recebido</Text><Text style={s.heroN}>{fmtMoney(data?.jaRecebido || 0)}</Text></View>
          <View style={{ flex: 1 }}><Text style={s.heroS}>Corridas (7 dias)</Text><Text style={s.heroN}>{data?.entregasSemana ?? 0}</Text></View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.periodRow} contentContainerStyle={{ gap: 8 }}>
        {PERIODS.map(p => (
          <Pressable key={p.kind} style={[s.pill, period === p.kind && s.pillOn]} onPress={() => setPeriod(p.kind)}>
            <Text style={[s.pillTxt, period === p.kind && s.pillTxtOn]}>{p.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {data && (
        <View style={s.periodCards}>
          <View style={s.stat}><Text style={s.statK}>A receber no período</Text><Text style={[s.statV, { color: colors.goldDark }]}>{fmtMoney(data.periodAReceber)}</Text></View>
          <View style={s.stat}><Text style={s.statK}>Recebido no período</Text><Text style={[s.statV, { color: colors.good }]}>{fmtMoney(data.periodRecebido)}</Text></View>
        </View>
      )}

      {data && mostrarGrafico && (
        <View style={s.chart}>
          <View style={s.chartHead}><Text style={s.chartTit}>{label}</Text><Text style={s.chartSub}>{data.recentOrders.length} corridas</Text></View>
          <Svg width="100%" height={96} viewBox="0 0 326 96" preserveAspectRatio="xMidYMid meet">
            {porDia.map((v, i) => {
              const h = Math.max(4, Math.round((v / max) * 64))
              const x = 6 + i * 46
              const destaque = period === 'week' && i === hojeIdx
              return (
                <G key={i}>
                  <Rect x={x} y={78 - h} width={30} height={h} rx={6} fill={destaque ? colors.gold : colors.ink} />
                  <SvgText x={x + 15} y={94} fontSize={11} fontWeight={destaque ? '800' : '600'} fill={destaque ? colors.ink : colors.muted} textAnchor="middle">{DIAS[i]}</SvgText>
                </G>
              )
            })}
          </Svg>
        </View>
      )}

      <Text style={s.sec}>Corridas — {label.toLowerCase()}</Text>
      {data?.recentOrders.map(o => {
        const ok = o.status === 'entregue'
        const valor = o.repasse != null ? fmtMoney(Number(o.repasse)) : fmtMoney(Number(o.fee))
        const dt = new Date(o.created_at)
        return (
          <View key={o.id} style={s.card}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.cardTit} numberOfLines={2}>{o.company_name}</Text>
              <Text style={s.cardSub}>{o.customer_name} · {o.bairro || '—'}</Text>
              <Text style={s.cardDate}>{dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{o.pago ? ' · pago' : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.badge, ok ? s.badgeOk : s.badgeWait]}>{STATUS_LABEL[o.status] || o.status}</Text>
              <Text style={s.cardValor}>{valor}</Text>
              {o.repasse != null && <Text style={s.metade}>metade da corrida</Text>}
            </View>
          </View>
        )
      })}
      {data && data.recentOrders.length === 0 && <Text style={s.empty}>Nenhuma corrida neste período.</Text>}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 28, fontWeight: '800', color: colors.ink },
  hero: { marginTop: 16, backgroundColor: colors.ink, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 20 },
  heroLabel: { fontSize: 12, letterSpacing: 1.2, color: colors.mutedDark, fontWeight: '600' },
  heroValor: { fontFamily: fonts.display, fontSize: 68, lineHeight: 72, color: colors.gold, marginTop: 4 },
  heroRow: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.inkLine },
  heroS: { fontSize: 12, color: colors.mutedDark },
  heroN: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 2 },
  periodRow: { marginTop: 16, flexGrow: 0 },
  pill: { height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.btnBorder, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  pillTxt: { fontSize: 14, fontWeight: '600', color: colors.ink },
  pillTxtOn: { fontWeight: '800' },
  periodCards: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12 },
  statK: { fontSize: 11, color: colors.muted },
  statV: { fontSize: 18, fontWeight: '800', marginTop: 3 },
  chart: { marginTop: 14, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chartTit: { fontSize: 14, fontWeight: '700', color: colors.ink },
  chartSub: { fontSize: 13, color: colors.muted },
  sec: { marginTop: 18, marginBottom: 10, fontSize: 15, fontWeight: '800', color: colors.ink },
  card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', gap: 12, marginBottom: 10 },
  cardTit: { fontSize: 15, fontWeight: '800', color: colors.ink, lineHeight: 19 },
  cardSub: { fontSize: 13, color: colors.muted, marginTop: 3 },
  cardDate: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { fontSize: 12, fontWeight: '800', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' },
  badgeOk: { backgroundColor: colors.goodBg, color: colors.goodDark },
  badgeWait: { backgroundColor: '#F6E9CE', color: '#6B4A00' },
  cardValor: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 6 },
  metade: { fontSize: 11, color: colors.muted },
  empty: { color: colors.muted, fontSize: 13 },
})
