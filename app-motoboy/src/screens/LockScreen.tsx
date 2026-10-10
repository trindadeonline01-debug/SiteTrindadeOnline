import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { colors, spacing, radius, errMsg } from '../theme'
import { clearToken } from '../auth'

// Cadeado local por digital/Face ID, mostrado quando o motoboy já tem
// sessão salva no aparelho e ativou "login com digital" no Perfil (pedido
// do Ricardo, out/2026). Não é uma autenticação nova — só libera o token
// que já está salvo, sem precisar digitar senha/código de novo toda vez
// que abre o app.
type Props = { motoboyName: string; onUnlock: () => void; onLogout: () => void }

export default function LockScreen({ motoboyName, onUnlock, onLogout }: Props) {
  const [erro, setErro] = useState('')
  const [trying, setTrying] = useState(false)

  async function tryAuth() {
    setTrying(true); setErro('')
    try {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear Trindade Online Entregas',
        cancelLabel: 'Cancelar',
      })
      if (r.success) onUnlock()
      else setErro('Não reconheceu — tenta de novo.')
    } catch (e) {
      setErro(errMsg(e))
    } finally {
      setTrying(false)
    }
  }

  // Já abre o prompt sozinho ao entrar na tela, sem precisar de um toque a mais.
  useEffect(() => { tryAuth() }, [])

  async function handleLogout() {
    await clearToken()
    onLogout()
  }

  return (
    <View style={s.wrap}>
      <Text style={s.icon}>🔒</Text>
      <Text style={s.title}>Olá, {motoboyName.split(' ')[0]}</Text>
      <Text style={s.sub}>Desbloqueia com a digital pra continuar</Text>

      {erro ? <Text style={s.erro}>{erro}</Text> : null}

      <Pressable style={s.btn} onPress={tryAuth} disabled={trying}>
        <Text style={s.btnTxt}>{trying ? 'Verificando…' : '🔓 Tentar de novo'}</Text>
      </Pressable>

      <Pressable onPress={handleLogout}>
        <Text style={s.logout}>Sair e entrar com WhatsApp/senha</Text>
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  icon: { fontSize: 44, marginBottom: spacing.sm },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink },
  sub: { color: colors.muted, marginBottom: spacing.lg },
  erro: { color: colors.bad, fontSize: 13, textAlign: 'center', marginBottom: spacing.sm },
  btn: { backgroundColor: colors.gold, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, alignItems: 'center' },
  btnTxt: { fontWeight: '800', color: colors.ink, fontSize: 15 },
  logout: { color: colors.muted, fontSize: 13, marginTop: spacing.lg, textDecorationLine: 'underline' },
})
