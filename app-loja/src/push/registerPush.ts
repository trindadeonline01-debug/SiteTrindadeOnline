import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

// Canal de alta prioridade — é o que faz o Android tocar som/vibrar mesmo
// com a tela apagada/bloqueada (diferente de notificação "silenciosa"
// padrão, que só aparece na barra sem acordar o aparelho). O nome do som
// tem que bater com o arquivo bundlado pelo plugin expo-notifications no
// app.json (assets/sounds/novo_pedido.wav → referenciado sem extensão).
const CANAL_PEDIDOS = 'pedidos-loja';

export async function configurarCanalNotificacoes() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL_PEDIDOS, {
    name: 'Pedido novo',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'novo_pedido',
    vibrationPattern: [0, 500, 250, 500],
    lightColor: '#C9951A',
    enableVibrate: true,
    bypassDnd: false,
  });
}

// Pede permissão (obrigatório a partir do Android 13) e salva o token FCM
// nativo do aparelho pra essa empresa em `loja_push_tokens` — tabela
// própria do app-loja, nunca reaproveita a infra de push do app-motoboy
// (que usa OneSignal, projeto e fluxo totalmente separados).
// Nunca lança exceção pra fora: push é reforço (acordar o app com a tela
// apagada), não pode travar login/uso do app se falhar.
export async function registrarPushLoja(companyId: string) {
  try {
    if (Platform.OS !== 'android') return;
    await configurarCanalNotificacoes();

    const { status: statusAtual } = await Notifications.getPermissionsAsync();
    let status = statusAtual;
    if (status !== 'granted') {
      const resp = await Notifications.requestPermissionsAsync();
      status = resp.status;
    }
    if (status !== 'granted') return;

    // Token FCM nativo (não o Expo Push Token) — o envio do lado do
    // servidor usa o Firebase Admin SDK direto, sem depender do serviço
    // de push da Expo. Só funciona em build real (EAS), nunca no Expo Go.
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (!token) return;

    await supabase.from('loja_push_tokens').upsert(
      { company_id: companyId, token, platform: 'android', updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
  } catch {
    // silencioso de propósito — ver comentário acima
  }
}
