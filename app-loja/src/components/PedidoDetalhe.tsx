import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, statusColor } from '../theme';
import { STATUS_LABEL, proximoStatus, type Entrega, type Pedido } from '../types';
import { acaoLabel, codigosVisiveis, fmt, horaCurta, motoEstado, pagoNoSite, payLabel } from '../pedidoUtils';

type Acao = { key: string; icon: string; label: string; curto: string; kind: 'sign' | 'dark' | 'ghost' | 'yellow' | 'red' | 'green' | 'redOutline'; onPress: () => void };

const KIND: Record<Acao['kind'], { bg: string; fg: string; border: string }> = {
  sign: { bg: '#FFC531', fg: '#151210', border: '#FFC531' },
  dark: { bg: '#151210', fg: '#FFFFFF', border: '#151210' },
  ghost: { bg: '#FFFFFF', fg: '#151210', border: '#CFCAC0' },
  yellow: { bg: '#FFF4D1', fg: '#7A5200', border: '#FFC531' },
  red: { bg: '#FBEAEA', fg: '#D6392B', border: '#F0C3BD' },
  green: { bg: '#E4F3EC', fg: '#0F8A57', border: '#9FD5B9' },
  redOutline: { bg: '#FFFFFF', fg: '#D6392B', border: '#F0C3BD' },
};

type Props = {
  pedido: Pedido; entrega?: Entrega; isTablet: boolean; podeChamarMoto: boolean;
  onClose: () => void; onAvancar: () => void; onChamarMoto: () => void; onChamarDeNovo: () => void; onCancelarChamada: () => void;
  onReimprimir: () => void; onCancelarPedido: () => void; onManter: () => void;
};

