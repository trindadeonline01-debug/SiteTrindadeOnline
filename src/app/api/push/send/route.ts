import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { title, body, target } = await req.json()
    if (!title || !body) return NextResponse.json({ error: 'title e body obrigatórios' }, { status: 400 })

    let query = supabase.from('push_tokens').select('token')
    if (target === 'user') query = query.eq('user_type', 'user')
    else if (target === 'company') query = query.eq('user_type', 'company')

    const { data: tokens } = await query
    if (!tokens || tokens.length === 0) return NextResponse.json({ sent: 0 })

    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging']
    })
    const accessToken = await auth.getAccessToken()

    let sent = 0
    for (const { token } of tokens) {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title, body },
                webpush: {
                  notification: { icon: '/icon-192.png', badge: '/icon-192.png' }
                }
              }
            })
          }
        )
        if (res.ok) sent++
        else {
          const err = await res.json()
          if (err.error?.details?.some((d: any) => d.errorCode === 'UNREGISTERED')) {
            await supabase.from('push_tokens').delete().eq('token', token)
          }
        }
      } catch {}
    }

    return NextResponse.json({ sent, total: tokens.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
