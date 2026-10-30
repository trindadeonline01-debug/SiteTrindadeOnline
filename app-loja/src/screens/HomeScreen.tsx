import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, Alert } from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { colors } from '../theme';
import { useLayout } from '../layout';
import { proximoStatus, type Company, type Entrega, type Pedido, type Produto } from '../types';
import { cancelarPedido, fetchPedido, fetchPedidosAbertos, fetchPedidosHoje, manterPedido, setPedidoStatus, subscribePedidos } from '../api/pedidos';
import { cancelarChamada, chamarDeNovo, chamarMotoboy, fetchEntregas } from '../api/entrega';
import { fetchProdutos, toggleEsgotado } from '../api/produtos';
import { setCompanyFlag, temMotoboyProprioAtivo } from '../api/company';
import { autoImprimirPedido } from '../print/autoPrint';
import { registrarPushLoja } from '../push/registerPush';
import { motoEstado } from '../pedidoUtils';
import PedidosScreen from './PedidosScreen';
import CardapioScreen from './CardapioScreen';
import HojeScreen from './HojeScreen';
import ConfigScreen from './ConfigScreen';
import PedidoDetalhe, { confirmarCancelamento } from '../components/PedidoDetalhe';
import ProdutoEdit from '../components/ProdutoEdit';
import AlarmeOverlay from '../components/AlarmeOverlay';

type Tab = 'pedidos' | 'cardapio' | 'hoje' | 'config';
const TABS: [Tab, string, string][] = [['pedidos', '🧾', 'Pedidos'], ['cardapio', '📋', 'Cardápio'], ['hoje', '📊', 'Hoje'], ['config', '⚙️', 'Ajustes']];
const ATIVAS = ['buscando', 'sem', 'caminho', 'retirado'];

