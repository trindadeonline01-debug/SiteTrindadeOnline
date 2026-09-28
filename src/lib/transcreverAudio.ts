const OPENAI_TRANSCRICOES_URL = 'https://api.openai.com/v1/audio/transcriptions'

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
  if (!apiKey) return null
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
      return null
    }
    const json: any = await res.json()
    const texto = String(json?.text || '').trim()
    return texto || null
  } catch (err: any) {
    console.error('[transcreverAudioWhatsApp] falha:', err?.message || err)
    return null
  }
}
