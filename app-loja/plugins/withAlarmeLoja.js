const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

// Alarme de pedido novo com o app fechado (ver LojaMessagingService.kt):
// 1) a tela principal pode abrir por cima do bloqueio e acender a tela;
// 2) o nosso serviço de push entra no lugar do padrão do expo-notifications
//    (que tem prioridade -1; o nosso fica na padrão, 0).
const SERVICO = 'expo.modules.thermalprinterloja.LojaMessagingService';
// Toca o alarme em repetição (ver AlarmeService.kt)
const SERVICO_ALARME = 'expo.modules.thermalprinterloja.AlarmeService';

// O lint do app não enxerga a classe-mãe do serviço (vem de um artefato
// pré-compilado do expo-notifications) e acusa "must extend android.app.Service"
// — falso alarme que derruba o build de release. Desliga só essa checagem.
const LINT_FIX = `
// withAlarmeLoja: falso alarme do lint sobre o serviço de push
android {
    lint {
        disable.add('Instantiatable')
    }
}
`;

module.exports = function withAlarmeLoja(config) {
  config = withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes('withAlarmeLoja')) c.modResults.contents += LINT_FIX;
    return c;
  });
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
    if (!app.service.find((s) => s.$['android:name'] === SERVICO_ALARME)) {
      app.service.push({
        $: { 'android:name': SERVICO_ALARME, 'android:exported': 'false', 'android:foregroundServiceType': 'mediaPlayback' },
      });
    }
    return c;
  });
};
