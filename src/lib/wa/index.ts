// Camada única de WhatsApp por instância (nov/2026). Cada linha de crm_whatsapp_instances tem um
// `provider`: 'evolution' (padrão, comportamento antigo) ou 'waha'. Ver docs/DESENHO_WAHA.md.
// Aqui ficam só as operações que as rotas usam; o texto simples (aviso, IA, oferta) passa por waSendText.

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evo.trindadeonline.com.br'
const WAHA_URL = (process.env.WAHA_URL || '').replace(/\/+$/, '')
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''

export type WaInstance = { instance_name: string; api_key: string; provider?: string | null }
export type WaResult = { ok: boolean; id?: string | null; detail?: string; status?: number }

export const isWaha = (inst: { provider?: string | null }) => inst.provider === 'waha'

// WhatsApp identifica a mensagem por um id curto (3EB0…); o WAHA usa um id composto
// "true_5521…@c.us_3EB0…". Guardamos SEMPRE o curto e remontamos o composto quando precisa.
export const shortId = (id: any): string | null => {
  const s = typeof id === 'string' ? id : id?._serialized || id?.id || ''
  return s ? String(s).split('_').pop() || null : null
}
export const composedId = (fromMe: boolean, phone: string, short: string) => `${fromMe}_${phone}@c.us_${short}`

export async function waha(path: string, init?: RequestInit & { json?: unknown }) {
  const { json, ...rest } = init || {}
  return fetch(`${WAHA_URL}${path}`, {
    ...rest,
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    headers: { 'X-Api-Key': WAHA_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json', ...(rest.headers || {}) },
    signal: AbortSignal.timeout(25000),
  })
}

async function lerErro(res: Response, quem: string): Promise<WaResult> {
  const body = await res.text().catch(() => '')
  return { ok: false, status: res.status, detail: `${quem} respondeu ${res.status}: ${body.slice(0, 300)}` }
}

export const chatIdDe = (phone: string) => `${phone.replace(/\D/g, '')}@c.us`

export async function waSendText(inst: WaInstance, phone: string, text: string, opts?: { linkPreview?: boolean; replyToShortId?: string | null; replyFromMe?: boolean }): Promise<WaResult> {
  try {
    if (isWaha(inst)) {
      const res = await waha('/api/sendText', { method: 'POST', json: {
        session: inst.instance_name, chatId: chatIdDe(phone), text, linkPreview: opts?.linkPreview ?? true,
        ...(opts?.replyToShortId ? { reply_to: composedId(!!opts.replyFromMe, phone.replace(/\D/g, ''), opts.replyToShortId) } : {}),
      } })
      if (!res.ok) return lerErro(res, 'WAHA')
      const d = await res.json().catch(() => null)
      return { ok: true, id: shortId(d?.id ?? d?.key?.id) }
    }
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(inst.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
      body: JSON.stringify({
        number: phone, text, ...(opts?.linkPreview ? { linkPreview: true } : {}),
        ...(opts?.replyToShortId ? { quoted: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: !!opts.replyFromMe, id: opts.replyToShortId } } } : {}),
      }),
    })
    if (!res.ok) return lerErro(res, 'Evolution')
    const d = await res.json().catch(() => null)
    return { ok: true, id: d?.key?.id || null }
  } catch (err: any) {
    return { ok: false, detail: `falha ao chamar o WhatsApp: ${err?.message || err}` }
  }
}

