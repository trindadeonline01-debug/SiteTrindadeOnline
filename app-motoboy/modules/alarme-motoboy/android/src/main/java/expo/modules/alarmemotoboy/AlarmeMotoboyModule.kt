package expo.modules.alarmemotoboy

import android.content.Intent
import android.net.Uri
import android.provider.Settings
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
  }
}
