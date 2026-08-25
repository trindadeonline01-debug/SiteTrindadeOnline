'use client'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export default function BackButton() {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Essas páginas usam a navegação própria do EmpresaShell (sidebar/topbar/tabbar) —
  // o botão flutuante de voltar do site principal ficaria duplicado ali.
  const empresaShellPaths = ['/painel/compartilhar', '/painel/catalogo', '/painel/pedidos', '/painel/cozinha', '/painel/entrega', '/painel/mensagens', '/painel/clientes']
  if (pathname === '/' || empresaShellPaths.some(p => pathname.startsWith(p))) return null

  return (
    <button
      onClick={() => router.back()}
      aria-label="Voltar"
      style={{
        position: 'fixed',
        right: 16,
        bottom: isMobile ? 84 : 24,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: '#111',
        border: 'none',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 500,
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  )
}
