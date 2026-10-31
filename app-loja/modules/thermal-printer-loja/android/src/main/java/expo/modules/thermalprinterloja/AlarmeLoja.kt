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

// Alarme de pedido novo com o app fechado/tela apagada. O push chega como
// mensagem só de dados (ver LojaMessagingService) e aqui vira uma
// notificação de tela cheia: o Android acorda o aparelho e abre o app por
// cima do bloqueio. FLAG_INSISTENT repete o som do canal até alguém tocar
// ou o app abrir — é o mesmo truque de despertador/ligação.
object AlarmeLoja {
  // Canal novo (o Android não deixa mudar som/importância de canal já criado)
  private const val CANAL = "alarme-pedido-v1"
  private const val NOTIF_ID = 7301

  private fun criarCanal(ctx: Context, nm: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (nm.getNotificationChannel(CANAL) != null) return
    val canal = NotificationChannel(CANAL, "Alarme de pedido novo", NotificationManager.IMPORTANCE_HIGH)
    canal.description = "Toca até você abrir o app e aceitar o pedido"
    val som = ctx.resources.getIdentifier("pedido_novo_telefone", "raw", ctx.packageName)
    if (som != 0) {
      canal.setSound(
        Uri.parse("android.resource://${ctx.packageName}/$som"),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
    }
    canal.enableVibration(true)
    canal.vibrationPattern = longArrayOf(0, 500, 250, 500)
    canal.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    nm.createNotificationChannel(canal)
  }

  fun mostrar(ctx: Context, titulo: String, corpo: String) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    criarCanal(ctx, nm)

    val abrir = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } ?: return
    val pi = PendingIntent.getActivity(ctx, 0, abrir, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    val iconeNotif = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
    val icone = if (iconeNotif != 0) iconeNotif else ctx.applicationInfo.icon

    val notif = NotificationCompat.Builder(ctx, CANAL)
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
    notif.flags = notif.flags or Notification.FLAG_INSISTENT
    nm.notify(NOTIF_ID, notif)
  }

  fun parar(ctx: Context) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(NOTIF_ID)
  }
}
