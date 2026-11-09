package expo.modules.alarmemotoboy

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

// Alarme de corrida nova com o app em segundo plano, fechado ou tela
// apagada. Mesmo desenho do AlarmeLoja (app-loja): o push chega só com
// dados, sobe o AlarmeService que toca em loop e abre o app.
object AlarmeMotoboy {
  private const val CANAL_SILENCIOSO = "alarme-corrida-v1"
  private const val CANAL_COM_SOM = "alarme-corrida-som-v1"
  private const val SOM = "alerta_corrida"
  const val NOTIF_ID = 7401

  private fun criarCanais(ctx: Context, nm: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (nm.getNotificationChannel(CANAL_SILENCIOSO) == null) {
      val c = NotificationChannel(CANAL_SILENCIOSO, "Alarme de corrida nova", NotificationManager.IMPORTANCE_HIGH)
      c.description = "Mostra a corrida nova na tela; o som toca até você abrir o app"
      c.setSound(null, null)
      c.enableVibration(false)
      c.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      nm.createNotificationChannel(c)
    }
    if (nm.getNotificationChannel(CANAL_COM_SOM) == null) {
      val c = NotificationChannel(CANAL_COM_SOM, "Alarme de corrida nova (reserva)", NotificationManager.IMPORTANCE_HIGH)
      val som = ctx.resources.getIdentifier(SOM, "raw", ctx.packageName)
      if (som != 0) {
        c.setSound(
          Uri.parse("android.resource://${ctx.packageName}/$som"),
          AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        )
      }
      c.enableVibration(true)
      c.vibrationPattern = longArrayOf(0, 500, 250, 500)
      c.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      nm.createNotificationChannel(c)
    }
  }

  fun notificacao(ctx: Context, titulo: String, corpo: String, comSom: Boolean): Notification? {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    criarCanais(ctx, nm)

    val abrir = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } ?: return null
    val pi = PendingIntent.getActivity(ctx, 0, abrir, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    val iconeNotif = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
    val icone = if (iconeNotif != 0) iconeNotif else ctx.applicationInfo.icon

    val n = NotificationCompat.Builder(ctx, if (comSom) CANAL_COM_SOM else CANAL_SILENCIOSO)
      .setSmallIcon(icone)
      .setContentTitle(titulo)
      .setContentText(corpo)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(true)
      .setContentIntent(pi)
      .setFullScreenIntent(pi, true)
      .setTimeoutAfter(3 * 60 * 1000L)
      .build()
    if (comSom) n.flags = n.flags or Notification.FLAG_INSISTENT
    return n
  }

  fun iniciar(ctx: Context, titulo: String, corpo: String, expiraEmMs: Long) {
    try {
      val i = Intent(ctx, AlarmeService::class.java)
        .putExtra(AlarmeService.EXTRA_TITULO, titulo)
        .putExtra(AlarmeService.EXTRA_CORPO, corpo)
        .putExtra(AlarmeService.EXTRA_EXPIRA, expiraEmMs)
      ContextCompat.startForegroundService(ctx, i)
    } catch (e: Exception) {
      val n = notificacao(ctx, titulo, corpo, true) ?: return
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(NOTIF_ID, n)
    }
  }

  // Corrida cancelada (pela loja) com o app fechado/em segundo plano: toca o
  // som de cancelamento por alguns segundos e abre o app por cima.
  fun cancelada(ctx: Context, titulo: String, corpo: String) {
    try {
      val i = Intent(ctx, AlarmeService::class.java)
        .putExtra(AlarmeService.EXTRA_TITULO, titulo)
        .putExtra(AlarmeService.EXTRA_CORPO, corpo)
        .putExtra(AlarmeService.EXTRA_MODO, AlarmeService.MODO_CANCELADA)
      ContextCompat.startForegroundService(ctx, i)
    } catch (e: Exception) {
      avisoCancelada(ctx, titulo, corpo)
    }
  }

  // Aviso que fica na barra depois do som (sem som próprio, comum).
  fun avisoCancelada(ctx: Context, titulo: String, corpo: String) {
    try {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      criarCanais(ctx, nm)
      val abrir = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      } ?: return
      val pi = PendingIntent.getActivity(ctx, 1, abrir, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val iconeNotif = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
      val icone = if (iconeNotif != 0) iconeNotif else ctx.applicationInfo.icon
      val n = NotificationCompat.Builder(ctx, CANAL_SILENCIOSO)
        .setSmallIcon(icone)
        .setContentTitle(titulo)
        .setContentText(corpo)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(true)
        .setContentIntent(pi)
        .build()
      nm.notify(NOTIF_ID + 1, n)
    } catch (e: Exception) {}
  }

  fun parar(ctx: Context) {
    try { ctx.stopService(Intent(ctx, AlarmeService::class.java)) } catch (e: Exception) {}
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(NOTIF_ID)
  }
}
