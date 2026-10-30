import AsyncStorage from '@react-native-async-storage/async-storage';

// O Android não deixa o app LER se a bateria está sem restrição nem se a
// tela por cima do bloqueio está liberada — então o assistente abre a tela
// certa e o dono marca "Já fiz". O resto (notificações, Bluetooth,
// impressora) é conferido de verdade.
const KEY = 'loja-assistente';
export type WizardState = { bateria: boolean; telaCheia: boolean; teste: boolean; visto: boolean };
const VAZIO: WizardState = { bateria: false, telaCheia: false, teste: false, visto: false };

export async function getWizardState(): Promise<WizardState> {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? { ...VAZIO, ...JSON.parse(raw) } : VAZIO; } catch { return VAZIO; }
}
export async function saveWizardState(patch: Partial<WizardState>): Promise<WizardState> {
  const atual = await getWizardState();
  const novo = { ...atual, ...patch };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(novo)); } catch {}
  return novo;
}
