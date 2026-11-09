package expo.modules.alarmemotoboy

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.view.WindowManager

// Serviço em primeiro plano que faz o alarme de corrida nova (cópia do
// AlarmeService do app-loja): toca o som em repetição (canal de ALARME,
// passa por cima do silencioso) e abre o app por cima do que estiver aberto
// (Waze, WhatsApp...). Para quando o app abre (stopAlarm), quando chega o
// push "oferta_encerrada" ou quando a oferta vence (expira_em, ~2 min).
class AlarmeService : Service() {
  companion object {
    const val EXTRA_TITULO = "titulo"
    const val EXTRA_CORPO = "corpo"
    const val EXTRA_EXPIRA = "expira_em"
    const val EXTRA_MODO = "modo"
    const val MODO_CANCELADA = "cancelada"
    private const val CANCELADA_MS = 9 * 1000L
    private const val LIMITE_MS = 3 * 60 * 1000L
  }

  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var overlay: View? = null
  private val handler = Handler(Looper.getMainLooper())

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val cancelada = intent?.getStringExtra(EXTRA_MODO) == MODO_CANCELADA
    val titulo = intent?.getStringExtra(EXTRA_TITULO) ?: (if (cancelada) "Corrida cancelada" else "Nova corrida")
    val corpo = intent?.getStringExtra(EXTRA_CORPO) ?: ""

    val notif = AlarmeMotoboy.notificacao(this, titulo, corpo, false)
    if (notif == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(AlarmeMotoboy.NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(AlarmeMotoboy.NOTIF_ID, notif)
      }
    } catch (e: Exception) {
      stopSelf()
      return START_NOT_STICKY
    }

    acordarTela()
    // Troca o som se já tinha alarme de corrida nova tocando
    try { player?.stop(); player?.release() } catch (e: Exception) {}
    player = null
    tocar(if (cancelada) "corrida_cancelada" else "alerta_corrida")
    abrirApp()

    handler.removeCallbacksAndMessages(null)
    if (cancelada) {
      // Som de cancelamento: ~9 s e para; deixa um aviso comum na barra.
      handler.postDelayed({
        AlarmeMotoboy.avisoCancelada(this, titulo, corpo)
        stopSelf()
      }, CANCELADA_MS)
      return START_NOT_STICKY
    }
    // Para na hora em que a oferta vence (com folga de 5 s); sem a data,
    // ou com data estranha, usa o limite de 3 minutos.
    val expira = intent?.getLongExtra(EXTRA_EXPIRA, 0L) ?: 0L
    val restante = expira - System.currentTimeMillis() + 5000L
    val limite = if (restante in 5000L..LIMITE_MS) restante else LIMITE_MS
    handler.postDelayed({ stopSelf() }, limite)
    return START_NOT_STICKY
  }

  @Suppress("DEPRECATION")
  private fun acordarTela() {
    try {
      if (wakeLock == null) {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP, "trindademotoboy:alarme")
      }
      wakeLock?.acquire(60 * 1000L)
    } catch (e: Exception) {}
  }

  private fun tocar(nomeSom: String) {
    if (player != null) return
    try {
      // Garante volume audível no canal de alarme (tablet de balcão)
      val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
      val minimo = (max * 0.7).toInt()
      if (am.getStreamVolume(AudioManager.STREAM_ALARM) < minimo) {
        am.setStreamVolume(AudioManager.STREAM_ALARM, minimo, 0)
      }

      val res = resources.getIdentifier(nomeSom, "raw", packageName)
      if (res == 0) return
      val mp = MediaPlayer()
      mp.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      val afd = resources.openRawResourceFd(res)
      mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
      afd.close()
      mp.isLooping = true
      mp.prepare()
      mp.start()
      player = mp
    } catch (e: Exception) {
      // sem som o resto (notificação de tela cheia) ainda funciona
    }
  }

  // Abre o app por cima de qualquer outro. Com a permissão "Sobrepor a outros
  // apps" o Android deixa um app abrir tela vindo do segundo plano; uma
  // janela mínima e transparente garante isso nas versões mais novas.
  private fun abrirApp() {
    val abrir = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } ?: return
    try {
      if (Settings.canDrawOverlays(this) && overlay == null) {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val v = View(this)
        val lp = WindowManager.LayoutParams(
          1, 1,
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
          PixelFormat.TRANSLUCENT
        )
        wm.addView(v, lp)
        overlay = v
      }
    } catch (e: Exception) {}
    try { startActivity(abrir) } catch (e: Exception) {}
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    try { player?.stop() } catch (e: Exception) {}
    try { player?.release() } catch (e: Exception) {}
    player = null
    try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (e: Exception) {}
    try {
      overlay?.let { (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(it) }
    } catch (e: Exception) {}
    overlay = null
    try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (e: Exception) {}
    super.onDestroy()
  }
}
