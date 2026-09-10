'use client'
import { createContext, useContext } from 'react'
import type { EmpresaNavKey } from '@/components/EmpresaShell'

type SwitcherCompany = { id: string; name: string; slug?: string }

export type ShellCompany = {
  id: string; name: string; slug: string
  loja_digital_enabled: boolean; crm_whatsapp_enabled: boolean; entrega_enabled: boolean
}

type PainelShellValue = {
  // A empresa que src/app/painel/layout.tsx já resolveu (dono logado, ou
  // impersonação de admin via ?empresa=) — as páginas usam isso pra buscar
  // seus próprios dados por company.id em vez de reimplementar a lógica de
  // "sou dono ou sou admin?" em cada uma.
  company: ShellCompany | null
  // true enquanto o layout ainda está resolvendo a empresa — company===null
  // com loading===true é "ainda não sei", company===null com loading===false
  // é "resolvido, não tem empresa nenhuma" (aí sim a página redireciona).
  loading: boolean
  // true quando quem está navegando é um admin vendo a empresa de outro
  // dono (não é a própria empresa). Páginas podem mostrar o aviso "Modo
  // admin" quando isso for true.
  isAdminMode: boolean
  // A sidebar mora em src/app/painel/layout.tsx (persistente entre
  // navegações). O item ativo é adivinhado a partir da URL na maioria das
  // páginas, mas /painel e /painel/pessoal trocam de aba sem sempre mudar
  // a URL — essas páginas usam esse override pra corrigir o destaque.
  setActiveOverride: (key: EmpresaNavKey | null) => void
  // Só /painel usa hoje (troca entre negócios do mesmo dono) — as outras
  // páginas nunca chamam isso, então o seletor simplesmente não aparece.
  setSwitcherExtras: (extras: { companies?: SwitcherCompany[]; onSwitchCompany?: (c: SwitcherCompany) => void } | null) => void
  // Nome da impressora configurada e se aceita pedido automático — moraram
  // antes só dentro de /painel/pedidos, mas a impressão automática precisa
  // rodar a partir do layout (persiste entre navegações) pra não depender
  // da tela de Pedidos estar aberta (achado real do Ricardo, set/2026).
  // As páginas continuam podendo ler/mudar por aqui, single source of truth.
  printerName: string
  autoAceitar: boolean
  setPrinterName: (name: string) => void
  setAutoAceitar: (v: boolean) => void
}

export const PainelShellContext = createContext<PainelShellValue>({
  company: null,
  loading: true,
  isAdminMode: false,
  setActiveOverride: () => {},
  setSwitcherExtras: () => {},
  printerName: '',
  autoAceitar: true,
  setPrinterName: () => {},
  setAutoAceitar: () => {},
})

export function usePainelShell() {
  return useContext(PainelShellContext)
}
