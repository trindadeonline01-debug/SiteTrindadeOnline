import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://trindadeonline.com.br'

  const static_pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/categoria/comercios`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/categoria/gastronomia`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/categoria/servicos`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/categoria/igrejas`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/desapega`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/empregos`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/imoveis`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/achados-perdidos`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/empresa/cadastrar`, changeFrequency: 'monthly', priority: 0.6 },
  ]

  const { data: companies } = await supabase
    .from('companies')
    .select('slug, updated_at')
    .eq('is_active', true)

  const company_pages: MetadataRoute.Sitemap = (companies || []).map(c => ({
    url: `${base}/empresa/${c.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
    lastModified: c.updated_at,
  }))

  return [...static_pages, ...company_pages]
}
