import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { colors, spacing, radius, errMsg } from '../theme'
import { enviarCodigo, verificarCodigo, loginSenha, Motoboy } from '../api'
import { saveToken } from '../auth'
import OtpInput from '../components/OtpInput'

type Props = { onLogin: (motoboy: Motoboy) => void }

const CODE_LEN = 6
const RESEND_COOLDOWN_S = 60 // mesmo cooldown que o backend já aplica (enviar-codigo/route.ts)

export default function LoginScreen({ onLogin }: Props) {
  const [tab, setTab] = useState<'wa' | 'pwd'>('wa')
  const [step, setStep] = useState<1 | 2>(1)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const autoSubmitted = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  async function handleEnviarCodigo() {
    if (!phone.trim()) return
    setLoading(true); setErro(''); setCode('')
    autoSubmitted.current = false
    try {
      await enviarCodigo(phone)
      setStep(2)
      setCooldown(RESEND_COOLDOWN_S)
    } catch (e) {
      setErro(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleVerificarCodigo(codeToUse?: string) {
    const c = codeToUse ?? code
    if (!c.trim() || c.length < CODE_LEN) return
    setLoading(true); setErro('')
    try {
      const r = await verificarCodigo(phone, c)
      await saveToken(r.token)
      onLogin(r.motoboy)
    } catch (e) {
      setErro(errMsg(e))
      setCode('')
      autoSubmitted.current = false
    } finally {
      setLoading(false)
    }
  }

  // Confirma sozinho assim que o 6º dígito é digitado — igual iFood/99,
  // sem precisar apertar um botão a mais (pedido do Ricardo, out/2026).
  useEffect(() => {
    if (tab === 'wa' && step === 2 && code.length === CODE_LEN && !loading && !autoSubmitted.current) {
      autoSubmitted.current = true
      handleVerificarCodigo(code)
    }
  }, [code])

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
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.brand}>
          <Text style={s.brandInk}>TRINDADE</Text>
          <Text style={s.brandGold}>ONLINE</Text>
        </Text>
        <Text style={s.sub}>Entregas · Painel do motoboy</Text>

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
          <View style={{ gap: spacing.sm, alignItems: 'center' }}>
            <OtpInput length={CODE_LEN} value={code} onChangeText={setCode} autoFocus />
            <Pressable disabled={cooldown > 0 || loading} onPress={handleEnviarCodigo}>
              <Text style={[s.resend, (cooldown > 0 || loading) && s.resendOff]}>
                {cooldown > 0 ? `🔁 Reenviar código em ${cooldown}s` : '🔁 Reenviar código'}
              </Text>
            </Pressable>
          </View>
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
          onPress={tab === 'pwd' ? handleLoginSenha : step === 1 ? handleEnviarCodigo : () => handleVerificarCodigo()}
        >
          {loading ? <ActivityIndicator color={colors.ink} /> : (
            <Text style={s.btnTxt}>{tab === 'pwd' ? 'Entrar' : step === 1 ? 'Enviar código' : 'Confirmar código'}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  // Conteúdo ancorado mais pro topo (em vez de centralizado na tela
  // inteira) — era isso que deixava o teclado cobrindo o campo de código
  // quando ele abria (achado do Ricardo, out/2026).
  wrap: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xl * 2, gap: spacing.md },
  brand: { fontSize: 30, fontWeight: '800', textAlign: 'center', letterSpacing: 1 },
  brandInk: { color: colors.ink },
  brandGold: { color: colors.gold },
  sub: { textAlign: 'center', color: colors.muted, marginBottom: spacing.lg },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  tab: { color: colors.muted, fontWeight: '600', paddingBottom: 4 },
  tabOn: { color: colors.goldDark, borderBottomWidth: 2, borderBottomColor: colors.gold },
  field: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.ink },
  resend: { textAlign: 'center', color: colors.goldDark, fontWeight: '700', fontSize: 13, padding: spacing.xs },
  resendOff: { color: colors.muted },
  erro: { color: colors.bad, fontSize: 13, textAlign: 'center' },
  btn: { backgroundColor: colors.gold, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  btnTxt: { fontWeight: '800', color: colors.ink, fontSize: 15 },
})
