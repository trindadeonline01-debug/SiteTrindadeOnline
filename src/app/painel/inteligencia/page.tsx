'use client'
import { usePainelShell } from '@/contexts/PainelShellContext'
import InteligenciaConsumo from '@/components/inteligencia/InteligenciaConsumo'

// Inteligência de consumo da loja (nov/2026): quem comprou o quê, quando e de onde, com filtros conectados.
export default function InteligenciaPage() {
  const { company, loading } = usePainelShell()
  if (loading) return <div style={{ padding: 24 }}>Carregando…</div>
  if (!company) return <div style={{ padding: 24 }}>Nenhuma empresa selecionada.</div>
  return <InteligenciaConsumo companyId={company.id} />
}
