import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Image, StyleSheet, RefreshControl } from 'react-native';
import { colors, radius } from '../theme';
import type { Produto } from '../types';
import type { Layout } from '../layout';
import { fmt } from '../pedidoUtils';
import { precoPromocional } from '../api/produtos';
import Toggle from '../components/Toggle';

export function Foto({ url, style, emoji = '🍽️' }: { url: string | null; style: any; emoji?: string }) {
  return (
    <View style={[{ backgroundColor: '#EEEBE3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      <Text style={{ fontSize: 30 }}>{emoji}</Text>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

function Preco({ p }: { p: Produto }) {
  const pp = precoPromocional(p);
  if (pp == null) return <Text style={styles.preco}>{fmt(p.sale_price)}</Text>;
  return <Text style={styles.preco}><Text style={styles.riscado}>{fmt(p.sale_price)}</Text> <Text style={styles.promo}>{fmt(pp)}</Text></Text>;
}

type Props = { produtos: Produto[]; loading: boolean; onRefresh: () => void; onToggle: (p: Produto) => void; onEdit: (p: Produto) => void; layout: Layout; width: number };

export default function CardapioScreen({ produtos, loading, onRefresh, onToggle, onEdit, layout, width }: Props) {
  const [q, setQ] = useState('');
  const lista = produtos.filter(p => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const pausados = produtos.filter(p => p.esgotado).length;
  const grid = layout !== 'phone';
  const cols = Math.max(3, Math.floor((width - 86 - 24) / 180));
  const larg = grid ? Math.floor((width - 86 - 24 - (cols - 1) * 10) / cols) : 0;

  return (
    <ScrollView contentContainerStyle={styles.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />} keyboardShouldPersistTaps="handled">
      <TextInput style={styles.busca} placeholder="Buscar produto" value={q} onChangeText={setQ} placeholderTextColor={colors.mutedLight} />
      <Text style={styles.info}>{produtos.length} produtos{pausados ? <Text style={{ color: colors.bad, fontWeight: '800' }}> · {pausados} pausado{pausados > 1 ? 's' : ''}</Text> : null}</Text>
      {grid ? (
        <View style={styles.grid}>
          {lista.map(p => (
            <Pressable key={p.id} onPress={() => onEdit(p)} style={[styles.pc, { width: larg }, p.esgotado && { opacity: 0.6 }]}>
              <View>
                <Foto url={p.photo_url} style={{ width: '100%', aspectRatio: 4 / 3 }} />
                {p.esgotado && <Text style={styles.tag}>PAUSADO</Text>}
                {!p.esgotado && precoPromocional(p) != null && <Text style={[styles.tag, { backgroundColor: colors.bad }]}>PROMOÇÃO</Text>}
              </View>
              <View style={styles.bd}>
                <View style={{ flex: 1 }}><Text style={styles.nome} numberOfLines={2}>{p.name}</Text><Preco p={p} /></View>
                <Toggle on={!p.esgotado} onPress={() => onToggle(p)} />
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        lista.map(p => (
          <Pressable key={p.id} onPress={() => onEdit(p)} style={[styles.row, p.esgotado && { opacity: 0.6 }]}>
            <Foto url={p.photo_url} style={{ width: 58, height: 58, borderRadius: 10 }} emoji="🍽️" />
            <View style={{ flex: 1 }}>
              <Text style={styles.nome} numberOfLines={2}>{p.name}</Text>
              <Preco p={p} />
              <Text style={styles.sub}>{p.esgotado ? <Text style={{ color: colors.bad, fontWeight: '800' }}>Pausado: fora do site</Text> : 'Disponível no site'}</Text>
            </View>
            <Toggle on={!p.esgotado} onPress={() => onToggle(p)} />
          </Pressable>
        ))
      )}
      {lista.length === 0 && <Text style={styles.info}>Nenhum produto.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 12, paddingBottom: 40 },
  busca: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: 11, fontSize: 14, marginBottom: 8, color: colors.ink },
  info: { fontSize: 12, color: colors.muted, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pc: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: 'hidden' },
  tag: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.ink, color: '#fff', fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  bd: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 11, padding: 10, marginBottom: 7 },
  nome: { fontSize: 13, fontWeight: '800', color: colors.ink },
  preco: { fontSize: 12, color: colors.muted, marginTop: 1 },
  riscado: { textDecorationLine: 'line-through', color: colors.mutedLight },
  promo: { color: colors.bad, fontWeight: '800' },
  sub: { fontSize: 11.5, color: colors.muted, marginTop: 1 },
});
