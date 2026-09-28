import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OPENAI_TRANSCRICOES_URL = 'https://api.openai.com/v1/audio/transcriptions'

// DEBUG temporário (set/2026): grava o motivo exato de qualquer falha na
// tabela crm_webhook_debug (já existe, reaproveitada) — sem isso não dava
// pra saber se falhava por chave errada, sem crédito, etc., já que essa
// função roda na Vercel e os console.error não ficam visíveis por aqui.
// Remover depois de confirmar que a transcrição está funcionando de verdade.
async function logDebug(motivo: string, detalhe: any) {
  try {
    await supabase.from('crm_webhook_debug').insert({ event: 'transcricao_audio', payload: { motivo, detalhe } })
  } catch {}
}

// Transcreve áudio de WhatsApp (voz, formato ogg/opus) pra texto — única
// exceção no projeto chamando um provedor de IA que não é a Anthropic, porque
// a API do Claude não recebe áudio como entrada, só texto/imagem (pedido do
// Ricardo, set/2026: atendente de IA ficava mudo quando o cliente mandava
// áudio). Usa a Whisper da OpenAI só por esse motivo, nada mais no projeto
// depende dela. Sem OPENAI_API_KEY configurada, ou qualquer falha na
// chamada, devolve null — quem chama já sabe cair de volta no "ainda não
// consigo ouvir áudio, pode escrever?" nesse caso.
export async function transcreverAudioWhatsApp(buffer: Buffer, mimetype: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) { await logDebug('sem_chave', { temChave: false }); return null }
  try {
    const ext = mimetype.includes('ogg') ? 'ogg' : mimetype.includes('mp4') || mimetype.includes('m4a') ? 'm4a' : 'ogg'
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimetype || 'audio/ogg' }), `audio.${ext}`)
    form.append('model', 'whisper-1')
    form.append('language', 'pt')
    const res = await fetch(OPENAI_TRANSCRICOES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[transcreverAudioWhatsApp] OpenAI respondeu ${res.status}: ${body.slice(0, 300)}`)
      await logDebug('openai_erro', { status: res.status, body: body.slice(0, 500), chaveComeca: apiKey.slice(0, 8) })
      return null
    }
    const json: any = await res.json()
    const texto = String(json?.text || '').trim()
    if (!texto) await logDebug('transcricao_vazia', { json })
    return texto || null
  } catch (err: any) {
    console.error('[transcreverAudioWhatsApp] falha:', err?.message || err)
    await logDebug('excecao', { erro: String(err?.message || err) })
    return null
  }
}
