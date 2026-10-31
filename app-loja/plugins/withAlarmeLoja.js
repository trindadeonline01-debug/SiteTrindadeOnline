const { withAndroidManifest } = require('expo/config-plugins');

// Alarme de pedido novo com o app fechado (ver LojaMessagingService.kt):
// 1) a tela principal pode abrir por cima do bloqueio e acender a tela;
// 2) o nosso serviço de push entra no lugar do padrão do expo-notifications
//    (que tem prioridade -1; o nosso fica na padrão, 0).
const SERVICO = 'expo.modules.thermalprinterloja.LojaMessagingService';

module.exports = function withAlarmeLoja(config) {
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application[0];
    const main = (app.activity || []).find((a) => a.$['android:name'] === '.MainActivity');
    if (main) {
      main.$['android:showWhenLocked'] = 'true';
      main.$['android:turnScreenOn'] = 'true';
    }
    app.service = app.service || [];
    if (!app.service.find((s) => s.$['android:name'] === SERVICO)) {
      app.service.push({
        $: { 'android:name': SERVICO, 'android:exported': 'false' },
        'intent-filter': [{ action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }] }],
      });
    }
    return c;
  });
};
