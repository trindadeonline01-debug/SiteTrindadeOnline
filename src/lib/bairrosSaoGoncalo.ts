// Os 91 bairros oficiais de São Gonçalo (RJ), nos 5 distritos (Sede, Ipiíba,
// Monjolos, Neves, Sete Pontes), em ordem alfabética. Usado no painel de
// taxa de entrega por bairro e pra casar com o campo "bairro" que o ViaCEP
// devolve no checkout do cardápio.
export const BAIRROS_SAO_GONCALO = [
  'Alcântara', 'Almerinda', 'Amendoeira', 'Anaia Grande', 'Anaia Pequeno', 'Antonina', 'Apolo II',
  'Arrastão', 'Arsenal', 'Bairro das Palmeiras', 'Barracão', 'Barro Vermelho', 'Boa Vista', 'Boaçu',
  'Bom Retiro', 'Brasilândia', 'Centro', 'Coelho', 'Colubandê', 'Covanca', 'Cruzeiro do Sul', 'Eliane',
  'Engenho do Roçado', 'Engenho Pequeno', 'Estrela do Norte', 'Fazenda dos Mineiros', 'Galo Branco',
  'Gebara', 'Gradim', 'Guarani', 'Guaxindiba', 'Ieda', 'Ipiiba', 'Itaoca', 'Itaúna', 'Jardim Alcântara',
  'Jardim Amendoeira', 'Jardim Califórnia', 'Jardim Catarina', 'Jardim Nova República', 'Jóquei Clube',
  'Lagoinha', 'Laranjal', 'Largo da Ideia', 'Lindo Parque', 'Luiz Caçador', 'Mangueira', 'Marambaia',
  'Maria Paula', 'Miriambi', 'Monjolos', 'Morro do Castro', 'Mutondo', 'Mutuá', 'Mutuaguaçu', 'Mutuapira',
  'Neves', 'Nova Cidade', 'Pacheco', 'Paraíso', 'Patronato', 'Pita', 'Porto da Madama', 'Porto da Pedra',
  'Porto do Rosa', 'Porto Novo', 'Porto Velho', 'Raul Veiga', 'Recanto das Acácias', 'Rio do Ouro',
  'Rocha', 'Rosane', 'Sacramento', 'Salgueiro', 'Santa Catarina', 'Santa Isabel', 'Santa Luzia',
  'São Miguel', 'Tenente Jardim', 'Tiradentes', 'Tribobó', 'Trindade', 'Várzea das Moças', 'Venda da Cruz',
  'Vila Candoza', 'Vila Iara', 'Vila Lage', 'Vila Três', 'Vista Alegre', 'Zé Garoto', 'Zumbi',
]

// Normaliza pra comparar bairro digitado pelo ViaCEP com o que a empresa
// configurou — remove acento, caixa e espaço nas pontas, já que a grafia
// pode variar ligeiramente entre fontes (ex: "Alcantara" vs "Alcântara").
export function normalizeBairro(nome: string): string {
  return (nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

// Acha o bairro mais espec\u00edfico (nome mais longo primeiro, pra "Boa Vista"
// n\u00e3o perder pra um bairro cujo nome seja substring de outro) dentro de um
// endere\u00e7o em texto livre \u2014 vive aqui (n\u00e3o em entregaPricing.ts) de
// prop\u00f3sito: este arquivo \u00e9 s\u00f3 dado + fun\u00e7\u00e3o pura, seguro de importar em
// componente de cliente. entregaPricing.ts cria um client Supabase com a
// service role key no topo do m\u00f3dulo \u2014 importar algo de l\u00e1 num componente
// 'use client' carrega esse client no navegador e quebra a p\u00e1gina inteira
// (achado real, out/2026: Vis\u00e3o Geral trava com "Aw, Snap" assim que
// VendasDashboard importava matchBairroInAddress de entregaPricing.ts).
export function matchBairroInAddress(address: string): string | null {
  const norm = normalizeBairro(address)
  const ordenados = [...BAIRROS_SAO_GONCALO].sort((a, b) => b.length - a.length)
  for (const bairro of ordenados) {
    if (norm.includes(normalizeBairro(bairro))) return bairro
  }
  return null
}
