'use client'
import { useEffect, useId, useRef, useState } from 'react'

// Formulário seguro de cartão do próprio Mercado Pago (Card Payment Brick).
// O número do cartão é digitado num campo do Mercado Pago e nunca passa pelo
// nosso site: o Brick devolve só um `token`, que o servidor usa pra cobrar.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { MercadoPago?: any }
}

const SDK_URL = 'https://sdk.mercadopago.com/js/v2'
let sdkPromise: Promise<void> | null = null
function carregarSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve()
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SDK_URL
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { sdkPromise = null; reject(new Error('sdk')) }
    document.head.appendChild(s)
  })
  return sdkPromise
}

export type CartaoFormData = {
  token: string
  issuer_id?: string
  payment_method_id: string
  transaction_amount?: number
  installments?: number
  payer: { email: string; identification?: { type: string; number: string } }
}

export default function CartaoMercadoPago({ publicKey, amount, payerEmail, onPagar }: {
  publicKey: string
  amount: number
  payerEmail?: string | null
  onPagar: (dados: CartaoFormData) => Promise<void>
}) {
  const containerId = 'mp-card-' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [carregando, setCarregando] = useState(true)
  const [erroSdk, setErroSdk] = useState(false)
  const onPagarRef = useRef(onPagar)
  useEffect(() => { onPagarRef.current = onPagar }, [onPagar])

  useEffect(() => {
    let controller: any = null
    let cancelado = false
    carregarSdk().then(async () => {
      if (cancelado || !window.MercadoPago) return
      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' })
      controller = await mp.bricks().create('cardPayment', containerId, {
        initialization: { amount, ...(payerEmail ? { payer: { email: payerEmail } } : {}) },
        customization: { paymentMethods: { maxInstallments: 1 } },
        callbacks: {
          onReady: () => setCarregando(false),
          onSubmit: (dados: CartaoFormData) => onPagarRef.current(dados),
          onError: (err: unknown) => console.error('[CartaoMercadoPago]', err),
        },
      })
      if (cancelado) controller?.unmount?.()
    }).catch(() => { setErroSdk(true); setCarregando(false) })
    return () => { cancelado = true; controller?.unmount?.() }
  }, [publicKey, amount, payerEmail, containerId])

  return (
    <div>
      {carregando && <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12.5, color: '#6F6C67' }}>Carregando pagamento seguro…</div>}
      {erroSdk && <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: '#A83232' }}>Não deu pra carregar o pagamento com cartão. Confere a internet ou paga com Pix.</div>}
      <div id={containerId} />
    </div>
  )
}
