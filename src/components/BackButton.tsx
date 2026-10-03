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

  // Essas páginas usam a navegação própria do EmpresaShell (sidebar
  // desktop/tabbar mobile), mas nenhuma delas tem um "voltar" de verdade —
  // a tabbar do celular não cobre toda rota, e cair numa tela funda (ex:
  // Configurar cardápio) sem esse botão prende o lojista lá (achado real
  // do Ricardo testando no iPhone, set/2026). Só a home (que não tem "voltar"
  // que faça sentido) continua de fora.
  if (pathname === '/') return null

  // Página do produto (/empresa/[slug]/item/[id]) tem a barra fixa
  // "Adicionar ao carrinho" (.id-bar, z-index:10000) colada no mesmo
  // canto inferior direito — sem esse ajuste ela cobre o botão por
  // cima (some visualmente e também captura o toque), achado real do
  // Ricardo, out/2026: "não tenho o botão de voltar nessa página do
  // produto". Sobe o botão pra ficar acima da barra, não atrás dela.
  const isProdutoPage = /^\/empresa\/[^/]+\/item\//.test(pathname)

  return (
    <button
      onClick={() => router.back()}
      aria-label="Voltar"
      style={{
        position: 'fixed',
        right: 16,
        bottom: isProdutoPage ? (isMobile ? 148 : 84) : (isMobile ? 84 : 24),
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
        // Precisa ficar abaixo do overlay de QUALQUER modal do site (o mais
        // baixo em uso é z-index:60, no catálogo) — senão esse botão fica
        // flutuando por cima do modal, escondendo e capturando o toque de
        // controles dele (achado real do Ricardo, set/2026: modal "Duplicar
        // grupo de outro produto" com o seletor de produto inacessível).
        zIndex: 40,
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  )
}
