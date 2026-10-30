import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '../theme';
import type { Produto } from '../types';
import { fmt } from '../pedidoUtils';
import { precoPromocional, salvarProduto, trocarFoto } from '../api/produtos';
import { Foto } from '../screens/CardapioScreen';
import Toggle from './Toggle';

const num = (v: string) => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? 0 : x; };
const txt = (n: number) => String(n).replace('.', ',');

export default function ProdutoEdit({ produto, companyId, isTablet, onClose, onSaved }: { produto: Produto; companyId: string; isTablet: boolean; onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const promoAtual = precoPromocional(produto);
  const [nome, setNome] = useState(produto.name);
  const [preco, setPreco] = useState(txt(produto.sale_price));
  const [desc, setDesc] = useState(produto.description || '');
  const [pausado, setPausado] = useState(produto.esgotado);
  const [promoOn, setPromoOn] = useState(promoAtual != null);
  const [novo, setNovo] = useState(promoAtual != null ? txt(promoAtual) : '');
  const [foto, setFoto] = useState(produto.photo_url);
  const [salvando, setSalvando] = useState(false);

  const base = num(preco);
  const pp = promoOn && num(novo) > 0 && num(novo) < base ? num(novo) : null;

  async function escolherFoto() {
    Alert.alert('Trocar foto', 'De onde vem a foto?', [
      { text: 'Câmera', onPress: () => pegar(true) },
      { text: 'Galeria', onPress: () => pegar(false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }
  async function pegar(camera: boolean) {
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Sem permissão', 'Libere o acesso nas configurações do Android.'); return; }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [4, 3] };
      const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets?.[0]) return;
      setSalvando(true);
      const url = await trocarFoto(companyId, produto.id, r.assets[0].uri);
      setFoto(url);
      onSaved();
    } catch (e: any) {
      Alert.alert('Não deu pra trocar a foto', e?.message || 'Tente de novo.');
    }
    setSalvando(false);
  }

  async function salvar() {
    if (!nome.trim() || base <= 0) { Alert.alert('Confira os dados', 'Preencha o nome e um preço maior que zero.'); return; }
    if (promoOn && pp == null) { Alert.alert('Promoção', 'O novo valor precisa ser menor que o preço.'); return; }
    setSalvando(true);
    try {
      await salvarProduto(produto, { name: nome, description: desc, sale_price: base, esgotado: pausado, novoValor: promoOn ? pp : null });
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Não deu pra salvar', e?.message || 'Tente de novo.');
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.panel, isTablet ? styles.panelTablet : styles.panelPhone, { paddingBottom: insets.bottom, top: insets.top + (isTablet ? 0 : 24) }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}><Text style={styles.titulo}>Editar produto</Text><Text style={styles.sub}>Alterações valem no site na hora</Text></View>
          <Pressable onPress={onClose} hitSlop={12}><Text style={styles.x}>×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <View style={styles.tiles}>
            <Foto url={foto} style={styles.tile} />
            <Pressable style={[styles.tile, styles.tileBox]} onPress={escolherFoto} disabled={salvando}>
              <Text style={{ fontSize: 26 }}>📷</Text><Text style={styles.tileLb}>Trocar foto</Text>
            </Pressable>
            <View style={[styles.tile, styles.tileBox, !pausado ? { backgroundColor: colors.goodBg, borderColor: '#9FD5B9' } : { backgroundColor: '#F0EDE8' }]}>
              <Text style={[styles.tileLb, !pausado && { color: colors.good }]}>{pausado ? 'Pausado' : 'Disponível'}</Text>
              <Toggle on={!pausado} onPress={() => setPausado(!pausado)} />
            </View>
          </View>

          <Text style={styles.lbl}>Nome</Text>
          <TextInput style={styles.inp} value={nome} onChangeText={setNome} />

          <View style={styles.prow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lbl} numberOfLines={1}>Preço (R$)</Text>
              <TextInput style={styles.inp} value={preco} onChangeText={setPreco} keyboardType="decimal-pad" />
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.lbl} numberOfLines={1}>Em promoção</Text>
              <View style={{ marginTop: 10 }}><Toggle on={promoOn} onPress={() => setPromoOn(!promoOn)} /></View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lbl} numberOfLines={1}>Novo valor</Text>
              <TextInput style={[styles.inp, !promoOn && styles.inpOff]} value={novo} onChangeText={setNovo} editable={promoOn} keyboardType="decimal-pad" placeholder="Ex.: 4,00" placeholderTextColor={colors.mutedLight} />
            </View>
          </View>

          <Text style={styles.lbl}>Descrição</Text>
          <TextInput style={[styles.inp, { height: 84, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} multiline placeholder="Ex.: 9 unidades, saem quentinhas" placeholderTextColor={colors.mutedLight} />

          <Text style={styles.prev}>{pp != null ? <>Preço na loja: <Text style={{ color: colors.bad, fontWeight: '800' }}>{fmt(pp)}</Text> (de {fmt(base)})</> : <>Preço na loja: <Text style={{ fontWeight: '800' }}>{fmt(base)}</Text></>}</Text>
        </ScrollView>
        <View style={styles.footer}>
          <Pressable style={[styles.btn, { backgroundColor: colors.sign, borderColor: colors.sign }]} onPress={salvar} disabled={salvando}><Text style={styles.btnTxt}>{salvando ? 'Salvando...' : 'Salvar alterações'}</Text></Pressable>
          <Pressable style={[styles.btn, { backgroundColor: '#fff', borderColor: '#CFCAC0' }]} onPress={onClose}><Text style={styles.btnTxt}>Cancelar</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: { position: 'absolute', backgroundColor: '#fff' },
  panelTablet: { top: 0, bottom: 0, right: 0, width: 440 },
  panelPhone: { left: 0, right: 0, bottom: 0, top: 36, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#DCDDD6' },
  titulo: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.muted },
  x: { fontSize: 26, color: colors.ink, lineHeight: 26 },
  tiles: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  tile: { flex: 1, aspectRatio: 1, borderRadius: 14, overflow: 'hidden' },
  tileBox: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#DCDDD6', alignItems: 'center', justifyContent: 'center', gap: 8 },
  tileLb: { fontSize: 12, fontWeight: '800', color: colors.ink },
  lbl: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted, marginTop: 10, marginBottom: 4 },
  inp: { borderWidth: 1.5, borderColor: '#DCDDD6', borderRadius: 9, padding: 11, fontSize: 14, color: colors.ink, backgroundColor: '#fff' },
  inpOff: { backgroundColor: '#F0EDE8', color: colors.mutedLight },
  prow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  prev: { fontSize: 12.5, color: colors.muted, marginTop: 12 },
  footer: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#DCDDD6' },
  btn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnTxt: { fontWeight: '800', fontSize: 14, color: colors.ink },
});
