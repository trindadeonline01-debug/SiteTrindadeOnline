// Número da PLATAFORMA (21 98621-0551: motoboys, códigos de verificação, avisos ao admin, disparos).
// Por padrão continua na Evolution. Para trocar para o WAHA basta, na Vercel, WA_PLATFORM_PROVIDER=waha
// (sessão em WA_PLATFORM_SESSION, padrão "plataforma") — sem mexer em código; voltar = tirar a variável.
import { waSendText, waSendMedia, wahaSessao, type WaInstance } from '@/lib/wa'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''
export const EVOLUTION_INSTANCE_PLATAFORMA = process.env.EVOLUTION_INSTANCE || 'Trindade Online'

export const PLATAFORMA_WAHA = process.env.WA_PLATFORM_PROVIDER === 'waha'
export const PLATAFORMA_SESSAO = process.env.WA_PLATFORM_SESSION || 'plataforma'

export const plataformaWaha = (): WaInstance => ({ instance_name: PLATAFORMA_SESSAO, api_key: 'waha', provider: 'waha' })

const soDigitos = (p: string) => {
  const d = (p || '').replace(/\D/g, '')
  return d.startsWith('55') ? d : '55' + d
}

// Envia texto pelo número da plataforma, seja qual for o provedor ativo.
export async function plataformaTexto(phone: string, text: string): Promise<{ ok: boolean; detail?: string }> {
  if (PLATAFORMA_WAHA) {
    const r = await waSendText(plataformaWaha(), soDigitos(phone), text, { linkPreview: true })
    return { ok: r.ok, detail: r.detail }
  }
  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE_PLATAFORMA)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
      body: JSON.stringify({ number: soDigitos(phone), text }),
    })
    if (!res.ok) return { ok: false, detail: `Evolution respondeu ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}` }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, detail: `falha ao chamar a Evolution API: ${err?.message || err}` }
  }
}

export async function plataformaConectada(): Promise<boolean> {
  if (PLATAFORMA_WAHA) return (await wahaSessao(PLATAFORMA_SESSAO))?.status === 'WORKING'
  try {
    const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${encodeURIComponent(EVOLUTION_INSTANCE_PLATAFORMA)}`, { headers: { apikey: EVOLUTION_KEY } })
    if (!res.ok) return false
    return (await res.json())?.instance?.state === 'open'
  } catch { return false }
}

// Chamada "no formato da Evolution" (path + corpo) traduzida para o WAHA — usada pelos disparos em massa (blast),
// que falam o dialeto da Evolution. Devolve null se deu certo, ou o texto do erro.
export async function waComoEvolution(inst: WaInstance, path: string, body: any): Promise<string | null> {
  const phone = String(body?.number || '')
  let r
  if (path.endsWith('/sendText')) r = await waSendText(inst, phone, String(body.text || ''), { linkPreview: true })
  else if (path.endsWith('/sendMedia')) r = await waSendMedia(inst, phone, body.mediatype === 'video' ? 'video' : 'image', String(body.media), { caption: body.caption })
  else if (path.endsWith('/sendWhatsAppAudio')) r = await waSendMedia(inst, phone, 'audio', String(body.audio))
  else return `rota sem equivalente no WAHA: ${path}`
  return r.ok ? null : (r.detail || 'falha ao enviar')
}
