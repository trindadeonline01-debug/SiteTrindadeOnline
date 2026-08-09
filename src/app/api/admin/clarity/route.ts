import { NextRequest, NextResponse } from 'next/server'

// Relatório da Microsoft Clarity — a API oficial de exportação de dados só
// aceita numOfDays 1, 2 ou 3, e tem limite de 10 chamadas/dia por projeto.
// Por isso o botão de carregar é manual no admin, não busca sozinho.
const CLARITY_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights'
const VALID_DIMENSIONS = ['Browser', 'Device', 'Country/Region', 'OS', 'Source', 'Medium', 'Campaign', 'Channel', 'URL']

export async function GET(req: NextRequest) {
  try {
    const token = process.env.CLARITY_API_TOKEN
    if (!token) return NextResponse.json({ error: 'CLARITY_API_TOKEN não configurado nas variáveis de ambiente' }, { status: 500 })

    const { searchParams } = new URL(req.url)
    let numOfDays = parseInt(searchParams.get('numOfDays') || '3', 10)
    if (!numOfDays || numOfDays < 1) numOfDays = 1
    if (numOfDays > 3) numOfDays = 3

    const dims = (searchParams.get('dims') || 'Device,Source')
      .split(',')
      .map(d => d.trim())
      .filter(d => VALID_DIMENSIONS.includes(d))
      .slice(0, 3)

    const url = new URL(CLARITY_URL)
    url.searchParams.set('numOfDays', String(numOfDays))
    dims.forEach((d, i) => url.searchParams.set(`dimension${i + 1}`, d))

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    })

    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json({ error: `Clarity respondeu ${res.status}: ${text.slice(0, 500)}` }, { status: res.status })
    }

    let data: any
    try { data = JSON.parse(text) } catch { data = text }

    return NextResponse.json({ ok: true, numOfDays, dims, data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
