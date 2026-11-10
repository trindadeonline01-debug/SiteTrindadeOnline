import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Switch, ScrollView, AppState, Linking } from 'react-native'
import { useAudioPlayer } from 'expo-audio'
import { statusAlertas, abrirAjusteNotificacoes, abrirAjusteSobrepor, abrirAjusteTelaCheia, abrirAjusteBateria } from 'alarme-motoboy'
import * as LocalAuthentication from 'expo-local-authentication'
import { colors, spacing, radius, errMsg } from '../theme'
import { atualizarPix, logout, getPainel, Motoboy } from '../api'
import Icon from '../components/Icon'
import { iniciais } from '../rides'
import { clearToken, isBiometricEnabled, setBiometricEnabled } from '../auth'
import { statusLocalizacao, pedirLocalizacao, StatusLocalizacao } from '../localizacao'

type Props = { motoboy: Motoboy; onLogout: () => void }

export default function PerfilScreen({ motoboy, onLogout }: Props) {
  const [editPix, setEditPix] = useState(false)
  const [pixKey, setPixKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [pixInfo, setPixInfo] = useState('')
  useEffect(() => {
    getPainel().then(d => {
      const k = d.motoboy.pix_key
      setPixInfo(k ? `Chave cadastrada · final ${k.slice(-3)}` : '')
    }).catch(() => {})
  }, [saving])
  // Login com digital (pedido do Ricardo, out/2026) — só mostra o toggle se
  // o aparelho tiver sensor E já tiver digital/Face ID cadastrado nele.
  const [bioSupported, setBioSupported] = useState(false)
  const [bioEnabled, setBioEnabledState] = useState(false)

  // Alertas de corrida (nov/2026): confere as 4 permissões que o Android exige
  // pro alarme tocar e abrir o app com a tela apagada ou em cima de outro app.
  const [alertas, setAlertas] = useState(() => statusAlertas())
  const [loc, setLoc] = useState<StatusLocalizacao | null>(null)
  useEffect(() => {
    statusLocalizacao().then(setLoc)
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') { setAlertas(statusAlertas()); statusLocalizacao().then(setLoc) }
    })
    return () => sub.remove()
  }, [])
  async function ligarLocalizacao() {
    const r = await pedirLocalizacao()
    setLoc(r)
    if (!r.primeiroPlano) Linking.openSettings().catch(() => {})
  }
  const testePlayer = useAudioPlayer(require('../../assets/sounds/alerta_corrida.wav'))
  function testarSom() {
    try {
      testePlayer.volume = 1
      testePlayer.seekTo(0).catch(() => {})
      testePlayer.play()
      setTimeout(() => { try { testePlayer.pause() } catch {} }, 4000)
    } catch {}
  }

  useEffect(() => {
    (async () => {
      const [hw, enrolled, pref] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        isBiometricEnabled(),
      ])
      setBioSupported(hw && enrolled)
      setBioEnabledState(pref)
    })()
  }, [])

  async function handleToggleBio(next: boolean) {
    if (next) {
      // Confirma que a digital funciona ANTES de ativar — sem isso, dava
      // pra ligar e ficar travado numa digital que não reconhece nada.
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirma sua digital pra ativar' })
      if (!r.success) return
    }
    await setBiometricEnabled(next)
    setBioEnabledState(next)
  }

  async function handleSalvarPix() {
    if (!pixKey.trim()) return
    setSaving(true)
    try {
      await atualizarPix(pixKey.trim(), 'celular')
      setMsg('Chave Pix atualizada.')
      setEditPix(false)
    } catch (e) {
      setMsg(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleSair() {
    try { await logout() } catch {}
    await clearToken()
    onLogout()
  }

  const itens: { ok: boolean; titulo: string; ajuda: string; onPress: () => void }[] = [
    { ok: alertas.notificacoes, titulo: 'Notificações', ajuda: 'Aviso de corrida nova e cancelada', onPress: abrirAjusteNotificacoes },
    { ok: alertas.sobrepor, titulo: 'Sobrepor a outros apps', ajuda: 'A corrida abre por cima de qualquer app', onPress: abrirAjusteSobrepor },
    { ok: alertas.telaCheia, titulo: 'Notificação em tela cheia', ajuda: 'Mostra a corrida na tela bloqueada', onPress: abrirAjusteTelaCheia },
    { ok: !!loc?.primeiroPlano, titulo: 'Localização', ajuda: 'A loja e o cliente acompanham a corrida', onPress: ligarLocalizacao },
    { ok: alertas.bateria, titulo: 'Sem economia de bateria', ajuda: 'Impede o Android de fechar o app', onPress: abrirAjusteBateria },
  ]
  const okCount = itens.filter(i => i.ok).length
  const tudoOk = okCount === itens.length

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={s.wrap}>
      <Text style={s.h1}>Perfil</Text>

      <View style={s.hero}>
        <View style={s.avatar}><Text style={s.avatarTxt}>{iniciais(motoboy.name)}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.nome} numberOfLines={2}>{motoboy.name}</Text>
          <Text style={s.fone}>{motoboy.phone}</Text>
          <View style={s.tag}><Icon name="shield" size={14} color={colors.gold} stroke={2.2} /><Text style={s.tagTxt}>Motoboy parceiro</Text></View>
        </View>
      </View>

      <View style={s.listCard}>
        <Pressable style={[s.row, s.rowBorder]} onPress={() => setEditPix(e => !e)}>
          <View style={s.rowIcon}><Icon name="card" size={20} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTit}>Chave Pix</Text>
            <Text style={s.rowSub}>{pixInfo || 'Toque para cadastrar'}</Text>
          </View>
          <Text style={s.editar}>Editar</Text>
        </Pressable>
        {editPix && (
          <View style={s.pixBox}>
            <TextInput style={s.field} placeholder="Nova chave Pix" placeholderTextColor={colors.muted} value={pixKey} onChangeText={setPixKey} autoCapitalize="none" />
            <Pressable style={s.btnGold} disabled={saving} onPress={handleSalvarPix}><Text style={s.btnGoldTxt}>Salvar chave</Text></Pressable>
          </View>
        )}
        {msg ? <Text style={s.msg}>{msg}</Text> : null}
        <View style={[s.row, bioSupported && s.rowBorder]}>
          <View style={s.rowIcon}><Icon name="doc" size={20} /></View>
          <Text style={[s.rowTit, { flex: 1 }]}>Documentos</Text>
          <Text style={s.okPill}>Aprovados</Text>
        </View>
        {bioSupported && (
          <View style={s.row}>
            <View style={s.rowIcon}><Icon name="lock" size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTit}>Entrar com digital</Text>
              <Text style={s.rowSub}>Abre o app sem digitar código</Text>
            </View>
            <Switch value={bioEnabled} onValueChange={handleToggleBio} trackColor={{ true: colors.gold, false: colors.line }} thumbColor={colors.ink} />
          </View>
        )}
      </View>

      <View style={s.saude}>
        <View style={s.saudeHead}>
          <Text style={s.saudeTit}>Saúde do app</Text>
          <Text style={[s.contador, !tudoOk && { backgroundColor: '#FFF1CC', color: '#6B4A00' }]}>{okCount} de {itens.length}</Text>
        </View>
        <View style={s.barra}><View style={[s.barraFill, { width: `${(okCount / itens.length) * 100}%`, backgroundColor: tudoOk ? colors.good : colors.gold }]} /></View>
        <Text style={s.saudeTxt}>Com tudo ligado, a corrida toca e abre o app mesmo com a tela apagada ou em cima de outro aplicativo.</Text>
        {itens.map((it, i) => (
          <Pressable key={it.titulo} style={[s.item, i < itens.length - 1 && s.itemBorder]} onPress={it.ok ? undefined : it.onPress}>
            <View style={[s.check, !it.ok && { backgroundColor: colors.bad }]}>
              <Icon name={it.ok ? 'check' : 'close'} size={15} color="#fff" stroke={3} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.itemTit}>{it.titulo}</Text>
              <Text style={s.itemSub}>{it.ajuda}</Text>
            </View>
            {!it.ok && <Text style={s.ligar}>Ligar</Text>}
          </Pressable>
        ))}
      </View>

      <Pressable style={s.somBtn} onPress={testarSom}>
        <Icon name="speaker" size={20} /><Text style={s.somTxt}>Testar o som da corrida</Text>
      </Pressable>

      <View style={s.listCard}>
        <Pressable style={s.row} onPress={() => Linking.openURL('https://wa.me/5521986210551').catch(() => Alert.alert('Ajuda', 'Fale com a gente pelo WhatsApp da Trindade Online.'))}>
          <View style={s.rowIcon}><Icon name="chat" size={20} /></View>
          <Text style={[s.rowTit, { flex: 1 }]}>Ajuda pelo WhatsApp</Text>
          <Icon name="chevronRight" size={18} color={colors.muted} />
        </Pressable>
      </View>

      <Pressable style={s.sair} onPress={handleSair}><Text style={s.sairTxt}>Sair da conta</Text></Pressable>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.ink },
  hero: { marginTop: 16, backgroundColor: colors.ink, borderRadius: 24, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontWeight: '800', fontSize: 26, color: colors.ink },
  nome: { fontSize: 21, fontWeight: '800', color: '#fff', lineHeight: 24 },
  fone: { fontSize: 14, color: colors.mutedDark, marginTop: 3 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, backgroundColor: colors.inkLine, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  tagTxt: { fontSize: 12, fontWeight: '700', color: colors.gold },
  listCard: { marginTop: 14, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#EEEAE0' },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  rowTit: { fontSize: 15, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 1 },
  editar: { fontSize: 13, fontWeight: '700', color: colors.goldDark },
  okPill: { backgroundColor: colors.goodBg, color: colors.goodDark, fontSize: 12, fontWeight: '800', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, overflow: 'hidden' },
  pixBox: { paddingHorizontal: 16, paddingBottom: 14, gap: 8, borderBottomWidth: 1, borderBottomColor: '#EEEAE0' },
  field: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, fontSize: 15, color: colors.ink },
  btnGold: { backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnGoldTxt: { fontWeight: '800', color: colors.ink },
  msg: { fontSize: 12, color: colors.muted, paddingHorizontal: 16, paddingBottom: 8 },
  saude: { marginTop: 14, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 6 },
  saudeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saudeTit: { fontSize: 17, fontWeight: '800', color: colors.ink },
  contador: { fontSize: 13, fontWeight: '800', color: colors.goodDark, backgroundColor: colors.goodBg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, overflow: 'hidden' },
  barra: { height: 8, borderRadius: 8, backgroundColor: '#EEEAE0', marginTop: 12, overflow: 'hidden' },
  barraFill: { height: '100%' },
  saudeTxt: { marginTop: 12, marginBottom: 4, fontSize: 13, lineHeight: 19, color: colors.muted },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: '#EEEAE0' },
  check: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.good, alignItems: 'center', justifyContent: 'center' },
  itemTit: { fontSize: 14, fontWeight: '700', color: colors.ink },
  itemSub: { fontSize: 12, color: colors.muted },
  ligar: { fontSize: 13, fontWeight: '800', color: colors.bad },
  somBtn: { marginTop: 14, height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  somTxt: { fontSize: 15, fontWeight: '800', color: colors.ink },
  sair: { marginTop: 14, height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: '#C0392B', alignItems: 'center', justifyContent: 'center' },
  sairTxt: { fontSize: 15, fontWeight: '800', color: '#B03123' },
})
