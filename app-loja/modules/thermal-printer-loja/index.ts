import { requireNativeModule } from 'expo-modules-core';

export type PairedPrinter = { name: string; address: string };

const Native = requireNativeModule('ThermalPrinterLoja');

export async function requestBluetoothPermissions(): Promise<boolean> {
  const result = await Native.requestBluetoothPermissions();
  return Object.values(result || {}).every((p: any) => p?.status === 'GRANTED');
}

export function listPairedPrinters(): PairedPrinter[] {
  try {
    return Native.listPairedPrinters() || [];
  } catch {
    return [];
  }
}

export type PrintConfig = { dpi: number; widthMm: number; charsPerLine: number };

// Padrão de impressora térmica de 58mm portátil (a mesma categoria das que
// o Crepe Cone/padaria do Durval usam) — 32 colunas é o comum pra esse
// tamanho. Ajustável na tela de Configuração se a impressora real for
// diferente (80mm = normalmente 42-48 colunas).
export const DEFAULT_PRINT_CONFIG: PrintConfig = { dpi: 203, widthMm: 58, charsPerLine: 32 };

export async function printFormatted(text: string, address: string | null, config: PrintConfig): Promise<void> {
  await Native.printFormatted(text, address, config.dpi, config.widthMm, config.charsPerLine);
}

// Para o alarme nativo de pedido novo (notificação de tela cheia que toca em
// repetição com o app fechado). Chamado sempre que o app volta pra frente.
export function stopAlarm(): void {
  try { Native.stopAlarm(); } catch {}
}
