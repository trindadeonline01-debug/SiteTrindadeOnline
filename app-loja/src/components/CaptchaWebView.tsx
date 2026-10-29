import { Modal, View, StyleSheet, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, radius, spacing } from '../theme';

// Ver src/app/mobile-captcha/page.tsx (site) — React Native não tem SDK
// nativo pro Cloudflare Turnstile, então resolve o desafio numa página web
// de verdade dentro de uma WebView e recebe o token de volta por
// postMessage. Fica visível (não escondida) porque às vezes o Turnstile
// pede uma confirmação visual ("não sou robô") — escondido, o lojista
// ficaria travado sem entender por quê.
const CAPTCHA_URL = 'https://www.trindadeonline.com.br/mobile-captcha';

export default function CaptchaWebView({ visible, onToken }: { visible: boolean; onToken: (token: string) => void }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <Text style={styles.hint}>Confirmando que não é um robô...</Text>
          <WebView
            source={{ uri: CAPTCHA_URL }}
            onMessage={(e) => onToken(e.nativeEvent.data)}
            style={styles.webview}
            javaScriptEnabled
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,8,6,0.6)', alignItems: 'center', justifyContent: 'center' },
  box: { width: 320, height: 220, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, overflow: 'hidden' },
  hint: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: spacing.sm, textAlign: 'center' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
