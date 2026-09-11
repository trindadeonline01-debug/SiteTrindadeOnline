import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeBairro } from '@/lib/bairrosSaoGoncalo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Endereco = { bairro?: string; cidade?: string; uf?: string; logradouro?: string; numero?: string }
type CompanyRow = { id: string; loja_lat: number | null; loja_lng: number | null; loja_tempo_preparo_min: number | null }

// Rota pública (sem login — é chamada no checkout do cardápio assim que o
// CEP resolve). Nunca deixa o checkout travado por causa de uma falha
// externa: qualquer problema (geocodificação, ORS fora do ar, loja sem
// localização configurada) cai de volta pra taxa fixa antiga da empresa —
// e o tempo estimado, quando não dá pra calcular o trajeto, cai pra só o
// tempo de preparo (pedido do Ricardo, set/2026).
export async function POST(req: NextRequest) {
  try {
    const { company_id, bairro, cidade, uf, logradouro, numero } = await req.json()
    if (!company_id) return NextResponse.json({ error: 'company_id faltando' }, { status: 400 })

    const { data: company } = await supabase
      .from('companies')
      .select('id, loja_taxa_metodo, loja_taxa_entrega, loja_taxa_fora_area, loja_lat, loja_lng, loja_tempo_preparo_min')
      .eq('id', company_id)
      .maybeSingle()
    if (!company) return NextResponse.json({ error: 'empresa não encontrada' }, { status: 404 })

    const flatFallback = Number(company.loja_taxa_entrega || 0)
    const endereco: Endereco = { bairro, cidade, uf, logradouro, numero }

    // Trajeto real via OpenRouteService — calculado sempre, independente do
    // método de cobrança da taxa (bairro ou distância). No método distância
    // a mesma chamada já resolve o km pra taxa também, sem duplicar
    // requisição à API.
    const trajeto = await geocodeAndMatrix(company, endereco)
    const tempo = buildTempo(company.loja_tempo_preparo_min, trajeto?.durationMin ?? null)

    if (company.loja_taxa_metodo === 'distancia') {
      const result = await calcularPorDistancia(company, flatFallback, trajeto)
      return NextResponse.json({ ...result, tempo })
    }

    // método "bairro" (padrão)
    if (!bairro) return NextResponse.json({ ok: true, method: 'bairro', blocked: false, fee: flatFallback, tempo })
    const { data: rows } = await supabase.from('company_delivery_bairros').select('bairro, price, disabled').eq('company_id', company_id)
    const alvo = normalizeBairro(bairro)
    const match = (rows || []).find(r => normalizeBairro(r.bairro) === alvo)

    if (match?.disabled) {
      return NextResponse.json({ ok: true, method: 'bairro', blocked: true, bairro: match.bairro, fee: 0, reason: 'Não entregamos nesse bairro no momento.', tempo })
    }
    if (match?.price != null) {
      return NextResponse.json({ ok: true, method: 'bairro', blocked: false, bairro: match.bairro, fee: Number(match.price), tempo })
    }
    const foraArea = company.loja_taxa_fora_area
    const fee = foraArea != null ? Number(foraArea) : flatFallback
    return NextResponse.json({ ok: true, method: 'bairro', blocked: false, bairro, fee, tempo })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao calcular frete' }, { status: 500 })
  }
}

// Tempo de preparo (configurado pela loja) + tempo de trajeto (calculado,
// quando disponível) = faixa mostrada pro cliente. Sem trajeto calculável,
// mostra só o tempo de preparo — nunca trava nem inventa deslocamento.
function buildTempo(prepMinRaw: number | null, travelMin: number | null) {
  const prepMin = prepMinRaw || 20
  if (travelMin == null) return { prepMin, travelMin: null, min: prepMin, max: prepMin + 15 }
  const total = prepMin + travelMin
  return { prepMin, travelMin, min: Math.max(5, total - 10), max: total + 10 }
}

async function geocodeAndMatrix(company: CompanyRow, endereco: Endereco): Promise<{ km: number; durationMin: number } | null> {
  if (company.loja_lat == null || company.loja_lng == null) return null
  const orsKey = process.env.ORS_API_KEY
  if (!orsKey) return null

  const partes = [
    endereco.logradouro && endereco.numero ? `${endereco.logradouro}, ${endereco.numero}` : endereco.logradouro,
    endereco.bairro, endereco.cidade && endereco.uf ? `${endereco.cidade} - ${endereco.uf}` : endereco.cidade,
  ].filter(Boolean)
  if (partes.length === 0) return null

  let custLat: number, custLng: number
  try {
    const geoUrl = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(orsKey)}&text=${encodeURIComponent(partes.join(', ') + ', Brasil')}&boundary.country=BR&size=1`
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
        locations: [[company.loja_lng, company.loja_lat], [custLng, custLat]],
        sources: [0], destinations: [1], metrics: ['distance', 'duration'],
      }),
      signal: AbortSignal.timeout(8000),
    })
    const matrix = await matrixRes.json()
    const metros = matrix?.distances?.[0]?.[0]
    const segundos = matrix?.durations?.[0]?.[0]
    if (typeof metros !== 'number' || typeof segundos !== 'number') return null
    return { km: metros / 1000, durationMin: Math.round(segundos / 60) }
  } catch {
    return null
  }
}

async function calcularPorDistancia(
  company: { id: string },
  flatFallback: number,
  trajeto: { km: number; durationMin: number } | null,
) {
  if (!trajeto) return { ok: true, method: 'distancia', blocked: false, fee: flatFallback, reason: 'não deu pra calcular o trajeto' }
  const km = trajeto.km

  const { data: tiers } = await supabase
    .from('company_delivery_km_tiers')
    .select('km_until, price, blocked')
    .eq('company_id', company.id)
    .order('position', { ascending: true })

  if (!tiers?.length) return { ok: true, method: 'distancia', blocked: false, fee: flatFallback, km: round1(km), reason: 'sem faixas configuradas' }

  const tier = tiers.find(t => t.km_until == null || km <= Number(t.km_until))
  if (!tier) return { ok: true, method: 'distancia', blocked: false, fee: flatFallback, km: round1(km) }
  if (tier.blocked) return { ok: true, method: 'distancia', blocked: true, km: round1(km), fee: 0, reason: 'Fora da nossa área de entrega.' }
  const fee = tier.price != null ? Number(tier.price) : flatFallback
  return { ok: true, method: 'distancia', blocked: false, fee, km: round1(km) }
}

function round1(n: number) { return Math.round(n * 10) / 10 }
