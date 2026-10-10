import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { colors, spacing, radius, errMsg } from '../theme'
import { enviarCodigo, verificarCodigo, loginSenha, Motoboy } from '../api'
import { saveToken } from '../auth'

type Props = { onLogin: (motoboy: Motoboy) => void }

export default function LoginScreen({ onLogin }: Props) {
  const [tab, setTab] = useState<'wa' | 'pwd'>('wa')
  const [step, setStep] = useState<1 | 2>(1)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleEnviarCodigo() {
    if (!phone.trim()) return
    setLoading(true); setErro('')
    try {
      await enviarCodigo(phone)
      setStep(2)
    } catch (e) {
      setErro(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleVerificarCodigo() {
    if (!code.trim()) return
    setLoading(true); setErro('')
    try {
      const r = await verificarCodigo(phone, code)
      await saveToken(r.token)
      onLogin(r.motoboy)
    } catch (e) {
      setErro(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleLoginSenha() {
    if (!phone.trim() || !senha.trim()) return
    setLoading(true); setErro('')
    try {
      const r = await loginSenha(phone, senha)
      await saveToken(r.token)
      onLogin(r.motoboy)
    } catch (e) {
      setErro(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.brand}>TRINDADE{'\n'}ENTREGA</Text>
      <Text style={s.sub}>Painel do motoboy</Text>

      <View style={s.tabs}>
        <Pressable onPress={() => { setTab('wa'); setStep(1); setErro('') }}>
          <Text style={[s.tab, tab === 'wa' && s.tabOn]}>Código por WhatsApp</Text>
        </Pressable>
        <Pressable onPress={() => { setTab('pwd'); setErro('') }}>
          <Text style={[s.tab, tab === 'pwd' && s.tabOn]}>Senha</Text>
        </Pressable>
      </View>

      <TextInput
        style={s.field}
        placeholder="Seu WhatsApp (com DDD)"
        placeholderTextColor={colors.muted}
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        editable={!(tab === 'wa' && step === 2)}
      />

      {tab === 'wa' && step === 2 && (
        <TextInput
          style={s.field}
          placeholder="Código de 6 dígitos"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
          autoFocus
        />
      )}

      {tab === 'pwd' && (
        <TextInput
          style={s.field}
          placeholder="Senha"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={senha}
          onChangeText={setSenha}
        />
      )}

      {erro ? <Text style={s.erro}>{erro}</Text> : null}

      <Pressable
        style={s.btn}
        disabled={loading}
        onPress={tab === 'pwd' ? handleLoginSenha : step === 1 ? handleEnviarCodigo : handleVerificarCodigo}
      >
        {loading ? <ActivityIndicator color={colors.ink} /> : (
          <Text style={s.btnTxt}>{tab === 'pwd' ? 'Entrar' : step === 1 ? 'Enviar código' : 'Confirmar código'}</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, padding: spacing.xl, justifyContent: 'center', gap: spacing.md },
  brand: { fontSize: 30, fontWeight: '800', color: colors.goldDark, textAlign: 'center', letterSpacing: 1 },
  sub: { textAlign: 'center', color: colors.muted, marginBottom: spacing.lg },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  tab: { color: colors.muted, fontWeight: '600', paddingBottom: 4 },
  tabOn: { color: colors.goldDark, borderBottomWidth: 2, borderBottomColor: colors.gold },
  field: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.ink },
  erro: { color: colors.bad, fontSize: 13, textAlign: 'center' },
  btn: { backgroundColor: colors.gold, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  btnTxt: { fontWeight: '800', color: colors.ink, fontSize: 15 },
})
