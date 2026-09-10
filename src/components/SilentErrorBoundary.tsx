'use client'
import { Component, type ReactNode } from 'react'

// Rede de segurança pra componentes globais (montados no layout raiz, então
// aparecem em TODA página) que dependem de dado guardado no navegador do
// cliente (localStorage) e não tem como validar 100% do que pode estar lá —
// um formato antigo/corrompido nunca mais pode derrubar o site inteiro só
// porque um componente pequeno quebrou. Se acontecer, esconde só aquele
// pedaço, em silêncio (não é um erro que o morador precisa ver).
export default class SilentErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() { return this.state.hasError ? null : this.props.children }
}
