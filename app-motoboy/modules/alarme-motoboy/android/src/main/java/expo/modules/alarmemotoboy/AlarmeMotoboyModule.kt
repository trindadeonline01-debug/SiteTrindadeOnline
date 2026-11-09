package expo.modules.alarmemotoboy

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AlarmeMotoboyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AlarmeMotoboy")

    // Cancela o som em loop e a notificação de tela cheia.
    Function("stopAlarm") {
      appContext.reactContext?.let { AlarmeMotoboy.parar(it) }
      Unit
    }

    Function("canDrawOverlays") {
      val ctx = appContext.reactContext ?: return@Function true
      Settings.canDrawOverlays(ctx)
    }

    Function("openOverlaySettings") {
      val ctx = appContext.reactContext ?: return@Function Unit
      try {
        val i = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
      } catch (e: Exception) {}
      Unit
    }

    // Notificações do app ligadas no sistema?
    Function("notificationsEnabled") {
      val ctx = appContext.reactContext ?: return@Function true
      NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }
    Function("openNotificationSettings") {
      val ctx = appContext.reactContext ?: return@Function Unit
      try {
        val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
      } catch (e: Exception) {}
      Unit
    }

    // Notificação em tela cheia (Android 14+ pode vir desligada)
    Function("canUseFullScreenIntent") {
      val ctx = appContext.reactContext ?: return@Function true
      if (Build.VERSION.SDK_INT >= 34) {
        (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canUseFullScreenIntent()
      } else true
    }
    Function("openFullScreenSettings") {
      val ctx = appContext.reactContext ?: return@Function Unit
      try {
        if (Build.VERSION.SDK_INT >= 34) {
          val i = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${ctx.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          ctx.startActivity(i)
        }
      } catch (e: Exception) {}
      Unit
    }

    // Bateria: app fora da economia de bateria (senão o Android mata o app em segundo plano)
    Function("ignoringBatteryOptimizations") {
      val ctx = appContext.reactContext ?: return@Function true
      (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName)
    }
    Function("openBatterySettings") {
      val ctx = appContext.reactContext ?: return@Function Unit
      try {
        val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
      } catch (e: Exception) {
        try {
          ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e2: Exception) {}
      }
      Unit
    }
  }
}
