import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from './requireAdmin'

// Pra rotas de manutenção pontual que o Claude precisa disparar direto (sem
// clicar em nada no admin) — aceita o mesmo CRON_SECRET já usado nos crons
// (só existe na Vercel, nunca no repo) como alternativa ao login de admin.
// Evita ter que criar um botão novo no painel pra cada faxina de uma vez só.
export async function requireAdminOrSecret(req: NextRequest): Promise<{ userId: string | null } | NextResponse> {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (token && process.env.CRON_SECRET && token === process.env.CRON_SECRET) {
    return { userId: null }
  }
  return requireAdmin(req)
}
