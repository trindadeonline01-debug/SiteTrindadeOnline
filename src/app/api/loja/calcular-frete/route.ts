import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeBairro, BAIRROS_SAO_GONCALO } from '@/lib/bairrosSaoGoncalo'
import { moduleActive } from '@/lib/modules'
import { getEntregaFeeForDelivery } from '@/lib/entregaPricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Endereco = { bairro?: string; cidade?: string; uf?: string; logradouro?: string; numero?: string }
type CompanyRow = { id: string; loja_lat: number | null; loja_lng: number | null; loja_tempo_preparo_min: number | null }

// Monta o texto do endereço do jeito que o motor de preço da plataforma
// espera (uma string só) — mesma lógica de junção usada em geocodeAndMatrix
// abaixo, só que aqui fica disponível pro branch da taxa do admin também,
// que não passa pelo geocode (o método "bairro" da plataforma casa o nome
// do bairro direto no texto, sem precisar de coordenadas).
function buildEnderecoTexto(endereco: Endereco, enderecoLivre?: string): string {
  const partes = [
    endereco.logradouro && endereco.numero ? `${endereco.logradouro}, ${endereco.numero}` : endereco.logradouro,
    endereco.bairro, endereco.cidade && endereco.uf ? `${endereco.cidade} - ${endereco.uf}` : endereco.cidade,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(', ') : (enderecoLivre || '')
}

// Cliente logado tem o endereço pré-preenchido a partir do perfil (texto
// livre salvo antes, sem passar pelo CEP) — nesse caso não existe bairro
// estruturado nenhum, e a taxa caía sempre no fallback fixo (R$0 quando a
// loja não configura esse campo), mesmo com preço de bairro cadastrado
// (achado do Ricardo, set/2026: Crepe Cone com "Trindade" a R$3 configurado,
// mas pedido saindo com taxa R$0 porque o endereço veio pronto do perfil).
// Acha o nome de bairro mais específico (mais longo primeiro) dentro do
// texto livre do endereço, mesmo padrão já usado pro motoboy da plataforma.
function matchBairroInFreeText(address: string): string | null {
  const norm = normalizeBairro(address)
  const ordenados = [...BAIRROS_SAO_GONCALO].sort((a, b) => b.length - a.length)
  for (const bairro of ordenados) {
    if (norm.includes(normalizeBairro(bairro))) return bairro
  }
  return null
}

// Rota pública (sem login — é chamada no checkout do cardápio assim que o
// CEP resolve). Nunca deixa o checkout travado por causa de uma falha
// externa: qualquer problema (geocodificação, ORS fora do ar, loja sem
// localização configurada) cai de volta pra taxa fixa antiga da empresa —
// e o tempo estimado, quando não dá pra calcular o trajeto, cai pra só o
// tempo de preparo (pedido do Ricardo, set/2026).
export async function POST(req: NextRequest) {
  try {
    const { company_id, bairro: bairroRaw, cidade, uf, logradouro, numero, enderecoLivre } = await req.json()
    if (!company_id) return NextResponse.json({ error: 'company_id faltando' }, { status: 400 })

    const { data: company } = await supabase
      .from('companies')
      .select('id, loja_taxa_metodo, loja_taxa_entrega, loja_taxa_fora_area, loja_lat, loja_lng, loja_tempo_preparo_min, entrega_enabled, trial_modules_until')
      .eq('id', company_id)
      .maybeSingle()
    if (!company) return NextResponse.json({ error: 'empresa não encontrada' }, { status: 404 })

    const flatFallback = Number(company.loja_taxa_entrega || 0)
    // Sem bairro estruturado (endereço veio pronto do perfil, sem passar
    // pelo CEP), tenta achar um bairro conhecido dentro do texto livre antes
    // de desistir e cair no fallback fixo.
    const bairro = bairroRaw || (enderecoLivre ? matchBairroInFreeText(enderecoLivre) || undefined : undefined)
    const endereco: Endereco = { bairro, cidade, uf, logradouro, numero }

    // Trajeto real via OpenRouteService — calculado sempre, independente do
    // método de cobrança da taxa (bairro ou distância). No método distância
    // a mesma chamada já resolve o km pra taxa também, sem duplicar
    // requisição à API.
    const trajeto = await geocodeAndMatrix(company, endereco, enderecoLivre)
    const tempo = buildTempo(company.loja_tempo_preparo_min, trajeto?.durationMin ?? null)

    // Quem entrega é o motoboy da PLATAFORMA (módulo Entrega ativo) — quem
    // determina o preço que o cliente paga tem que ser o admin, não a loja:
    // é o admin quem organiza/banca essa entrega, a loja não tem como saber
    // (nem deveria decidir) quanto custa um motoboy que não é dela. Só cai
    // na taxa da própria loja (abaixo) quando ela usa motoboy próprio, ou
    // seja, quando esse módulo está desligado. Pedido do Ricardo, set/2026,
    // "urgente" — Roberta pediu entrega numa loja com Entrega ativo e saiu
    // cobrando R$0 porque a loja nunca configurou taxa própria, sem nem
    // olhar pra taxa do admin que já existe cadastrada.
    if (moduleActive(company.entrega_enabled, company.trial_modules_until)) {
      const enderecoTexto = buildEnderecoTexto(endereco, enderecoLivre)
      const { fee, blocked, reason } = await getEntregaFeeForDelivery(enderecoTexto, { loja_lat: company.loja_lat, loja_lng: company.loja_lng })
      return NextResponse.json({ ok: true, method: 'admin', blocked, fee, reason, tempo })
    }

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

async function geocodeAndMatrix(company: CompanyRow, endereco: Endereco, enderecoLivre?: string): Promise<{ km: number; durationMin: number } | null> {
  if (company.loja_lat == null || company.loja_lng == null) return null
  const orsKey = process.env.ORS_API_KEY
  if (!orsKey) return null

  const partes = [
    endereco.logradouro && endereco.numero ? `${endereco.logradouro}, ${endereco.numero}` : endereco.logradouro,
    endereco.bairro, endereco.cidade && endereco.uf ? `${endereco.cidade} - ${endereco.uf}` : endereco.cidade,
  ].filter(Boolean)
  // Sem nenhum campo estruturado (endereço veio pronto do perfil), usa o
  // texto livre direto como busca — melhor que desistir do trajeto.
  const textoBusca = partes.length > 0 ? partes.join(', ') : (enderecoLivre || '')
  if (!textoBusca) return null

  let custLat: number, custLng: number
  try {
    const geoUrl = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(orsKey)}&text=${encodeURIComponent(textoBusca + ', Brasil')}&boundary.country=BR&size=1`
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
