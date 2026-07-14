import { NextRequest, NextResponse } from 'next/server'

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID!
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY!

export async function POST(req: NextRequest) {
  try {
    const { title, body, target } = await req.json()
    if (!title || !body) return NextResponse.json({ error: 'title e body obrigatórios' }, { status: 400 })

    let filters: any[] = []
    if (target === 'user') {
      filters = [{ field: 'tag', key: 'user_type', relation: '=', value: 'user' }]
    } else if (target === 'company') {
      filters = [{ field: 'tag', key: 'user_type', relation: '=', value: 'company' }]
    }

    const payload: any = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title, pt: title },
      contents: { en: body, pt: body },
      chrome_web_icon: '/icon-192.png',
    }

    if (filters.length > 0) {
      payload.filters = filters
    } else {
      payload.included_segments = ['All']
    }

    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify(payload)
    })

    const data = await res.json()
    console.log('OneSignal response:', JSON.stringify(data))
    if (data.errors) return NextResponse.json({ error: data.errors }, { status: 500 })

    return NextResponse.json({ sent: data.recipients || 0, total: data.recipients || 0, id: data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}