export default function HomeScreen({ company: inicial }: { company: Company }) {
  useKeepAwake();
  const { layout, isTablet, width } = useLayout();
  const [company, setCompany] = useState(inicial);
  const [tab, setTab] = useState<Tab>('pedidos');
  const [abertos, setAbertos] = useState<Pedido[]>([]);
  const [hoje, setHoje] = useState<Pedido[]>([]);
  const [entregas, setEntregas] = useState<Record<string, Entrega>>({});
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loadingPed, setLoadingPed] = useState(true);
  const [loadingProd, setLoadingProd] = useState(true);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [alarme, setAlarme] = useState<string[]>([]);
  const [impresso, setImpresso] = useState<Record<string, 'imprimindo' | 'ok' | 'erro'>>({});
  const [ownMoto, setOwnMoto] = useState(false);
  const [novoAviso, setNovoAviso] = useState(false);

  // O que o Realtime (criado uma vez) precisa ler sempre atualizado.
  const ref = useRef({ company, ownMoto, entregas });
  ref.current = { company, ownMoto, entregas };
  const ultimoToque = useRef<Record<string, number>>({});

  const player = useAudioPlayer(require('../../assets/sounds/pedido_novo_telefone.mp3'));
  useEffect(() => { setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {}); }, []);
  const tocar = useCallback((repetir: boolean) => { try { player.loop = repetir; player.seekTo(0).catch(() => {}); player.play(); } catch {} }, [player]);
  const parar = useCallback(() => { try { player.loop = false; player.pause(); } catch {} }, [player]);

  const recarregar = useCallback(async () => {
    const [a, h] = await Promise.all([fetchPedidosAbertos(company.id), fetchPedidosHoje(company.id)]);
    setAbertos(a); setHoje(h);
    const ids = Array.from(new Set([...a, ...h].map(p => p.id)));
    setEntregas(await fetchEntregas(company.id, ids));
    setLoadingPed(false);
  }, [company.id]);

  const recarregarProdutos = useCallback(async () => {
    setLoadingProd(true);
    const r = await fetchProdutos(company.id);
    setProdutos(r.produtos);
    setLoadingProd(false);
  }, [company.id]);

  useEffect(() => { recarregar(); recarregarProdutos(); temMotoboyProprioAtivo(company.id).then(setOwnMoto); }, [company.id, recarregar, recarregarProdutos]);

  // Registra o token de push assim que a empresa carrega — é isso que vai
  // permitir acordar o app (som + impressão) com a tela apagada/bloqueada.
  useEffect(() => { registrarPushLoja(company.id); }, [company.id]);

  // Chama o motoboy da plataforma sozinho quando o pedido de entrega entra em
  // preparo (ou pronto, o que vier primeiro) — mesma regra do painel do site.
  const maybeAutoChamar = useCallback(async (p: Pedido) => {
    const c = ref.current.company;
    if (!c.entrega_enabled || !c.entrega_chamada_automatica || ref.current.ownMoto) return;
    if (p.delivery_type !== 'entrega' || !p.delivery_address || ref.current.entregas[p.id]) return;
    try { await chamarMotoboy(c.id, p); } catch {}
  }, []);

  const avancar = useCallback(async (p: Pedido) => {
    const nx = proximoStatus(p);
    if (!nx) return;
    try {
      await setPedidoStatus(ref.current.company.id, ref.current.company.name, p, nx);
      if (nx === 'em_preparo' || nx === 'pronto') await maybeAutoChamar(p);
    } catch (e: any) { Alert.alert('Não deu pra atualizar o pedido', e?.message || 'Tente de novo.'); }
    recarregar();
  }, [maybeAutoChamar, recarregar]);

  // Pedido novo chegando (Realtime).
  useEffect(() => {
    return subscribePedidos(company.id, async (pedidoId) => {
      const p = await fetchPedido(pedidoId);
      if (!p) return;
      setImpresso(m => ({ ...m, [p.id]: 'imprimindo' }));
      autoImprimirPedido(ref.current.company.name, p.id).then(r => setImpresso(m => ({ ...m, [p.id]: r.ok ? 'ok' : 'erro' })));
      if (ref.current.company.loja_auto_aceitar_pedidos) {
        tocar(false);
        await avancar(p);
      } else {
        ultimoToque.current[p.id] = Date.now();
        setAlarme(a => (a.includes(p.id) ? a : [...a, p.id]));
        setNovoAviso(true);
        tocar(true);
      }
    }, () => { recarregar(); });
  }, [company.id, recarregar, avancar, tocar]);

  // Se o pedido continua em "Recebido" depois de 60 s, o alarme volta a tocar.
  useEffect(() => {
    const t = setInterval(() => {
      if (ref.current.company.loja_auto_aceitar_pedidos) return;
      const agora = Date.now();
      for (const p of abertos) {
        if (p.status !== 'recebido') continue;
        const ult = ultimoToque.current[p.id] ?? new Date(p.created_at).getTime();
        if (agora - ult >= 60000) {
          ultimoToque.current[p.id] = agora;
          setAlarme(a => (a.includes(p.id) ? a : [...a, p.id]));
          tocar(true);
        }
      }
    }, 5000);
    return () => clearInterval(t);
  }, [abertos, tocar]);

  // Corrida em andamento: confere o motoboy a cada 10 s (o Realtime de
  // entregas pode não estar ligado no banco).
  useEffect(() => {
    const ativa = Object.values(entregas).some(e => ATIVAS.includes(motoEstado(e) || ''));
    if (!ativa) return;
    const t = setInterval(() => { recarregar(); }, 10000);
    return () => clearInterval(t);
  }, [entregas, recarregar]);

  const todos = useMemo(() => {
    const m = new Map<string, Pedido>();
    for (const p of hoje) m.set(p.id, p);
    for (const p of abertos) m.set(p.id, p);
    return m;
  }, [abertos, hoje]);
  const detalhe = detalheId ? todos.get(detalheId) : undefined;
  const alarmePedido = alarme.map(id => todos.get(id)).find(p => p && p.status === 'recebido');

  function verPedidos() { setAlarme([]); parar(); setNovoAviso(false); setTab('pedidos'); }

  async function toggleFlag(campo: 'loja_auto_aceitar_pedidos' | 'entrega_chamada_automatica' | 'store_paused') {
    const novo = !company[campo];
    setCompany(c => ({ ...c, [campo]: novo }));
    try { await setCompanyFlag(company.id, campo, novo); } catch (e: any) { setCompany(c => ({ ...c, [campo]: !novo })); Alert.alert('Não deu pra salvar', e?.message || 'Tente de novo.'); }
  }
  function toggleMoto() {
    if (ownMoto) { Alert.alert('Motoboy próprio', 'Você tem motoboy próprio ativo, então a chamada automática do motoboy da plataforma fica desligada. Pelo botão "Chamar motoboy" do pedido dá pra chamar quando quiser.'); return; }
    toggleFlag('entrega_chamada_automatica');
  }

  async function onToggleProduto(p: Produto) {
    setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, esgotado: !p.esgotado } : x));
    await toggleEsgotado(p.id, p.esgotado);
  }

  async function acaoMoto(fn: () => Promise<unknown>) {
    try { await fn(); } catch (e: any) { Alert.alert('Motoboy', e?.message || 'Não deu pra completar agora.'); }
    recarregar();
  }

  async function cancelar(p: Pedido) {
    confirmarCancelamento(p, async () => {
      try {
        const r = await cancelarPedido(p);
        if (r.estorno?.status === 'falhou') Alert.alert('Pedido cancelado', `Mas o estorno de R$ ${Number(r.estorno.valor).toFixed(2).replace('.', ',')} não saiu: ${r.estorno.erro || 'erro no Mercado Pago'}.\nDá pra devolver pelo app do Mercado Pago.`);
        setDetalheId(null);
      } catch (e: any) { Alert.alert('Não deu pra cancelar', e?.message || 'Tente de novo.'); }
      recarregar();
    });
  }

  const nNovos = abertos.filter(p => p.status === 'recebido').length;
  const rail = isTablet;
  const tabs = TABS.map(([k, ic, lb]) => (
    <Pressable key={k} onPress={() => { setTab(k); if (k === 'pedidos') setNovoAviso(false); }} style={[rail ? styles.railTab : styles.barTab, tab === k && rail && styles.railTabOn]}>
      <Text style={[styles.tabIc, tab !== k && { opacity: 0.5 }]}>{ic}</Text>
      <Text style={[styles.tabLb, rail && { color: tab === k ? '#fff' : '#A39E96' }, !rail && tab === k && { color: colors.ink }]}>{lb}</Text>
      {k === 'pedidos' && nNovos > 0 && <Text style={styles.badge}>{nNovos}</Text>}
    </Pressable>
  ));

  const conteudo = (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.headerName} numberOfLines={1}>{company.name}</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => toggleFlag('store_paused')} style={[styles.loja, company.store_paused && { backgroundColor: '#5A1F19' }]}>
          <Text style={styles.lojaTxt}>● {company.store_paused ? 'Loja pausada' : 'Loja aberta'}</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'pedidos' && <PedidosScreen pedidos={abertos} entregas={entregas} layout={layout} loading={loadingPed} onRefresh={recarregar} autoAceitar={company.loja_auto_aceitar_pedidos} autoMoto={company.entrega_chamada_automatica && !ownMoto} onToggleAceitar={() => toggleFlag('loja_auto_aceitar_pedidos')} onToggleMoto={toggleMoto} onOpen={p => setDetalheId(p.id)} onAvancar={avancar} />}
        {tab === 'cardapio' && <CardapioScreen produtos={produtos} loading={loadingProd} onRefresh={recarregarProdutos} onToggle={onToggleProduto} onEdit={setEditando} layout={layout} width={width} />}
        {tab === 'hoje' && <HojeScreen pedidos={hoje} loading={loadingPed} onRefresh={recarregar} onOpen={p => setDetalheId(p.id)} />}
        {tab === 'config' && <ConfigScreen companyName={company.name} lojaAberta={!company.store_paused} onToggleLoja={() => toggleFlag('store_paused')} />}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.wrap}>
      {rail ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={styles.rail}><Text style={styles.logo}>TRINDADE{'\n'}LOJA</Text>{tabs}</View>
          {conteudo}
        </View>
      ) : (
        <View style={{ flex: 1 }}>{conteudo}<View style={styles.bar}>{tabs}</View></View>
      )}

      {detalhe && (
        <PedidoDetalhe
          pedido={detalhe} entrega={entregas[detalhe.id]} isTablet={isTablet} podeChamarMoto={company.entrega_enabled}
          onClose={() => setDetalheId(null)}
          onAvancar={async () => { await avancar(detalhe); }}
          onChamarMoto={() => acaoMoto(() => chamarMotoboy(company.id, detalhe))}
          onChamarDeNovo={() => acaoMoto(() => chamarDeNovo(company.id, entregas[detalhe.id]!.id))}
          onCancelarChamada={() => acaoMoto(() => cancelarChamada(company.id, entregas[detalhe.id]!.id))}
          onReimprimir={async () => { const r = await autoImprimirPedido(company.name, detalhe.id); Alert.alert(r.ok ? 'Enviado para a impressora' : 'Não imprimiu', r.ok ? 'Confira se o recibo saiu.' : r.erro || 'Tente de novo.'); }}
          onCancelarPedido={() => cancelar(detalhe)}
          onManter={async () => { await manterPedido(detalhe.id); recarregar(); setDetalheId(null); }}
        />
      )}
      {editando && <ProdutoEdit produto={editando} companyId={company.id} isTablet={isTablet} onClose={() => setEditando(null)} onSaved={recarregarProdutos} />}
      {alarmePedido && <AlarmeOverlay pedido={alarmePedido} mais={Math.max(0, alarme.length - 1)} impresso={impresso[alarmePedido.id] || null} onVer={verPedidos} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  header: { backgroundColor: colors.ink, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerName: { color: '#fff', fontSize: 15, fontWeight: '800', flexShrink: 1 },
  loja: { backgroundColor: '#2E2925', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  lojaTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  rail: { width: 86, backgroundColor: colors.ink, alignItems: 'center', paddingTop: 10, gap: 4 },
  logo: { color: colors.sign, fontSize: 13, fontWeight: '800', textAlign: 'center', marginBottom: 10, lineHeight: 14 },
  railTab: { width: 72, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  railTabOn: { backgroundColor: '#2A2521' },
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#fff', paddingVertical: 7 },
  barTab: { flex: 1, alignItems: 'center' },
  tabIc: { fontSize: 20 },
  tabLb: { fontSize: 10, fontWeight: '700', color: '#8D877D', marginTop: 1 },
  badge: { position: 'absolute', top: 2, right: '24%', minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.bad, color: '#fff', fontSize: 9.5, fontWeight: '800', textAlign: 'center', lineHeight: 17, overflow: 'hidden', paddingHorizontal: 4 },
});
