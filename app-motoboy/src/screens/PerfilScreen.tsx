import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Switch, ScrollView, AppState } from 'react-native'
import { useAudioPlayer } from 'expo-audio'
import { statusAlertas, abrirAjusteNotificacoes, abrirAjusteSobrepor, abrirAjusteTelaCheia, abrirAjusteBateria } from 'alarme-motoboy'
import * as LocalAuthentication from 'expo-local-authentication'
import { colors, spacing, radius, errMsg } from '../theme'
import { atualizarPix, logout, Motoboy } from '../api'
import { clearToken, isBiometricEnabled, setBiometricEnabled } from '../auth'

type Props = { motoboy: Motoboy; onLogout: () => void }

export default function PerfilScreen({ motoboy, onLogout }: Props) {
  const [editPix, setEditPix] = useState(false)
  const [pixKey, setPixKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  // Login com digital (pedido do Ricardo, out/2026) — só mostra o toggle se
  // o aparelho tiver sensor E já tiver digital/Face ID cadastrado nele.
  const [bioSupported, setBioSupported] = useState(false)
  const [bioEnabled, setBioEnabledState] = useState(false)

  // Alertas de corrida (nov/2026): confere as 4 permissões que o Android exige
  // pro alarme tocar e abrir o app com a tela apagada ou em cima de outro app.
  const [alertas, setAlertas] = useState(() => statusAlertas())
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => { if (st === 'active') setAlertas(statusAlertas()) })
    return () => sub.remove()
  }, [])
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={s.wrap}>
      <View style={s.avatarRow}>
        <View style={s.avatar}><Text style={s.avatarTxt}>{motoboy.name.slice(0, 2).toUpperCase()}</Text></View>
        <View>
          <Text style={s.nome}>{motoboy.name}</Text>
          <Text style={s.muted}>{motoboy.phone}</Text>
        </View>
      </View>

      <Pressable style={s.docRow} onPress={() => setEditPix(e => !e)}>
        <Text>💳 Chave Pix</Text>
        <Text style={s.muted}>editar ›</Text>
      </Pressable>
      {editPix && (
        <View style={{ gap: spacing.sm }}>
          <TextInput style={s.field} placeholder="Nova chave Pix" placeholderTextColor={colors.muted} value={pixKey} onChangeText={setPixKey} />
          <Pressable style={s.btn} disabled={saving} onPress={handleSalvarPix}><Text style={s.btnTxt}>Salvar</Text></Pressable>
        </View>
      )}
      {msg ? <Text style={s.muted}>{msg}</Text> : null}

      <View style={s.docRow}>
        <Text>📄 Documentos</Text>
        <Text style={s.pillOk}>✓ aprovados</Text>
      </View>

      {bioSupported && (
        <View style={s.docRow}>
          <Text>🔒 Entrar com digital</Text>
          <Switch
            value={bioEnabled}
            onValueChange={handleToggleBio}
            trackColor={{ true: colors.gold, false: colors.line }}
            thumbColor={colors.card}
          />
        </View>
      )}

      <View style={s.secao}>
        <Text style={s.secaoTit}>🔔 Alertas de corrida</Text>
        <Text style={s.muted}>
          Para a corrida tocar e abrir o app com a tela apagada ou em cima de outro aplicativo, as quatro opções abaixo precisam estar ligadas.
        </Text>
        <ItemAlerta ok={alertas.notificacoes} titulo="Notificações" ajuda="Permite o aviso de corrida nova e cancelada" onPress={abrirAjusteNotificacoes} />
        <ItemAlerta ok={alertas.sobrepor} titulo="Sobrepor a outros apps" ajuda="Deixa a corrida abrir por cima de qualquer app" onPress={abrirAjusteSobrepor} />
        <ItemAlerta ok={alertas.telaCheia} titulo="Notificação em tela cheia" ajuda="Mostra a corrida na tela bloqueada" onPress={abrirAjusteTelaCheia} />
        <ItemAlerta ok={alertas.bateria} titulo="Sem economia de bateria" ajuda="Impede o Android de fechar o app em segundo plano" onPress={abrirAjusteBateria} />
        <Pressable style={[s.btn, { marginTop: spacing.sm }]} onPress={testarSom}><Text style={s.btnTxt}>🔊 Testar o som da corrida</Text></Pressable>
      </View>

      <Pressable
        style={s.docRow}
        onPress={() => Alert.alert('Ajuda', 'Fala com a gente pelo WhatsApp da Trindade Online.')}
      >
        <Text>💬 Ajuda</Text>
        <Text style={s.muted}>WhatsApp ›</Text>
      </Pressable>

      <Pressable style={[s.btn, s.btnSair]} onPress={handleSair}>
        <Text style={[s.btnTxt, { color: colors.bad }]}>Sair</Text>
      </Pressable>
    </ScrollView>
  )
}

function ItemAlerta({ ok, titulo, ajuda, onPress }: { ok: boolean; titulo: string; ajuda: string; onPress: () => void }) {
  return (
    <Pressable style={s.itemAlerta} onPress={ok ? undefined : onPress}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>{ok ? '✅' : '⚠️'} {titulo}</Text>
        <Text style={s.muted}>{ajuda}</Text>
      </View>
      {ok ? <Text style={s.pillOk}>ligado</Text> : <Text style={s.corrigir}>Ligar ›</Text>}
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrap: { backgroundColor: colors.paper, padding: spacing.md, gap: spacing.md },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontWeight: '800', color: colors.ink },
  nome: { fontWeight: '800', fontSize: 16, color: colors.ink },
  muted: { color: colors.muted, fontSize: 12 },
  docRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md },
  pillOk: { color: colors.good, fontWeight: '700', fontSize: 12 },
  field: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md },
  btn: { backgroundColor: colors.gold, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  btnTxt: { fontWeight: '800', color: colors.ink },
  btnSair: { backgroundColor: 'transparent', borderWidth: 1.4, borderColor: colors.bad, marginTop: spacing.lg },
  secao: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  secaoTit: { fontWeight: '800', fontSize: 15, color: colors.ink },
  itemAlerta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  corrigir: { color: colors.bad, fontWeight: '800', fontSize: 13 },
})
