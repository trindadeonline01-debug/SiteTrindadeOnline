import { NextResponse } from 'next/server'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://157.90.156.213:8080'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'trindade2024'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'trindade'

export async function GET() {
  try {
    const res = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
      headers: { 'apikey': EVOLUTION_KEY }
    })
    if (!res.ok) return NextResponse.json({ connected: false })
    const data = await res.json()
    const instances = Array.isArray(data) ? data : []
    const instance = instances.find((i: any) => i.name === EVOLUTION_INSTANCE || i.instance?.instanceName === EVOLUTION_INSTANCE)
    const connected = instance?.instance?.status === 'open' || instance?.connectionStatus === 'open'
    return NextResponse.json({ connected: !!connected })
  } catch {
    return NextResponse.json({ connected: false })
  }
}