import { loadToken } from './auth'

// Mesmo backend do site — essas rotas já existem e já são usadas pelo
// painel web em src/app/motoboy/painel/page.tsx. O app não duplica
// nenhuma regra de negócio, só chama a mesma API.
export const API_BASE = 'https://www.trindadeonline.com.br'

export type Motoboy = { id: string; name: string; phone: string; status: string }

async function request<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.auth) {
    const token = await loadToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Falha na requisição')
  return data as T
}

export function enviarCodigo(phone: string) {
  return request<{ ok: true }>('/api/motoboy/enviar-codigo', { body: { phone, purpose: 'login' } })
}

export function verificarCodigo(phone: string, code: string) {
  return request<{ ok: true; token: string; motoboy: Motoboy }>('/api/motoboy/verificar-codigo', {
    body: { phone, code, purpose: 'login' },
  })
}

export function loginSenha(phone: string, senha: string) {
  return request<{ ok: true; token: string; motoboy: Motoboy }>('/api/motoboy/login-senha', {
    body: { phone, senha },
  })
}

export type PainelData = {
  motoboy: { id: string; name: string; phone: string; pix_key: string | null; pix_key_type: string | null; status: string; available: boolean; has_password: boolean }
  entregasSemana: number; aReceber: number; jaRecebido: number
  periodAReceber: number; periodRecebido: number
  recentOrders: { id: string; company_name: string; customer_name: string; status: string; fee: number; created_at: string; pago: boolean; bairro: string | null; picked_up_at: string | null; delivered_at: string | null }[]
  payouts: { id: string; period_start: string; period_end: string; valor: number; status: string; paid_at: string | null }[]
}

export function getPainel(params?: { from?: string; to?: string }) {
  const qs = params?.from ? `?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to || '')}` : ''
  return request<PainelData>(`/api/motoboy/painel${qs}`, { auth: true })
}

export function setDisponibilidade(available: boolean) {
  return request<{ ok: true }>('/api/motoboy/painel', { auth: true, body: { action: 'disponibilidade', available } })
}

export function atualizarPix(pix_key: string, pix_key_type: string) {
  return request<{ ok: true }>('/api/motoboy/painel', { auth: true, body: { action: 'atualizar_pix', pix_key, pix_key_type } })
}

export function logout() {
  return request<{ ok: true }>('/api/motoboy/painel', { auth: true, body: { action: 'logout' } })
}

export type Oferta = { deliveryOrderId: string; company: string; bairro: string | null; valueLabel: string; expiresAt: string }
export type Corrida = { id: string; company: string; bairro: string | null; customerName: string; valueLabel: string; pickedUp: boolean; requestedAt: string; destinationAddress: string }

export function getCorridas() {
  return request<{ offer: Oferta | null; rides: Corrida[] }>('/api/motoboy/corridas', { auth: true })
}

export function aceitarOferta() {
  return request<{ ok: boolean; error?: string }>('/api/motoboy/corridas', { auth: true, body: { action: 'accept' } })
}

export function recusarOferta() {
  return request<{ ok: boolean; error?: string }>('/api/motoboy/corridas', { auth: true, body: { action: 'decline' } })
}

export function confirmarCodigo(orderId: string, code: string) {
  return request<{ ok: boolean; error?: string; phase?: 'retirada' | 'entrega' }>('/api/motoboy/corridas', {
    auth: true, body: { action: 'confirm_code', orderId, code },
  })
}

export function confirmarGrupo(items: { orderId: string; code: string }[]) {
  return request<{ results: { orderId: string; ok: boolean; error?: string; phase?: string }[] }>('/api/motoboy/corridas', {
    auth: true, body: { action: 'confirm_group', items },
  })
}
