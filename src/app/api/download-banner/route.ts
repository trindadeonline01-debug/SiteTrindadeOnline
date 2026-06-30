import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  const filename = req.nextUrl.searchParams.get('filename') || 'banner.png'
  if (!url) return NextResponse.json({ error: 'URL obrigatória' }, { status: 400 })

  try {
    const res = await fetch(url)
    const blob = await res.arrayBuffer()
    return new NextResponse(blob, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/png',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
