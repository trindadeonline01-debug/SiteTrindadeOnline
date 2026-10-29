import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl } from 'react-native';
import { colors, radius, spacing } from '../theme';
import type { Pedido, Status } from '../types';
import { STATUS_LABEL, STATUS_NEXT } from '../types';

const STATUS_COLOR: Record<Status, { fg: string; bg: string }> = {
  recebido: { fg: colors.bad, bg: colors.badBg },
  em_preparo: { fg: colors.signDark, bg: '#FCEFCB' },
  pronto: { fg: colors.good, bg: colors.goodBg },
  saiu_entrega: { fg: colors.info, bg: '#E3EAF2' },
  entregue: { fg: colors.muted, bg: colors.paper },
  cancelado: { fg: colors.muted, bg: colors.paper },
};

const ORIGIN_LABEL: Record<string, string> = { cardapio_publico: '🌐 Site', conversa: '💬 WhatsApp', balcao: '🏪 Balcão' };
function money(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ','); }

function PedidoCard({ p, onAvancar, onReimprimir }: { p: Pedido; onAvancar: (id: string, status: Status) => void; onReimprimir: (id: string) => void }) {
  const next = STATUS_NEXT[p.status];
  const c = STATUS_COLOR[p.status];
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.num}>#{p.order_number ?? p.id.slice(0, 6)}</Text>
        <View style={[styles.badge, { backgroundColor: c.bg }]}><Text style={[styles.badgeTxt, { color: c.fg }]}>{STATUS_LABEL[p.status]}</Text></View>
      </View>
      <Text style={styles.sub}>{ORIGIN_LABEL[p.origin] || p.origin} · {p.customer_name} · {money(p.total)}</Text>

      {p.itens?.length > 0 && (
        <View style={styles.itens}>
          {p.itens.map(it => (
            <Text key={it.id} style={styles.item}>
              {it.peso_kg != null ? `${it.peso_kg}kg` : `${it.qty}x`} {it.product_name}
              {it.selected_options?.length ? ' · ' + it.selected_options.map(o => o.name).join(', ') : ''}
            </Text>
          ))}
        </View>
      )}
      {p.notes ? <Text style={styles.notes}>📝 {p.notes}</Text> : null}

      <View style={styles.actions}>
        {next && (
          <Pressable style={styles.btnNext} onPress={() => onAvancar(p.id, next)}>
            <Text style={styles.btnNextTxt}>{p.status === 'recebido' ? 'Aceitar e avançar' : `Avançar · ${STATUS_LABEL[next]}`}</Text>
          </Pressable>
        )}
        <Pressable style={styles.btnPrint} onPress={() => onReimprimir(p.id)}>
          <Text style={styles.btnPrintTxt}>🖨️</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function PedidosScreen({ pedidos, loading, onRefresh, onAvancar, onReimprimir }: {
  pedidos: Pedido[]; loading: boolean; onRefresh: () => void;
  onAvancar: (id: string, status: Status) => void; onReimprimir: (id: string) => void;
}) {
  if (pedidos.length === 0 && !loading) {
    return (
      <ScrollView contentContainerStyle={styles.emptyWrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}>
        <Text style={styles.emptyTxt}>Nenhum pedido em aberto agora.</Text>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}>
      {pedidos.map(p => <PedidoCard key={p.id} p={p} onAvancar={onAvancar} onReimprimir={onReimprimir} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTxt: { color: colors.mutedLight, fontSize: 14 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  num: { fontSize: 18, fontWeight: '800', color: colors.ink },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
  sub: { fontSize: 12.5, color: colors.muted, marginBottom: 8 },
  itens: { gap: 2, marginBottom: 6 },
  item: { fontSize: 13, color: colors.ink },
  notes: { fontSize: 12.5, color: colors.signDark, fontWeight: '700', marginBottom: 6 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  btnNext: { flex: 1, backgroundColor: colors.good, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  btnNextTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnPrint: { width: 46, backgroundColor: colors.paper, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnPrintTxt: { fontSize: 18 },
});
