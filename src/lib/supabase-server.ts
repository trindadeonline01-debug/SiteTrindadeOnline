import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Cliente Supabase pra usar em Server Components / rotas que rodam no
// servidor — lê a sessão do cookie pra já buscar dado com o RLS certo
// (ex: já sabe se é admin) antes de mandar qualquer HTML pro navegador.
// Só consegue LER cookie (não setar) porque isso só é permitido de dentro
// de uma Server Action ou Route Handler — em Server Component o set() é
// ignorado de propósito, sem quebrar a renderização
export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {
          // no-op: Server Component não pode setar cookie
        },
        remove() {
          // no-op: idem
        },
      },
    }
  )
}
