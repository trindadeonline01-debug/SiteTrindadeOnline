import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://taste-relocation-recording-decided.trycloudflare.com'
    const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'trindade2024'

    const res = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
      headers: { 'apikey': EVOLUTION_KEY },
      signal: AbortSignal.timeout(5000)
    })

    if (!res.ok) return NextResponse.json({ connected: false })
    const data = await res.json()
    const instances = Array.isArray(data) ? data : []
    const connected = instances.some((i: any) => i.connectionStatus === 'open')
    return NextResponse.json({ connected })
  } catch {
    // Se não conseguir acessar, assume conectado (monitorar pelo painel Evolution)
    return NextResponse.json({ connected: true, note: 'status assumido' })
  }
}
