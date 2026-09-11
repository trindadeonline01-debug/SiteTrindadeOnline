'use client'
import { useEffect, useState } from 'react'

// Sinal de "recomeça do zero" pra canais realtime. Celular com a tela
// apagada ou o navegador em segundo plano trava/atrasa os timers da aba —
// o WebSocket do Supabase Realtime pode ficar "vivo" mas surdo (sem erro
// nenhum, só para de entregar evento), e o token de sessão pode vencer
// nesse meio tempo sem o realtime saber. Sintoma real do Ricardo, set/2026:
// pedido chegou, não tocou som, não atualizou a tela — só voltou ao normal
// depois de dar F5.
//
// Em vez de confiar que o socket se recupera sozinho, qualquer sinal de
// "a aba voltou a existir" (ficou visível nas costas, ganhou foco, internet
// voltou) incrementa esse número. Quem usa deve recriar o canal (e
// idealmente rebuscar os dados) sempre que ele mudar.
export function useRealtimeResync() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick(t => t + 1)
    const onVisibility = () => { if (document.visibilityState === 'visible') bump() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', bump)
    window.addEventListener('online', bump)
    window.addEventListener('pageshow', bump)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', bump)
      window.removeEventListener('online', bump)
      window.removeEventListener('pageshow', bump)
    }
  }, [])
  return tick
}
