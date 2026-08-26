// Fotos reais de cada categoria, escolhidas pelo Ricardo e hospedadas no
// bucket público "Categorias" do Supabase Storage — substituem os ícones
// de linha (SVG) usados antes nos cards/heróis de categoria do site.
const BASE = 'https://plfuznchzuzardkfjmqo.supabase.co/storage/v1/object/public/Categorias'

export const CATEGORY_IMAGES: Record<string, string> = {
  comercios: `${BASE}/comercio.png`,
  servicos: `${BASE}/servicos.png`,
  gastronomia: `${BASE}/gastronomia.png`,
  empregos: `${BASE}/empregos.png`,
  imoveis: `${BASE}/imoveis.png`,
  desapega: `${BASE}/desapega.png`,
  achados: `${BASE}/achados%20e%20perdidos.png`,
  igrejas: `${BASE}/igrejas.png`,
}
