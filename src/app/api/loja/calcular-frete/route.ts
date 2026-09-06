import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeBairro } from '@/lib/bairrosSaoGoncalo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Rota pública (sem login — é chamada no checkout do cardápio assim que o
// CEP resolve). Nunca deixa o checkout travado por causa de uma falha
// externa: qualquer problema (geocodificação, ORS fora do ar, loja sem
// localização configurada) cai de volta pra taxa fixa antiga da empresa.
export async function POST(req: NextRequest) {
  try {
    const { company_id, bairro, cidade, uf, logradouro, numero } = await req.json()
    if (!company_id) return NextResponse.json({ error: 'company_id faltando' }, { status: 400 })

    const { data: company } = await supabase
      .from('companies')
      .select('id, loja_taxa_metodo, loja_taxa_entrega, loja_taxa_fora_area, loja_lat, loja_lng')
      .eq('id', company_id)
      .maybeSingle()
    if (!company) return NextResponse.json({ error: 'empresa não encontrada' }, { status: 404 })

    const flatFallback = Number(company.loja_taxa_entrega || 0)

    if (company.loja_taxa_metodo === 'distancia') {
      const result = await calcularPorDistancia(company, { bairro, cidade, uf, logradouro, numero }, flatFallback)
      return NextResponse.json(result)
    }

    // método "bairro" (padrão)
    if (!bairro) return NextResponse.json({ ok: true, method: 'bairro', blocked: false, fee: flatFallback })
    const { data: rows } = await supabase.from('company_delivery_bairros').select('bairro, price, disabled').eq('company_id', company_id)
    const alvo = normalizeBairro(bairro)
    const match = (rows || []).find(r => normalizeBairro(r.bairro) === alvo)

    if (match?.disabled) {
      return NextResponse.json({ ok: true, method: 'bairro', blocked: true, bairro: match.bairro, fee: 0, reason: 'Não entregamos nesse bairro no momento.' })
    }
    if (match?.price != null) {
      return NextResponse.json({ ok: true, method: 'bairro', blocked: false, bairro: match.bairro, fee: Number(match.price) })
    }
    const foraArea = company.loja_taxa_fora_area
    const fee = foraArea != null ? Number(foraArea) : flatFallback
    return NextResponse.json({ ok: true, method: 'bairro', blocked: false, bairro, fee })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao calcular frete' }, { status: 500 })
  }
}

async function calcularPorDistancia(
  company: { id: string; loja_lat: number | null; loja_lng: number | null },
  endereco: { bairro?: string; cidade?: string; uf?: string; logradouro?: string; numero?: string },
  flatFallback: number
) {
  if (company.loja_lat == null || company.loja_lng == null) {
    return { ok: true, method: 'distancia', blocked: false, fee: flatFallback, reason: 'loja sem localização configurada' }
  }
  const orsKey = process.env.ORS_API_KEY
  if (!orsKey) {
    return { ok: true, method: 'distancia', blocked: false, fee: flatFallback, reason: 'ORS não configurado' }
  }

  const partes = [
    endereco.logradouro && endereco.numero ? `${endereco.logradouro}, ${endereco.numero}` : endereco.logradouro,
    endereco.bairro, endereco.cidade && endereco.uf ? `${endereco.cidade} - ${endereco.uf}` : endereco.cidade,
  ].filter(Boolean)
  if (partes.length === 0) return { ok: true, method: 'distancia', blocked: false, fee: flatFallback, reason: 'endereço incompleto' }

  let custLat: number, custLng: number
  try {
    const geoUrl = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(orsKey)}&text=${encodeURIComponent(partes.join(', ') + ', Brasil')}&boundary.country=BR&size=1`
    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) })
    const geo = await geoRes.json()
    const feature = geo?.features?.[0]
    if (!feature) return { ok: true, method: 'distancia', blocked: false, fee: flatFallback, reason: 'endereço não localizado' }
    ;[custLng, custLat] = feature.geometry.coordinates
  } catch {
    return { ok: true, method: 'distancia', blocked: false, fee: flatFallback, reason: 'falha na geocodificação' }
  }

  let km: number
  try {
    const matrixRes = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      headers: { Authorization: orsKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [[company.loja_lng, company.loja_lat], [custLng, custLat]],
        sources: [0], destinations: [1], metrics: ['distance'],
      }),
      signal: AbortSignal.timeout(8000),
    })
    const matrix = await matrixRes.json()
    const metros = matrix?.distances?.[0]?.[0]
    if (typeof metros !== 'number') return { ok: true, method: 'distancia', blocked: false, fee: flatFallback, reason: 'falha ao calcular distância' }
    km = metros / 1000
  } catch {
    return { ok: true, method: 'distancia', blocked: false, fee: flatFallback, reason: 'falha ao calcular distância' }
  }

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
