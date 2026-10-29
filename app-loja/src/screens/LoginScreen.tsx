import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../supabase';
import { colors, radius, spacing, errMsg } from '../theme';
import CaptchaWebView from '../components/CaptchaWebView';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [showCaptcha, setShowCaptcha] = useState(false);

  function entrar() {
    if (!email.trim() || !senha) { setErro('Preenche e-mail e senha.'); return; }
    setErro('');
    setShowCaptcha(true);
  }

  async function onCaptchaToken(token: string) {
    setShowCaptcha(false);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password: senha, options: { captchaToken: token },
    });
    setLoading(false);
    if (error) setErro('E-mail ou senha incorretos.');
    // sucesso: App.tsx reage sozinho à mudança de sessão (onAuthStateChange)
  }

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.eyebrow}>TRINDADE ONLINE</Text>
      <Text style={styles.title}>Painel da Loja</Text>

      <Text style={styles.label}>E-mail</Text>
      <TextInput
        style={styles.input} value={email} onChangeText={setEmail}
        autoCapitalize="none" keyboardType="email-address" placeholder="voce@seunegocio.com.br"
      />
      <Text style={styles.label}>Senha</Text>
      <TextInput style={styles.input} value={senha} onChangeText={setSenha} secureTextEntry placeholder="••••••••" />

      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      <Pressable style={[styles.btn, loading && styles.btnDisabled]} onPress={entrar} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.btnTxt}>Entrar</Text>}
      </Pressable>

      <Text style={styles.foot}>Mesmo login do painel do site (trindadeonline.com.br/painel).</Text>

      <CaptchaWebView visible={showCaptcha} onToken={onCaptchaToken} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, padding: spacing.xl, justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '800', color: colors.signDark, letterSpacing: 1, textAlign: 'center', marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: spacing.xl },
  label: { fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', marginBottom: 6, marginTop: spacing.md },
  input: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: 13, fontSize: 15 },
  erro: { color: colors.bad, fontSize: 12.5, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' },
  btn: { backgroundColor: colors.sign, borderRadius: radius.md, padding: 15, alignItems: 'center', marginTop: spacing.xl },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  foot: { fontSize: 11, color: colors.mutedLight, textAlign: 'center', marginTop: spacing.lg },
});
