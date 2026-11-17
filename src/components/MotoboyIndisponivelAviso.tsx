'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Aviso pro lojista quando o admin desliga o "Chamar motoboy da plataforma"
// (feature_flags.motoboy_disponivel). O bloqueio de verdade é no servidor
// (criarEntregaEChamarMotoboy) — isso aqui é só o aviso visível.
export default function MotoboyIndisponivelAviso() {
  const [off, setOff] = useState(false)
  useEffect(() => {
    const check = () => supabase.from('feature_flags').select('enabled').eq('key', 'motoboy_disponivel').maybeSingle()
      .then(({ data }) => setOff(data?.enabled === false))
    check()
    const iv = setInterval(check, 60000)
    return () => clearInterval(iv)
  }, [])
  if (!off) return null
  return (
    <div style={{ background: '#FBEAEA', border: '1.5px solid #E4A3A3', color: '#8A1F1F', borderRadius: 12, padding: '12px 16px', margin: '10px 12px', fontSize: 14, fontWeight: 700, textAlign: 'center' }}>
      🏍️ Neste momento estamos sem entregador disponível.
    </div>
  )
}
