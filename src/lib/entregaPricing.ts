import { createClient } from '@supabase/supabase-js'
import { BAIRROS_SAO_GONCALO, normalizeBairro } from '@/lib/bairrosSaoGoncalo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface EntregaPricing {
  diaria: number
  entrega_taxa_metodo: 'bairro' | 'distancia'
  entrega_taxa_padrao: number
}

// Servidor roda em UTC (Vercel) — sem timeZone explícito aqui a data vira
// amanhã/ontem dependendo da hora, perto da meia-noite. Ainda usado pra saber
// se a primeira entrega avulsa confirmada é "hoje" (ver /api/entrega/webhook).
export function todaySaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export async function getEntregaPricing(): Promise<EntregaPricing> {
  const { data } = await supabase.from('entrega_pricing').select('*').eq('id', true).maybeSingle()
  return {
    diaria: Number(data?.diaria ?? 20),
    entrega_taxa_metodo: (data?.entrega_taxa_metodo === 'distancia' ? 'distancia' : 'bairro'),
    entrega_taxa_padrao: Number(data?.entrega_taxa_padrao ?? 5),
  }
}

// Acha o bairro mais específico (nome mais longo primeiro, pra "Boa Vista"
// não perder pra um bairro cujo nome seja substring de outro) dentro de um
// endereço em texto livre — o dropoff da entrega da plataforma não vem
// estruturado em campos, é só uma string digitada pelo lojista ou montada
// no checkout do cliente.
function matchBairroInAddress(address: string): string | null {
  const norm = normalizeBairro(address)
  const ordenados = [...BAIRROS_SAO_GONCALO].sort((a, b) => b.length - a.length)
  for (const bairro of ordenados) {
    if (norm.includes(normalizeBairro(bairro))) return bairro
  }
  return null
}

async function geocodeAndMatrixPlataforma(
  lojaLat: number, lojaLng: number, dropoffAddress: string
): Promise<{ km: number } | null> {
  const orsKey = process.env.ORS_API_KEY
  if (!orsKey) return null
  let custLat: number, custLng: number
  try {
    const geoUrl = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(orsKey)}&text=${encodeURIComponent(dropoffAddress + ', São Gonçalo, RJ, Brasil')}&boundary.country=BR&size=1`
    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) })
    const geo = await geoRes.json()
    const feature = geo?.features?.[0]
    if (!feature) return null
    ;[custLng, custLat] = feature.geometry.coordinates
  } catch {
    return null
  }
  try {
    const matrixRes = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      headers: { Authorization: orsKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [[lojaLng, lojaLat], [custLng, custLat]],
        sources: [0], destinations: [1], metrics: ['distance'],
      }),
      signal: AbortSignal.timeout(8000),
    })
    const matrix = await matrixRes.json()
    const metros = matrix?.distances?.[0]?.[0]
    if (typeof metros !== 'number') return null
    return { km: metros / 1000 }
  } catch {
    return null
  }
}

// Preço que a PLATAFORMA cobra da loja por uma corrida (debitado do crédito
// da carteira) — por bairro ou por distância percorrida (pickup = endereço
// da loja, dropoff = endereço do cliente), igual ao padrão que cada loja já
// usa pra cobrar o próprio cliente, mas configurado globalmente pelo admin.
// Nunca trava a criação da entrega por falha externa: sem geocodificação
// possível ou sem faixa configurada, cai pro valor padrão do admin.
export async function getEntregaFeeForDelivery(
  dropoffAddress: string,
  loja: { loja_lat: number | null; loja_lng: number | null }
): Promise<{ fee: number; blocked: boolean; reason?: string }> {
  const pricing = await getEntregaPricing()

  if (pricing.entrega_taxa_metodo === 'distancia') {
    if (loja.loja_lat == null || loja.loja_lng == null) {
      return { fee: pricing.entrega_taxa_padrao, blocked: false }
    }
    const trajeto = await geocodeAndMatrixPlataforma(loja.loja_lat, loja.loja_lng, dropoffAddress)
    if (!trajeto) return { fee: pricing.entrega_taxa_padrao, blocked: false }

    const { data: tiers } = await supabase
      .from('entrega_km_tiers').select('km_until, price, blocked').order('position', { ascending: true })
    if (!tiers?.length) return { fee: pricing.entrega_taxa_padrao, blocked: false }
    const tier = tiers.find(t => t.km_until == null || trajeto.km <= Number(t.km_until))
    if (!tier) return { fee: pricing.entrega_taxa_padrao, blocked: false }
    if (tier.blocked) return { fee: 0, blocked: true, reason: 'Fora da área de entrega da plataforma.' }
    return { fee: Number(tier.price), blocked: false }
  }

  // método "bairro" (padrão)
  const bairro = matchBairroInAddress(dropoffAddress)
  if (!bairro) return { fee: pricing.entrega_taxa_padrao, blocked: false }
  const { data: match } = await supabase.from('entrega_bairros').select('price, disabled').ilike('bairro', bairro).maybeSingle()
  if (!match) return { fee: pricing.entrega_taxa_padrao, blocked: false }
  if (match.disabled) return { fee: 0, blocked: true, reason: 'Fora da área de entrega da plataforma.' }
  return { fee: Number(match.price), blocked: false }
}
