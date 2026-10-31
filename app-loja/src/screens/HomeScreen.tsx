import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
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
import AssistenteScreen from './AssistenteScreen';
import { getWizardState, saveWizardState } from '../wizardState';
import { carregarFeitos, jaFeito, marcarFeito } from '../alarmeAck';
import { stopAlarm } from '../../modules/thermal-printer-loja';

type Tab = 'pedidos' | 'cardapio' | 'hoje' | 'config';
const TABS: [Tab, string, string][] = [['pedidos', '🧾', 'Pedidos'], ['cardapio', '📋', 'Cardápio'], ['hoje', '📊', 'Hoje'], ['config', '⚙️', 'Ajustes']];
const ATIVAS = ['buscando', 'sem', 'caminho', 'retirado'];

export default function HomeScreen({ company: inicial }: { company: Company }) {
  useKeepAwake();
  const { layout, isTablet, width } = useLayout();
  const insets = useSafeAreaInsets();
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
  const [assistente, setAssistente] = useState(false);
  const [testeRecebido, setTesteRecebido] = useState(0);

  // O que o Realtime (criado uma vez) precisa ler sempre atualizado.
  const ref = useRef({ company, ownMoto, entregas });
  ref.current = { company, ownMoto, entregas };
  const ultimoToque = useRef<Record<string, number>>({});
  // pedidos que o app já tratou nesta abertura (recibo/aceite automático) e os
  // que você mandou "ver no quadro" (não voltam a abrir o alarme sozinhos)
  const tratados = useRef(new Set<string>());
  const dispensados = useRef(new Set<string>());

  // Só na primeira vez no aparelho: abre o assistente de configuração e já
  // marca como visto — fechar por qualquer caminho não faz ele voltar.
  useEffect(() => { getWizardState().then(w => { if (!w.visto) { setAssistente(true); saveWizardState({ visto: true }); } }); }, []);

  const player = useAudioPlayer(require('../../assets/sounds/pedido_novo_telefone.mp3'));
  useEffect(() => { setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {}); }, []);
  const tocar = useCallback((repetir: boolean) => { try { player.loop = repetir; player.seekTo(0).catch(() => {}); player.play(); } catch {} }, [player]);
  const parar = useCallback(() => { try { player.loop = false; player.pause(); } catch {} }, [player]);

  const recarregar = useCallback(async () => {
    const [a, h] = await Promise.all([fetchPedidosAbertos(company.id), fetchPedidosHoje(company.id), carregarFeitos()]).then(([x, y]) => [x, y] as const);
    setAbertos(a); setHoje(h);
    // Pedido recente que você ainda não confirmou no alarme (ex.: chegou com o
    // app fechado e o push abriu o app agora) volta a abrir a tela de alarme.
    const agora = Date.now();
    const novos = a.filter(p => p.origin !== 'balcao' && agora - new Date(p.created_at).getTime() < 30 * 60000 && !jaFeito('ack:' + p.id) && !dispensados.current.has(p.id)).map(p => p.id);
    if (novos.length) setAlarme(cur => { const add = novos.filter(id => !cur.includes(id)); return add.length ? [...cur, ...add] : cur; });
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

  // Push: o de teste mostra e toca mesmo com o app aberto; o de pedido novo
  // só leva ao quadro (o som e o alarme já vêm do Realtime em primeiro plano).
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        const teste = n.request.content.data?.tipo === 'teste';
        return { shouldShowBanner: teste, shouldShowList: teste, shouldPlaySound: teste, shouldSetBadge: false };
      },
    });
    const a = Notifications.addNotificationReceivedListener(n => {
      const tipo = n.request.content.data?.tipo;
      if (tipo === 'teste') setTesteRecebido(t => t + 1);
      if (tipo === 'pedido_novo') recarregar(); // reforço caso o Realtime esteja surdo
    });
    const b = Notifications.addNotificationResponseReceivedListener(r => {
      const tipo = r.notification.request.content.data?.tipo;
      if (tipo === 'teste') setTesteRecebido(t => t + 1);
      if (tipo === 'pedido_novo') { setTab('pedidos'); recarregar(); }
    });
    return () => { a.remove(); b.remove(); };
  }, [recarregar]);


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
      tratados.current.add(p.id);
      marcarFeito(['print:' + p.id]);
      setImpresso(m => ({ ...m, [p.id]: 'imprimindo' }));
      autoImprimirPedido(ref.current.company.name, p.id).then(r => setImpresso(m => ({ ...m, [p.id]: r.ok ? 'ok' : 'erro' })));
      if (p.origin !== 'balcao') {
        ultimoToque.current[p.id] = Date.now();
        setAlarme(a => (a.includes(p.id) ? a : [...a, p.id]));
        setNovoAviso(true);
      }
      if (ref.current.company.loja_auto_aceitar_pedidos) await avancar(p);
      recarregar();
    }, () => { recarregar(); });
  }, [company.id, recarregar, avancar]);

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
        }
      }
    }, 5000);
    return () => clearInterval(t);
  }, [abertos]);

  // Pedido que entrou com o app fechado (o Realtime não viu): imprime o recibo
  // e, com aceite automático ligado, aceita — uma vez só por pedido.
  useEffect(() => {
    const agora = Date.now();
    for (const p of abertos) {
      if (p.status !== 'recebido' || p.origin === 'balcao') continue;
      if (agora - new Date(p.created_at).getTime() > 30 * 60000) continue;
      if (tratados.current.has(p.id)) continue;
      tratados.current.add(p.id);
      if (!jaFeito('print:' + p.id)) {
        marcarFeito(['print:' + p.id]);
        setImpresso(m => ({ ...m, [p.id]: 'imprimindo' }));
        autoImprimirPedido(ref.current.company.name, p.id).then(r => setImpresso(m => ({ ...m, [p.id]: r.ok ? 'ok' : 'erro' })));
      }
      if (ref.current.company.loja_auto_aceitar_pedidos) avancar(p);
    }
  }, [abertos, avancar]);

  // O alarme nativo (tela cheia com o app fechado) para assim que o app abre;
  // daqui pra frente quem toca é a tela de alarme do próprio app.
  useEffect(() => {
    stopAlarm();
    const sub = AppState.addEventListener('change', st => { if (st === 'active') { stopAlarm(); recarregar(); } });
    return () => sub.remove();
  }, [recarregar]);

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
  // Fica na tela até alguém confirmar: aceite manual → pedido ainda em "recebido";
  // aceite automático → o pedido já avançou sozinho, falta só o OK.
  const alarmePedido = alarme.map(id => todos.get(id)).find(p => p && p.status !== 'cancelado' && p.status !== 'entregue' && (p.status === 'recebido' || company.loja_auto_aceitar_pedidos));

  // O som repete enquanto a tela de alarme estiver aberta.
  const tocando = !!alarmePedido;
  useEffect(() => { if (tocando) tocar(true); else parar(); }, [tocando, tocar, parar]);

  function fecharAlarme(dispensar: boolean) {
    if (dispensar) alarme.forEach(id => dispensados.current.add(id));
    else marcarFeito(alarme.map(id => 'ack:' + id));
    setAlarme([]); parar(); setNovoAviso(false);
  }
  async function aceitarAlarme() {
    const pedidos = alarme.map(id => todos.get(id)).filter((p): p is Pedido => !!p);
    fecharAlarme(false);
    if (!company.loja_auto_aceitar_pedidos) for (const p of pedidos) if (p.status === 'recebido') await avancar(p);
  }
  function verPedidos() { fecharAlarme(true); setTab('pedidos'); }

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
        {tab === 'config' && <ConfigScreen companyName={company.name} lojaAberta={!company.store_paused} onToggleLoja={() => toggleFlag('store_paused')} onAbrirAssistente={() => setAssistente(true)} />}
      </View>
    </View>
  );

  return (
    // Android 15+ desenha o app por baixo da barra de status e dos botões de
    // navegação (edge-to-edge); os insets empurram o conteúdo pra fora delas.
    <View style={[styles.wrap, { backgroundColor: colors.ink, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={{ flex: 1, backgroundColor: colors.paper, paddingBottom: rail ? insets.bottom : 0 }}>
      {rail ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={styles.rail}><Text style={styles.logo}>TRINDADE{'\n'}LOJA</Text>{tabs}</View>
          {conteudo}
        </View>
      ) : (
        <View style={{ flex: 1 }}>{conteudo}<View style={[styles.bar, { paddingBottom: 7 + insets.bottom }]}>{tabs}</View></View>
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
      {assistente && <AssistenteScreen companyId={company.id} testeRecebido={testeRecebido} onClose={() => setAssistente(false)} />}
      {editando && <ProdutoEdit produto={editando} companyId={company.id} isTablet={isTablet} onClose={() => setEditando(null)} onSaved={recarregarProdutos} />}
      {alarmePedido && <AlarmeOverlay pedido={alarmePedido} mais={Math.max(0, alarme.length - 1)} impresso={impresso[alarmePedido.id] || null} autoAceitar={company.loja_auto_aceitar_pedidos} onAceitar={aceitarAlarme} onVer={verPedidos} />}
      </View>
    </View>
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
