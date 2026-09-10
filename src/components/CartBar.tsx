'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getActiveCart, fmt, type ActiveCart } from '@/lib/lojaPricing'

// Barra amarela fixa "N itens · Ver carrinho — R$X", igual a que já existe
// dentro do cardápio de cada loja (.cd-cartbar em CardapioClient) — só que
// montada uma vez no layout global, pra aparecer em qualquer página
// (home, página do produto etc) enquanto o carrinho tiver item. Pedido do
// Ricardo: quem adiciona pela home também merece essa mesma barra
// persistente, não só um aviso que some sozinho.
export default function CartBar() {
  const pathname = usePathname()
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
  // Dentro do próprio cardápio dessa loja a página já tem a barra dela,
  // calculada ao vivo do carrinho em memória — mostrar essa aqui também
  // duplicaria.
  if (pathname === `/empresa/${cart.slug}/cardapio`) return null

  return (
    <>
      <style>{`
        .global-cartbar{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;width:calc(100% - 32px);max-width:448px;padding:13px 16px;border-radius:16px;background:var(--sign);color:var(--ink);display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 10px 24px -8px rgba(0,0,0,.35);text-decoration:none;font-family:'Archivo',sans-serif;z-index:10000;}
        .global-cartbar-txt{font-size:13px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .global-cartbar-txt b{font-weight:800;}
        .global-cartbar-price{font-size:14.5px;font-weight:800;flex-shrink:0;}
      `}</style>
      <a className="global-cartbar" href={`/empresa/${cart.slug}/cardapio`}>
        <span className="global-cartbar-txt">{cart.count} {cart.count === 1 ? 'item' : 'itens'} · Ver carrinho <b>— {cart.companyName}</b></span>
        <span className="global-cartbar-price">{fmt(cart.total)}</span>
      </a>
    </>
  )
}
