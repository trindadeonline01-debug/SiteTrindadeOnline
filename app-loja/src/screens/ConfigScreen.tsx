import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { colors, radius, spacing, errMsg } from '../theme';
import { supabase } from '../supabase';
import { listPairedPrinters, requestBluetoothPermissions, printFormatted, type PairedPrinter, type PrintConfig } from '../../modules/thermal-printer-loja';
import { getSavedPrinterAddress, savePrinterAddress, getSavedPrintConfig, savePrintConfig } from '../printerConfig';
import { buildTestTicket } from '../print/receipt';
import Toggle from '../components/Toggle';

export default function ConfigScreen({ companyName, lojaAberta, onToggleLoja }: { companyName: string; lojaAberta: boolean; onToggleLoja: () => void }) {
  const [impressoras, setImpressoras] = useState<PairedPrinter[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [config, setConfig] = useState<PrintConfig>({ dpi: 203, widthMm: 58, charsPerLine: 32 });
  const [testando, setTestando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      setSelecionada(await getSavedPrinterAddress());
      setConfig(await getSavedPrintConfig());
      await carregarImpressoras();
    })();
  }, []);

  async function carregarImpressoras() {
    await requestBluetoothPermissions();
    setImpressoras(listPairedPrinters());
  }

  async function escolher(p: PairedPrinter) {
    setSelecionada(p.address);
    await savePrinterAddress(p.address);
  }

  async function salvarConfig(patch: Partial<PrintConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    await savePrintConfig(next);
  }

  async function testarImpressao() {
    setTestando(true);
    setMsg('');
    try {
      const texto = buildTestTicket(companyName, config.charsPerLine);
      await printFormatted(texto, selecionada, config);
      setMsg('✓ Enviado — confere se saiu na impressora.');
    } catch (e) {
      setMsg('✗ ' + errMsg(e));
    }
    setTestando(false);
  }

  async function sair() {
    Alert.alert('Sair', 'Deseja sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.lojaRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.lojaTit}>Loja {lojaAberta ? 'aberta' : 'pausada'}</Text>
          <Text style={styles.hint}>{lojaAberta ? 'Recebendo pedidos pelo site' : 'O site mostra "Loja fechada" e não aceita pedido'}</Text>
        </View>
        <Toggle on={lojaAberta} onPress={onToggleLoja} />
      </View>
      <Text style={styles.secTitle}>🖨️ Impressora Bluetooth</Text>
      <Text style={styles.hint}>Pareie a impressora pelo Bluetooth do Android primeiro, depois escolha ela aqui.</Text>
      <Pressable style={styles.btnOutline} onPress={carregarImpressoras}>
        <Text style={styles.btnOutlineTxt}>🔄 Atualizar lista</Text>
      </Pressable>
      {impressoras.length === 0 ? (
        <Text style={styles.empty}>Nenhuma impressora pareada encontrada.</Text>
      ) : (
        impressoras.map(p => (
          <Pressable key={p.address} style={[styles.printerRow, selecionada === p.address && styles.printerRowOn]} onPress={() => escolher(p)}>
            <Text style={styles.printerNome}>{p.name}</Text>
            {selecionada === p.address && <Text style={styles.printerCheck}>✓</Text>}
          </Pressable>
        ))
      )}

      <Text style={[styles.secTitle, { marginTop: spacing.xl }]}>Largura da impressora</Text>
      <Text style={styles.hint}>58mm (32 colunas) é o padrão de impressora portátil pequena — ajusta se a sua for 80mm.</Text>
      <View style={styles.widthRow}>
        {[{ mm: 58, chars: 32 }, { mm: 80, chars: 42 }].map(opt => (
          <Pressable key={opt.mm} style={[styles.widthBtn, config.widthMm === opt.mm && styles.widthBtnOn]} onPress={() => salvarConfig({ widthMm: opt.mm, charsPerLine: opt.chars })}>
            <Text style={[styles.widthBtnTxt, config.widthMm === opt.mm && styles.widthBtnTxtOn]}>{opt.mm}mm</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={[styles.btnTest, testando && styles.btnDisabled]} onPress={testarImpressao} disabled={testando}>
        <Text style={styles.btnTestTxt}>{testando ? 'Imprimindo...' : '🖨️ Imprimir teste'}</Text>
      </Pressable>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <Pressable style={styles.btnSair} onPress={sair}>
        <Text style={styles.btnSairTxt}>Sair da conta</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  lojaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: spacing.xl },
  lojaTit: { fontSize: 14, fontWeight: '800', color: colors.ink },
  secTitle: { fontSize: 13, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  hint: { fontSize: 11.5, color: colors.muted, marginBottom: spacing.md },
  empty: { fontSize: 12.5, color: colors.mutedLight, marginBottom: spacing.md },
  btnOutline: { alignSelf: 'flex-start', borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 14, marginBottom: spacing.sm },
  btnOutlineTxt: { fontSize: 12, fontWeight: '700', color: colors.ink },
  printerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6 },
  printerRowOn: { borderColor: colors.sign, backgroundColor: '#FFFBEF' },
  printerNome: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  printerCheck: { fontSize: 14, fontWeight: '800', color: colors.signDark },
  widthRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  widthBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center' },
  widthBtnOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  widthBtnTxt: { fontWeight: '800', color: colors.ink },
  widthBtnTxtOn: { color: colors.sign },
  btnTest: { backgroundColor: colors.sign, borderRadius: radius.md, padding: 14, alignItems: 'center', marginBottom: 6 },
  btnDisabled: { opacity: 0.6 },
  btnTestTxt: { fontWeight: '800', color: colors.ink },
  msg: { fontSize: 12, color: colors.muted, marginBottom: spacing.lg },
  btnSair: { marginTop: spacing.xl, alignItems: 'center', padding: 12 },
  btnSairTxt: { color: colors.bad, fontWeight: '700', fontSize: 13 },
});
