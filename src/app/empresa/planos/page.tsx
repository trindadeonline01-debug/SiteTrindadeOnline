'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Plan = { id: string; name: string; days: number; value: number; description: string; display_order: number; highlight?: boolean; highlight_label?: string }

export default function PlanosPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pixData, setPixData] = useState<{qr: string|null; copy: string|null; valor: number; plano: string} | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
    })
    supabase.from('plans').select('id,name,days,value,description,display_order,highlight,highlight_label')
      .eq('type', 'subscription').eq('active', true).order('display_order')
      .then(({ data }) => {
        const list = (data || []) as Plan[]
        setPlans(list)
        // Seleciona o "highlight" ou o primeiro por padrão
        const highlighted = list.find(p => p.highlight)
        setSelectedId(highlighted?.id || list[0]?.id || null)
        setLoading(false)
      })
  }, [])

  // Plano mensal serve de referência para calcular o valor "cheio"
  const mensalValue = useMemo(() => {
    const mensal = plans.find(p => p.days <= 31)
    return mensal ? mensal.value : 0
  }, [plans])

  const selectedPlan = plans.find(p => p.id === selectedId) || null

  function calcDiscount(plan: Plan) {
    if (!mensalValue) return { full: 0, saved: 0, percent: 0 }
    const months = Math.max(1, Math.round(plan.days / 30))
    const full = mensalValue * months
    const saved = full - plan.value
    const percent = full > 0 ? Math.round((saved / full) * 100) : 0
    return { full, saved, percent }
  }

  async function handleAssinar(plan: Plan) {
    setPaying(plan.id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: company } = await supabase.from('companies').select('id,name').eq('owner_id', session.user.id).single()
    if (!company) { setPaying(null); return }
    const res = await fetch('/api/mp/create-charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: 'custom',
        company_id: company.id,
        owner_email: session.user.email,
        valor_override: plan.value,
        dias_override: plan.days,
        nome_plano: plan.name
      })
    })
    const data = await res.json()
    setPaying(null)
    if (data.qr_code_image || data.pix_copy_paste) {
      setPixData({ qr: data.qr_code_image, copy: data.pix_copy_paste, valor: plan.value, plano: plan.name })
    } else {
      alert('Erro ao gerar pagamento: ' + (data.error || 'Tente novamente.'))
    }
  }

  function copiarPix() {
    if (!pixData?.copy) return
    navigator.clipboard.writeText(pixData.copy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fmtBRL = (n: number) => n.toFixed(2).replace('.', ',')

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #111; font-family: 'Inter', sans-serif; }
        .wrap { min-height: 100vh; padding: 32px 20px; max-width: 460px; margin: 0 auto; }
        @media(max-width:600px){.wrap{padding:20px 14px;}}
        .header { text-align: center; margin-bottom: 22px; }
        .title { font-family: 'Bebas Neue', sans-serif; font-size: 34px; color: #fff; letter-spacing: 2px; }
        .title span { color: #C9951A; }
        .subtitle { font-size: 12px; color: #666; margin-top: 6px; }

        .tabs-wrap { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 100px; padding: 5px; display: flex; gap: 3px; margin-bottom: 20px; }
        .tab { flex: 1; padding: 12px 6px; border-radius: 100px; text-align: center; font-size: 13px; font-weight: 700; cursor: pointer; color: #888; transition: all .15s; position: relative; border: none; background: transparent; font-family: 'Inter', sans-serif; }
        .tab.on { background: #C9951A; color: #111; }
        .tab .discount { position: absolute; top: -8px; right: 4px; background: #4ADE80; color: #111; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 8px; letter-spacing: 0.5px; }
        .tab.on .discount { background: #111; color: #C9951A; }

        .plan-card { background: linear-gradient(135deg, #C9951A 0%, #B8841A 100%); border-radius: 20px; padding: 22px 20px; color: #fff; position: relative; margin-bottom: 14px; box-shadow: 0 10px 30px rgba(201,149,26,0.3); text-align: center; }
        .plan-name-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 12px; }
        .plan-name { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; opacity: 0.95; }
        .plan-badge { background: rgba(255,255,255,0.25); color: #fff; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 20px; letter-spacing: 0.5px; }
        .price-original { font-size: 15px; color: rgba(255,255,255,0.65); text-decoration: line-through; font-weight: 600; margin-bottom: 2px; }
        .plan-price { font-family: 'Bebas Neue', sans-serif; font-size: 60px; line-height: 1; margin: 0 0 4px; }
        .plan-price small { font-size: 24px; }
        .plan-period { font-size: 12px; opacity: 0.9; margin-bottom: 12px; font-weight: 600; }
        .plan-economy { display: inline-block; background: #4ADE80; color: #0F5232; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 800; }

        .pix-badge { background: #1A1A1A; border: 1px solid #4ADE80; border-radius: 12px; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 14px; }
        .pix-badge-text { color: #4ADE80; font-size: 12px; font-weight: 800; letter-spacing: 0.5px; }

        .benefits { background: #1A1A1A; border-radius: 14px; padding: 14px 18px; margin-bottom: 16px; }
        .benefits-title { font-size: 11px; font-weight: 700; color: #888; letter-spacing: 1px; margin-bottom: 8px; }
        .benefit-item { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #ccc; padding: 4px 0; }
        .benefit-item .check { color: #4ADE80; font-size: 16px; font-weight: 700; }

        .btn-assinar { width: 100%; background: #C9951A; color: #111; border: none; padding: 16px; border-radius: 12px; font-size: 15px; font-weight: 800; cursor: pointer; letter-spacing: 0.5px; font-family: 'Inter', sans-serif; }
        .btn-assinar:hover { background: #B8841A; }
        .btn-assinar:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-note { text-align: center; font-size: 11px; color: #555; margin-top: 10px; }
        .back { text-align: center; margin-top: 20px; }
        .back a { font-size: 12px; color: #555; text-decoration: none; }
        .back a:hover { color: #C9951A; }

        .pix-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pix-modal { background: #fff; border-radius: 20px; padding: 32px 28px; max-width: 420px; width: 100%; position: relative; text-align: center; max-height: 90vh; overflow-y: auto; }
        .pix-close { position: absolute; top: 12px; right: 16px; font-size: 28px; color: #888; cursor: pointer; line-height: 1; }
        .pix-close:hover { color: #111; }
        .pix-title { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: #111; letter-spacing: 2px; margin-bottom: 4px; }
        .pix-title span { color: #C9951A; }
        .pix-plano { font-size: 13px; color: #666; margin-bottom: 20px; font-weight: 600; }
        .pix-qr-wrap { background: #fff; padding: 8px; border: 2px solid #EDE8E0; border-radius: 12px; display: inline-block; margin-bottom: 16px; }
        .pix-qr { width: 220px; height: 220px; display: block; }
        .pix-instr { font-size: 12px; color: #888; margin-bottom: 16px; line-height: 1.5; }
        .pix-copy-wrap { display: flex; gap: 6px; margin-bottom: 20px; }
        .pix-copy-input { flex: 1; padding: 10px 12px; border: 1.5px solid #E0DDD8; border-radius: 8px; font-size: 11px; font-family: monospace; color: #333; background: #FAFAF8; outline: none; }
        .pix-copy-btn { background: #C9951A; color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; font-family: 'Inter', sans-serif; }
        .pix-copy-btn:hover { background: #B8841A; }
        .pix-done-btn { width: 100%; background: #111; color: #fff; border: none; padding: 14px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif; margin-bottom: 12px; }
        .pix-done-btn:hover { background: #333; }
        .pix-note { font-size: 11px; color: #999; line-height: 1.5; }
      `}</style>

      <div className="wrap">
        <div className="header">
          <div className="title">ESCOLHA SEU <span>PLANO</span></div>
          <div className="subtitle">Ativação imediata após o pagamento via Pix</div>
        </div>

        {loading ? (
          <div style={{textAlign:'center',color:'#555',paddingTop:60}}>Carregando planos...</div>
        ) : plans.length === 0 ? (
          <div style={{textAlign:'center',color:'#555',paddingTop:60}}>Nenhum plano disponível.</div>
        ) : (
          <>
            <div className="tabs-wrap">
              {plans.map(plan => {
                const { percent } = calcDiscount(plan)
                return (
                  <button key={plan.id} className={`tab ${selectedId === plan.id ? 'on' : ''}`} onClick={() => setSelectedId(plan.id)}>
                    {plan.name}
                    {percent > 0 && <span className="discount">-{percent}%</span>}
                  </button>
                )
              })}
            </div>

            {selectedPlan && (() => {
              const { full, saved } = calcDiscount(selectedPlan)
              const months = Math.max(1, Math.round(selectedPlan.days / 30))
              return (
                <>
                  <div className="plan-card">
                    <div className="plan-name-row">
                      <span className="plan-name">Plano {selectedPlan.name}</span>
                      {selectedPlan.highlight && <span className="plan-badge">{selectedPlan.highlight_label || 'MELHOR OFERTA'}</span>}
                    </div>
                    {saved > 0 && <div className="price-original">De R$ {fmtBRL(full)}</div>}
                    <div className="plan-price">R$ {Math.floor(selectedPlan.value)}<small>,{selectedPlan.value.toFixed(2).split('.')[1]}</small></div>
                    <div className="plan-period">
                      {months === 1 ? 'Cobrado uma vez por mês' : months === 12 ? 'Cobrado uma vez por ano' : `Cobrado a cada ${months} meses`}
                    </div>
                    {saved > 0 && <div className="plan-economy">💰 Economia de R$ {fmtBRL(saved)}</div>}
                  </div>

                  <div className="pix-badge">
                    <span style={{fontSize:16}}>💠</span>
                    <span className="pix-badge-text">PAGAMENTO EXCLUSIVO VIA PIX</span>
                  </div>

                  <div className="benefits">
                    <div className="benefits-title">✓ INCLUÍDO</div>
                    <div className="benefit-item"><span className="check">✓</span> WhatsApp visível</div>
                    <div className="benefit-item"><span className="check">✓</span> Endereço e mapa</div>
                    <div className="benefit-item"><span className="check">✓</span> Link externo</div>
                    <div className="benefit-item"><span className="check">✓</span> Fotos, avaliações e busca por tags</div>
                  </div>

                  <button className="btn-assinar" disabled={paying === selectedPlan.id} onClick={() => handleAssinar(selectedPlan)}>
                    {paying === selectedPlan.id ? 'Aguarde...' : `Assinar · R$ ${fmtBRL(selectedPlan.value)}`}
                  </button>
                  <div className="btn-note">Cancele quando quiser</div>
                </>
              )
            })()}
          </>
        )}

        <div className="back"><a href="/painel">← Ir para o painel sem assinar agora</a></div>
      </div>

      {pixData && (
        <div className="pix-overlay" onClick={() => setPixData(null)}>
          <div className="pix-modal" onClick={e => e.stopPropagation()}>
            <div className="pix-close" onClick={() => setPixData(null)}>×</div>
            <div className="pix-title">PAGUE COM <span>PIX</span></div>
            <div className="pix-plano">{pixData.plano} · R$ {fmtBRL(pixData.valor)}</div>
            {pixData.qr && (
              <div className="pix-qr-wrap">
                <img src={`data:image/png;base64,${pixData.qr}`} alt="QR Code Pix" className="pix-qr" />
              </div>
            )}
            <div className="pix-instr">Escaneie o QR Code acima ou copie o código abaixo no app do seu banco</div>
            {pixData.copy && (
              <div className="pix-copy-wrap">
                <input type="text" readOnly value={pixData.copy} className="pix-copy-input" />
                <button className="pix-copy-btn" onClick={copiarPix}>
                  {copied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
            )}
            <button className="pix-done-btn" onClick={() => router.push('/painel')}>Já paguei — ir para o painel →</button>
            <div className="pix-note">Após o pagamento, seu plano é ativado automaticamente em até 2 minutos</div>
          </div>
        </div>
      )}
    </>
  )
}
