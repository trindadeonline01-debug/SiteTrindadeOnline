import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { colors, radius } from '../theme';
import { apiPost } from '../api/http';
import { requestBluetoothPermissions } from '../../modules/thermal-printer-loja';
import { getSavedPrinterAddress } from '../printerConfig';
import { getWizardState, saveWizardState, type WizardState } from '../wizardState';

type Item = { k: string; titulo: string; desc: string; ok: boolean; acao?: { rotulo: string; fn: () => void }; manual?: () => void };

// Abre a tela certa do Android; se o aparelho não tiver essa tela, cai nas
// configurações gerais do app.
async function abrirAndroid(action: string) {
  try { await Linking.sendIntent(action); } catch { Linking.openSettings(); }
}

export default function AssistenteScreen({ companyId, onClose, testeRecebido }: { companyId: string; onClose: () => void; testeRecebido: number }) {
  const [w, setW] = useState<WizardState | null>(null);
  const [notif, setNotif] = useState(false);
  const [bt, setBt] = useState(false);
  const [impressora, setImpressora] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const conferir = useCallback(async () => {
    setW(await getWizardState());
    const p = await Notifications.getPermissionsAsync();
    setNotif(p.status === 'granted');
    setImpressora(!!(await getSavedPrinterAddress()));
  }, []);
  useEffect(() => { conferir(); }, [conferir]);
  // O app avisa quando o push de teste chega/é tocado.
  useEffect(() => { if (testeRecebido > 0) { saveWizardState({ teste: true }).then(setW); } }, [testeRecebido]);

  async function marcar(patch: Partial<WizardState>) { setW(await saveWizardState(patch)); }

  async function pedirNotificacao() {
    const r = await Notifications.requestPermissionsAsync();
    if (r.status !== 'granted') Linking.openSettings();
    conferir();
  }
  async function pedirBluetooth() {
    const ok = await requestBluetoothPermissions();
    setBt(ok);
    if (!ok) Linking.openSettings();
  }
  async function enviarTeste() {
    setEnviando(true);
    try {
      await apiPost('/api/loja/teste-push', { companyId });
      Alert.alert('Teste enviado', 'Agora apague a tela do tablet e espere alguns segundos. Ele deve acordar e tocar. Toque na notificação para concluir.');
    } catch (e: any) {
      Alert.alert('Não deu pra enviar o teste', e?.message || 'Tente de novo.');
    }
    setEnviando(false);
  }

  if (!w) return null;
  const itens: Item[] = [
    { k: 'notif', titulo: 'Notificações permitidas', desc: 'O Android pergunta uma vez. Toque em Permitir.', ok: notif, acao: { rotulo: 'Permitir', fn: pedirNotificacao } },
    { k: 'tela', titulo: 'Tela de pedido novo por cima do bloqueio', desc: 'Android 14 ou mais: ligue "Notificações em tela cheia" para o Trindade Loja.', ok: w.telaCheia, acao: { rotulo: 'Abrir', fn: () => abrirAndroid('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT') }, manual: () => marcar({ telaCheia: true }) },
    { k: 'bat', titulo: 'Bateria sem restrição', desc: 'Procure o Trindade Loja na lista e escolha "Não otimizar" (Samsung: Bateria, Sem restrições). Sem isso o Android congela o app.', ok: w.bateria, acao: { rotulo: 'Abrir', fn: () => abrirAndroid('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS') }, manual: () => marcar({ bateria: true }) },
    { k: 'bt', titulo: 'Bluetooth liberado', desc: 'Permite achar as impressoras já pareadas.', ok: bt, acao: { rotulo: 'Permitir', fn: pedirBluetooth } },
    { k: 'imp', titulo: 'Impressora escolhida', desc: 'Pareie a impressora nas configurações do Android e escolha em Ajustes.', ok: impressora },
  ];
  const base = itens.every(i => i.ok);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}><Text style={styles.titulo}>Vamos garantir que o tablet toca</Text><Text style={styles.sub}>Cada fabricante esconde essas opções num lugar. Siga os itens abaixo.</Text></View>
          <Pressable onPress={onClose} hitSlop={12}><Text style={styles.x}>×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {itens.map(i => (
            <View key={i.k} style={styles.item}>
              <Text style={[styles.ic, i.ok ? styles.icOk : styles.icBad]}>{i.ok ? '✓' : '!'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.it}>{i.titulo}</Text>
                <Text style={styles.id}>{i.desc}</Text>
                {!i.ok && (
                  <View style={styles.btns}>
                    {i.acao && <Pressable style={styles.btn} onPress={i.acao.fn}><Text style={styles.btnTxt}>{i.acao.rotulo}</Text></Pressable>}
                    {i.manual && <Pressable style={[styles.btn, styles.btnGhost]} onPress={i.manual}><Text style={styles.btnTxt}>Já fiz</Text></Pressable>}
                  </View>
                )}
              </View>
            </View>
          ))}
          <View style={styles.item}>
            <Text style={[styles.ic, w.teste ? styles.icOk : styles.icWarn]}>{w.teste ? '✓' : '?'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.it}>Teste completo</Text>
              <Text style={styles.id}>Manda um aviso de teste. Apague a tela do tablet, espere ele acordar e tocar, e toque na notificação.</Text>
              <View style={styles.btns}>
                <Pressable style={[styles.btn, enviando && { opacity: 0.6 }]} onPress={enviarTeste} disabled={enviando || !base && false}><Text style={styles.btnTxt}>{enviando ? 'Enviando...' : w.teste ? 'Testar de novo' : 'Enviar teste'}</Text></Pressable>
              </View>
              {!base && <Text style={styles.aviso}>Termine os itens acima antes para o teste valer.</Text>}
            </View>
          </View>
          <Pressable style={[styles.final, !(base && w.teste) && { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#CFCAC0' }]} onPress={() => { saveWizardState({ visto: true }); onClose(); }}>
            <Text style={styles.finalTxt}>{base && w.teste ? 'Concluir' : 'Continuar sem terminar'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F0EDE8' },
  head: { flexDirection: 'row', gap: 10, padding: 18, paddingTop: 40, backgroundColor: colors.ink },
  titulo: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: '#A39E96', fontSize: 12.5, marginTop: 3 },
  x: { color: '#fff', fontSize: 28, lineHeight: 28 },
  item: { flexDirection: 'row', gap: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, marginBottom: 8 },
  ic: { width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, color: '#fff', fontWeight: '800', fontSize: 12, overflow: 'hidden' },
  icOk: { backgroundColor: colors.good }, icBad: { backgroundColor: colors.bad }, icWarn: { backgroundColor: colors.sign, color: colors.ink },
  it: { fontSize: 14, fontWeight: '800', color: colors.ink },
  id: { fontSize: 12, color: colors.muted, marginTop: 2 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { backgroundColor: colors.sign, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#CFCAC0' },
  btnTxt: { fontWeight: '800', fontSize: 12.5, color: colors.ink },
  aviso: { fontSize: 11.5, color: colors.muted, marginTop: 6 },
  final: { backgroundColor: colors.sign, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 10 },
  finalTxt: { fontWeight: '800', fontSize: 15, color: colors.ink },
});
