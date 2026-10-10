import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Switch } from 'react-native'
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
    <View style={s.wrap}>
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
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, padding: spacing.md, gap: spacing.md },
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
  btnSair: { backgroundColor: 'transparent', borderWidth: 1.4, borderColor: colors.bad, marginTop: 'auto' },
})
