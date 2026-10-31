import AsyncStorage from '@react-native-async-storage/async-storage';

// Memória do que o app já tratou de cada pedido, guardada no aparelho — é
// isso que impede o alarme de tocar de novo (e o recibo de imprimir de novo)
// pra um pedido que você já aceitou/imprimiu numa abertura anterior do app.
// Chaves: `ack:<pedido>` (alarme confirmado), `print:<pedido>` (recibo enviado).
const KEY = 'loja-feitos';
const LIMITE = 300;

let feitos: string[] = [];
let set = new Set<string>();
let carregado: Promise<void> | null = null;

export function carregarFeitos(): Promise<void> {
  if (!carregado) {
    carregado = AsyncStorage.getItem(KEY)
      .then(raw => { feitos = raw ? JSON.parse(raw) : []; set = new Set(feitos); })
      .catch(() => {});
  }
  return carregado;
}

export function jaFeito(chave: string): boolean { return set.has(chave); }

export function marcarFeito(chaves: string[]) {
  let mudou = false;
  for (const c of chaves) if (!set.has(c)) { set.add(c); feitos.push(c); mudou = true; }
  if (!mudou) return;
  if (feitos.length > LIMITE) { feitos = feitos.slice(-LIMITE); set = new Set(feitos); }
  AsyncStorage.setItem(KEY, JSON.stringify(feitos)).catch(() => {});
}
