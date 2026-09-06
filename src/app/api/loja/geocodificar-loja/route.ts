import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Geocodifica o endereço cadastrado da loja (uma vez só) e grava loja_lat/lng
// — é a partir daí que /api/loja/calcular-frete mede a distância até o
// cliente quando a empresa usa o método "por distância".
export async function POST(req: NextRequest) {
  try {
    const { access_token, company_id } = await req.json()
    if (!access_token || !company_id) {
      return NextResponse.json({ error: 'dados faltando' }, { status: 400 })
    }

    const { data: userData } = await supabaseAuth.auth.getUser(access_token)
    if (!userData?.user) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

    const { data: company } = await supabase.from('companies').select('owner_id, address').eq('id', company_id).maybeSingle()
    if (!company) return NextResponse.json({ error: 'empresa não encontrada' }, { status: 404 })
    if (company.owner_id !== userData.user.id) {
      const { data: profile } = await supabase.from('profiles').select('user_type').eq('id', userData.user.id).maybeSingle()
      if (profile?.user_type !== 'admin') {
        return NextResponse.json({ error: 'empresa não é sua' }, { status: 403 })
      }
    }
    if (!company.address?.trim()) {
      return NextResponse.json({ error: 'Cadastre o endereço completo da loja no Perfil antes de ativar esse método' }, { status: 400 })
    }

    const orsKey = process.env.ORS_API_KEY
    if (!orsKey) {
      return NextResponse.json({ error: 'Configuração pendente no servidor: variável ORS_API_KEY não encontrada. Peça pro time técnico configurar.' }, { status: 500 })
    }

    const query = `${company.address}, São Gonçalo - RJ, Brasil`
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(orsKey)}&text=${encodeURIComponent(query)}&boundary.country=BR&size=1`
    let geo: any
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      geo = await res.json()
    } catch {
      return NextResponse.json({ error: 'Não deu pra consultar o serviço de localização agora. Tenta de novo em instantes.' }, { status: 502 })
    }
    const feature = geo?.features?.[0]
    if (!feature) {
      return NextResponse.json({ error: 'Não conseguimos localizar esse endereço automaticamente. Confira o endereço cadastrado no Perfil.' }, { status: 400 })
    }
    const [lng, lat] = feature.geometry.coordinates

    await supabase.from('companies').update({ loja_lat: lat, loja_lng: lng }).eq('id', company_id)
    return NextResponse.json({ ok: true, lat, lng, label: feature.properties?.label || query })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'falha ao geocodificar' }, { status: 500 })
  }
}
