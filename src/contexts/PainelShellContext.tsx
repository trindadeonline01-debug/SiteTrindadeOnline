'use client'
import { createContext, useContext } from 'react'
import type { EmpresaNavKey } from '@/components/EmpresaShell'

type SwitcherCompany = { id: string; name: string; slug?: string }

type PainelShellValue = {
  // A sidebar mora em src/app/painel/layout.tsx (persistente entre
  // navegações). O item ativo é adivinhado a partir da URL na maioria das
  // páginas, mas /painel e /painel/pessoal trocam de aba sem sempre mudar
  // a URL — essas páginas usam esse override pra corrigir o destaque.
  setActiveOverride: (key: EmpresaNavKey | null) => void
  // Só /painel usa hoje (troca entre negócios do mesmo dono) — as outras
  // páginas nunca chamam isso, então o seletor simplesmente não aparece.
  setSwitcherExtras: (extras: { companies?: SwitcherCompany[]; onSwitchCompany?: (c: SwitcherCompany) => void } | null) => void
}

export const PainelShellContext = createContext<PainelShellValue>({
  setActiveOverride: () => {},
  setSwitcherExtras: () => {},
})

export function usePainelShell() {
  return useContext(PainelShellContext)
}
