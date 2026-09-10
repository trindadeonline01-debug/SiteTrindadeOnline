'use client'
import { useEffect, useState } from 'react'
import { getActiveCart, type ActiveCart } from '@/lib/lojaPricing'

// Ícone de carrinho global — mostra o carrinho ativo (de qualquer loja
// que o cliente andou comprando) direto no header, em qualquer página do
// site, sem precisar de login. Some sozinho quando o carrinho esvazia
// (pedido enviado, ou o cliente removeu tudo). Ouve o evento disparado
// por quem mexe no carrinho (HomePecaAgora, ProdutoDetailClient,
// CardapioClient) em vez de só ler uma vez, porque mudar o localStorage
// na mesma aba não dispara o evento nativo "storage".
export default function CartIndicator({ variant }: { variant: 'mobile' | 'desktop' }) {
  const [cart, setCart] = useState<ActiveCart | null>(null)

  useEffect(() => {
    const sync = () => setCart(getActiveCart())
    sync()
    window.addEventListener('trindade-cart-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('trindade-cart-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  if (!cart || cart.count <= 0) return null

  const label = `${cart.count} ${cart.count === 1 ? 'item' : 'itens'} — ${cart.companyName}`

  if (variant === 'mobile') {
    return (
      <>
        <style>{`
          .ci-mobile{position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;color:var(--ink);flex-shrink:0;text-decoration:none;}
          .ci-badge{position:absolute;top:-4px;right:-6px;background:var(--sign-dark);color:#fff;font-size:9.5px;font-weight:800;min-width:15px;height:15px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;font-family:'Archivo',sans-serif;}
        `}</style>
        <a className="ci-mobile" href={`/empresa/${cart.slug}/cardapio`} aria-label={`Carrinho — ${label}`} title={label}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1.4" fill="currentColor" stroke="none" /><circle cx="18" cy="21" r="1.4" fill="currentColor" stroke="none" />
            <path d="M2.5 3h2l2.6 12.4a2 2 0 0 0 2 1.6h8.1a2 2 0 0 0 2-1.6L21 7H6" />
          </svg>
          <span className="ci-badge">{cart.count}</span>
        </a>
      </>
    )
  }

  return (
    <>
      <style>{`
        .ci-desktop{position:relative;display:inline-flex;align-items:center;gap:7px;background:var(--sign);color:var(--ink);border-radius:10px;padding:7px 14px 7px 12px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;font-family:'Archivo',sans-serif;}
        .ci-desktop:hover{background:var(--sign-dark);color:#fff;}
      `}</style>
      <a className="ci-desktop" href={`/empresa/${cart.slug}/cardapio`} aria-label={`Carrinho — ${label}`} title={label}>
        🛒 {cart.count} {cart.count === 1 ? 'item' : 'itens'}
      </a>
    </>
  )
}
