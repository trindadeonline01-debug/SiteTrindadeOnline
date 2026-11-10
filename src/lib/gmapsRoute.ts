// Rota do Google Maps pela Routes API (nov/2026). O DirectionsService antigo
// ("legacy") não pode mais ser ativado em projetos novos do Google Cloud —
// chamar ele devolvia LegacyApiNotActivatedMapError e a tela "Ops! Algo deu
// errado" no mapa. Aqui usamos a biblioteca `routes` do Maps JavaScript API
// (Route.computeRoutes), que usa a Routes API — precisa estar ATIVADA no projeto
// da chave (console.cloud.google.com → APIs e serviços → Routes API).
type LatLng = { lat: number; lng: number }

export type RotaCalculada = { path: LatLng[]; fim: LatLng | null; minutos: number | null }

const num = (v: unknown): number => (typeof v === 'function' ? (v as () => number)() : (v as number))

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function calcularRota(google: any, origem: LatLng, destino: string | LatLng): Promise<RotaCalculada> {
  const lib = google.maps.importLibrary ? await google.maps.importLibrary('routes') : google.maps.routes
  const { routes } = await lib.Route.computeRoutes({
    origin: origem,
    destination: destino,
    travelMode: 'DRIVING',
    fields: ['path', 'durationMillis', 'legs'],
  })
  const r = routes?.[0]
  if (!r) throw new Error('sem rota')
  const path: LatLng[] = (r.path || []).map((p: any) => ({ lat: num(p.lat), lng: num(p.lng) }))
  const end = r.legs?.[r.legs.length - 1]?.endLocation
  return {
    path,
    fim: end ? { lat: num(end.lat), lng: num(end.lng) } : (path.length ? path[path.length - 1] : null),
    minutos: typeof r.durationMillis === 'number' ? Math.max(1, Math.round(r.durationMillis / 60000)) : null,
  }
}
