import { createClient } from '@supabase/supabase-js'
import { enfileirarWhatsApp, type ItemFila } from '@/lib/whatsappFila'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'
// Avaliação nova ganha 24h pro lojista responder sozinho antes do lembrete.
const ESPERA_MS = 24 * 3600_000
// No máximo 1 lembrete por loja a cada 7 dias enquanto houver pendência.
const INTERVALO_MS = 7 * 86400_000

function texto(nome: string, qtd: number) {
  const plural = qtd > 1
  return `⭐ Olá, ${nome.trim()}! Você tem ${qtd} ${plural ? 'avaliações' : 'avaliação'} sem resposta no Trindade Online.\n\n` +
    `Responder mostra pra quem visita o seu perfil que você cuida dos seus clientes. A resposta fica pública logo abaixo da avaliação, passa confiança pra quem está decidindo onde comprar e faz o cliente se sentir ouvido (e voltar).\n\n` +
    `Clique no link abaixo e responda o quanto antes:\n${SITE_URL}/painel?tab=avaliacoes`
}

export async function runAvaliacoesLembrete() {
  const agora = Date.now()
  const { data: revs, error } = await supabase.from('reviews')
    .select('id, company_id, created_at, response:review_responses(id)')
    .lt('created_at', new Date(agora - ESPERA_MS).toISOString())
  if (error) throw error

  const pendentes = new Map<string, number>()
  for (const r of revs || []) {
    const resp = r.response as unknown as { id: string }[] | { id: string } | null
    const respondida = Array.isArray(resp) ? resp.length > 0 : !!resp
    if (!respondida) pendentes.set(r.company_id, (pendentes.get(r.company_id) || 0) + 1)
  }
  if (pendentes.size === 0) return { lojas: 0, enfileiradas: 0 }

  const { data: companies } = await supabase.from('companies')
    .select('id, name, phone, owner_id, review_reminder_at')
    .in('id', [...pendentes.keys()]).eq('status', 'active')

  const fila: ItemFila[] = []
  const avisadas: string[] = []
  for (const c of companies || []) {
    if (c.review_reminder_at && agora - new Date(c.review_reminder_at).getTime() < INTERVALO_MS) continue
    let phone: string | null = null
    if (c.owner_id) {
      const { data: owner } = await supabase.from('profiles').select('phone').eq('id', c.owner_id).maybeSingle()
      phone = owner?.phone || null
    }
    phone = phone || c.phone
    if (!phone) continue
    fila.push({ phone, nome: c.name, texto: texto(c.name, pendentes.get(c.id)!) })
    avisadas.push(c.id)
  }
  if (!fila.length) return { lojas: pendentes.size, enfileiradas: 0 }

  await enfileirarWhatsApp(`Lembrete de avaliações sem resposta — ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, fila)
  await supabase.from('companies').update({ review_reminder_at: new Date().toISOString() }).in('id', avisadas)
  return { lojas: pendentes.size, enfileiradas: fila.length }
}
