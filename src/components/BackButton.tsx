'use client'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Mesma lista de rotas que o BottomNav usa pra se esconder (duplicada de
// propósito, mesmo padrão do resto do header/navegação do site) — nelas
// o menu inferior nunca aparece, logado ou não.
const BOTTOM_NAV_HIDE_ON = ['/login', '/cadastro', '/empresa/cadastrar', '/anunciar', '/admin', '/producao', '/painel', '/atendimento']

export default function BackButton() {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user || null))
  }, [])

  // O menu inferior (BottomNav) só aparece pro mobile logado (pedido do
  // Ricardo, out/2026) — sem ele, não sobra mais espaço reservado lá
  // embaixo, então esse botão (e o "+" de /peca-agora) descem pra ficar
  // mais perto da borda da tela, exatamente como no desktop (que nunca
  // teve esse menu). Logado, continua na posição de sempre, acima do menu.
  const hasBottomNav = isMobile && !!user && !BOTTOM_NAV_HIDE_ON.some(p => pathname.startsWith(p))

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
        bottom: isProdutoPage ? (hasBottomNav ? 148 : 84) : (hasBottomNav ? 84 : 24),
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
