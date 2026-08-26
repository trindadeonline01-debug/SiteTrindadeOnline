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
  },
};

export default nextConfig;