export default function PedidoDetalhe(props: Props) {
  const insets = useSafeAreaInsets();
  const { pedido: p, entrega: e, isTablet } = props;
  const moto = motoEstado(e);
  const aberto = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega'].includes(p.status);
  const st = statusColor[p.status];

  const acoes: Acao[] = [];
  if (aberto && p.cancelamento_solicitado_em) {
    acoes.push({ key: 'devolver', icon: '💸', label: `Cancelar e devolver ${fmt(p.total)}`, curto: 'Devolver', kind: 'dark', onPress: props.onCancelarPedido });
    acoes.push({ key: 'manter', icon: '↩️', label: 'Manter o pedido', curto: 'Manter', kind: 'ghost', onPress: props.onManter });
  } else if (aberto) {
    if (p.delivery_type === 'entrega' && props.podeChamarMoto) {
      if (!moto) acoes.push({ key: 'moto', icon: '🏍️', label: 'Chamar motoboy', curto: 'Motoboy', kind: 'sign', onPress: props.onChamarMoto });
      else if (moto === 'buscando') acoes.push({ key: 'moto', icon: '🏍️', label: 'Chamando motoboy... toque para cancelar', curto: 'Chamando', kind: 'yellow', onPress: props.onCancelarChamada });
      else if (moto === 'sem') acoes.push({ key: 'moto', icon: '🏍️', label: 'Motoboy não aceitou · Chamar de novo', curto: 'De novo', kind: 'red', onPress: props.onChamarDeNovo });
      else if (moto === 'caminho') acoes.push({ key: 'moto', icon: '🏍️', label: `${e?.motoboy_name || 'Motoboy'} a caminho · toque para cancelar`, curto: 'A caminho', kind: 'green', onPress: props.onCancelarChamada });
    }
    const nx = proximoStatus(p);
    if (nx) acoes.push({ key: 'avancar', icon: p.status === 'pronto' && p.delivery_type === 'entrega' ? '🛵' : '✅', label: p.status === 'recebido' ? 'Aceitar pedido' : acaoLabel(p), curto: acaoLabel(p).replace('Saiu para entrega', 'Saiu'), kind: p.status === 'recebido' ? 'sign' : 'dark', onPress: props.onAvancar });
  }
  acoes.push({ key: 'imprimir', icon: '🖨️', label: '🖨️ Imprimir de novo', curto: 'Imprimir', kind: 'ghost', onPress: props.onReimprimir });
  if (aberto && !p.cancelamento_solicitado_em) {
    acoes.push({ key: 'cancelar', icon: '✖️', label: 'Cancelar pedido', curto: 'Cancelar', kind: 'redOutline', onPress: props.onCancelarPedido });
  }

  const panel = isTablet ? styles.panelTablet : styles.panelPhone;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose} />
      <View style={[styles.panel, panel, { paddingBottom: insets.bottom, top: insets.top + (isTablet ? 0 : 24) }]}>
        {codigosVisiveis(p, e) && e && (
          <View style={styles.codes}>
            <View style={styles.cd}><Text style={styles.cdLbl}>CÓDIGO DA LOJA</Text><Text style={styles.cdNum}>{e.pickup_code}</Text><Text style={styles.cdSub}>Diga ao motoboy quando ele pegar o pedido</Text></View>
            <View style={styles.cd}><Text style={styles.cdLbl}>CÓDIGO DO CLIENTE</Text><Text style={styles.cdNum}>{e.delivery_code}</Text><Text style={styles.cdSub}>O cliente diz ao motoboy na entrega</Text></View>
          </View>
        )}
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>Pedido #{p.order_number ?? '—'}</Text>
            <Text style={styles.sub}>{p.customer_name} · {horaCurta(p.created_at)}  <Text style={{ color: st.fg, fontWeight: '800' }}>{STATUS_LABEL[p.status]}</Text></Text>
          </View>
          <Pressable onPress={props.onClose} hitSlop={12}><Text style={styles.x}>×</Text></Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {p.cancelamento_solicitado_em && <Text style={styles.cancelReq}>Cliente pediu cancelamento deste pedido</Text>}
          <Text style={styles.kv}>{p.delivery_type === 'entrega' ? <>Entrega: <Text style={styles.kvB}>{p.delivery_address || '—'}</Text></> : <Text style={styles.kvB}>Retirada no balcão</Text>}</Text>
          <Text style={styles.kv}>Pagamento: <Text style={styles.kvB}>{payLabel(p.payment_method)}{pagoNoSite(p) ? ' · pago pelo site' : ' · cobrar'}</Text>{pagoNoSite(p) ? ' (não cobrar na entrega)' : ''}</Text>
          {p.customer_phone ? <Text style={styles.kv}>Telefone: <Text style={styles.kvB}>{p.customer_phone}</Text></Text> : null}
          {p.notes ? <Text style={styles.kv}>Observação: <Text style={styles.kvB}>{p.notes}</Text></Text> : null}
          <View style={{ marginTop: 10 }}>
            {p.itens.map(i => (
              <View key={i.id} style={styles.irow}>
                <Text style={styles.iname}>{i.peso_kg ? `${i.peso_kg}kg` : `${i.qty}×`} {i.product_name}{i.selected_options?.length ? `\n${i.selected_options.map(o => '+ ' + o.name).join(', ')}` : ''}</Text>
                <Text style={styles.ival}>{fmt(Number(i.unit_price) * (i.peso_kg || i.qty))}</Text>
              </View>
            ))}
            {p.delivery_fee > 0 && <View style={styles.irow}><Text style={styles.iname}>Entrega</Text><Text style={styles.ival}>{fmt(p.delivery_fee)}</Text></View>}
            <View style={[styles.irow, { borderBottomWidth: 0 }]}><Text style={[styles.iname, { fontWeight: '800', fontSize: 15 }]}>Total</Text><Text style={[styles.ival, { fontSize: 15 }]}>{fmt(p.total)}</Text></View>
          </View>
        </ScrollView>
        {isTablet ? (
          <View style={styles.footer}>
            {acoes.map(a => (
              <Pressable key={a.key} onPress={a.onPress} style={[styles.btn, { backgroundColor: KIND[a.kind].bg, borderColor: KIND[a.kind].border }]}>
                <Text style={[styles.btnTxt, { color: KIND[a.kind].fg }]}>{a.key === 'moto' || a.key === 'imprimir' ? a.label : a.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.tiles}>
            {acoes.map(a => (
              <Pressable key={a.key} onPress={a.onPress} style={[styles.tile, { backgroundColor: KIND[a.kind].bg, borderColor: KIND[a.kind].border }]}>
                <Text style={styles.tileIc}>{a.icon}</Text>
                <Text style={[styles.tileLb, { color: KIND[a.kind].fg }]} numberOfLines={1}>{a.curto}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

export function confirmarCancelamento(p: Pedido, ok: () => void) {
  const pago = pagoNoSite(p);
  Alert.alert(`Cancelar o pedido #${p.order_number ?? ''}?`, pago ? `Ele foi pago pelo site. ${fmt(p.total)} vão ser devolvidos ao cliente pelo Mercado Pago.` : 'O cliente será avisado.', [
    { text: 'Voltar', style: 'cancel' },
    { text: pago ? 'Cancelar e devolver' : 'Cancelar pedido', style: 'destructive', onPress: ok },
  ]);
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: { position: 'absolute', backgroundColor: '#fff' },
  panelTablet: { top: 0, bottom: 0, right: 0, width: 440 },
  panelPhone: { left: 0, right: 0, bottom: 0, top: 36, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  codes: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 0 },
  cd: { flex: 1, backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center' },
  cdLbl: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, color: colors.sign },
  cdNum: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: 5 },
  cdSub: { fontSize: 9.5, color: '#A39E96', textAlign: 'center' },
  head: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#DCDDD6' },
  titulo: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  x: { fontSize: 26, color: colors.ink, lineHeight: 26 },
  cancelReq: { backgroundColor: colors.badBg, color: colors.bad, fontWeight: '800', padding: 10, borderRadius: 8, marginBottom: 10, overflow: 'hidden' },
  kv: { fontSize: 12.5, color: colors.muted, marginBottom: 3 },
  kvB: { fontWeight: '700', color: colors.ink },
  irow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  iname: { flex: 1, fontSize: 13, color: colors.ink },
  ival: { fontSize: 13, fontWeight: '800', color: colors.ink },
  footer: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#DCDDD6' },
  btn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnTxt: { fontWeight: '800', fontSize: 14 },
  tiles: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#DCDDD6' },
  tile: { flex: 1, aspectRatio: 1, borderWidth: 1.5, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4 },
  tileIc: { fontSize: 24 },
  tileLb: { fontSize: 10.5, fontWeight: '800' },
});
