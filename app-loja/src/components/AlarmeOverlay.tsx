import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import type { Pedido } from '../types';
import { fmt, pagoNoSite, payLabel } from '../pedidoUtils';

// Tela de pedido novo (aceite automático desligado). Fica por cima de tudo
// enquanto o alarme toca; o botão leva ao quadro, onde o pedido espera em
// "Recebido" para você aceitar.
export default function AlarmeOverlay({ pedido: p, mais, impresso, onVer }: { pedido: Pedido; mais: number; impresso: 'imprimindo' | 'ok' | 'erro' | null; onVer: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onVer}>
      <View style={styles.wrap}>
        <ScrollView contentContainerStyle={styles.in}>
          <Text style={styles.bell}>🔔</Text>
          <Text style={styles.big}>PEDIDO NOVO #{p.order_number ?? '—'}</Text>
          <Text style={styles.cli}>{p.customer_name} · {p.delivery_type === 'entrega' ? 'Entrega' : 'Retirada'}</Text>
          <Text style={styles.pg}>{pagoNoSite(p) ? `Pago no site (${payLabel(p.payment_method)})` : `${payLabel(p.payment_method)} · cobrar`} · {fmt(p.total)}</Text>
          <View style={styles.box}>
            {p.itens.map(i => (
              <View key={i.id} style={styles.row}><Text style={styles.it}>{i.peso_kg ? `${i.peso_kg}kg` : `${i.qty}×`} {i.product_name}</Text><Text style={styles.itv}>{fmt(Number(i.unit_price) * (i.peso_kg || i.qty))}</Text></View>
            ))}
          </View>
          {impresso && <Text style={[styles.st, impresso === 'ok' ? { color: '#7FE0B2' } : impresso === 'erro' ? { color: '#FF9F93' } : { color: colors.sign }]}>{impresso === 'ok' ? 'Recibo impresso ✓' : impresso === 'erro' ? 'Não foi possível imprimir' : 'Imprimindo o recibo...'}</Text>}
          <Pressable style={styles.btn} onPress={onVer}><Text style={styles.btnTxt}>VER PEDIDO NO QUADRO</Text></Pressable>
          <Text style={styles.nota}>O pedido está em RECEBIDO. Você decide aceitar por lá.</Text>
          {mais > 0 && <Text style={styles.nota}>+ {mais} pedido(s) esperando</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, justifyContent: 'center' },
  in: { padding: 20, alignItems: 'center' },
  bell: { fontSize: 46 },
  big: { fontSize: 34, fontWeight: '800', color: colors.sign, marginTop: 4, textAlign: 'center' },
  cli: { fontSize: 15, fontWeight: '700', color: '#fff', marginTop: 6 },
  pg: { fontSize: 13, color: '#7FE0B2', marginTop: 2 },
  box: { alignSelf: 'stretch', maxWidth: 430, backgroundColor: '#231F1B', borderRadius: 12, padding: 12, marginVertical: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 },
  it: { flex: 1, color: '#fff', fontSize: 13 },
  itv: { color: '#fff', fontWeight: '800', fontSize: 13 },
  st: { fontSize: 12.5, fontWeight: '700', marginBottom: 6 },
  btn: { alignSelf: 'stretch', maxWidth: 430, backgroundColor: colors.sign, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnTxt: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  nota: { color: '#A39E96', fontSize: 11.5, marginTop: 8, textAlign: 'center' },
});
