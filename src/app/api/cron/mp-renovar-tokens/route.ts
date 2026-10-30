import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyAdmin } from '@/lib/notifyAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// O token do Mercado Pago Connect vence em ~180 dias. Renovando com 30 dias
// de antecedência, uma falha pontual (MP fora do ar etc.) ainda tem ~30
// tentativas diárias antes de a loja ficar sem Pix.
const RENOVAR_COM_DIAS = 30

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const clientId = process.env.MERCADO_PAGO_CLIENT_ID
  const clientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Mercado Pago Connect não configurado' }, { status: 500 })
  }

  const limite = new Date(Date.now() + RENOVAR_COM_DIAS * 86400000).toISOString()
  const { data: contas, error } = await supabase
    .from('company_mp_accounts')
    .select('company_id, mp_refresh_token, mp_token_expires_at, companies(name)')
    .eq('status', 'connected')
    .or(`mp_token_expires_at.is.null,mp_token_expires_at.lt.${limite}`)
  if (error) {
    console.error('[mp-renovar-tokens] consulta falhou', error)
    return NextResponse.json({ error: 'falhou' }, { status: 500 })
  }

  const resultado = { renovadas: 0, falhas: 0 }
  for (const conta of contas || []) {
    const empresa = (conta.companies as { name?: string } | null)?.name || conta.company_id
    const venceEm = conta.mp_token_expires_at
      ? new Date(conta.mp_token_expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : null

    let motivo = 'sem refresh token salvo'
    if (conta.mp_refresh_token) {
      try {
        const res = await fetch('https://api.mercadopago.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: conta.mp_refresh_token,
          }),
        })
        const data = await res.json()
        if (res.ok && data.access_token && data.refresh_token) {
          // O refresh token é de uso único: o novo tem que ser salvo junto,
          // senão a próxima renovação falha.
          const novosDados = {
            mp_access_token: data.access_token,
            mp_refresh_token: data.refresh_token,
            mp_public_key: data.public_key || undefined,
            mp_token_expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          }
          let updError = null
          for (let tentativa = 0; tentativa < 3; tentativa++) {
            ;({ error: updError } = await supabase.from('company_mp_accounts').update(novosDados).eq('company_id', conta.company_id))
            if (!updError) break
            await new Promise(r => setTimeout(r, 1000))
          }
          if (!updError) { resultado.renovadas++; continue }
          console.error('[mp-renovar-tokens] renovou mas não salvou', conta.company_id, updError)
          motivo = 'renovou no Mercado Pago mas falhou ao salvar no banco'
        } else {
          console.error('[mp-renovar-tokens] MP recusou', conta.company_id, res.status, data?.error, data?.message)
          motivo = `Mercado Pago respondeu ${res.status}${data?.message ? ` — ${data.message}` : ''}`
        }
      } catch (err) {
        console.error('[mp-renovar-tokens] erro de rede', conta.company_id, err)
        motivo = 'erro de conexão com o Mercado Pago'
      }
    }

    // Nunca desconecta sozinho: o token atual continua valendo até vencer, e
    // amanhã o cron tenta de novo.
    resultado.falhas++
    await notifyAdmin({ type: 'mp_renovacao_falhou', empresa, venceEm, motivo })
  }

  return NextResponse.json({ ok: true, verificadas: contas?.length || 0, ...resultado })
}
