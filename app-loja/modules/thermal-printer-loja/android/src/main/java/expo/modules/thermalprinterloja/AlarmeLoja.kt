package expo.modules.thermalprinterloja

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

// Alarme de pedido novo com o app em segundo plano, fechado ou tela apagada.
// O push chega como mensagem só de dados (ver LojaMessagingService) e dispara
// o AlarmeService, que toca o som em repetição por conta própria (não depende
// do Android repetir o som da notificação, que muitos aparelhos ignoram) e
// abre o app por cima do que estiver na tela.
object AlarmeLoja {
  // Canal SEM som: quem toca é o AlarmeService (MediaPlayer em loop)
  private const val CANAL_SILENCIOSO = "alarme-pedido-v2"
  // Canal COM som: só usado se o serviço não puder subir (plano B)
  private const val CANAL_COM_SOM = "alarme-pedido-v1"
  const val NOTIF_ID = 7301

  private fun criarCanais(ctx: Context, nm: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (nm.getNotificationChannel(CANAL_SILENCIOSO) == null) {
      val c = NotificationChannel(CANAL_SILENCIOSO, "Alarme de pedido novo", NotificationManager.IMPORTANCE_HIGH)
      c.description = "Mostra o pedido novo na tela; o som toca até você abrir o app"
      c.setSound(null, null)
      c.enableVibration(false)
      c.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      nm.createNotificationChannel(c)
    }
    if (nm.getNotificationChannel(CANAL_COM_SOM) == null) {
      val c = NotificationChannel(CANAL_COM_SOM, "Alarme de pedido novo (reserva)", NotificationManager.IMPORTANCE_HIGH)
      val som = ctx.resources.getIdentifier("pedido_novo_telefone", "raw", ctx.packageName)
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

  // Notificação de tela cheia (acorda e abre o app quando a tela está apagada/
  // bloqueada). comSom = true só no plano B, quando o serviço não sobe.
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
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(true)
      .setContentIntent(pi)
      .setFullScreenIntent(pi, true)
      .setTimeoutAfter(10 * 60 * 1000L)
      .build()
    if (comSom) n.flags = n.flags or Notification.FLAG_INSISTENT
    return n
  }

  // Ponto de entrada do push: sobe o serviço que toca em loop e abre o app.
  // Se o Android não deixar subir o serviço, cai na notificação com som.
  fun iniciar(ctx: Context, titulo: String, corpo: String) {
    try {
      val i = Intent(ctx, AlarmeService::class.java)
        .putExtra(AlarmeService.EXTRA_TITULO, titulo)
        .putExtra(AlarmeService.EXTRA_CORPO, corpo)
      ContextCompat.startForegroundService(ctx, i)
    } catch (e: Exception) {
      val n = notificacao(ctx, titulo, corpo, true) ?: return
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(NOTIF_ID, n)
    }
  }

  fun parar(ctx: Context) {
    try { ctx.stopService(Intent(ctx, AlarmeService::class.java)) } catch (e: Exception) {}
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(NOTIF_ID)
  }
}
