import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp usa binário nativo — sem isso o rastreamento de dependências do
  // Next tenta empacotar ele junto com o resto do bundle da função
  // serverless e o binário quebra em produção (funciona local, 500 na Vercel).
  serverExternalPackages: ['sharp'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'plfuznchzuzardkfjmqo.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    // Achado real do Ricardo, set/2026: foto de produto (Xerelete G/P kg)
    // quebrada no site (ícone de "?" no lugar da imagem) tanto no celular
    // quanto no desktop — confirmado via curl que a otimização automática da
    // Vercel (/_next/image) estava devolvendo 402 Payment Required,
    // x-vercel-error: OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED (cota mensal
    // de otimização de imagem do plano estourada). A imagem crua no Storage
    // sempre funcionou (por isso o preview do link no WhatsApp, que usa a
    // URL direta, nunca quebrou). Como toda foto já passa por compressão no
    // navegador antes do upload (compressImage.ts, ~130KB/1000px), reotimizar
    // de novo do lado da Vercel é redundante e cobrado à parte — desligando
    // aqui, o <Image> do Next serve a URL do Storage direto, sem passar pela
    // cota paga, e para de quebrar quando ela estoura.
    unoptimized: true,
  },
  // Link do cardápio mudou de /empresa/[slug]/cardapio pra /cardapio/[slug]
  // (pedido do Ricardo, set/2026) — redireciona pra sempre (301) porque já
  // tem link antigo espalhado (QR code impresso, mensagem de WhatsApp já
  // mandada pelos clientes/pela IA, link salvo em algum lugar).
  async redirects() {
    return [
      {
        source: '/empresa/:slug/cardapio',
        destination: '/cardapio/:slug',
        permanent: true,
      },
    ]
  },
  // Headers de segurança básicos em toda página — achado em auditoria de
  // segurança, out/2026 (o site não tinha nenhum). Sem CSP de propósito:
  // apertar isso direito exigiria mapear e testar contra TODO script de
  // terceiro já plugado (GTM, OneSignal, Mercado Pago, QZ Tray, fontes do
  // Google), risco real de quebrar alguma coisa sem o teste completo — fica
  // pra uma rodada própria, não misturado com o resto do checklist.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ]
  },
};

export default nextConfig;
