'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getVisitorId } from '@/components/PalavraPremiada'

// Cobre o site inteiro fora das 3 páginas que já tinham rastreio próprio
// (empresa, cardápio, produto — cada uma grava com o entity_id certo no
// momento em que já busca seus próprios dados, em EmpresaPerfilClient/
// CardapioClient/ProdutoDetailClient). Antes dessa peça, o admin só tinha
// número pra essas 3 — pedido do Ricardo, out/2026: "quero saber tudo o
// que está acontecendo em todas as páginas do site, pra ter dado real".
function bucketFor(pathname: string): string | null {
  // Já rastreadas em outro lugar, com entity_id — não duplica aqui.
  if (/^\/empresa\/[^/]+\/item\//.test(pathname)) return null
  if (/^\/empresa\/[^/]+$/.test(pathname)) return null
  if (/^\/cardapio\/[^/]+$/.test(pathname)) return null
  // Área interna (painel/admin/motoboy/produção/API) não é tráfego do site
  // público — misturar isso inflaria os números com a própria equipe
  // navegando, não morador nenhum. /pedido/[id] continua de fora dessa
  // lista: é o acompanhamento do CLIENTE (público, ESPECIFICACAO.md §5.2),
  // entra no bucket próprio lá embaixo.
  if (
    pathname.startsWith('/painel') || pathname.startsWith('/admin') ||
    pathname.startsWith('/motoboy') || pathname.startsWith('/producao') ||
    pathname.startsWith('/api')
  ) return null

  // "/" na frente em todo bucket — mesma convenção que os 3 tipos que já
  // existiam antes (page: '/empresa', '/cardapio', '/produto').
  if (pathname === '/') return '/home'
  if (pathname.startsWith('/busca')) return '/busca'
  if (pathname.startsWith('/categoria/')) return '/categoria'
  if (pathname.startsWith('/subcategoria/')) return '/subcategoria'
  if (pathname.startsWith('/peca-agora')) return '/peca-agora'
  if (pathname.startsWith('/desapega')) return '/desapega'
  if (pathname.startsWith('/empregos')) return '/empregos'
  if (pathname.startsWith('/imoveis')) return '/imoveis'
  if (pathname.startsWith('/achados-perdidos')) return '/achados-perdidos'
  if (pathname.startsWith('/anuncio/')) return '/anuncio'
  if (pathname.startsWith('/cupons')) return '/cupons'
  if (pathname.startsWith('/promocoes')) return '/promocoes'
  if (pathname.startsWith('/ofertas')) return '/ofertas'
  if (pathname.startsWith('/favoritos')) return '/favoritos'
  if (pathname.startsWith('/perfil')) return '/perfil'
  if (pathname.startsWith('/termos')) return '/termos'
  if (pathname.startsWith('/empresa/cadastrar') || pathname.startsWith('/anunciar')) return '/anunciar'
  if (pathname.startsWith('/empresa/planos')) return '/planos'
  if (pathname.startsWith('/empresa/bem-vindo')) return '/bem-vindo'
  if (pathname.startsWith('/login')) return '/login'
  if (pathname.startsWith('/cadastro')) return '/cadastro'
  if (pathname.startsWith('/redefinir-senha')) return '/redefinir-senha'
  if (pathname.startsWith('/pedido/')) return '/pedido'
  // Catch-all — qualquer página pública nova criada depois já entra sozinha,
  // sem precisar lembrar de adicionar aqui.
  return '/outro'
}

export default function SiteViewTracker() {
  const pathname = usePathname()
  const lastTracked = useRef<string | null>(null)

  useEffect(() => {
    const bucket = bucketFor(pathname)
    if (!bucket || lastTracked.current === pathname) return
    lastTracked.current = pathname
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabase.from('page_views').insert({
        page: bucket,
        session_id: getVisitorId(),
        user_id: session?.user?.id || null,
        referrer: typeof document !== 'undefined' ? (document.referrer || null) : null,
      }).then(() => {})
    })
  }, [pathname])

  return null
}
