import { supabase } from '@/lib/supabase'

// Contraparte de requireAdmin — manda o token da sessão atual no header
// Authorization pra rota provar quem tá chamando de verdade.
export async function adminFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  return fetch(url, { ...options, headers })
}
