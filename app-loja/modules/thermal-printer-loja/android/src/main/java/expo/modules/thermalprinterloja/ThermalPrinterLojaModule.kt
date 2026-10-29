package expo.modules.thermalprinterloja

import android.Manifest
import android.os.Build
import com.dantsu.escposprinter.EscPosPrinter
import com.dantsu.escposprinter.connection.bluetooth.BluetoothPrintersConnections
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Em cima da mesma lib (com.dantsu.escposprinter) que o pacote
// expo-thermal-printer 0.1.1 usa — só que esse pacote só expõe
// selectFirstPaired() (sem deixar ESCOLHER a impressora, se tiver mais de
// um dispositivo pareado) e uma largura fixa de 48mm/203dpi/32 colunas
// hardcoded no módulo nativo (não configurável da tela). Essas duas coisas
// o lojista precisa poder ajustar — tablet pareado só com a impressora
// resolveria na prática, mas é frágil assumir isso sem dar opção.
class ThermalPrinterLojaModule : Module() {
  private val bluetoothPermissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    arrayOf(
      Manifest.permission.BLUETOOTH,
      Manifest.permission.BLUETOOTH_ADMIN,
      Manifest.permission.BLUETOOTH_SCAN,
      Manifest.permission.BLUETOOTH_CONNECT
    )
  } else {
    arrayOf(
      Manifest.permission.BLUETOOTH,
      Manifest.permission.BLUETOOTH_ADMIN
    )
  }

  override fun definition() = ModuleDefinition {
    Name("ThermalPrinterLoja")

    AsyncFunction("requestBluetoothPermissions") { promise: Promise ->
      appContext.permissions?.askForPermissions(PermissionsResponseListener { result ->
        promise.resolve(result.map { mapOf(it.key to mapOf(
          "status" to it.value.status.toString(),
          "canAskAgain" to it.value.canAskAgain
        )) })
      }, *bluetoothPermissions)
    }

    // Lista de verdade (BluetoothPrintersConnections.getList()), não só a
    // primeira pareada — cada item traz nome+endereço pro lojista escolher
    // qual é a impressora na tela de configuração do app.
    Function("listPairedPrinters") {
      val connections = BluetoothPrintersConnections.getList()
      if (connections == null) {
        emptyList<Map<String, String>>()
      } else {
        connections.mapNotNull { conn ->
          val device = conn.device ?: return@mapNotNull null
          mapOf(
            "name" to (device.name ?: "Impressora sem nome"),
            "address" to device.address
          )
        }
      }
    }

    // text já vem pronto na sintaxe própria do DantSu ([C]/[L]/[R], <b>,
    // <font size='...'>...) — ver src/print/receipt.ts. dpi/widthMm/
    // charsPerLine são a calibração da impressora específica do lojista
    // (ver tela de Configuração), não um valor fixo pro app inteiro.
    AsyncFunction("printFormatted") { text: String, address: String?, dpi: Int, widthMm: Double, charsPerLine: Int, promise: Promise ->
      Thread {
        try {
          val connections = BluetoothPrintersConnections.getList()
          val connection = if (address != null) {
            connections?.firstOrNull { it.device?.address == address }
              ?: throw CodedException("PRINTER_NOT_FOUND", "Impressora com esse endereço não está pareada/visível agora.", null)
          } else {
            BluetoothPrintersConnections.selectFirstPaired()
              ?: throw CodedException("NO_PRINTER_PAIRED", "Nenhuma impressora pareada encontrada.", null)
          }
          val printer = EscPosPrinter(connection, dpi, widthMm.toFloat(), charsPerLine)
          printer.printFormattedTextAndCut(text)
          promise.resolve(true)
        } catch (e: Exception) {
          promise.reject(CodedException("PRINT_FAILED", e.message ?: "Falha ao imprimir", e))
        }
      }.start()
    }
  }
}
