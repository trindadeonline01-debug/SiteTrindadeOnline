import { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { colors, spacing, radius } from '../theme'
import { getPainel, PainelData } from '../api'

function fmt(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }

const STATUS_LABEL: Record<string, string> = {
  buscando_motoboy: 'Chamando motoboy', a_caminho: 'A caminho', entregue: 'Entregue', cancelada: 'Cancelada', sem_credito: 'Sem crédito',
}

export default function GanhosScreen() {
  const [data, setData] = useState<PainelData | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try { setData(await getPainel()) } catch {}
  }, [])

  useEffect(() => { load() }, [load])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  if (!data) return <View style={s.wrap} />

  return (
    <ScrollView style={s.wrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={s.heroCard}>
        <Text style={s.heroLabel}>A receber</Text>
        <Text style={s.heroValor}>{fmt(data.aReceber)}</Text>
      </View>
      <View style={s.row}>
        <View style={s.statCard}>
          <Text style={s.muted}>Corridas (7 dias)</Text>
          <Text style={s.statValor}>{data.entregasSemana}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.muted}>Já recebido</Text>
          <Text style={s.statValor}>{fmt(data.jaRecebido)}</Text>
        </View>
      </View>

      <Text style={s.sectionTitle}>Últimas corridas</Text>
      {data.recentOrders.map(o => (
        <View key={o.id} style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.cardTitle}>{o.company_name}</Text>
            <Text style={[s.pill, o.status === 'entregue' ? s.pillGood : s.pillWait]}>{STATUS_LABEL[o.status] || o.status}</Text>
          </View>
          <Text style={s.muted}>{o.customer_name} · {o.bairro || '—'}</Text>
          <View style={s.rowBetween}>
            <Text style={s.muted}>{new Date(o.created_at).toLocaleDateString('pt-BR')}</Text>
            <Text style={s.valorTxt}>{fmt(o.fee)}{o.pago ? ' · pago' : ''}</Text>
          </View>
        </View>
      ))}
      {data.recentOrders.length === 0 && <Text style={s.muted}>Nenhuma corrida ainda.</Text>}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, padding: spacing.md },
  heroCard: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  heroLabel: { color: colors.paperDark, fontSize: 12 },
  heroValor: { color: colors.gold, fontSize: 28, fontWeight: '800' },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  statValor: { fontWeight: '800', fontSize: 18, color: colors.ink, marginTop: 2 },
  sectionTitle: { fontWeight: '800', fontSize: 15, marginBottom: spacing.sm, color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4, marginBottom: spacing.sm },
  cardTitle: { fontWeight: '700', color: colors.ink },
  muted: { color: colors.muted, fontSize: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valorTxt: { fontWeight: '700', color: colors.ink },
  pill: { fontSize: 10.5, fontWeight: '700', borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: 8 },
  pillGood: { backgroundColor: colors.goodBg, color: colors.good },
  pillWait: { backgroundColor: colors.waitBg, color: colors.wait },
})
