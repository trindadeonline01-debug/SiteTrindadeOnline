'use client'
import { useEffect, useRef, useState } from 'react'
import { PeriodSel, periodRange, periodLabel } from '@/lib/periodFilter'
import PeriodFilterBar from '@/components/admin/PeriodFilterBar'

const TOKEN_KEY = 'motoboy_session_token'

const STATUS_LABEL: Record<string, string> = {
  buscando_motoboy: 'Chamando motoboy', a_caminho: 'A caminho', entregue: 'Entregue', cancelada: 'Cancelada', sem_credito: 'Sem crédito',
}

interface Oferta { deliveryOrderId: string; company: string; bairro: string | null; valueLabel: string; expiresAt: string }
interface Corrida { id: string; company: string; bairro: string | null; customerName: string; valueLabel: string; pickedUp: boolean; requestedAt: string; destinationAddress: string }
function fmtTempo(s: number) { const m = Math.floor(s / 60); const sec = s % 60; return m + ':' + (sec < 10 ? '0' : '') + sec }
// Navegação embutida (out/2026) — mapa com rota + posição ao vivo direto no
// painel, em vez de abrir o app do Maps por cima (o que tirava o site de
// primeiro plano e parava o rastreio). Carrega o script do Google Maps só
// quando o motoboy abre a navegação de verdade, não no carregamento da
// página inteira — e só UMA vez por sessão (cache no módulo).
let gmapsLoadPromise: Promise<void> | null = null
function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('sem window'))
  if ((window as any).google?.maps) return Promise.resolve()
  if (gmapsLoadPromise) return gmapsLoadPromise
  gmapsLoadPromise = new Promise((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) { reject(new Error('sem chave')); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('falha ao carregar'))
    document.head.appendChild(script)
  })
  return gmapsLoadPromise
}
// Corrida de verdade resolve em minutos — passado de 2h parada "aguardando
// retirada"/"a caminho" é sinal de corrida esquecida, nunca finalizada de
// verdade (achado real do Ricardo, out/2026: 5 corridas de teste antigas
// apareceram juntas na lista, sem nenhuma pista de que eram velhas).
function isStaleRide(iso: string) { return Date.now() - new Date(iso).getTime() > 2 * 60 * 60 * 1000 }

