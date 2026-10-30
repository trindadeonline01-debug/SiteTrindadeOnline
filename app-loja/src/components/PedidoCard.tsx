import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, statusColor, tipoColor } from '../theme';
import type { Entrega, Pedido } from '../types';
import { acaoLabel, codigosVisiveis, fmt, minutosAtras, motoEstado, pagoNoSite, payLabel, resumoItens } from '../pedidoUtils';

const MOTO_CHIP = {
  buscando: { t: '🏍️ Chamando motoboy', bg: '#FFF4D1', fg: '#A87200' },
  sem: { t: '🏍️ Motoboy não aceitou', bg: '#FBEAEA', fg: '#D6392B' },
  caminho: { t: '🏍️ Motoboy a caminho', bg: '#E4F3EC', fg: '#0F8A57' },
  retirado: { t: '🏍️ Com o motoboy', bg: '#E4F3EC', fg: '#0F8A57' },
  entregue: { t: '🏍️ Entrega confirmada', bg: '#E4F3EC', fg: '#0F8A57' },
} as const;

export default function PedidoCard({ pedido: p, entrega, onOpen, onAvancar, largura }: { pedido: Pedido; entrega?: Entrega; onOpen: () => void; onAvancar: () => void; largura?: number | string }) {
  const tipo = p.delivery_type === 'entrega' ? tipoColor.entrega : tipoColor.retirada;
  const cor = statusColor[p.status]?.fg || colors.ink;
  const moto = motoEstado(entrega);
  const mc = moto ? MOTO_CHIP[moto] : null;
  return (
    <Pressable onPress={onOpen} style={[styles.card, { backgroundColor: tipo.card, borderLeftColor: tipo.stripe, width: largura as any }, p.status === 'recebido' && { borderColor: cor, borderWidth: 1.5, borderLeftWidth: 5 }]}>
      <View style={styles.r1}>
        <Text style={styles.nome} numberOfLines={1}>#{p.order_number ?? '—'} {p.customer_name}</Text>
        <Text style={styles.total}>{fmt(p.total)}</Text>
      </View>
      <View style={styles.chips}>
        {pagoNoSite(p)
          ? <Text style={[styles.chip, { backgroundColor: colors.goodBg, color: colors.good }]}>PAGO NO SITE · {payLabel(p.payment_method)}</Text>
          : <Text style={[styles.chip, { backgroundColor: '#FEF0E0', color: '#B5690C' }]}>{payLabel(p.payment_method)} · cobrar</Text>}
        <Text style={[styles.chip, { backgroundColor: tipo.bg, color: tipo.fg }]}>{p.delivery_type === 'entrega' ? '🏍️ ENTREGA' : '🏪 RETIRADA'}</Text>
        {mc && <Text style={[styles.chip, { backgroundColor: mc.bg, color: mc.fg }]}>{mc.t}</Text>}
      </View>
      {codigosVisiveis(p, entrega) && entrega && (
        <View style={styles.codes}>
          <View style={styles.code}><Text style={styles.codeLbl}>LOJA</Text><Text style={styles.codeNum}>{entrega.pickup_code}</Text></View>
          <View style={styles.code}><Text style={styles.codeLbl}>CLIENTE</Text><Text style={styles.codeNum}>{entrega.delivery_code}</Text></View>
        </View>
      )}
      <Text style={styles.itens} numberOfLines={3}>{resumoItens(p)}</Text>
      {p.cancelamento_solicitado_em && <Text style={styles.cancelReq}>Cliente pediu cancelamento</Text>}
      <Text style={styles.tempo}>{p.status === 'recebido' ? `Aguardando aceite · há ${minutosAtras(p.created_at)} min` : `Há ${minutosAtras(p.created_at)} min`}</Text>
      <Pressable onPress={onAvancar} style={[styles.btn, { backgroundColor: cor }]}>
        <Text style={styles.btnTxt}>{acaoLabel(p)}</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#DCDDD6', borderLeftWidth: 5, borderRadius: radius.md, padding: 10, marginBottom: 8 },
  r1: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  nome: { flex: 1, fontSize: 13.5, fontWeight: '800', color: colors.ink },
  total: { fontSize: 13.5, fontWeight: '800', color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5, marginBottom: 5 },
  chip: { fontSize: 9.5, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  codes: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  code: { flex: 1, backgroundColor: colors.ink, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeLbl: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, color: colors.sign },
  codeNum: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 2 },
  itens: { fontSize: 11.5, color: colors.muted, marginBottom: 5, lineHeight: 16 },
  cancelReq: { backgroundColor: colors.badBg, color: colors.bad, fontWeight: '800', fontSize: 11, padding: 6, borderRadius: 7, marginBottom: 6, overflow: 'hidden' },
  tempo: { fontSize: 11, color: colors.muted, marginBottom: 6 },
  btn: { borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
});
