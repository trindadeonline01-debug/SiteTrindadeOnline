import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, AppState, Modal } from 'react-native'
// SafeAreaView do pacote 'react-native' não respeita a barra de navegação
// do Android (só funciona de verdade no iOS) — achado real do Ricardo,
// out/2026: a barra de baixo do app (Corridas/Ganhos/Perfil) ficava embaixo
// dos botões de navegação do sistema, sem dar pra clicar. Essa versão (do
// pacote safe-area-context) calcula a área segura nos dois sistemas.
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { colors, spacing, radius } from '../theme'
import { setDisponibilidade, getCorridas, getPainel, Motoboy, Oferta, Corrida } from '../api'
import CorridasScreen from './CorridasScreen'
import GanhosScreen from './GanhosScreen'
import PerfilScreen from './PerfilScreen'
import { registrarPushMotoboy } from '../push'
import { pararAlarme, statusAlertas } from 'alarme-motoboy'

type Tab = 'corridas' | 'ganhos' | 'perfil'
type Props = { motoboy: Motoboy; onLogout: () => void }

export default function HomeScreen({ motoboy, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('corridas')
  // Online/offline vem SEMPRE do servidor (motoboys.available), nunca de um
  // valor fixo do app — antes começava em `false` toda vez que o app abria e
  // o motoboy parecia offline mesmo estando online no sistema (Ricardo,
  // 9/nov/2026: "toda vez que eu fecho o aplicativo, o motoboy fica
  // offline"). Só muda quando o motoboy toca no botão.
  const [online, setOnline] = useState(true)
  const carregarOnline = useCallback(async () => {
    try {
      const d = await getPainel()
      setOnline(!!d.motoboy.available)
    } catch {}
  }, [])
  useEffect(() => { carregarOnline() }, [carregarOnline])

  // Polling de corridas (oferta + corridas ativas) e o som de alerta moram
  // AQUI, não dentro de CorridasScreen — achado real do Ricardo, out/2026:
  // "a música não tocou". Causa: CorridasScreen só existe enquanto a aba
  // Corridas está em foco (`{tab === 'corridas' && <CorridasScreen />}`
  // desmonta o componente nas outras abas), então se a oferta chegasse com
  // o motoboy olhando Ganhos ou Perfil, nem o poll nem o som rodavam. Aqui
  // em cima sobrevive à troca de aba — o som toca não importa onde o
  // motoboy está dentro do app.
  const [offer, setOffer] = useState<Oferta | null>(null)
  const [rides, setRides] = useState<Corrida[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Corrida cancelada com o app aberto (nov/2026): uma corrida que ainda NÃO
  // foi retirada e some da lista só pode ter sido cancelada pela loja (entrega
  // exige retirada antes). Mostra aviso vermelho + som até o motoboy tocar OK.
  const [cancelada, setCancelada] = useState<{ company: string; pickedUp: boolean } | null>(null)
  // Ids de corridas canceladas já conhecidas: a 1ª resposta só "semeia" a lista (não
  // mostra aviso de cancelamento antigo); depois, cada id novo abre o aviso uma vez.
  const canceladasVistas = useRef<Set<string> | null>(null)
  const reload = useCallback(async () => {
    try {
      const data = await getCorridas()
      const lista = data.canceladas || []
      if (canceladasVistas.current === null) {
        canceladasVistas.current = new Set(lista.map(c => c.id))
      } else {
        const nova = lista.find(c => !canceladasVistas.current!.has(c.id))
        if (nova) { canceladasVistas.current.add(nova.id); setCancelada({ company: nova.company, pickedUp: nova.pickedUp }) }
      }
      setOffer(data.offer)
      setRides(data.rides)
    } catch {}
  }, [])

  // Push nativo + alarme de corrida com o app fechado (nov/2026). Ao abrir
  // ou voltar pro app, o alarme nativo para — a partir daí quem toca é a
  // própria tela (alertPlayer abaixo), enquanto a oferta estiver de pé.
  const [alertasIncompletos, setAlertasIncompletos] = useState(false)
  useEffect(() => {
    registrarPushMotoboy()
    pararAlarme()
    setAlertasIncompletos(!statusAlertas().tudoOk)
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') { pararAlarme(); setAlertasIncompletos(!statusAlertas().tudoOk); reload(); carregarOnline() }
    })
    return () => sub.remove()
  }, [carregarOnline])

  useEffect(() => {
    reload()
    pollRef.current = setInterval(reload, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [reload])

  // Som de marca "N1 — três toques e acorde" (aprovado pelo Ricardo, 9/nov/2026):
  // três toques de telefone subindo de tom + acorde de 3 notas (Trindade = três).
  // Toca em loop, no volume máximo, enquanto tiver oferta esperando resposta.
  const alertPlayer = useAudioPlayer(require('../../assets/sounds/alerta_corrida.wav'))
  const hasOffer = !!offer
  const cancelPlayer = useAudioPlayer(require('../../assets/sounds/corrida_cancelada.wav'))
  useEffect(() => {
    cancelPlayer.loop = true
    cancelPlayer.volume = 1
    if (cancelada) {
      cancelPlayer.seekTo(0).catch(() => {})
      cancelPlayer.play()
      const t = setTimeout(() => { try { cancelPlayer.pause() } catch {} }, 12000)
      return () => clearTimeout(t)
    } else {
      try { cancelPlayer.pause() } catch {}
    }
  }, [cancelada, cancelPlayer])

  useEffect(() => {
    alertPlayer.loop = true
    alertPlayer.volume = 1
    // Explícito em vez de confiar no default — garante que o som toca
    // mesmo com o celular no silencioso/vibrar (`playsInSilentMode`,
    // default já é `true`, mas sem isso o comportamento real dependia do
    // que o sistema decidisse sozinho).
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {})
  }, [alertPlayer])

  useEffect(() => {
    if (hasOffer) {
      alertPlayer.seekTo(0).catch(() => {})
      alertPlayer.play()
    } else {
      alertPlayer.pause()
      alertPlayer.seekTo(0).catch(() => {})
    }
  }, [hasOffer, alertPlayer])

  function pauseAlert() {
    alertPlayer.pause() // não espera o próximo poll pra calar o som
  }

  async function toggleOnline() {
    const next = !online
    setOnline(next)
    try { await setDisponibilidade(next) } catch { setOnline(!next) }
  }

  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.header}>
        {/* Nome à esquerda, botão de online/offline à direita — ordem
            trocada a pedido do Ricardo, out/2026 (estava ao contrário). */}
        <Text style={s.headerName}>{motoboy.name}</Text>
        <Pressable style={[s.onlinePill, online ? s.onlineOn : s.onlineOff]} onPress={toggleOnline}>
          <Text style={[s.onlineTxt, online && { color: colors.good }]}>{online ? '🟢 Online' : '⚫ Offline'}</Text>
        </Pressable>
      </View>

      {alertasIncompletos && (
        <Pressable style={s.aviso} onPress={() => setTab('perfil')}>
          <Text style={s.avisoTxt}>⚠️ Alertas de corrida incompletos — toque aqui para configurar (Perfil → Alertas de corrida).</Text>
        </Pressable>
      )}

      <Modal visible={!!cancelada} transparent animationType="fade" onRequestClose={() => setCancelada(null)}>
        <View style={s.cancelFundo}>
          <View style={s.cancelCard}>
            <Text style={s.cancelEmoji}>❌</Text>
            <Text style={s.cancelTit}>Corrida cancelada</Text>
            <Text style={s.cancelTxt}>
              {cancelada?.company ? `A loja ${cancelada.company} cancelou essa corrida.` : 'A loja cancelou essa corrida.'}{' '}
              {cancelada?.pickedUp ? 'Volte ao estabelecimento e devolva o pedido.' : 'Você não precisa buscar nem entregar.'}
            </Text>
            <Pressable style={s.cancelBtn} onPress={() => setCancelada(null)}>
              <Text style={s.cancelBtnTxt}>OK, entendi</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={{ flex: 1 }}>
        {tab === 'corridas' && <CorridasScreen offer={offer} rides={rides} reload={reload} pauseAlert={pauseAlert} />}
        {tab === 'ganhos' && <GanhosScreen />}
        {tab === 'perfil' && <PerfilScreen motoboy={motoboy} onLogout={onLogout} />}
      </View>

      <View style={s.bottomNav}>
        <Pressable style={s.navItem} onPress={() => setTab('corridas')}>
          <Text style={[s.navTxt, tab === 'corridas' && s.navOn]}>🏠 Corridas{hasOffer && tab !== 'corridas' ? ' 🔴' : ''}</Text>
        </Pressable>
        <Pressable style={s.navItem} onPress={() => setTab('ganhos')}><Text style={[s.navTxt, tab === 'ganhos' && s.navOn]}>💰 Ganhos</Text></Pressable>
        <Pressable style={s.navItem} onPress={() => setTab('perfil')}><Text style={[s.navTxt, tab === 'perfil' && s.navOn]}>👤 Perfil</Text></Pressable>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.card },
  cancelFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  cancelCard: { width: '100%', backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', gap: spacing.sm, borderWidth: 3, borderColor: colors.bad },
  cancelEmoji: { fontSize: 44 },
  cancelTit: { fontSize: 22, fontWeight: '800', color: colors.bad },
  cancelTxt: { textAlign: 'center', color: colors.ink, fontSize: 15 },
  cancelBtn: { marginTop: spacing.sm, backgroundColor: colors.bad, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, alignSelf: 'stretch', alignItems: 'center' },
  cancelBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  onlinePill: { borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1 },
  onlineOn: { backgroundColor: colors.goodBg, borderColor: colors.good },
  onlineOff: { backgroundColor: colors.paperDark, borderColor: colors.line },
  onlineTxt: { fontWeight: '700', fontSize: 12.5, color: colors.muted },
  aviso: { backgroundColor: '#FFF4D6', borderBottomWidth: 1, borderBottomColor: colors.line, padding: spacing.sm },
  avisoTxt: { fontSize: 12.5, color: colors.ink, fontWeight: '600' },
  headerName: { fontWeight: '700', color: colors.ink },
  // Área de toque ~35% mais alta que antes (era só o texto solto, sem
  // padding — ficava estreito demais pra clicar, achado do Ricardo,
  // out/2026). Padding mora no item, não no container, pra cada aba ter
  // sua própria área de toque cheia em vez de dividir um espaço comum.
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  navTxt: { fontSize: 12, color: colors.muted },
  navOn: { color: colors.goldDark, fontWeight: '800' },
})