export async function waSendMedia(inst: WaInstance, phone: string, kind: 'image' | 'video' | 'document' | 'audio', url: string, o?: { caption?: string; fileName?: string; replyToShortId?: string | null; replyFromMe?: boolean }): Promise<WaResult> {
  try {
    if (isWaha(inst)) {
      let mimetype = 'application/octet-stream'
      try { mimetype = (await fetch(url, { method: 'HEAD' })).headers.get('content-type') || mimetype } catch {}
      const rota = kind === 'image' ? '/api/sendImage' : kind === 'video' ? '/api/sendVideo' : kind === 'audio' ? '/api/sendVoice' : '/api/sendFile'
      const res = await waha(rota, { method: 'POST', json: {
        session: inst.instance_name, chatId: chatIdDe(phone),
        file: { mimetype, url, ...(o?.fileName ? { filename: o.fileName } : {}) },
        ...(kind !== 'audio' && o?.caption ? { caption: o.caption } : {}),
        ...(kind === 'audio' ? { convert: true } : {}),
        ...(o?.replyToShortId ? { reply_to: composedId(!!o.replyFromMe, phone.replace(/\D/g, ''), o.replyToShortId) } : {}),
      } })
      if (!res.ok) return lerErro(res, 'WAHA')
      const d = await res.json().catch(() => null)
      return { ok: true, id: shortId(d?.id ?? d?.key?.id) }
    }
    const quoted = o?.replyToShortId ? { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: !!o.replyFromMe, id: o.replyToShortId } } : undefined
    const res = kind === 'audio'
      ? await fetch(`${EVOLUTION_URL}/message/sendWhatsAppAudio/${encodeURIComponent(inst.instance_name)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key }, body: JSON.stringify({ number: phone, audio: url, quoted }) })
      : await fetch(`${EVOLUTION_URL}/message/sendMedia/${encodeURIComponent(inst.instance_name)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
          body: JSON.stringify({ number: phone, mediatype: kind, media: url, caption: o?.caption || undefined, fileName: kind === 'document' ? (o?.fileName || undefined) : undefined, quoted }) })
    if (!res.ok) return lerErro(res, 'Evolution')
    const d = await res.json().catch(() => null)
    return { ok: true, id: d?.key?.id || null }
  } catch (err: any) {
    return { ok: false, detail: `falha ao chamar o WhatsApp: ${err?.message || err}` }
  }
}

export async function waSendLocation(inst: WaInstance, phone: string, loc: { lat: number; lng: number; name?: string; address?: string }): Promise<WaResult> {
  try {
    if (isWaha(inst)) {
      const res = await waha('/api/sendLocation', { method: 'POST', json: { session: inst.instance_name, chatId: chatIdDe(phone), latitude: loc.lat, longitude: loc.lng, title: loc.name || loc.address || '' } })
      if (!res.ok) return lerErro(res, 'WAHA')
      const d = await res.json().catch(() => null)
      return { ok: true, id: shortId(d?.id ?? d?.key?.id) }
    }
    const res = await fetch(`${EVOLUTION_URL}/message/sendLocation/${encodeURIComponent(inst.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
      body: JSON.stringify({ number: phone, latitude: loc.lat, longitude: loc.lng, name: loc.name || undefined, address: loc.address || undefined }) })
    if (!res.ok) return lerErro(res, 'Evolution')
    const d = await res.json().catch(() => null)
    return { ok: true, id: d?.key?.id || null }
  } catch (err: any) {
    return { ok: false, detail: `falha ao chamar o WhatsApp: ${err?.message || err}` }
  }
}

export async function waSendContact(inst: WaInstance, phone: string, c: { name: string; phone: string }): Promise<WaResult> {
  try {
    const wuid = c.phone.replace(/\D/g, '').startsWith('55') ? c.phone.replace(/\D/g, '') : '55' + c.phone.replace(/\D/g, '')
    if (isWaha(inst)) {
      const res = await waha('/api/sendContactVcard', { method: 'POST', json: { session: inst.instance_name, chatId: chatIdDe(phone), contacts: [{ fullName: c.name, phoneNumber: `+${wuid}`, whatsappId: wuid }] } })
      if (!res.ok) return lerErro(res, 'WAHA')
      const d = await res.json().catch(() => null)
      return { ok: true, id: shortId(d?.id ?? d?.key?.id) }
    }
    const res = await fetch(`${EVOLUTION_URL}/message/sendContact/${encodeURIComponent(inst.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
      body: JSON.stringify({ number: phone, contact: [{ fullName: c.name, wuid, phoneNumber: c.phone }] }) })
    if (!res.ok) return lerErro(res, 'Evolution')
    const d = await res.json().catch(() => null)
    return { ok: true, id: d?.key?.id || null }
  } catch (err: any) {
    return { ok: false, detail: `falha ao chamar o WhatsApp: ${err?.message || err}` }
  }
}

export async function waReact(inst: WaInstance, phone: string, msg: { shortId: string; fromMe: boolean }, emoji: string): Promise<WaResult> {
  try {
    if (isWaha(inst)) {
      const res = await waha('/api/reaction', { method: 'PUT', json: { session: inst.instance_name, messageId: composedId(msg.fromMe, phone, msg.shortId), reaction: emoji } })
      return res.ok ? { ok: true } : lerErro(res, 'WAHA')
    }
    const res = await fetch(`${EVOLUTION_URL}/message/sendReaction/${encodeURIComponent(inst.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
      body: JSON.stringify({ key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: msg.fromMe, id: msg.shortId }, reaction: emoji }) })
    return res.ok ? { ok: true } : lerErro(res, 'Evolution')
  } catch (err: any) {
    return { ok: false, detail: String(err?.message || err) }
  }
}

export async function waDelete(inst: WaInstance, phone: string, shortIdValue: string): Promise<WaResult> {
  try {
    if (isWaha(inst)) {
      const res = await waha(`/api/${encodeURIComponent(inst.instance_name)}/chats/${encodeURIComponent(chatIdDe(phone))}/messages/${encodeURIComponent(composedId(true, phone, shortIdValue))}`, { method: 'DELETE' })
      return res.ok ? { ok: true } : lerErro(res, 'WAHA')
    }
    const res = await fetch(`${EVOLUTION_URL}/chat/deleteMessageForEveryone/${encodeURIComponent(inst.instance_name)}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
      body: JSON.stringify({ id: shortIdValue, remoteJid: `${phone}@s.whatsapp.net`, fromMe: true }) })
    return res.ok ? { ok: true } : lerErro(res, 'Evolution')
  } catch (err: any) {
    return { ok: false, detail: String(err?.message || err) }
  }
}

