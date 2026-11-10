import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, AppState, Modal } from 'react-native'
import { StatusBar } from 'expo-status-bar'
// SafeAreaView do pacote 'react-native' não respeita a barra de navegação
// do Android (só funciona de verdade no iOS) — achado real do Ricardo,
// out/2026: a barra de baixo do app (Corridas/Ganhos/Perfil) ficava embaixo
// dos botões de navegação do sistema, sem dar pra clicar. Essa versão (do
// pacote safe-area-context) calcula a área segura nos dois sistemas.
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { colors, spacing, radius } from '../theme'
import { setDisponibilidade, getCorridas, getPainel, confirmarCodigo, confirmarGrupo, Motoboy, Oferta, Corrida } from '../api'
import CorridasScreen from './CorridasScreen'
import OfertaScreen from './OfertaScreen'
import CorridaAtivaScreen from './CorridaAtivaScreen'
import CodigoScreen from './CodigoScreen'
import ConcluidaScreen, { Concluida } from './ConcluidaScreen'
import Icon, { IconName } from '../components/Icon'
import { buildUnits, fmtMoney } from '../rides'
import { periodRange } from '../periodFilter'
import GanhosScreen from './GanhosScreen'
import PerfilScreen from './PerfilScreen'
import { registrarPushMotoboy } from '../push'
import { pararAlarme, statusAlertas } from 'alarme-motoboy'
import LocalizacaoScreen from './LocalizacaoScreen'
import {
  statusLocalizacao, StatusLocalizacao, ligarRastreio, desligarRastreio, rastreioLigado,
  marcarOfflineForcado, estavaOfflineForcado,
} from '../localizacao'

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
  const [ridesLoaded, setRidesLoaded] = useState(false)
  // Redesenho (nov/2026): a corrida ocupa a tela toda (oferta, indo à loja/ao
  // cliente, código, concluída). `foco` = unidade aberta; `mostrarMenu` = o
  // motoboy tocou em "Menu" e quer ver as abas com a corrida em andamento.
  const [foco, setFoco] = useState<string | null>(null)
  const [mostrarMenu, setMostrarMenu] = useState(false)
  const [codigoAberto, setCodigoAberto] = useState(false)
  const [concluida, setConcluida] = useState<Concluida | null>(null)
  const [concluidaHoje, setConcluidaHoje] = useState<string | null>(null)
  const prevRides = useRef<Corrida[] | null>(null)
  const prevKeys = useRef<Set<string> | null>(null)

  // Localização (nov/2026): obrigatória pra receber corrida e
  // pro rastreio em segundo plano com o Google Maps aberto. Sem ela, o app
  // mostra a tela de permissão no lugar de tudo e deixa o motoboy offline.
  const [loc, setLoc] = useState<StatusLocalizacao | null>(null)
  // O Android só deixa iniciar o serviço de localização com o app visível. Se a
  // corrida foi aceita com o app em 2º plano (WhatsApp), tenta de novo quando
  // o motoboy volta pro app.
  const [voltouAoApp, setVoltouAoApp] = useState(0)
  const checarLoc = useCallback(async () => { setLoc(await statusLocalizacao()) }, [])
  useEffect(() => { checarLoc() }, [checarLoc])
  const semLocalizacao = loc !== null && !loc.primeiroPlano
  useEffect(() => {
    if (loc === null) return
    if (semLocalizacao) {
      // Tira o motoboy da fila de corridas enquanto a permissão falta.
      marcarOfflineForcado(true)
      setOnline(false)
      setDisponibilidade(false).catch(() => {})
    } else {
      // Permissão voltou: se foi o app que o deixou offline, volta online.
      estavaOfflineForcado().then(forcado => {
        if (!forcado) return
        marcarOfflineForcado(false)
        setOnline(true)
        setDisponibilidade(true).catch(() => {})
      })
    }
  }, [semLocalizacao, loc === null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rastreio: liga o GPS em 2º plano enquanto houver corrida aceita e desliga
  // quando não houver mais nenhuma (entregue/cancelada).
  useEffect(() => {
    if (!ridesLoaded || loc === null) return
    if (rides.length > 0 && loc.primeiroPlano) {
      ligarRastreio()
    } else {
      rastreioLigado().then(on => { if (on) desligarRastreio() })
    }
  }, [ridesLoaded, rides.length, loc, voltouAoApp])

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
      // Corrida já retirada que saiu da lista sem ter sido cancelada = entregue.
      const antes = prevRides.current
      if (antes) {
        const canc = new Set((data.canceladas || []).map(c => c.id))
        const feita = antes.find(p => p.pickedUp && !data.rides.some(r => r.id === p.id) && !canc.has(p.id))
        if (feita) {
          setConcluida({ company: feita.company, customerName: feita.customerName, bairro: feita.bairro, valueLabel: feita.valueLabel })
          setConcluidaHoje(null)
          setCodigoAberto(false)
          getPainel({ from: periodRange('today').from || '', to: '' }).then(d => {
            const n = d.recentOrders.filter(o => o.status === 'entregue').length
            setConcluidaHoje(`${fmtMoney((d.periodAReceber || 0) + (d.periodRecebido || 0))} · ${n} ${n === 1 ? 'corrida' : 'corridas'}`)
          }).catch(() => {})
        }
      }
      prevRides.current = data.rides
      setOffer(data.offer)
      setRides(data.rides)
      setRidesLoaded(true)
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
      if (st === 'active') { pararAlarme(); setAlertasIncompletos(!statusAlertas().tudoOk); reload(); carregarOnline(); checarLoc(); setVoltouAoApp(n => n + 1) }
    })
    return () => sub.remove()
  }, [carregarOnline, checarLoc])

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
    if (semLocalizacao) return
    const next = !online
    setOnline(next)
    try { await setDisponibilidade(next) } catch { setOnline(!next) }
  }

  const units = buildUnits(rides)
  const unitKeys = units.map(u => u.key).join('|')
  // Corrida nova (ex.: acabou de aceitar, ou a retirada virou entrega) abre sozinha.
  useEffect(() => {
    if (!ridesLoaded) return
    const keys = new Set(units.map(u => u.key))
    if (prevKeys.current) {
      const nova = units.find(u => !prevKeys.current!.has(u.key))
      if (nova) { setFoco(nova.key); setMostrarMenu(false); setCodigoAberto(false) }
    }
    if (keys.size === 0) { setMostrarMenu(false); setCodigoAberto(false) }
    prevKeys.current = keys
  }, [ridesLoaded, unitKeys]) // eslint-disable-line react-hooks/exhaustive-deps

  const unitAtual = units.find(u => u.key === foco) || units[0] || null
  const alertasOk = !alertasIncompletos && !!loc?.primeiroPlano

  if (loc && semLocalizacao) {
    return <LocalizacaoScreen status={loc} onChange={setLoc} />
  }

  const canceladaModal = (
    <Modal visible={!!cancelada} transparent animationType="fade" onRequestClose={() => setCancelada(null)}>
      <View style={s.cancelFundo}>
        <View style={s.cancelCard}>
          <View style={s.cancelIcon}><Icon name="close" size={30} color="#fff" stroke={3} /></View>
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
  )

  // 1) Entrega concluída
  if (concluida) {
    return (
      <>
        <StatusBar style="light" />
        <ConcluidaScreen
          dados={concluida}
          hoje={concluidaHoje}
          onVoltar={() => { setConcluida(null); setTab('corridas'); setMostrarMenu(false) }}
          onGanhos={() => { setConcluida(null); setTab('ganhos') }}
        />
        {canceladaModal}
      </>
    )
  }

  // 2) Oferta nova em tela cheia
  if (offer) {
    return (
      <>
        <StatusBar style="light" />
        <OfertaScreen offer={offer} pauseAlert={pauseAlert} reload={reload} />
        {canceladaModal}
      </>
    )
  }

  // 3) Código de retirada / entrega
  if (tab === 'corridas' && !mostrarMenu && unitAtual && codigoAberto) {
    const loja = unitAtual.kind === 'loja'
    const alvos = unitAtual.rides.map(r => ({ id: r.id, label: r.customerName }))
    return (
      <>
        <StatusBar style="dark" />
        <CodigoScreen
          key={unitAtual.key}
          etapa={loja ? 'retirada' : 'entrega'}
          titulo={loja ? 'Código de retirada' : 'Código de entrega'}
          quem={loja ? `ao lojista da ${unitAtual.company}` : `à ${unitAtual.rides[0].customerName}`}
          alvos={alvos}
          confirmarLabel={loja ? 'Confirmar retirada' : 'Confirmar entrega'}
          onBack={() => setCodigoAberto(false)}
          onConfirm={async codes => {
            const erros: Record<string, string> = {}
            try {
              if (alvos.length === 1) {
                const r = await confirmarCodigo(alvos[0].id, codes[alvos[0].id])
                if (!r.ok) erros[alvos[0].id] = r.error || 'Código não confere'
              } else {
                const r = await confirmarGrupo(alvos.map(a => ({ orderId: a.id, code: codes[a.id] || '' })))
                r.results.forEach(x => { if (!x.ok) erros[x.orderId] = `${alvos.find(a => a.id === x.orderId)?.label || 'Pedido'}: ${x.error || 'não confere'}` })
              }
            } catch (e) {
              erros[alvos[0].id] = e instanceof Error ? e.message : 'Algo deu errado.'
            }
            if (Object.keys(erros).length === 0) { setCodigoAberto(false); reload() }
            return erros
          }}
        />
        {canceladaModal}
      </>
    )
  }

  // 4) Corrida em andamento (indo à loja / ao cliente)
  if (tab === 'corridas' && !mostrarMenu && unitAtual) {
    return (
      <>
        <StatusBar style="light" />
        <CorridaAtivaScreen unit={unitAtual} onCodigo={() => setCodigoAberto(true)} onMenu={() => setMostrarMenu(true)} />
        {canceladaModal}
      </>
    )
  }

  // 5) Menu principal (abas)
  const NAV: { tab: Tab; label: string; icon: IconName }[] = [
    { tab: 'corridas', label: 'Corridas', icon: 'bike' },
    { tab: 'ganhos', label: 'Ganhos', icon: 'wallet' },
    { tab: 'perfil', label: 'Perfil', icon: 'user' },
  ]
  return (
    <SafeAreaView style={s.wrap} edges={['top']}>
      <StatusBar style="dark" />
      {canceladaModal}
      <View style={{ flex: 1 }}>
        {tab === 'corridas' && (
          <CorridasScreen
            nome={motoboy.name}
            online={online}
            onToggleOnline={toggleOnline}
            units={units}
            onOpenUnit={key => { setFoco(key); setMostrarMenu(false); setCodigoAberto(false) }}
            alertasOk={alertasOk}
            onConfigurar={() => setTab('perfil')}
            reload={reload}
          />
        )}
        {tab === 'ganhos' && <GanhosScreen online={online} onToggleOnline={toggleOnline} />}
        {tab === 'perfil' && <PerfilScreen motoboy={motoboy} onLogout={() => { desligarRastreio(); onLogout() }} />}
      </View>
      <BottomNav items={NAV} tab={tab} onChange={setTab} />
    </SafeAreaView>
  )
}

