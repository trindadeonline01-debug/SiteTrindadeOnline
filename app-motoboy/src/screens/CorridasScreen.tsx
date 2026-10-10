import { useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, RefreshControl, Linking } from 'react-native'
import { useAudioPlayer } from 'expo-audio'
import { colors, spacing, radius, errMsg } from '../theme'
import { getCorridas, aceitarOferta, recusarOferta, confirmarCodigo, confirmarGrupo, Oferta, Corrida } from '../api'

// "O entregador tá cego" (Ricardo, out/2026) — o card de "indo entregar" só
// tinha nome e código, nada de endereço nem contato. Esses dois abrem o que
// já está instalado no celular (Maps/WhatsApp), sem precisar de API nova.
function openMaps(address: string) {
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
}
function openWhatsApp(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('55')) digits = '55' + digits
  Linking.openURL(`https://wa.me/${digits}`)
}

function fmtTempo(s: number) {
  const m = Math.floor(s / 60); const sec = s % 60
  return `${m}:${sec < 10 ? '0' : ''}${sec}`
}
function isStaleRide(iso: string) { return Date.now() - new Date(iso).getTime() > 2 * 60 * 60 * 1000 }
function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Mesma engine do painel web (src/app/motoboy/painel/page.tsx) — poll a
// cada 4s em vez de Supabase Realtime, porque motoboy não é usuário
// Supabase Auth (ver KB). Round 2 troca esse poll por push nativo quando
// o Firebase estiver configurado; a lógica de aceitar/recusar/confirmar
// continua a mesma de qualquer forma.
export default function CorridasScreen() {
  const [offer, setOffer] = useState<Oferta | null>(null)
  const [rides, setRides] = useState<Corrida[]>([])
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [soloCodes, setSoloCodes] = useState<Record<string, string>>({})
  const [soloErrs, setSoloErrs] = useState<Record<string, string>>({})
  const [groupCodes, setGroupCodes] = useState<Record<string, string>>({})
  const [groupErrs, setGroupErrs] = useState<Record<string, string>>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Som insistente enquanto tiver oferta esperando resposta (pedido do
  // Ricardo, out/2026 — "não temos o barulho do Trindade Online tocando").
  // O painel web já faz isso com um beep sintetizado via Web AudioContext
  // (não existe no RN); aqui usa um arquivo de áudio de verdade com
  // expo-audio em loop. Toca som placeholder por enquanto — quando o
  // Ricardo mandar a musiquinha de marca de verdade, troca o arquivo em
  // assets/sounds/alerta_corrida.wav, sem precisar mudar nada aqui.
  const alertPlayer = useAudioPlayer(require('../../assets/sounds/alerta_corrida.wav'))
  const hasOffer = !!offer

  useEffect(() => {
    alertPlayer.loop = true
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

  const load = useCallback(async () => {
    try {
      const data = await getCorridas()
      setOffer(data.offer)
      setRides(data.rides)
    } catch {}
  }, [])

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])

  useEffect(() => {
    if (!offer) { setSecondsLeft(0); return }
    const tick = () => setSecondsLeft(Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [offer])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleAceitar() {
    setBusy(true)
    alertPlayer.pause() // não espera o próximo poll pra calar o som
    try { await aceitarOferta() } catch {} finally { setBusy(false); load() }
  }
  async function handleRecusar() {
    setBusy(true)
    alertPlayer.pause()
    try { await recusarOferta() } catch {} finally { setBusy(false); load() }
  }

  async function handleConfirmarSolo(id: string) {
    const code = soloCodes[id]
    if (!code) return
    setSoloErrs(e => ({ ...e, [id]: '' }))
    try {
      const r = await confirmarCodigo(id, code)
      if (!r.ok) setSoloErrs(e => ({ ...e, [id]: r.error || 'não confere' }))
      else { setSoloCodes(c => ({ ...c, [id]: '' })); load() }
    } catch (e) {
      setSoloErrs(er => ({ ...er, [id]: errMsg(e) }))
    }
  }

  async function handleConfirmarGrupo(ids: string[]) {
    const items = ids.map(id => ({ orderId: id, code: groupCodes[id] || '' }))
    const r = await confirmarGrupo(items)
    const newErrs: Record<string, string> = {}
    r.results.forEach(res => { if (!res.ok) newErrs[res.orderId] = res.error || 'não confere' })
    setGroupErrs(newErrs)
    if (Object.keys(newErrs).length === 0) { setGroupCodes({}); load() }
  }

  // Corridas aguardando retirada da MESMA loja viram um card de grupo —
  // achado real: retirar vários pedidos da mesma loja numa só ida
  // (Confeitaria da Juju, 3 pedidos de uma vez).
  const aRetirar = rides.filter(r => !r.pickedUp)
  const porLoja = new Map<string, Corrida[]>()
  aRetirar.forEach(r => porLoja.set(r.company, [...(porLoja.get(r.company) || []), r]))
  const aEntregar = rides.filter(r => r.pickedUp)

  return (
    <ScrollView style={s.wrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {offer && (
        <View style={s.offerBox}>
          <Text style={s.offerKicker}>NOVA CORRIDA</Text>
          <View style={s.ring}><Text style={s.ringTxt}>{fmtTempo(secondsLeft)}</Text></View>
          <Text style={s.offerCompany}>{offer.company}</Text>
          <Text style={s.offerBairro}>→ {offer.bairro || 'destino do cliente'}</Text>
          <Text style={s.offerValor}>R$ {offer.valueLabel}</Text>
          <View style={s.offerBtns}>
            <Pressable style={[s.btn, s.btnBad]} disabled={busy} onPress={handleRecusar}><Text style={s.btnTxt}>Recusar</Text></Pressable>
            <Pressable style={[s.btn, s.btnGood]} disabled={busy} onPress={handleAceitar}><Text style={s.btnTxt}>Aceitar</Text></Pressable>
          </View>
        </View>
      )}

      {!offer && rides.length === 0 && (
        <View style={s.empty}><Text style={s.emptyTxt}>Nenhuma corrida ativa agora.{'\n'}Fica de olho — a próxima oferta aparece aqui.</Text></View>
      )}

      {Array.from(porLoja.entries()).map(([loja, items]) => (
        <View key={loja} style={s.card}>
          <Text style={s.cardTitle}>{loja}</Text>
          {items.length > 1 && <Text style={s.muted}>{items.length} pedidos pra retirar junto</Text>}
          {items.map(r => (
            <View key={r.id} style={s.rideRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.rideCliente}>{r.customerName}</Text>
                <Text style={s.muted}>{r.bairro || r.pickupAddress} · R$ {r.valueLabel}{isStaleRide(r.requestedAt) ? ' · ⚠️ há muito tempo' : ` · ${fmtHora(r.requestedAt)}`}</Text>
              </View>
              <TextInput
                style={s.codeInput}
                placeholder="código"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={4}
                value={items.length > 1 ? (groupCodes[r.id] || '') : (soloCodes[r.id] || '')}
                onChangeText={t => items.length > 1 ? setGroupCodes(c => ({ ...c, [r.id]: t })) : setSoloCodes(c => ({ ...c, [r.id]: t }))}
              />
              {items.length === 1 && (
                <Pressable style={s.btnSm} onPress={() => handleConfirmarSolo(r.id)}><Text style={s.btnSmTxt}>Confirmar</Text></Pressable>
              )}
            </View>
          ))}
          {items.map(r => (items.length > 1 && groupErrs[r.id]) ? <Text key={r.id + 'e'} style={s.erroTxt}>{r.customerName}: {groupErrs[r.id]}</Text> : null)}
          {items.map(r => (items.length === 1 && soloErrs[r.id]) ? <Text key={r.id + 'e'} style={s.erroTxt}>{soloErrs[r.id]}</Text> : null)}
          {items.length > 1 && (
            <Pressable style={s.btn} onPress={() => handleConfirmarGrupo(items.map(i => i.id))}><Text style={s.btnTxt}>Confirmar todos</Text></Pressable>
          )}
        </View>
      ))}

      {aEntregar.map(r => (
        <View key={r.id} style={s.card}>
          <View style={s.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{r.customerName}</Text>
              <Text style={s.muted}>{r.bairro || r.dropoffAddress} · R$ {r.valueLabel}</Text>
            </View>
            <Text style={s.pillWait}>🏍️ Indo entregar</Text>
          </View>
          <View style={s.addrRow}>
            {r.pickupAddress && (
              <Pressable style={s.addrBtn} onPress={() => openMaps(r.pickupAddress!)}>
                <Text style={s.addrBtnTxt}>📍 Loja</Text>
              </Pressable>
            )}
            {r.dropoffAddress && (
              <Pressable style={s.addrBtn} onPress={() => openMaps(r.dropoffAddress!)}>
                <Text style={s.addrBtnTxt}>📍 Cliente</Text>
              </Pressable>
            )}
          </View>
          {r.customerPhone && (
            <Pressable style={s.waBtn} onPress={() => openWhatsApp(r.customerPhone!)}>
              <Text style={s.waBtnTxt}>💬 Chamar cliente no WhatsApp</Text>
            </Pressable>
          )}
          <View style={s.rideRow}>
            <TextInput
              style={[s.codeInput, { flex: 1 }]}
              placeholder="código de entrega"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={4}
              value={soloCodes[r.id] || ''}
              onChangeText={t => setSoloCodes(c => ({ ...c, [r.id]: t }))}
            />
            <Pressable style={s.btnSm} onPress={() => handleConfirmarSolo(r.id)}><Text style={s.btnSmTxt}>Confirmar</Text></Pressable>
          </View>
          {soloErrs[r.id] ? <Text style={s.erroTxt}>{soloErrs[r.id]}</Text> : null}
        </View>
      ))}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, padding: spacing.md },
  offerBox: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  offerKicker: { color: colors.paperDark, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  ring: { width: 72, height: 72, borderRadius: 36, borderWidth: 5, borderColor: colors.bad, alignItems: 'center', justifyContent: 'center' },
  ringTxt: { color: colors.bad, fontWeight: '800', fontSize: 18 },
  offerCompany: { color: colors.paper, fontWeight: '800', fontSize: 16 },
  offerBairro: { color: colors.paperDark, fontSize: 13 },
  offerValor: { color: colors.gold, fontWeight: '800', fontSize: 24 },
  offerBtns: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyTxt: { color: colors.muted, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { fontWeight: '800', fontSize: 15, color: colors.ink },
  muted: { color: colors.muted, fontSize: 12 },
  addrRow: { flexDirection: 'row', gap: spacing.sm },
  addrBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: spacing.sm },
  addrBtnTxt: { fontWeight: '700', fontSize: 12, color: colors.ink },
  waBtn: { backgroundColor: colors.goodBg, borderWidth: 1, borderColor: '#BEE3CC', borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  waBtnTxt: { fontWeight: '800', fontSize: 12.5, color: colors.good },
  rideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rideCliente: { fontWeight: '700', color: colors.ink },
  codeInput: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: spacing.sm, width: 80, textAlign: 'center', fontWeight: '700' },
  btn: { backgroundColor: colors.gold, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  btnGood: { backgroundColor: colors.good, flex: 1 },
  btnBad: { backgroundColor: colors.bad, flex: 1 },
  btnTxt: { fontWeight: '800', color: '#fff' },
  btnSm: { backgroundColor: colors.gold, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  btnSmTxt: { fontWeight: '800', color: colors.ink, fontSize: 12 },
  pillWait: { alignSelf: 'flex-start', backgroundColor: colors.waitBg, color: colors.wait, fontWeight: '700', fontSize: 11, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
  erroTxt: { color: colors.bad, fontSize: 12 },
})