export async function waEdit(inst: WaInstance, phone: string, shortIdValue: string, text: string): Promise<WaResult> {
  try {
    if (isWaha(inst)) {
      const res = await waha(`/api/${encodeURIComponent(inst.instance_name)}/chats/${encodeURIComponent(chatIdDe(phone))}/messages/${encodeURIComponent(composedId(true, phone, shortIdValue))}`, { method: 'PUT', json: { text } })
      return res.ok ? { ok: true } : lerErro(res, 'WAHA')
    }
    const res = await fetch(`${EVOLUTION_URL}/chat/updateMessage/${encodeURIComponent(inst.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
      body: JSON.stringify({ number: phone, text, key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: true, id: shortIdValue } }) })
    return res.ok ? { ok: true } : lerErro(res, 'Evolution')
  } catch (err: any) {
    return { ok: false, detail: String(err?.message || err) }
  }
}

export async function waMarkRead(inst: WaInstance, phone: string, shortIds: string[]): Promise<void> {
  try {
    if (isWaha(inst)) {
      await waha('/api/sendSeen', { method: 'POST', json: { session: inst.instance_name, chatId: chatIdDe(phone), messageIds: shortIds.map(i => composedId(false, phone, i)) } })
      return
    }
    await fetch(`${EVOLUTION_URL}/chat/markMessageAsRead/${encodeURIComponent(inst.instance_name)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
      body: JSON.stringify({ readMessages: shortIds.map(id => ({ remoteJid: `${phone}@s.whatsapp.net`, id, fromMe: false })) }) })
  } catch {}
}

