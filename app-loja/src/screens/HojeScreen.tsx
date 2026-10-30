import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { colors, radius, statusColor } from '../theme';
import { STATUS_LABEL, type Pedido } from '../types';
import { fmt, horaCurta, pagoNoSite } from '../pedidoUtils';

type Filtro = 'todos' | 'andamento' | 'entregue' | 'cancelado';
const FILTROS: [Filtro, string][] = [['todos', 'Todos'], ['andamento', 'Em andamento'], ['entregue', 'Entregues'], ['cancelado', 'Cancelados']];
const grupo = (p: Pedido): Filtro => (p.status === 'cancelado' ? 'cancelado' : p.status === 'entregue' ? 'entregue' : 'andamento');

function Barra({ rotulo, n, total }: { rotulo: string; n: number; total: number }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.bl}>{rotulo}</Text><Text style={[styles.bl, { fontWeight: '800' }]}>{n}</Text></View>
      <View style={styles.bar}><View style={[styles.barIn, { width: `${total ? Math.round((n / total) * 100) : 0}%` }]} /></View>
    </View>
  );
}

export default function HojeScreen({ pedidos, loading, onRefresh, onOpen }: { pedidos: Pedido[]; loading: boolean; onRefresh: () => void; onOpen: (p: Pedido) => void }) {
  const [f, setF] = useState<Filtro>('todos');
  const ok = pedidos.filter(p => p.status !== 'cancelado');
  const can = pedidos.filter(p => p.status === 'cancelado');
  const fat = ok.reduce((s, p) => s + Number(p.total), 0);
  const n = ok.length;
  const pix = ok.filter(p => (p.payment_method || '').includes('pix')).length;
  const ent = ok.filter(p => p.delivery_type === 'entrega').length;
  const lista = pedidos.filter(p => f === 'todos' || grupo(p) === f);
  const listaOk = lista.filter(p => p.status !== 'cancelado');
  const estornado = lista.filter(p => p.status === 'cancelado' && p.refund_status === 'estornado').reduce((s, p) => s + Number(p.total), 0);

  return (
    <ScrollView contentContainerStyle={styles.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}>
      <Text style={styles.h2}>Hoje</Text>
      <View style={styles.kpis}>
        {[['Pedidos', String(n)], ['Vendido', fmt(fat)], ['Ticket médio', n ? fmt(fat / n) : '—'], ['Cancelados', String(can.length)]].map(([l, v]) => (
          <View key={l} style={styles.kpi}><Text style={styles.kl}>{l.toUpperCase()}</Text><Text style={styles.kv}>{v}</Text></View>
        ))}
      </View>
      <Text style={styles.sect}>FORMA DE PAGAMENTO</Text>
      <Barra rotulo="Pix" n={pix} total={n} /><Barra rotulo="Cartão e outros" n={n - pix} total={n} />
      <Text style={styles.sect}>TIPO</Text>
      <Barra rotulo="Entrega" n={ent} total={n} /><Barra rotulo="Retirada" n={n - ent} total={n} />

      <Text style={styles.sect}>PEDIDOS DE HOJE</Text>
      <View style={styles.filtros}>
        {FILTROS.map(([k, l]) => (
          <Pressable key={k} onPress={() => setF(k)} style={[styles.fchip, f === k && styles.fchipOn]}>
            <Text style={[styles.fchipTxt, f === k && { color: '#fff' }]}>{l} {k === 'todos' ? pedidos.length : pedidos.filter(p => grupo(p) === k).length}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.lista}>
        {lista.length === 0 ? <Text style={styles.vazio}>Nenhum pedido neste filtro.</Text> : lista.map(p => {
          const c = statusColor[p.status];
          return (
            <Pressable key={p.id} style={styles.item} onPress={() => onOpen(p)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.in}><Text style={{ fontWeight: '800' }}>#{p.order_number ?? '—'}</Text>  <Text style={styles.hora}>{horaCurta(p.created_at)}</Text>  {p.customer_name}</Text>
                <Text style={styles.is}>{p.delivery_type === 'entrega' ? 'Entrega' : 'Retirada'} · {pagoNoSite(p) ? 'pago no site' : 'cobrar'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={styles.iv}>{fmt(p.total)}</Text>
                <Text style={[styles.pill, { backgroundColor: c.bg, color: c.fg }]}>{STATUS_LABEL[p.status]}</Text>
                {p.status === 'cancelado' && p.refund_status === 'estornado' ? <Text style={styles.est}>estornado</Text> : null}
              </View>
            </Pressable>
          );
        })}
        {lista.length > 0 && (
          <View style={[styles.item, { backgroundColor: '#F5F3EE' }]}>
            <Text style={[styles.in, { flex: 1, fontWeight: '800' }]}>{lista.length} pedido{lista.length > 1 ? 's' : ''}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.iv}>{fmt(listaOk.reduce((s, p) => s + Number(p.total), 0))}</Text>
              {estornado > 0 ? <Text style={styles.est}>estornado {fmt(estornado)}</Text> : null}
            </View>
          </View>
        )}
      </View>
      <Text style={styles.nota}>Só entram pedidos do cardápio digital.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 14, paddingBottom: 40 },
  h2: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 10 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 12 },
  kpi: { flexGrow: 1, flexBasis: 130, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 },
  kl: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: colors.muted },
  kv: { fontSize: 22, fontWeight: '800', color: colors.ink, marginTop: 3 },
  sect: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: '#8D877D', marginTop: 14, marginBottom: 6 },
  bl: { fontSize: 12.5, color: colors.ink },
  bar: { height: 9, borderRadius: 5, backgroundColor: '#EEEBE3', overflow: 'hidden', marginTop: 4 },
  barIn: { height: '100%', backgroundColor: colors.sign },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 },
  fchip: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 9, backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12 },
  fchipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  fchipTxt: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
  lista: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#EEEBE3' },
  in: { fontSize: 13, color: colors.ink },
  hora: { fontSize: 11, color: '#8D877D' },
  is: { fontSize: 11.5, color: colors.muted, marginTop: 1 },
  iv: { fontSize: 13, fontWeight: '800', color: colors.ink },
  pill: { fontSize: 10.5, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  est: { fontSize: 10.5, fontWeight: '700', color: '#C43D3D' },
  vazio: { padding: 14, color: colors.muted, fontSize: 12.5 },
  nota: { fontSize: 12, color: colors.muted, marginTop: 10 },
});
