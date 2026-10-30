import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import { colors, radius, spacing } from '../theme';
import CaptchaWebView from '../components/CaptchaWebView';

const MAX_TENTATIVAS_CAPTCHA = 3;
const ESPERA_CAPTCHA_MS = 25000;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  // A validação "não sou robô" roda escondida desde que a tela abre — quando
  // o lojista toca em Entrar o token normalmente já está pronto.
  const [captchaKey, setCaptchaKey] = useState(0);
  const tokenRef = useRef<string | null>(null);
  const aguardandoRef = useRef(false);
  const falhasRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function limparEspera() {
    aguardandoRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }

  async function login(token: string) {
    limparEspera();
    tokenRef.current = null;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password: senha, options: { captchaToken: token },
    });
    setLoading(false);
    if (error) {
      setErro('E-mail ou senha incorretos.');
      setCaptchaKey(k => k + 1); // o token é de uso único — pega outro pra próxima tentativa
    }
    // sucesso: App.tsx reage sozinho à mudança de sessão (onAuthStateChange)
  }

  function entrar() {
    if (!email.trim() || !senha) { setErro('Preenche e-mail e senha.'); return; }
    setErro('');
    if (tokenRef.current) { login(tokenRef.current); return; }
    aguardandoRef.current = true;
    setLoading(true);
    timerRef.current = setTimeout(() => {
      if (!aguardandoRef.current) return;
      limparEspera();
      setLoading(false);
      setErro('Não deu pra validar agora. Confira a internet e toque em Entrar de novo.');
      setCaptchaKey(k => k + 1);
    }, ESPERA_CAPTCHA_MS);
  }

  function onCaptchaToken(token: string) {
    falhasRef.current = 0;
    tokenRef.current = token;
    if (aguardandoRef.current) login(token);
  }

  function onCaptchaExpired() {
    tokenRef.current = null;
    falhasRef.current += 1;
    if (falhasRef.current < MAX_TENTATIVAS_CAPTCHA) { setCaptchaKey(k => k + 1); return; }
    if (aguardandoRef.current) {
      limparEspera();
      setLoading(false);
      setErro('Não deu pra validar agora. Confira a internet e toque em Entrar de novo.');
    }
    falhasRef.current = 0;
    setCaptchaKey(k => k + 1);
  }

  return (
    <KeyboardAvoidingView style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]} behavior="padding">
      <ScrollView contentContainerStyle={styles.in} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>TRINDADE ONLINE</Text>
        <Text style={styles.title}>Painel da Loja</Text>

        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input} value={email} onChangeText={setEmail}
          autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email"
          placeholder="voce@seunegocio.com.br" placeholderTextColor={colors.mutedLight}
        />
        <Text style={styles.label}>Senha</Text>
        <View style={styles.senhaRow}>
          <TextInput
            style={[styles.input, styles.senhaInput]} value={senha} onChangeText={setSenha}
            secureTextEntry={!verSenha} autoCapitalize="none" autoCorrect={false} autoComplete="password"
            placeholder="Sua senha" placeholderTextColor={colors.mutedLight}
            onSubmitEditing={entrar} returnKeyType="go"
          />
          <Pressable style={styles.olho} onPress={() => setVerSenha(v => !v)} hitSlop={8}>
            <Text style={styles.olhoTxt}>{verSenha ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
        </View>

        {erro ? <Text style={styles.erro}>{erro}</Text> : null}

        <Pressable style={[styles.btn, loading && styles.btnDisabled]} onPress={entrar} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.btnTxt}>Entrar</Text>}
        </Pressable>

        <Text style={styles.foot}>Mesmo login do painel do site (trindadeonline.com.br/painel). Esqueceu a senha? Recupere pelo site.</Text>
      </ScrollView>

      <CaptchaWebView refreshKey={captchaKey} onToken={onCaptchaToken} onExpired={onCaptchaExpired} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  in: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, maxWidth: 520, width: '100%', alignSelf: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '800', color: colors.signDark, letterSpacing: 1, textAlign: 'center', marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: spacing.xl },
  label: { fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', marginBottom: 6, marginTop: spacing.md },
  input: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: 13, fontSize: 15, color: colors.ink },
  senhaRow: { justifyContent: 'center' },
  senhaInput: { paddingRight: 84 },
  olho: { position: 'absolute', right: 6, paddingHorizontal: 10, paddingVertical: 8 },
  olhoTxt: { fontSize: 12.5, fontWeight: '800', color: colors.signDark },
  erro: { color: colors.bad, fontSize: 12.5, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' },
  btn: { backgroundColor: colors.sign, borderRadius: radius.md, padding: 15, alignItems: 'center', marginTop: spacing.xl },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  foot: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: spacing.lg },
});