export async function waProfilePicture(inst: WaInstance, phone: string): Promise<string | null> {
  try {
    if (isWaha(inst)) {
      const res = await waha(`/api/contacts/profile-picture?contactId=${encodeURIComponent(chatIdDe(phone))}&session=${encodeURIComponent(inst.instance_name)}`)
      const d = await res.json().catch(() => null)
      return d?.profilePictureURL || d?.profilePictureUrl || null
    }
    const res = await fetch(`${EVOLUTION_URL}/chat/fetchProfilePictureUrl/${encodeURIComponent(inst.instance_name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: inst.api_key }, body: JSON.stringify({ number: phone }) })
    const d = await res.json().catch(() => null)
    return d?.profilePictureUrl || d?.picture || null
  } catch { return null }
}

// ---- sessão (só WAHA) ----

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.trindadeonline.com.br'

export async function wahaCriarSessao(nome: string): Promise<{ ok: boolean; detail?: string }> {
  const hmac = process.env.WAHA_HMAC_KEY || ''
  const res = await waha('/api/sessions', { method: 'POST', json: {
    name: nome, start: true,
    config: {
      webhooks: [{
        url: `${SITE}/api/wa/crm-webhook`,
        events: ['message.any', 'message.ack', 'message.reaction', 'session.status'],
        hmac: { key: hmac },
        retries: { policy: 'exponential', delaySeconds: 2, attempts: 5 },
      }],
      ignore: { status: true, groups: true, channels: true },
    },
  } })
  if (!res.ok) return { ok: false, detail: `WAHA ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}` }
  return { ok: true }
}

export async function wahaSessao(nome: string): Promise<{ status: string; phone: string | null } | null> {
  try {
    const res = await waha(`/api/sessions/${encodeURIComponent(nome)}`)
    if (!res.ok) return null
    const d = await res.json()
    const me: string | undefined = d?.me?.id
    return { status: String(d?.status || ''), phone: me ? me.split('@')[0].split(':')[0] : null }
  } catch { return null }
}

export async function wahaQr(nome: string): Promise<string | null> {
  try {
    const res = await waha(`/api/${encodeURIComponent(nome)}/auth/qr`)
    if (!res.ok) return null
    const d = await res.json()
    return d?.data ? `data:${d?.mimetype || 'image/png'};base64,${d.data}` : null
  } catch { return null }
}

export async function wahaApagarSessao(nome: string) {
  try {
    await waha(`/api/sessions/${encodeURIComponent(nome)}/logout`, { method: 'POST' })
    await waha(`/api/sessions/${encodeURIComponent(nome)}`, { method: 'DELETE' })
  } catch {}
}

// `from` do WAHA pode vir como @lid; devolve o telefone só com dígitos.
const lidCache = new Map<string, string>()
export async function wahaTelefone(session: string, jid: string): Promise<string | null> {
  const [id, dominio] = jid.split('@')
  if (dominio === 'c.us' || dominio === 's.whatsapp.net') return id.replace(/\D/g, '') || null
  if (dominio !== 'lid') return null
  const k = `${session}:${id}`
  const c = lidCache.get(k)
  if (c) return c
  try {
    const res = await waha(`/api/${encodeURIComponent(session)}/lids/${encodeURIComponent(id)}`)
    if (!res.ok) return null
    const pn: string | undefined = (await res.json())?.pn
    const tel = pn ? pn.split('@')[0].replace(/\D/g, '') : ''
    if (tel) { lidCache.set(k, tel); return tel }
  } catch {}
  return null
}

// Baixa a mídia de uma mensagem recebida (url do webhook, ou pede de novo ao WAHA mandando baixar).
export async function wahaBaixarMidia(session: string, chatJid: string, msgComposedId: string, url?: string | null): Promise<{ buf: Buffer; mimetype: string } | null> {
  try {
    let u = url || null
    if (!u) {
      const r = await waha(`/api/${encodeURIComponent(session)}/chats/${encodeURIComponent(chatJid)}/messages/${encodeURIComponent(msgComposedId)}?downloadMedia=true`)
      if (r.ok) u = (await r.json())?.media?.url || null
    }
    if (!u) return null
    const caminho = u.includes('/api/files/') ? u.slice(u.indexOf('/api/files/')) : null
    if (!caminho) return null
    const r = await waha(caminho, { headers: { Accept: '*/*' } })
    if (!r.ok) return null
    return { buf: Buffer.from(await r.arrayBuffer()), mimetype: (r.headers.get('content-type') || '').split(';')[0] }
  } catch { return null }
}
