'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { calcularRota } from '@/lib/gmapsRoute'

// Acompanhamento da entrega pelo cliente, sem app (nov/2026) — o link chega no
// WhatsApp quando o motoboy retira o pedido. Mostra o mapa com o motoboy se
// movendo (posição vem de /api/acompanhar a cada ~8 s) e o tempo estimado.
// A rota é recalculada só a cada 90 s (e quando a fase muda), pra manter o uso
// do Google Maps bem abaixo da cota grátis.

type Estado = 'aguardando' | 'a_caminho' | 'entregue' | 'cancelada'
type Dados = {
  empresa: string; motoboy: string | null; estado: Estado
  fase?: 'loja' | 'cliente'; destino?: string | null
  posicao?: { lat: number; lng: number; semSinal: boolean; atualizadoEm?: string } | null
  entregueEm?: string | null
}

let gmapsPromise: Promise<void> | null = null
function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('sem window'))
  if ((window as any).google?.maps) return Promise.resolve()
  if (gmapsPromise) return gmapsPromise
  gmapsPromise = new Promise((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) { reject(new Error('sem chave')); return }
    const sc = document.createElement('script')
    sc.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=routes`
    sc.async = true
    sc.onload = () => resolve()
    sc.onerror = () => { gmapsPromise = null; reject(new Error('falha ao carregar')) }
    document.head.appendChild(sc)
  })
  return gmapsPromise
}

const ROTA_A_CADA_MS = 90_000

export default function AcompanharClient({ token }: { token: string }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  // Motivo da falha do mapa (null = ok) — aparece na tela pra diagnosticar sem DevTools.
  const [mapaErro, setMapaErro] = useState<string | null>(null)
  const [eta, setEta] = useState<string | null>(null)

  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const motoRef = useRef<any>(null)
  const destRef = useRef<any>(null)
  const rotaRef = useRef<any>(null)
  const ultimaRotaRef = useRef<{ em: number; fase: string }>({ em: 0, fase: '' })
  const centralizouRef = useRef(false)
  const vivoRef = useRef(true)
  useEffect(() => { vivoRef.current = true; return () => { vivoRef.current = false } }, [])

  const buscar = useCallback(async () => {
    try {
      const res = await fetch(`/api/acompanhar?t=${encodeURIComponent(token)}`, { cache: 'no-store' })
      if (res.status === 404) { setErro('Link de acompanhamento inválido ou expirado.'); return }
      if (!res.ok) return
      setErro('')
      setDados(await res.json())
    } catch {}
  }, [token])

  useEffect(() => {
    buscar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') buscar() }, 8000)
    const onVis = () => { if (document.visibilityState === 'visible') buscar() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [buscar])

  const aCaminho = dados?.estado === 'a_caminho'
  const pos = aCaminho ? dados?.posicao : null
  const fase = dados?.fase
  const destino = dados?.destino

  // Mapa + marcador do motoboy + rota/ETA.
  useEffect(() => {
    if (!pos || !mapDivRef.current) return
    let cancelled = false
    ;(window as any).gm_authFailure = () => { if (!cancelled) setMapaErro('a chave do Google Maps foi recusada para este endereço (gm_authFailure)') }
    loadGoogleMaps().then(() => {
      if (cancelled || !mapDivRef.current) return
      const google = (window as any).google
      const latLng = { lat: pos.lat, lng: pos.lng }
      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(mapDivRef.current, {
          zoom: 15, center: latLng, disableDefaultUI: true, zoomControl: true, clickableIcons: false,
        })
        rotaRef.current = new google.maps.Polyline({ map: mapRef.current, strokeColor: '#1A56B0', strokeWeight: 5 })
      }
      if (!motoRef.current) {
        motoRef.current = new google.maps.Marker({
          map: mapRef.current, position: latLng, zIndex: 999,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 15, fillColor: '#0F8A57', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
          label: { text: '🏍️', fontSize: '15px' },
        })
      } else {
        motoRef.current.setPosition(latLng)
      }
      motoRef.current.setOpacity(pos.semSinal ? 0.5 : 1)

      const agora = Date.now()
      const precisaRota = !!destino && (ultimaRotaRef.current.fase !== fase || agora - ultimaRotaRef.current.em > ROTA_A_CADA_MS)
      if (precisaRota) {
        ultimaRotaRef.current = { em: agora, fase: fase || '' }
        calcularRota(google, latLng, destino as string).then(r => {
          if (!vivoRef.current) return
          rotaRef.current?.setPath(r.path)
          if (r.minutos != null) setEta(r.minutos >= 60 ? `${Math.floor(r.minutos / 60)} h ${r.minutos % 60} min` : `${r.minutos} min`)
          if (r.fim) {
            if (!destRef.current) {
              destRef.current = new google.maps.Marker({
                map: mapRef.current, position: r.fim, zIndex: 500,
                label: { text: fase === 'loja' ? '🏪' : '🏠', fontSize: '20px' },
                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
              })
            } else {
              destRef.current.setPosition(r.fim)
              destRef.current.setLabel({ text: fase === 'loja' ? '🏪' : '🏠', fontSize: '20px' })
            }
            if (!centralizouRef.current) {
              centralizouRef.current = true
              const b = new google.maps.LatLngBounds()
              b.extend(latLng); b.extend(r.fim)
              mapRef.current.fitBounds(b, 70)
            }
          }
        }).catch(() => { /* sem rota: o mapa e o motoboy continuam, só sem a linha azul e o tempo */ })
      }
    }).catch((e: unknown) => { if (!cancelled) setMapaErro(e instanceof Error ? e.message : 'erro ao montar o mapa') })
    return () => { cancelled = true }
  }, [pos?.lat, pos?.lng, pos?.semSinal, fase, destino]) // eslint-disable-line react-hooks/exhaustive-deps

  const nome = dados?.motoboy || 'O motoboy'
  let titulo = 'Carregando…'
  let sub = ''
  if (dados) {
    if (dados.estado === 'aguardando') { titulo = 'Procurando um motoboy'; sub = 'Assim que um motoboy aceitar, você acompanha aqui.' }
    else if (dados.estado === 'entregue') { titulo = '✅ Pedido entregue'; sub = `Obrigado por pedir na ${dados.empresa}!` }
    else if (dados.estado === 'cancelada') { titulo = 'Entrega cancelada'; sub = `Fale com a ${dados.empresa} para saber mais.` }
    else if (dados.fase === 'loja') { titulo = `🏍️ ${nome} está indo buscar seu pedido`; sub = `Ele vai retirar na ${dados.empresa} e já segue para você.` }
    else { titulo = `🏍️ ${nome} está a caminho`; sub = eta ? `Chega em cerca de ${eta}.` : 'Acompanhe pelo mapa.' }
  }

  return (
    <main className="ac-wrap">
      <style>{CSS}</style>
      <header className="ac-top">
        <div className="ac-brand">TRINDADE <span>ONLINE</span></div>
        {dados?.empresa && <div className="ac-loja">{dados.empresa}</div>}
      </header>

      {erro ? (
        <div className="ac-msg"><div className="ac-card"><div className="ac-tit">{erro}</div></div></div>
      ) : (
        <>
          <div className="ac-mapbox">
            {pos && !mapaErro ? <div ref={mapDivRef} className="ac-map" /> : (
              <div className="ac-nomap">
                {aCaminho && !pos ? 'Aguardando o sinal do motoboy…' : mapaErro && pos ? (
                  <div>
                    <div>Não deu para carregar o mapa agora.</div>
                    <a className="ac-link" href={`https://www.google.com/maps?q=${pos.lat},${pos.lng}`} target="_blank" rel="noopener noreferrer">📍 Ver a posição do motoboy no Google Maps</a>
                    <div className="ac-diag">({mapaErro})</div>
                  </div>
                ) : dados ? '' : 'Carregando…'}
              </div>
            )}
          </div>
          <section className="ac-card">
            <div className="ac-tit">{titulo}</div>
            {sub && <div className="ac-sub">{sub}</div>}
            {pos?.semSinal && <div className="ac-warn">Sem sinal do motoboy há alguns minutos — mostrando a última posição conhecida.</div>}
            {aCaminho && <div className="ac-hint">A posição atualiza sozinha a cada poucos segundos. Quando o motoboy chegar, informe o código de entrega que você recebeu no WhatsApp.</div>}
          </section>
        </>
      )}
    </main>
  )
}

