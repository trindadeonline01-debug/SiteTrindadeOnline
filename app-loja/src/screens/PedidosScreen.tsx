import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { colors, radius, statusColor } from '../theme';
import type { Entrega, Pedido, Status } from '../types';
import { STATUS_LABEL } from '../types';
import type { Layout } from '../layout';
import PedidoCard from '../components/PedidoCard';
import Toggle from '../components/Toggle';

const COLS: Status[] = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega'];

type Props = {
  pedidos: Pedido[]; entregas: Record<string, Entrega>; layout: Layout; loading: boolean; onRefresh: () => void;
  autoAceitar: boolean; autoMoto: boolean; onToggleAceitar: () => void; onToggleMoto: () => void;
  onOpen: (p: Pedido) => void; onAvancar: (p: Pedido) => void;
};

export default function PedidosScreen(props: Props) {
  const { pedidos, entregas, layout, loading, onRefresh } = props;
  const [filtro, setFiltro] = useState<Status>('recebido');
  const phone = layout === 'phone';

  const toolbar = (
    <View style={[styles.toolbar, phone && { flexWrap: 'nowrap' }]}>
      <View style={[styles.pill, phone && styles.pillPhone]}>
        <Text style={[styles.pillTxt, phone && { fontSize: 10.5 }]} numberOfLines={1}>{phone ? '⚡ Aceite automático' : '⚡ Aceitar pedidos automaticamente'}</Text>
        <Toggle small on={props.autoAceitar} onPress={props.onToggleAceitar} />
      </View>
      <View style={[styles.pill, phone && styles.pillPhone]}>
        <Text style={[styles.pillTxt, phone && { fontSize: 10.5 }]} numberOfLines={1}>{phone ? '🏍️ Motoboy automático' : '🏍️ Chamar motoboy ao iniciar o preparo'}</Text>
        <Toggle small on={props.autoMoto} onPress={props.onToggleMoto} />
      </View>
    </View>
  );

  const card = (p: Pedido, largura?: number | string) => (
    <PedidoCard key={p.id} pedido={p} entrega={entregas[p.id]} onOpen={() => props.onOpen(p)} onAvancar={() => props.onAvancar(p)} largura={largura} />
  );

  if (layout === 'tabletLandscape') {
    return (
      <View style={{ flex: 1 }}>
        {toolbar}
        <View style={styles.board}>
          {COLS.map(s => {
            const os = pedidos.filter(p => p.status === s);
            const c = statusColor[s].fg;
            return (
              <View key={s} style={[styles.col, { borderTopColor: c }]}>
                <View style={styles.colHead}>
                  <Text style={[styles.colTitle, { color: c }]}>{STATUS_LABEL[s].toUpperCase()}</Text>
                  <Text style={[styles.cnt, { backgroundColor: c }]}>{os.length}</Text>
                </View>
                <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}>
                  {os.length ? os.map(p => card(p)) : <Text style={styles.none}>Nenhum</Text>}
                </ScrollView>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  const lista = pedidos.filter(p => p.status === filtro);
  return (
    <View style={{ flex: 1 }}>
      {toolbar}
      <View style={styles.chips}>
        {COLS.map(s => {
          const c = statusColor[s].fg; const on = filtro === s;
          return (
            <Pressable key={s} onPress={() => setFiltro(s)} style={[styles.chip, { borderColor: on ? c : c + '66', backgroundColor: on ? c : '#fff' }]}>
              <Text style={[styles.chipTxt, { color: on ? '#fff' : c }]} numberOfLines={1}>{STATUS_LABEL[s]} {pedidos.filter(p => p.status === s).length}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={[styles.list, layout === 'tabletPortrait' && styles.listTwo]} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}>
        {lista.length ? lista.map(p => card(p, layout === 'tabletPortrait' ? '48.8%' : undefined)) : <Text style={styles.none}>Nenhum pedido aqui</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, paddingBottom: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingLeft: 12, paddingRight: 6, paddingVertical: 4 },
  pillPhone: { flex: 1, minWidth: 0, justifyContent: 'space-between', paddingLeft: 8, gap: 4 },
  pillTxt: { fontSize: 11.5, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  board: { flex: 1, flexDirection: 'row', gap: 10, padding: 12, paddingTop: 6 },
  col: { flex: 1, backgroundColor: '#E9E3D6', borderRadius: 14, padding: 10, borderTopWidth: 4 },
  colHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  colTitle: { fontSize: 12, fontWeight: '800' },
  cnt: { color: '#fff', fontSize: 11, fontWeight: '800', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 1, overflow: 'hidden' },
  none: { textAlign: 'center', color: colors.mutedLight, fontSize: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CFCAC0', borderRadius: 10, padding: 14 },
  chips: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingBottom: 4 },
  chip: { flexShrink: 1, borderWidth: 1, borderRadius: 18, paddingVertical: 6, paddingHorizontal: 8 },
  chipTxt: { fontSize: 10.5, fontWeight: '800' },
  list: { padding: 12 },
  listTwo: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' },
});
