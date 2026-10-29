import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PRINT_CONFIG, type PrintConfig } from '../modules/thermal-printer-loja';

// Impressora é característica do APARELHO (o tablet fica fixo na loja,
// pareado com uma impressora física), não da conta — por isso fica no
// AsyncStorage local, não numa coluna de companies no banco.
const KEY_ADDRESS = 'loja-printer-address';
const KEY_CONFIG = 'loja-printer-config';

export async function getSavedPrinterAddress(): Promise<string | null> {
  try { return await AsyncStorage.getItem(KEY_ADDRESS); } catch { return null; }
}
export async function savePrinterAddress(address: string | null) {
  try {
    if (address) await AsyncStorage.setItem(KEY_ADDRESS, address);
    else await AsyncStorage.removeItem(KEY_ADDRESS);
  } catch {}
}

export async function getSavedPrintConfig(): Promise<PrintConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEY_CONFIG);
    if (!raw) return DEFAULT_PRINT_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PRINT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_PRINT_CONFIG;
  }
}
export async function savePrintConfig(config: PrintConfig) {
  try { await AsyncStorage.setItem(KEY_CONFIG, JSON.stringify(config)); } catch {}
}
