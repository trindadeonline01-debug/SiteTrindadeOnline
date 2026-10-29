import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, TextInput, Image } from 'react-native';
import { colors, radius, spacing } from '../theme';
import type { Produto } from '../types';

function money(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ','); }

function ProdutoRow({ p, onToggle }: { p: Produto; onToggle: (p: Produto) => void }) {
  return (
    <View style={[styles.row, p.esgotado && styles.rowOff]}>
      {p.photo_url ? <Image source={{ uri: p.photo_url }} style={styles.foto} /> : <View style={[styles.foto, styles.fotoVazia]}><Text>🍽️</Text></View>}
      <View style={styles.rowMain}>
        <Text style={[styles.nome, p.esgotado && styles.nomeOff]} numberOfLines={2}>{p.name}</Text>
        <Text style={styles.preco}>{money(p.sale_price)}</Text>
      </View>
      <Pressable style={[styles.toggle, p.esgotado && styles.toggleOff]} onPress={() => onToggle(p)}>
        <Text style={[styles.toggleTxt, p.esgotado && styles.toggleTxtOff]}>{p.esgotado ? 'Pausado' : 'Disponível'}</Text>
      </Pressable>
    </View>
  );
}

export default function CardapioScreen({ produtos, loading, onRefresh, onToggle }: {
  produtos: Produto[]; loading: boolean; onRefresh: () => void; onToggle: (p: Produto) => void;
}) {
  const [busca, setBusca] = useState('');
  const filtrados = produtos.filter(p => !busca.trim() || p.name.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <View style={styles.wrap}>
      <TextInput style={styles.busca} placeholder="Buscar produto..." value={busca} onChangeText={setBusca} />
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}>
        {filtrados.length === 0 ? (
          <Text style={styles.empty}>Nenhum produto encontrado.</Text>
        ) : (
          filtrados.map(p => <ProdutoRow key={p.id} p={p} onToggle={onToggle} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  busca: { margin: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: 12, fontSize: 14 },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  empty: { color: colors.mutedLight, fontSize: 14, textAlign: 'center', marginTop: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.sm },
  rowOff: { opacity: 0.6 },
  foto: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.paper },
  fotoVazia: { alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1 },
  nome: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  nomeOff: { textDecorationLine: 'line-through' },
  preco: { fontSize: 12, color: colors.good, fontWeight: '700', marginTop: 2 },
  toggle: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.goodBg },
  toggleOff: { backgroundColor: colors.badBg },
  toggleTxt: { fontSize: 11, fontWeight: '800', color: colors.good },
  toggleTxtOff: { color: colors.bad },
});
