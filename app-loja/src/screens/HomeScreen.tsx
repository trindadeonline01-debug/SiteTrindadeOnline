import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { colors, spacing } from '../theme';
import type { Company, Pedido, Produto, Categoria, Status } from '../types';
import { fetchPedidosAbertos, setPedidoStatus, subscribePedidos } from '../api/pedidos';
import { fetchProdutos, toggleEsgotado } from '../api/produtos';
import { autoImprimirPedido } from '../print/autoPrint';
import { registrarPushLoja } from '../push/registerPush';
import PedidosScreen from './PedidosScreen';
import CardapioScreen from './CardapioScreen';
import ConfigScreen from './ConfigScreen';

type Tab = 'pedidos' | 'cardapio' | 'config';

// Tablet de balcão fica o dia inteiro ligado na tomada — manter a tela
// acesa (não escurecer/bloquear sozinha) é o que faz o app continuar em
// primeiro plano de verdade, sem o Android suspender o JS por trás (a
// mesma causa raiz do problema original: aba/app em 2º plano não toca som
// nem imprime). Sozinho isso não cobre 100% dos casos (ex: alguém aperta o
// botão físico de power), mas resolve a maior parte do "esquece aberto e
// a tela apaga sozinha depois de 30s".
export default function HomeScreen({ company }: { company: Company }) {
  useKeepAwake();
  const [tab, setTab] = useState<Tab>('pedidos');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(true);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [hasNovo, setHasNovo] = useState(false);

  const alertPlayer = useAudioPlayer(require('../../assets/sounds/novo_pedido.wav'));

  // Mesma lição aprendida no app-motoboy (docs/KNOWLEDGE_BASE.md): o que
  // precisa sobreviver a troca de aba interna (realtime, som) não pode
  // morar dentro de um componente que a própria navegação desmonta — por
  // isso tudo isso mora aqui no HomeScreen (sempre montado), nunca dentro
  // de PedidosScreen (que é só exibido quando tab==='pedidos').
  useEffect(() => {
    alertPlayer.loop = false;
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
  }, [alertPlayer]);

  const recarregarPedidos = useCallback(async () => {
    setLoadingPedidos(true);
    setPedidos(await fetchPedidosAbertos(company.id));
    setLoadingPedidos(false);
  }, [company.id]);

  const recarregarProdutos = useCallback(async () => {
    setLoadingProdutos(true);
    const { produtos: p, categorias: c } = await fetchProdutos(company.id);
    setProdutos(p);
    setCategorias(c);
    setLoadingProdutos(false);
  }, [company.id]);

  useEffect(() => { recarregarPedidos(); recarregarProdutos(); }, [recarregarPedidos, recarregarProdutos]);

  // Registra o token de push assim que a empresa carrega — é isso que vai
  // permitir acordar o app (som + impressão) com a tela apagada/bloqueada,
  // complementando o `useKeepAwake` acima (que só cobre primeiro plano).
  useEffect(() => { registrarPushLoja(company.id); }, [company.id]);

  useEffect(() => {
    const unsubscribe = subscribePedidos(
      company.id,
      (pedidoId) => {
        setHasNovo(true);
        alertPlayer.seekTo(0).catch(() => {});
        alertPlayer.play();
        autoImprimirPedido(company.name, pedidoId);
      },
      () => recarregarPedidos(),
    );
    return unsubscribe;
  }, [company.id, company.name, recarregarPedidos, alertPlayer]);

  async function onAvancar(id: string, status: Status) {
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    await setPedidoStatus(id, status);
    if (status === 'entregue') recarregarPedidos();
  }

  async function onReimprimir(id: string) {
    await autoImprimirPedido(company.name, id);
  }

  async function onToggleProduto(p: Produto) {
    setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, esgotado: !p.esgotado } : x));
    await toggleEsgotado(p.id, p.esgotado);
  }

  function irPraPedidos() { setTab('pedidos'); setHasNovo(false); }

  return (
    <SafeAreaView style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.headerName} numberOfLines={1}>{company.name}</Text>
        <Text style={styles.headerSub}>Trindade Online · Loja</Text>
      </View>

      <View style={styles.content}>
        {tab === 'pedidos' && <PedidosScreen pedidos={pedidos} loading={loadingPedidos} onRefresh={recarregarPedidos} onAvancar={onAvancar} onReimprimir={onReimprimir} />}
        {tab === 'cardapio' && <CardapioScreen produtos={produtos} loading={loadingProdutos} onRefresh={recarregarProdutos} onToggle={onToggleProduto} />}
        {tab === 'config' && <ConfigScreen companyName={company.name} />}
      </View>

      <View style={styles.tabbar}>
        <Pressable style={styles.tabItem} onPress={irPraPedidos}>
          <Text style={[styles.tabIcon, tab === 'pedidos' && styles.tabIconOn]}>🧾</Text>
          <Text style={[styles.tabLabel, tab === 'pedidos' && styles.tabLabelOn]}>Pedidos</Text>
          {hasNovo && tab !== 'pedidos' && <View style={styles.dot} />}
        </Pressable>
        <Pressable style={styles.tabItem} onPress={() => setTab('cardapio')}>
          <Text style={[styles.tabIcon, tab === 'cardapio' && styles.tabIconOn]}>📋</Text>
          <Text style={[styles.tabLabel, tab === 'cardapio' && styles.tabLabelOn]}>Cardápio</Text>
        </Pressable>
        <Pressable style={styles.tabItem} onPress={() => setTab('config')}>
          <Text style={[styles.tabIcon, tab === 'config' && styles.tabIconOn]}>⚙️</Text>
          <Text style={[styles.tabLabel, tab === 'config' && styles.tabLabelOn]}>Config</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  header: { backgroundColor: colors.ink, padding: spacing.md, paddingBottom: spacing.sm },
  headerName: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub: { color: colors.sign, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  content: { flex: 1 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card, paddingVertical: 8 },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { fontSize: 20, opacity: 0.4 },
  tabIconOn: { opacity: 1 },
  tabLabel: { fontSize: 10.5, fontWeight: '700', color: colors.mutedLight },
  tabLabelOn: { color: colors.ink },
  dot: { position: 'absolute', top: -2, right: '28%', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bad },
});
