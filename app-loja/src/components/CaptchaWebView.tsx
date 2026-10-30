import { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, radius, spacing } from '../theme';

// Ver src/app/mobile-captcha/page.tsx (site) — React Native não tem SDK
// nativo pro Cloudflare Turnstile, então o desafio roda numa página web
// dentro de uma WebView. Ela fica escondida: o Cloudflare resolve sozinho na
// quase totalidade dos casos. Só quando pede um toque ("sou humano") a
// mesma WebView vira um cartão no centro da tela — sem remontar, pra não
// perder o desafio em andamento.
const CAPTCHA_URL = 'https://www.trindadeonline.com.br/mobile-captcha';

type Props = {
  // Muda pra pedir um token novo (cada token vale pra um login só)
  refreshKey: number;
  onToken: (token: string) => void;
  // Token venceu ou o desafio falhou — a tela decide se tenta de novo
  onExpired: () => void;
};

export default function CaptchaWebView({ refreshKey, onToken, onExpired }: Props) {
  const [interativo, setInterativo] = useState(false);

  function onMessage(data: string) {
    if (data === '__interactive__') setInterativo(true);
    else if (data === '__done__') setInterativo(false);
    else if (data === '__expired__') { setInterativo(false); onExpired(); }
    else { setInterativo(false); onToken(data); }
  }

  return (
    <View style={interativo ? styles.backdrop : styles.hidden} pointerEvents={interativo ? 'auto' : 'none'}>
      <View style={interativo ? styles.box : styles.boxHidden}>
        {interativo ? <Text style={styles.hint}>Toque para confirmar que você não é um robô</Text> : null}
        <WebView
          key={refreshKey}
          source={{ uri: CAPTCHA_URL }}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
          style={styles.webview}
          javaScriptEnabled
          scrollEnabled={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', top: 0, left: 0, width: 320, height: 160, opacity: 0.01, zIndex: -1 },
  boxHidden: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,8,6,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  box: { width: 320, height: 150, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, overflow: 'hidden' },
  hint: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: spacing.sm, textAlign: 'center' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
