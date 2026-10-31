package expo.modules.thermalprinterloja

import android.app.ActivityManager
import android.content.Context
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

// Entra no lugar do serviço padrão do expo-notifications (prioridade maior
// no manifesto, ver plugins/withAlarmeLoja.js). Pedido novo com o app
// fechado/em segundo plano vira o alarme de tela cheia; qualquer outra
// mensagem — e o pedido novo com o app aberto, que a tela trata sozinha —
// segue o caminho normal do expo-notifications.
class LojaMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val dados = remoteMessage.data
    if (dados["tipo"] == "pedido_novo" && !appEmPrimeiroPlano()) {
      try {
        AlarmeLoja.iniciar(applicationContext, dados["title"] ?: "Pedido novo", dados["body"] ?: "")
        return
      } catch (e: Exception) {
        // se o alarme falhar por qualquer motivo, cai no caminho normal
      }
    }
    super.onMessageReceived(remoteMessage)
  }

  private fun appEmPrimeiroPlano(): Boolean {
    val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val processos = am.runningAppProcesses ?: return false
    return processos.any {
      it.processName == packageName && it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }
  }
}
