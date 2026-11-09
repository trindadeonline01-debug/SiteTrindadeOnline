package expo.modules.alarmemotoboy

import android.app.ActivityManager
import android.content.Context
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

// Entra no lugar do serviço padrão do expo-notifications (ver
// plugins/withAlarmeMotoboy.js). Corrida nova com o app fechado/em segundo
// plano vira o alarme em loop; com o app aberto a própria tela já toca o
// som (polling em HomeScreen), então segue o caminho normal.
class MotoboyMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val dados = remoteMessage.data
    if (dados["tipo"] == "oferta_corrida" && !appEmPrimeiroPlano()) {
      try {
        val expira = dados["expira_em"]?.toLongOrNull() ?: 0L
        AlarmeMotoboy.iniciar(applicationContext, dados["title"] ?: "Nova corrida", dados["body"] ?: "", expira)
        return
      } catch (e: Exception) {
        // se o alarme falhar, cai no caminho normal
      }
    }
    if (dados["tipo"] == "corrida_cancelada") {
      // App aberto: a própria tela mostra o aviso e toca o som (HomeScreen).
      if (!appEmPrimeiroPlano()) {
        AlarmeMotoboy.parar(applicationContext)
        AlarmeMotoboy.cancelada(applicationContext, dados["title"] ?: "Corrida cancelada", dados["body"] ?: "A loja cancelou essa corrida.")
      }
      return
    }
    if (dados["tipo"] == "oferta_encerrada") {
      AlarmeMotoboy.parar(applicationContext)
      return
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