function BottomNav({ items, tab, onChange }: { items: { tab: Tab; label: string; icon: IconName }[]; tab: Tab; onChange: (t: Tab) => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {items.map(it => {
        const on = it.tab === tab
        return (
          <Pressable key={it.tab} style={s.navItem} onPress={() => onChange(it.tab)}>
            {on && <View style={s.navBar} />}
            <Icon name={it.icon} size={24} color={on ? colors.gold : colors.mutedDark} />
            <Text style={[s.navTxt, on && s.navOn]}>{it.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  cancelFundo: { flex: 1, backgroundColor: 'rgba(18,15,10,0.8)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  cancelCard: { width: '100%', backgroundColor: colors.card, borderRadius: 24, padding: spacing.lg, alignItems: 'center', gap: spacing.sm, borderWidth: 3, borderColor: colors.bad },
  cancelIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bad, alignItems: 'center', justifyContent: 'center' },
  cancelTit: { fontSize: 22, fontWeight: '800', color: colors.bad },
  cancelTxt: { textAlign: 'center', color: colors.ink, fontSize: 15, lineHeight: 21 },
  cancelBtn: { marginTop: spacing.sm, backgroundColor: colors.bad, borderRadius: 16, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, alignSelf: 'stretch', alignItems: 'center' },
  cancelBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  // Barra inferior preta, ícone + nome, aba ativa em amarelo com marca no topo.
  nav: { flexDirection: 'row', backgroundColor: colors.ink, paddingHorizontal: 12, paddingTop: 10 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4 },
  navBar: { position: 'absolute', top: -10, width: 30, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.gold },
  navTxt: { fontSize: 12, fontWeight: '600', color: colors.mutedDark },
  navOn: { color: colors.gold, fontWeight: '700' },
})
