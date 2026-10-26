import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyMpState } from '@/lib/mpOauthState'
import { syncPixMpEnabled } from '@/lib/mpSync'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'

// Volta do Mercado Pago depois do lojista autorizar — troca o `code` pelo
// access_token/refresh_token DELE (nunca o nosso), guarda isolado em
// company_mp_accounts e manda de volta pro painel.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const erroMp = searchParams.get('error')

  function voltar(status: 'ok' | 'erro', msg?: string) {
    const url = new URL('/painel/pagamentos', SITE_URL)
    url.searchParams.set('mp', status)
    if (msg) url.searchParams.set('mp_msg', msg)
    return NextResponse.redirect(url)
  }

  if (erroMp) return voltar('erro', 'Autorização cancelada no Mercado Pago')
  if (!code || !state) return voltar('erro', 'Resposta incompleta do Mercado Pago')

  const verified = verifyMpState(state)
  if (!verified) return voltar('erro', 'Link de autorização expirado — tenta conectar de novo')

  const clientId = process.env.MERCADO_PAGO_CLIENT_ID
  const clientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET
  if (!clientId || !clientSecret) return voltar('erro', 'Mercado Pago Connect não configurado no servidor')

  try {
    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${SITE_URL}/api/painel/mp/callback`,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[painel/mp/callback] token exchange falhou', tokenData)
      return voltar('erro', 'Mercado Pago recusou a autorização')
    }

    // Email do vendedor é só pra mostrar no painel (ex: "conectado como
    // fulano@gmail.com") — falha aqui não derruba a conexão em si.
    let email: string | null = null
    try {
      const meRes = await fetch('https://api.mercadopago.com/users/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      const me = await meRes.json()
      email = me?.email || null
    } catch {}

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null

    const { error: upsertError } = await supabase.from('company_mp_accounts').upsert({
      company_id: verified.companyId,
      mp_user_id: String(tokenData.user_id),
      mp_access_token: tokenData.access_token,
      mp_refresh_token: tokenData.refresh_token,
      mp_public_key: tokenData.public_key || null,
      mp_token_expires_at: expiresAt,
      mp_email: email,
      status: 'connected',
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })

    if (upsertError) {
      console.error('[painel/mp/callback] upsert falhou', upsertError)
      return voltar('erro', 'Conectou no Mercado Pago mas falhou ao salvar — tenta de novo')
    }

    await syncPixMpEnabled(verified.companyId)
    return voltar('ok')
  } catch (err: any) {
    console.error('[painel/mp/callback]', err)
    return voltar('erro', 'Erro interno ao conectar')
  }
}