function fmt(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }
function fmtDT(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
// Antes mostrava só "30/09/2026 · Entregue" — não dava pra saber ONDE nem
// A QUE HORAS retirou/entregou. Agora mostra o bairro e as duas horas
// quando existem (pedido do Ricardo, set/2026).
function orderSubtitle(o: { status: string; created_at: string; bairro: string | null; picked_up_at: string | null; delivered_at: string | null }) {
  const partes: string[] = []
  if (o.bairro) partes.push(o.bairro)
  if (o.picked_up_at && o.delivered_at) partes.push(`Retirou ${fmtDT(o.picked_up_at)} · Entregou ${fmtDT(o.delivered_at)}`)
  else if (o.picked_up_at) partes.push(`Retirou ${fmtDT(o.picked_up_at)} · ${STATUS_LABEL[o.status] || o.status}`)
  else partes.push(`${new Date(o.created_at).toLocaleDateString('pt-BR')} · ${STATUS_LABEL[o.status] || o.status}`)
  return partes.join(' · ')
}

interface PainelData {
  motoboy: { id: string; name: string; phone: string; pix_key: string | null; pix_key_type: string | null; status: string; available: boolean; has_password: boolean }
  entregasSemana: number; aReceber: number; jaRecebido: number
  periodAReceber: number; periodRecebido: number
  recentOrders: { id: string; company_name: string; customer_name: string; status: string; fee: number; created_at: string; pago: boolean; bairro: string | null; picked_up_at: string | null; delivered_at: string | null }[]
  payouts: { id: string; period_start: string; period_end: string; valor: number; status: string; paid_at: string | null }[]
}

export default function MotoboyPainelPage() {
  const [token, setToken] = useState<string | null>(null)
  const [data, setData] = useState<PainelData | null>(null)
  const [loadingData, setLoadingData] = useState(false)

  // login
  const [loginTab, setLoginTab] = useState<'wa' | 'pwd'>('wa')
  const [waStep, setWaStep] = useState<1 | 2>(1)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [senha, setSenha] = useState('')
  const [sending, setSending] = useState(false)
  const [erro, setErro] = useState('')

  // pix edit
  const [editPix, setEditPix] = useState(false)
  const [pixKey, setPixKey] = useState('')
  const [pixType, setPixType] = useState('celular')
  const [novaSenha, setNovaSenha] = useState('')
  const [editSenha, setEditSenha] = useState(false)
  const [msg, setMsg] = useState('')
  const [period, setPeriod] = useState<PeriodSel>({ kind: 'week' })
  const [notifPermission, setNotifPermission] = useState<string>('default')

  // Corridas ativas (out/2026) — mesma engine de despacho que já existia só
  // por WhatsApp (delivery_offers/delivery_orders), agora também na tela,
  // via polling (sem Supabase Realtime: motoboy não é usuário Supabase Auth,
  // então não dá pra assinar com RLS dele — ver KB).
  const [corridas, setCorridas] = useState<{ offer: Oferta | null; rides: Corrida[] } | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [corridasToast, setCorridasToast] = useState<string | null>(null)
  const [soloCodes, setSoloCodes] = useState<Record<string, string>>({})
  const [soloErrs, setSoloErrs] = useState<Record<string, string>>({})
  const [groupCodes, setGroupCodes] = useState<Record<string, string>>({})
  const [groupErrs, setGroupErrs] = useState<Record<string, string>>({})
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Navegação embutida (out/2026) — qual corrida está com o mapa aberto, e
  // as referências do Maps (mapa, marcador de posição, watch do GPS) que
  // precisam sobreviver entre renders sem recriar o mapa a cada poll de 4s.
  const [navegandoId, setNavegandoId] = useState<string | null>(null)
  const [navError, setNavError] = useState<string | null>(null)
  const mapDivRef = useRef<HTMLDivElement | null>(null)
  const markerRef = useRef<any>(null)
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
    if (saved) setToken(saved)
    if (typeof Notification !== 'undefined') setNotifPermission(Notification.permission)
  }, [])

  // AudioContext só pode nascer depois de um toque — guarda no primeiro
  // clique da sessão pra já estar liberado quando a oferta chegar de verdade.
  useEffect(() => {
    function unlock() {
      if (audioCtxRef.current) return
      try { audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)() } catch {}
    }
    document.addEventListener('pointerdown', unlock)
    return () => document.removeEventListener('pointerdown', unlock)
  }, [])

  async function loadCorridas(tok: string) {
    const res = await fetch('/api/motoboy/corridas', { headers: { Authorization: `Bearer ${tok}` } })
    if (res.status === 401) return
    const j = await res.json()
    setCorridas(j)
  }

  useEffect(() => {
    if (!token) return
    loadCorridas(token)
    const iv = setInterval(() => loadCorridas(token), 4000)
    return () => clearInterval(iv)
  }, [token])

  // Navegação embutida — mapa + rota + posição ao vivo, em vez de abrir o
  // app do Maps por cima (o que tirava o site de primeiro plano e parava o
  // rastreio, ver conversa out/2026). Calcula a rota UMA vez, no primeiro
  // sinal de GPS — depois só move o marcador a cada atualização, sem
  // recalcular rota a cada poucos metros (mantém o uso da API bem abaixo da
  // cota grátis). Desliga o GPS (clearWatch) assim que fecha o mapa ou troca
  // de corrida, pra não gastar bateria/dados à toa com o mapa fechado.
  useEffect(() => {
    if (!navegandoId) return
    const ride = corridas?.rides.find(r => r.id === navegandoId)
    if (!ride?.destinationAddress) { setNavError('Essa corrida não tem endereço de destino.'); return }
    let cancelled = false
    setNavError(null)
    loadGoogleMaps().then(() => {
      if (cancelled || !mapDivRef.current) return
      const google = (window as any).google
      const map = new google.maps.Map(mapDivRef.current, {
        zoom: 15, center: { lat: -22.826, lng: -43.053 }, disableDefaultUI: true, zoomControl: true, clickableIcons: false,
      })
      const directionsService = new google.maps.DirectionsService()
      const directionsRenderer = new google.maps.DirectionsRenderer({
        map, suppressMarkers: true, polylineOptions: { strokeColor: '#1A56B0', strokeWeight: 5 },
      })
      let routed = false

      if (!navigator.geolocation) { setNavError('Esse navegador não dá suporte a localização.'); return }
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => {
          if (cancelled) return
          const latLng = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          if (!markerRef.current) {
            markerRef.current = new google.maps.Marker({
              map, position: latLng, zIndex: 999,
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#0F8A57', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
            })
            map.setCenter(latLng)
          } else {
            markerRef.current.setPosition(latLng)
          }
          if (!routed) {
            routed = true
            directionsService.route(
              { origin: latLng, destination: ride.destinationAddress, travelMode: google.maps.TravelMode.DRIVING },
              (result: any, status: string) => { if (!cancelled && status === 'OK') directionsRenderer.setDirections(result) }
            )
          }
        },
        () => { if (!cancelled) setNavError('Não deu pra pegar sua localização — ativa o GPS e permite o acesso no navegador.') },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      )
    }).catch(() => { if (!cancelled) setNavError('Não deu pra carregar o mapa agora.') })

    return () => {
      cancelled = true
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navegandoId])

  // Contagem regressiva visual dos 2 minutos pra responder — reinicia só
  // quando a oferta muda de fato (não a cada poll).
  useEffect(() => {
    if (!corridas?.offer) { setSecondsLeft(0); return }
    const expiresAt = corridas.offer.expiresAt
    const tick = () => setSecondsLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [corridas?.offer?.deliveryOrderId, corridas?.offer?.expiresAt])

  // Bipe repetido enquanto tiver oferta esperando resposta — só funciona com
  // a aba aberta em primeiro plano (limite do navegador, não dá pra tocar
  // som com a tela bloqueada); por isso o push do OneSignal continua sendo
  // o aviso de backup pra quando o painel não está na tela.
  useEffect(() => {
    if (!corridas?.offer) return
    const ctx = audioCtxRef.current
    if (!ctx) return
    let stopped = false
    const beep = () => {
      if (stopped) return
      try {
        const osc = ctx.createOscillator(); const gain = ctx.createGain()
        osc.type = 'square'; osc.frequency.value = 880; gain.gain.value = 0.15
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(); osc.stop(ctx.currentTime + 0.18)
      } catch {}
    }
    beep()
    const iv = setInterval(beep, 900)
    return () => { stopped = true; clearInterval(iv) }
  }, [corridas?.offer?.deliveryOrderId])

  function flashToast(msg: string, ms = 2800) {
    setCorridasToast(msg)
    setTimeout(() => setCorridasToast(null), ms)
  }

  async function aceitarCorrida() {
    if (!token) return
    const res = await fetch('/api/motoboy/corridas', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'accept' }) })
    const j = await res.json()
    flashToast(j.ok ? '✓ Corrida aceita — já apareceu na sua lista' : (j.error || 'não foi possível aceitar'))
    loadCorridas(token)
  }

  async function recusarCorrida() {
    if (!token) return
    await fetch('/api/motoboy/corridas', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'decline' }) })
    flashToast('✕ Recusada — repassamos pro próximo motoboy')
    loadCorridas(token)
  }

  async function confirmarCodigoSolo(orderId: string) {
    if (!token) return
    const code = soloCodes[orderId] || ''
    const res = await fetch('/api/motoboy/corridas', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'confirm_code', orderId, code }) })
    const j = await res.json()
    if (j.ok) {
      setSoloErrs(s => ({ ...s, [orderId]: '' })); setSoloCodes(s => ({ ...s, [orderId]: '' }))
      flashToast(j.phase === 'entrega' ? '✅ Entrega finalizada — repasse liberado!' : '✓ Retirada confirmada — segue pro cliente')
      loadCorridas(token)
    } else {
      setSoloErrs(s => ({ ...s, [orderId]: j.error || 'não confere' }))
    }
  }

  async function confirmarGrupo(orderIds: string[]) {
    if (!token) return
    const items = orderIds.map(id => ({ orderId: id, code: groupCodes[id] || '' }))
    const res = await fetch('/api/motoboy/corridas', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'confirm_group', items }) })
    const j = await res.json()
    const results: { orderId: string; ok: boolean; error?: string }[] = j.results || []
    const newErrs: Record<string, string> = {}
    let confirmed = 0
    for (const r of results) { if (r.ok) confirmed++; else newErrs[r.orderId] = r.error || 'falta digitar' }
    setGroupErrs(e => ({ ...e, ...newErrs }))
    setGroupCodes(c => { const copy = { ...c }; results.filter(r => r.ok).forEach(r => { delete copy[r.orderId] }); return copy })
    const total = results.length
    if (confirmed > 0 && confirmed === total) flashToast(confirmed === 1 ? '✓ Retirada confirmada — virou corrida própria na lista' : `✓ ${confirmed} retiradas confirmadas — viraram ${confirmed} corridas separadas`, 3400)
    else if (confirmed > 0) flashToast(`✓ ${confirmed} de ${total} confirmadas — revê o(s) código(s) que ainda falta(m)`, 3400)
    loadCorridas(token)
  }

  // Busca de novo sempre que o token mudar (login) ou o filtro de período
  // mudar — pedido do Ricardo, set/2026: motoboy precisa ver o que tem a
  // receber/já recebeu dentro de um período escolhido, não só um total fixo.
  useEffect(() => {
    if (!token) return
    loadData(token, period)
  }, [token, period])

  async function loadData(tok: string, p: PeriodSel) {
    setLoadingData(true)
    const { from, to } = periodRange(p)
    const qs = new URLSearchParams()
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    const res = await fetch(`/api/motoboy/painel${qs.toString() ? `?${qs.toString()}` : ''}`, { headers: { Authorization: `Bearer ${tok}` } })
    if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); setToken(null); setLoadingData(false); return }
    const j = await res.json()
    setData(j)
    setPixKey(j.motoboy.pix_key || '')
    setPixType(j.motoboy.pix_key_type || 'celular')
    setLoadingData(false)
    // Motoboy não passa pelo login do Supabase Auth (é OTP/senha próprio),
    // então o OneSignalInit global nunca amarra o push a ele — tem que ser
    // feito aqui, na própria página, assim que a gente sabe o id dele.
    // `external_user_id` = motoboy.id é o que a rota de cron de repique
    // (motoboy-repique) usa pra mandar a notificação certa pro motoboy certo.
    if (j.motoboy?.id && typeof window !== 'undefined') {
      const tryLogin = () => { if ((window as any).OneSignalReact) (window as any).OneSignalReact.login(j.motoboy.id) }
      if ((window as any).OneSignalReact) tryLogin()
      else { const check = setInterval(() => { if ((window as any).OneSignalReact) { clearInterval(check); tryLogin() } }, 300) }
    }
  }

  async function ativarNotifCorrida() {
    if (typeof window === 'undefined' || !(window as any).OneSignalReact?.Notifications) return
    await (window as any).OneSignalReact.Notifications.requestPermission()
    setNotifPermission(Notification.permission)
  }

  async function enviarCodigo() {
    setErro('')
    if (!phone.trim()) { setErro('Digite seu WhatsApp.'); return }
    setSending(true)
    const res = await fetch('/api/motoboy/enviar-codigo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, purpose: 'login' }) })
    const j = await res.json()
    setSending(false)
    if (j.error) { setErro(j.error); return }
    setWaStep(2)
  }

  async function confirmarCodigo() {
    setErro('')
    setSending(true)
    const res = await fetch('/api/motoboy/verificar-codigo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code, purpose: 'login' }) })
    const j = await res.json()
    setSending(false)
    if (j.error) { setErro(j.error); return }
    localStorage.setItem(TOKEN_KEY, j.token)
    setToken(j.token)
  }

  async function loginComSenha() {
    setErro('')
    if (!phone.trim() || !senha.trim()) { setErro('Preenche WhatsApp e senha.'); return }
    setSending(true)
    const res = await fetch('/api/motoboy/login-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, senha }) })
    const j = await res.json()
    setSending(false)
    if (j.error) { setErro(j.error); return }
    localStorage.setItem(TOKEN_KEY, j.token)
    setToken(j.token)
  }

  async function sair() {
    if (token) await fetch('/api/motoboy/painel', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'logout' }) })
    localStorage.removeItem(TOKEN_KEY)
    setToken(null); setData(null)
  }

  async function toggleDisponivel() {
    if (!token || !data) return
    const novo = !data.motoboy.available
    setData({ ...data, motoboy: { ...data.motoboy, available: novo } })
    await fetch('/api/motoboy/painel', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'disponibilidade', available: novo }) })
  }

  async function salvarPix() {
    if (!token) return
    setMsg('')
    const res = await fetch('/api/motoboy/painel', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'atualizar_pix', pix_key: pixKey, pix_key_type: pixType }) })
    const j = await res.json()
    if (j.error) { setMsg(j.error); return }
    setMsg('Pix atualizado!'); setEditPix(false)
    setTimeout(() => setMsg(''), 2000)
  }

  async function salvarSenha() {
    if (!token) return
    setMsg('')
    const res = await fetch('/api/motoboy/definir-senha', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ senha: novaSenha }) })
    const j = await res.json()
    if (j.error) { setMsg(j.error); return }
    setMsg('Senha salva!'); setEditSenha(false); setNovaSenha('')
    if (data) setData({ ...data, motoboy: { ...data.motoboy, has_password: true } })
    setTimeout(() => setMsg(''), 2000)
  }

  const style = `
    body{margin:0;}
    .p-wrap{max-width:520px;margin:0 auto;font-family:'Archivo',sans-serif;font-size:14px;color:var(--ink);background:var(--concrete);min-height:100vh;}
    .p-login{max-width:420px;margin:0 auto;padding:48px 20px 40px;}
    .p-logo{text-align:center;font-family:'Anton',sans-serif;font-size:22px;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;}
    .p-logo span{color:var(--sign-dark);}
    .p-logo-sub{text-align:center;font-size:12px;color:#8A8478;margin-bottom:26px;}
    .p-card{background:#fff;border:1px solid #E0DDD8;border-radius:16px;padding:24px;}
    .p-tabbar{display:flex;background:#FAFAF8;border:1.5px solid #E0DDD8;border-radius:12px;padding:4px;margin-bottom:20px;}
    .p-tabbar button{flex:1;border:none;background:transparent;font-family:inherit;font-size:11.5px;font-weight:800;color:#8A8478;padding:10px 6px;border-radius:9px;cursor:pointer;white-space:nowrap;}
    .p-tabbar button.on{background:var(--ink);color:var(--sign);}
    .p-field{margin-bottom:14px;}
    .p-field label{display:block;font-size:11.5px;font-weight:700;color:#8A8478;margin-bottom:6px;}
    .p-field input,.p-field select{width:100%;padding:12px 13px;border:1.5px solid #E0DDD8;border-radius:11px;font-size:14px;font-family:inherit;color:var(--ink);background:#FAFAF8;outline:none;box-sizing:border-box;}
    .p-btn{width:100%;padding:14px;background:var(--sign);color:var(--ink);border:none;border-radius:12px;font-size:14.5px;font-weight:800;cursor:pointer;margin-top:4px;}
    .p-btn:disabled{background:#E0DDD8;color:#8A8478;cursor:not-allowed;}
    .p-btn-2{width:100%;padding:11px;background:transparent;color:#8A8478;border:1.5px solid #E0DDD8;border-radius:12px;font-size:12.5px;font-weight:700;cursor:pointer;margin-top:8px;}
    .p-code{width:100%;padding:15px;text-align:center;font-size:26px;font-weight:800;letter-spacing:10px;border:1.5px solid #E0DDD8;border-radius:12px;margin:6px 0 4px;outline:none;background:#FAFAF8;box-sizing:border-box;}
    .p-error{color:#D6392B;font-size:12px;margin-top:10px;text-align:center;}
    .p-hd{background:var(--ink);color:#fff;padding:20px 20px 46px;}
    .p-hd-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
    .p-hd-logo{font-family:'Anton',sans-serif;font-size:15px;letter-spacing:.5px;text-transform:uppercase;color:var(--sign);}
    .p-hd-out{font-size:11px;color:#B9B4A8;font-weight:700;cursor:pointer;background:none;border:none;font-family:inherit;}
    .p-hd-user{display:flex;align-items:center;gap:12px;}
    .p-avatar{width:48px;height:48px;border-radius:50%;background:var(--sign);display:flex;align-items:center;justify-content:center;font-size:20px;flex:none;}
    .p-hd-name{font-size:16px;font-weight:800;}
    .p-hd-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;margin-top:2px;}
    .p-hd-status .dot{width:6px;height:6px;border-radius:50%;background:currentColor;}
    .p-body{padding:0 16px 40px;margin-top:-30px;}
    .p-avail-card{background:#fff;border:1px solid #E0DDD8;border-radius:14px;padding:16px;margin-bottom:14px;display:flex;align-items:center;gap:14px;box-shadow:0 1px 4px rgba(0,0,0,.06);}
    .p-avail-title{font-size:14px;font-weight:800;}
    .p-avail-sub{font-size:11px;color:#8A8478;margin-top:2px;line-height:1.5;}
    .p-avail-switch{flex:none;width:52px;height:30px;border-radius:20px;border:none;background:#E0DDD8;position:relative;cursor:pointer;padding:0;}
    .p-avail-switch.on{background:#0F8A57;}
    .p-avail-switch .knob{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s;}
    .p-avail-switch.on .knob{left:25px;}
    .p-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;}
    .p-kpi{background:#fff;border:1px solid #E0DDD8;border-radius:14px;padding:13px 10px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06);}
    .p-kpi .v{font-family:'Anton',sans-serif;font-size:20px;}
    .p-kpi .l{font-size:9px;color:#8A8478;text-transform:uppercase;margin-top:3px;font-weight:700;}
    .p-card2{background:#fff;border:1px solid #E0DDD8;border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:14px;overflow:hidden;}
    .p-card2-hd{padding:13px 16px;border-bottom:1px solid #E0DDD8;font-size:12.5px;font-weight:800;}
    .p-row{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #E0DDD8;}
    .p-row:last-child{border-bottom:none;}
    .p-row-mid{flex:1;min-width:0;}
    .p-row-title{font-size:12.5px;font-weight:700;}
    .p-row-sub{font-size:11px;color:#8A8478;margin-top:1px;}
    .p-row-right{text-align:right;flex:none;}
    .p-row-val{font-weight:800;font-size:13px;}
    .p-pill{font-size:9.5px;font-weight:800;text-transform:uppercase;padding:2px 7px;border-radius:20px;display:inline-block;margin-top:3px;}
    .p-empty{padding:22px 16px;text-align:center;color:#8A8478;font-size:12px;}
    .p-period-totals{display:flex;gap:10px;padding:0 16px 14px;}
    .p-period-totals > div{flex:1;background:#FAFAF8;border:1px solid #E0DDD8;border-radius:10px;padding:9px 11px;}
    .p-period-totals .l{display:block;font-size:9.5px;font-weight:700;color:#8A8478;text-transform:uppercase;}
    .p-period-totals .v{display:block;font-size:14px;font-weight:800;margin-top:2px;}
    .p-field-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #E0DDD8;font-size:13px;font-weight:600;}
    .p-field-row:last-child{border-bottom:none;}
    .p-field-edit{font-size:11px;color:var(--sign-dark);font-weight:800;cursor:pointer;flex:none;background:none;border:none;}
    .p-msg{text-align:center;font-size:12px;font-weight:700;color:#0F8A57;margin-bottom:10px;}

    .cr-empty{text-align:center;color:#8A8478;font-size:12px;padding:16px;}
    .cr-card{background:#fff;border:1px solid #E0DDD8;border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,.06);padding:14px;margin-bottom:12px;}
    .cr-card.group{border:1.5px solid var(--sign-dark);background:#FFFBEF;}
    .cr-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px;}
    .cr-name{font-size:14px;font-weight:800;}
    .cr-sub{font-size:11px;color:#8A8478;margin-top:2px;}
    .cr-val{font-family:'Anton',sans-serif;font-size:16px;color:var(--sign-dark);flex:none;}
    .cr-pill{display:inline-block;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:3px 9px;border-radius:20px;margin-top:4px;}
    .cr-pill.wait{background:#FEF3E2;color:#92600A;}
    .cr-pill.go{background:#E4F3EC;color:#0F7A4F;}
    .cr-codebox{background:#FAFAF8;border:1px dashed #D8D2C4;border-radius:12px;padding:11px 12px;}
    .cr-codebox .lbl{font-size:10.5px;font-weight:800;margin-bottom:3px;}
    .cr-codebox .hint{font-size:10px;color:#8A8478;line-height:1.4;margin-bottom:8px;}
    .cr-coderow{display:flex;gap:8px;}
    .cr-codeinput{flex:1;min-width:0;padding:10px 11px;border:1.5px solid #E0DDD8;border-radius:10px;font-size:16px;font-weight:800;letter-spacing:3px;text-align:center;background:#fff;outline:none;box-sizing:border-box;}
    .cr-codeinput:focus{border-color:var(--sign-dark);}
    .cr-codeinput.sm{flex:none;width:72px;font-size:14px;letter-spacing:2px;padding:9px 6px;}
    .cr-codebtn{flex:none;padding:0 14px;border-radius:10px;border:none;background:var(--ink);color:var(--sign);font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer;}
    .cr-codebtn.wide{width:100%;padding:12px;margin-top:4px;}
    .cr-codeerr{color:var(--alert);font-size:10.5px;font-weight:700;margin-top:7px;}
    .cr-grow{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #EFE6CE;}
    .cr-grow:last-of-type{border-bottom:none;}
    .cr-gname{flex:1;min-width:0;}
    .cr-gname b{font-size:12.5px;}
    .cr-gname span{display:block;font-size:10px;color:#8A8478;}
    .cr-overlay{position:fixed;inset:0;background:rgba(21,18,16,.55);display:flex;align-items:flex-end;justify-content:center;z-index:50;}
    .cr-ovcard{width:100%;max-width:520px;background:#fff;border-radius:22px 22px 0 0;padding:22px 22px 28px;box-shadow:0 -10px 40px rgba(0,0,0,.3);border:2px solid var(--sign);border-bottom:none;box-sizing:border-box;}
    .cr-ov-ring{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;}
    .cr-ov-ringtxt{font-family:'Anton',sans-serif;font-size:15px;letter-spacing:.3px;color:var(--sign-dark);text-transform:uppercase;}
    .cr-ov-sound{text-align:center;font-size:10.5px;color:#8A8478;font-weight:700;margin-bottom:14px;}
    .cr-ov-store{font-size:19px;font-weight:800;text-align:center;}
    .cr-ov-bairro{font-size:12.5px;color:#8A8478;text-align:center;margin-top:3px;margin-bottom:12px;}
    .cr-ov-val{font-family:'Anton',sans-serif;font-size:30px;text-align:center;color:#0F8A57;margin-bottom:14px;}
    .cr-ov-timebar{height:7px;border-radius:5px;background:#F0EDE8;overflow:hidden;margin-bottom:6px;}
    .cr-ov-timefill{height:100%;background:var(--alert);border-radius:5px;transition:width 1s linear;}
    .cr-ov-timelbl{text-align:center;font-size:11px;font-weight:800;color:var(--alert);margin-bottom:16px;}
    .cr-ov-btnrow{display:flex;gap:10px;}
    .cr-ov-btn{flex:1;padding:16px;border-radius:14px;border:none;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer;}
    .cr-ov-btn.no{background:#FBEAEA;color:#C0392B;}
    .cr-ov-btn.yes{background:#0F8A57;color:#fff;}
    .cr-toast{position:fixed;left:14px;right:14px;bottom:18px;max-width:492px;margin:0 auto;background:var(--ink);color:#fff;padding:13px 16px;border-radius:12px;font-size:12.5px;font-weight:700;text-align:center;z-index:60;box-shadow:0 6px 20px rgba(0,0,0,.3);}
    .cr-navbtn{width:100%;padding:10px;margin-bottom:10px;border-radius:11px;border:1.5px solid var(--sign-dark);background:#FFFBEF;color:var(--sign-dark);font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer;}
    .cr-nav-overlay{position:fixed;inset:0;background:#fff;z-index:70;display:flex;flex-direction:column;}
    .cr-nav-hd{flex:none;background:var(--ink);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;}
    .cr-nav-hd-txt{display:flex;flex-direction:column;gap:2px;font-size:13px;}
    .cr-nav-hd-txt span{font-size:10.5px;color:#B9B4A8;font-weight:600;}
    .cr-nav-close{flex:none;border:1.5px solid rgba(255,255,255,.4);background:transparent;color:#fff;font-family:inherit;font-size:11.5px;font-weight:800;padding:7px 12px;border-radius:9px;cursor:pointer;}
    .cr-nav-map{flex:1;width:100%;background:#E9E7E1;}
    .cr-nav-err{flex:none;background:#FBEAEA;color:#C0392B;font-size:12px;font-weight:700;text-align:center;padding:10px 16px;}
  `

  if (!token || !data) {
    return (
      <div className="p-wrap">
        <style>{style}</style>
        <div className="p-login">
          <div className="p-logo">TRINDADE <span>ONLINE</span></div>
          <div className="p-logo-sub">Painel do motoboy 🏍️</div>
          <div className="p-card">
            <div className="p-tabbar">
              <button className={loginTab === 'wa' ? 'on' : ''} onClick={() => { setLoginTab('wa'); setErro('') }}>📱 Código WhatsApp</button>
              <button className={loginTab === 'pwd' ? 'on' : ''} onClick={() => { setLoginTab('pwd'); setErro('') }}>🔒 Senha</button>
            </div>
            {loginTab === 'wa' ? (
              waStep === 1 ? (
                <>
                  <div style={{ fontSize: 12, color: '#8A8478', textAlign: 'center', marginBottom: 14 }}>Digite o WhatsApp que você usou no cadastro — mandamos um código pra entrar.</div>
                  <div className="p-field"><label>Seu WhatsApp</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(21) 98123-4567" inputMode="tel" /></div>
                  {erro && <div className="p-error">{erro}</div>}
                  <button className="p-btn" disabled={sending} onClick={enviarCodigo}>{sending ? 'Enviando...' : 'Enviar código →'}</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 8 }}>📱</div>
                  <div style={{ fontSize: 12, color: '#8A8478', textAlign: 'center', marginBottom: 6 }}>Código enviado pro seu WhatsApp<br /><b>{phone}</b></div>
                  <input className="p-code" maxLength={6} inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
                  <a style={{ display: 'block', textAlign: 'center', fontSize: 11.5, color: 'var(--sign-dark)', fontWeight: 700, marginBottom: 10, cursor: 'pointer' }} onClick={enviarCodigo}>Reenviar código</a>
                  {erro && <div className="p-error">{erro}</div>}
                  <button className="p-btn" disabled={sending || code.length < 6} onClick={confirmarCodigo}>{sending ? 'Entrando...' : 'Entrar'}</button>
                  <button className="p-btn-2" onClick={() => setWaStep(1)}>← Voltar</button>
                </>
              )
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#8A8478', textAlign: 'center', marginBottom: 14 }}>Entra com o WhatsApp e a senha que você criou.</div>
                <div className="p-field"><label>Seu WhatsApp</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(21) 98123-4567" inputMode="tel" /></div>
                <div className="p-field"><label>Senha</label><input type="password" value={senha} onChange={e => setSenha(e.target.value)} /></div>
                {erro && <div className="p-error">{erro}</div>}
                <button className="p-btn" disabled={sending} onClick={loginComSenha}>{sending ? 'Entrando...' : 'Entrar'}</button>
                <a style={{ display: 'block', textAlign: 'center', fontSize: 11.5, color: 'var(--sign-dark)', fontWeight: 700, marginTop: 14, cursor: 'pointer' }} onClick={() => setLoginTab('wa')}>Esqueci a senha — entrar pelo código do WhatsApp</a>
              </>
            )}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#8A8478', marginTop: 18 }}>Ainda não é motoboy parceiro? <a href="/motoboy/cadastro" style={{ color: 'var(--sign-dark)', fontWeight: 700 }}>Fazer meu cadastro →</a></div>
        </div>
      </div>
    )
  }

  const m = data.motoboy

  // Agrupa por loja as corridas que ainda esperam retirada (!pickedUp) —
  // 2+ da mesma loja virou card de grupo (confirma todas de uma vez),
  // 1 só continua como card solo normal.
  const waitingRides = (corridas?.rides || []).filter(r => !r.pickedUp)
  const movingRides = (corridas?.rides || []).filter(r => r.pickedUp)
  const byCompany: Record<string, Corrida[]> = {}
  waitingRides.forEach(r => { (byCompany[r.company] = byCompany[r.company] || []).push(r) })
  const grupos = Object.entries(byCompany).filter(([, items]) => items.length >= 2)
  const soloWaiting = Object.entries(byCompany).filter(([, items]) => items.length === 1).map(([, items]) => items[0])
  const soloRides = [...soloWaiting, ...movingRides]
  const totalCorridas = (corridas?.rides || []).length
  const pctTempo = Math.max(0, Math.min(100, (secondsLeft / 120) * 100))

  return (
    <div className="p-wrap">
      <style>{style}</style>
      <div className="p-hd">
        <div className="p-hd-top">
          <span className="p-hd-logo">TRINDADE ONLINE</span>
          <button className="p-hd-out" onClick={sair}>↪ Sair</button>
        </div>
        <div className="p-hd-user">
          <div className="p-avatar">🏍️</div>
          <div>
            <div className="p-hd-name">{m.name}</div>
            <div className="p-hd-status" style={{ color: m.available ? '#3FBE85' : '#B9B4A8' }}><span className="dot" />{m.available ? 'Disponível pra corridas' : 'Ausente'}</div>
          </div>
        </div>
      </div>
      <div className="p-body">
        {loadingData && <div style={{ textAlign: 'center', color: '#8A8478', padding: 20 }}>Carregando...</div>}

        {m.status === 'aguardando_aprovacao' && (
          <div className="p-card2" style={{ padding: 16, textAlign: 'center', color: '#92600A', background: '#FEF3E2', fontSize: 12.5 }}>⏳ Seu cadastro está em análise — assim que aprovarmos, você recebe a confirmação no WhatsApp.</div>
        )}
        {m.status === 'pendencia' && (
          <div className="p-card2" style={{ padding: 16, textAlign: 'center', color: '#92600A', background: '#FEF3E2', fontSize: 12.5 }}>🔶 Falta ajustar uma pendência do cadastro pra você começar a receber corridas — confere o link que te mandamos no WhatsApp.</div>
        )}
        {m.status === 'standby' && (
          <div className="p-card2" style={{ padding: 16, textAlign: 'center', color: '#92600A', background: '#FEF3E2', fontSize: 12.5 }}>📋 Seu cadastro está esperando um ajuste — confere o link que te mandamos no WhatsApp.</div>
        )}

        <div className="p-avail-card">
          <div style={{ flex: 1 }}>
            <div className="p-avail-title">{m.available ? '🟢 Disponível pra corridas' : '⚫ Ausente'}</div>
            <div className="p-avail-sub">{m.available ? 'Você está recebendo chamadas de entrega agora. Desliga quando parar de rodar.' : 'Você não recebe nenhuma chamada de entrega enquanto estiver assim.'}</div>
          </div>
          <button className={`p-avail-switch ${m.available ? 'on' : ''}`} onClick={toggleDisponivel}><span className="knob" /></button>
        </div>

        {notifPermission === 'default' && (
          <div className="p-avail-card" style={{ background: '#FEF3E2', borderColor: '#F0D9A8' }}>
            <div style={{ flex: 1 }}>
              <div className="p-avail-title">🔔 Ativar aviso de corrida</div>
              <div className="p-avail-sub">Sem isso, nova corrida só avisa pelo WhatsApp — com o celular travado você pode nem perceber a tempo.</div>
            </div>
            <button className="p-btn" style={{ width: 'auto', padding: '10px 16px', marginTop: 0, flex: 'none' }} onClick={ativarNotifCorrida}>Ativar</button>
          </div>
        )}
        {notifPermission === 'denied' && (
          <div className="p-avail-card" style={{ background: '#FBEAEA', borderColor: '#F0C9C4' }}>
            <div style={{ flex: 1 }}>
              <div className="p-avail-title">🔕 Aviso de corrida bloqueado</div>
              <div className="p-avail-sub">Você negou a notificação antes — pra ativar agora precisa ir nas configurações do navegador/celular e permitir manualmente.</div>
            </div>
          </div>
        )}

        <div className="p-card2">
          <div className="p-card2-hd">🏍️ Corridas ativas — {totalCorridas === 1 ? '1 corrida rolando agora' : totalCorridas === 0 ? 'nenhuma agora' : `${totalCorridas} corridas rolando agora`}</div>
          <div style={{ padding: 14 }}>
            {grupos.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: '#8A8478', margin: '0 2px 8px' }}>📦 Retirar junto</div>
                {grupos.map(([company, items]) => (
                  <div className="cr-card group" key={company}>
                    <div className="cr-top">
                      <div>
                        <div className="cr-name">{company}</div>
                        <div className="cr-sub">📍 {items[0].bairro || '—'}</div>
                        <span className="cr-pill wait">{items.length} corridas pra retirar aqui</span>
                      </div>
                    </div>
                    <div className="cr-codebox">
                      <div className="lbl">🔑 Código de cada pedido</div>
                      <div className="hint">Pede o código de retirada de cada corrida pro lojista e digita aqui — confirma todas de uma vez.</div>
                      {items.map(it => (
                        <div key={it.id}>
                          <div className="cr-grow">
                            <div className="cr-gname"><b>{it.customerName}</b><span style={isStaleRide(it.requestedAt) ? { color: 'var(--alert)', fontWeight: 800 } : undefined}>R$ {it.valueLabel} · pedida {fmtDT(it.requestedAt)}{isStaleRide(it.requestedAt) ? ' ⚠️' : ''}</span></div>
                            <input className="cr-codeinput sm" value={groupCodes[it.id] || ''} maxLength={4} inputMode="numeric" placeholder="----"
                              onChange={e => setGroupCodes(c => ({ ...c, [it.id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                          </div>
                          {groupErrs[it.id] && <div className="cr-codeerr">{it.customerName}: {groupErrs[it.id]}</div>}
                        </div>
                      ))}
                      <button className="cr-codebtn wide" onClick={() => confirmarGrupo(items.map(it => it.id))}>Confirmar retiradas</button>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: '#8A8478', margin: '14px 2px 8px' }}>🏍️ Minhas corridas</div>
              </>
            )}
            {soloRides.map(r => (
              <div className="cr-card" key={r.id}>
                <div className="cr-top">
                  <div>
                    <div className="cr-name">{r.company}</div>
                    <div className="cr-sub">👤 {r.customerName} · 📍 {r.bairro || '—'}</div>
                    <div className="cr-sub" style={isStaleRide(r.requestedAt) ? { color: 'var(--alert)', fontWeight: 800 } : undefined}>🕒 Pedida em {fmtDT(r.requestedAt)}{isStaleRide(r.requestedAt) ? ' · ⚠️ parada há muito tempo' : ''}</div>
                    <span className={`cr-pill ${r.pickedUp ? 'go' : 'wait'}`}>{r.pickedUp ? 'A caminho do cliente' : 'Aguardando retirada'}</span>
                  </div>
                  <div className="cr-val">R$ {r.valueLabel}</div>
                </div>
                {r.destinationAddress && (
                  <button type="button" className="cr-navbtn" onClick={() => setNavegandoId(r.id)}>
                    🗺️ Navegar até {r.pickedUp ? 'o cliente' : 'a loja'}
                  </button>
                )}
                <div className="cr-codebox">
                  <div className="lbl">{r.pickedUp ? '🔑 Código do cliente' : '🔑 Código da loja'}</div>
                  <div className="hint">{r.pickedUp ? 'Cliente informa na entrega — finaliza a corrida e libera seu repasse.' : 'Peça pro lojista na retirada.'}</div>
                  <div className="cr-coderow">
                    <input className="cr-codeinput" value={soloCodes[r.id] || ''} maxLength={4} inputMode="numeric" placeholder="----"
                      onChange={e => setSoloCodes(c => ({ ...c, [r.id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                    <button className="cr-codebtn" onClick={() => confirmarCodigoSolo(r.id)}>{r.pickedUp ? 'Confirmar entrega' : 'Confirmar retirada'}</button>
                  </div>
                  {soloErrs[r.id] && <div className="cr-codeerr">{soloErrs[r.id]}</div>}
                </div>
              </div>
            ))}
            {totalCorridas === 0 && <div className="cr-empty">Nenhuma corrida em andamento agora.</div>}
          </div>
        </div>

        <div className="p-kpis">
          <div className="p-kpi"><div className="v">{data.entregasSemana}</div><div className="l">Essa semana</div></div>
          <div className="p-kpi"><div className="v" style={{ color: '#C97A0E' }}>{fmt(data.aReceber)}</div><div className="l">A receber</div></div>
          <div className="p-kpi"><div className="v" style={{ color: '#0F8A57' }}>{fmt(data.jaRecebido)}</div><div className="l">Já recebido</div></div>
        </div>

        <div className="p-card2">
          <div className="p-card2-hd">📦 Entregas — {periodLabel(period)}</div>
          <div style={{ padding: '2px 16px 14px' }}>
            <PeriodFilterBar value={period} onChange={setPeriod} />
          </div>
          <div className="p-period-totals">
            <div><span className="l">A receber no período</span><span className="v" style={{ color: '#C97A0E' }}>{fmt(data.periodAReceber)}</span></div>
            <div><span className="l">Recebido no período</span><span className="v" style={{ color: '#0F8A57' }}>{fmt(data.periodRecebido)}</span></div>
          </div>
          {data.recentOrders.length === 0 && <div className="p-empty">Nenhuma entrega nesse período.</div>}
          {data.recentOrders.map(o => (
            <div className="p-row" key={o.id}>
              <div className="p-row-mid">
                <div className="p-row-title">{o.company_name}</div>
                <div className="p-row-sub">{orderSubtitle(o)}</div>
              </div>
              <div className="p-row-right">
                <div className="p-row-val">{fmt(o.fee)}</div>
                <span className="p-pill" style={{ background: o.pago ? '#E4F3EC' : '#FEF3E2', color: o.pago ? '#157A52' : '#92600A' }}>{o.pago ? 'pago' : 'a receber'}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-card2">
          <div className="p-card2-hd">💸 Pagamentos recebidos</div>
          {data.payouts.filter(p => p.status === 'pago').length === 0 && <div className="p-empty">Nenhum repasse pago ainda.</div>}
          {data.payouts.filter(p => p.status === 'pago').map(p => (
            <div className="p-row" key={p.id}>
              <div className="p-row-mid">
                <div className="p-row-title">Repasse — {p.period_start.split('-').reverse().slice(0, 2).join('/')} a {p.period_end.split('-').reverse().slice(0, 2).join('/')}</div>
                <div className="p-row-sub">{p.paid_at ? `Pago via Pix em ${new Date(p.paid_at).toLocaleDateString('pt-BR')}` : ''}</div>
              </div>
              <div className="p-row-right"><div className="p-row-val" style={{ color: '#0F8A57' }}>{fmt(p.valor)}</div></div>
            </div>
          ))}
        </div>

        <div className="p-card2">
          <div className="p-card2-hd">👤 Meus dados</div>
          {msg && <div className="p-msg">{msg}</div>}
          <div className="p-field-row">
            {editPix ? (
              <div style={{ flex: 1 }}>
                <select value={pixType} onChange={e => setPixType(e.target.value)} style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 8, border: '1px solid #E0DDD8' }}>
                  <option value="celular">Celular</option><option value="cpf">CPF</option><option value="email">E-mail</option><option value="aleatoria">Aleatória</option>
                </select>
                <input value={pixKey} onChange={e => setPixKey(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E0DDD8', marginBottom: 8 }} />
                <button className="p-btn" style={{ marginTop: 0 }} onClick={salvarPix}>Salvar</button>
              </div>
            ) : (
              <>
                <span>Chave Pix: {m.pix_key || '—'}</span>
                <button className="p-field-edit" onClick={() => setEditPix(true)}>Editar</button>
              </>
            )}
          </div>
          <div className="p-field-row"><span>WhatsApp: {m.phone}</span></div>
          <div className="p-field-row">
            {editSenha ? (
              <div style={{ flex: 1 }}>
                <input type="password" placeholder="Nova senha (mín. 6 caracteres)" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E0DDD8', marginBottom: 8 }} />
                <button className="p-btn" style={{ marginTop: 0 }} onClick={salvarSenha}>Salvar</button>
              </div>
            ) : (
              <>
                <span>Senha de acesso: {m.has_password ? '••••••••' : 'não criada'}</span>
                <button className="p-field-edit" onClick={() => setEditSenha(true)}>{m.has_password ? 'Trocar' : 'Criar'}</button>
              </>
            )}
          </div>
        </div>
      </div>

      {corridas?.offer && (
        <div className="cr-overlay">
          <div className="cr-ovcard">
            <div className="cr-ov-ring"><span style={{ fontSize: 26 }}>🏍️</span><span className="cr-ov-ringtxt">Tem entrega!</span></div>
            <div className="cr-ov-sound">🔊 chegou pedido no trindade online...</div>
            <div className="cr-ov-store">{corridas.offer.company}</div>
            <div className="cr-ov-bairro">📍 {corridas.offer.bairro || '—'}</div>
            <div className="cr-ov-val">R$ {corridas.offer.valueLabel}</div>
            <div className="cr-ov-timebar"><div className="cr-ov-timefill" style={{ width: `${pctTempo}%` }} /></div>
            <div className="cr-ov-timelbl">{fmtTempo(secondsLeft)} pra responder</div>
            <div className="cr-ov-btnrow">
              <button className="cr-ov-btn no" onClick={recusarCorrida}>✕ Recusar</button>
              <button className="cr-ov-btn yes" onClick={aceitarCorrida}>✓ Aceitar</button>
            </div>
          </div>
        </div>
      )}
      {corridasToast && <div className="cr-toast">{corridasToast}</div>}

      {navegandoId && (() => {
        const ride = corridas?.rides.find(r => r.id === navegandoId)
        return (
          <div className="cr-nav-overlay">
            <div className="cr-nav-hd">
              <div className="cr-nav-hd-txt">
                <b>🗺️ {ride?.pickedUp ? `Levando pra ${ride.customerName}` : `Indo retirar em ${ride?.company}`}</b>
                <span>A bolinha verde é você — some sozinha se perder o GPS</span>
              </div>
              <button type="button" className="cr-nav-close" onClick={() => setNavegandoId(null)}>✕ Fechar</button>
            </div>
            <div className="cr-nav-map" ref={mapDivRef} />
            {navError && <div className="cr-nav-err">⚠️ {navError}</div>}
          </div>
        )
      })()}
    </div>
  )
}
