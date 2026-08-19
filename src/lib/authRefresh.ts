import { supabase } from '@/lib/supabase'

let refreshing: ReturnType<typeof supabase.auth.refreshSession> | null = null

// Evita duas chamadas simultâneas de refreshSession() — por exemplo, o
// disparo automático de motoboy e um clique manual acontecendo ao mesmo
// tempo. O token de renovação só serve uma vez: rodar duas renovações em
// paralelo derruba a sessão (a segunda usa um refresh_token que a primeira
// já consumiu). Quem chega depois só espera a mesma promise em vez de
// tentar renovar de novo.
export function refreshSessionOnce() {
  if (!refreshing) {
    refreshing = supabase.auth.refreshSession().finally(() => { refreshing = null })
  }
  return refreshing
}