const CSS = `
:root{color-scheme:light}
.ac-wrap{min-height:100vh;display:flex;flex-direction:column;background:#F0EDE8;color:#1A0F00;font-family:Inter,system-ui,sans-serif}
.ac-top{background:#1A0F00;padding:14px 16px;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.ac-brand{font-family:'Bebas Neue',Impact,sans-serif;font-size:22px;letter-spacing:1px;color:#fff}
.ac-brand span{color:#C9951A}
.ac-loja{font-size:13px;color:#E3DCCB;font-weight:600;text-align:right}
.ac-mapbox{flex:1;min-height:55vh;position:relative;background:#E3DCCB}
.ac-map{position:absolute;inset:0}
.ac-nomap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:#6F6C67;font-weight:600}
.ac-msg{padding:16px}
.ac-card{background:#fff;padding:16px 16px calc(18px + env(safe-area-inset-bottom));border-top-left-radius:18px;border-top-right-radius:18px;margin-top:-14px;position:relative;z-index:2;box-shadow:0 -4px 18px rgba(0,0,0,.12)}
.ac-tit{font-size:18px;font-weight:800;line-height:1.25}
.ac-sub{margin-top:4px;font-size:15px;color:#2A1B08}
.ac-warn{margin-top:10px;background:#FFF4D6;color:#8A6410;border-radius:10px;padding:8px 10px;font-size:13px;font-weight:600}
.ac-link{display:inline-block;margin-top:12px;background:#1A0F00;color:#fff;font-weight:700;padding:10px 14px;border-radius:10px;text-decoration:none}
.ac-diag{margin-top:10px;font-size:11px;font-weight:400;color:#8a857d}
.ac-hint{margin-top:10px;font-size:12.5px;color:#6F6C67;line-height:1.45}
`
