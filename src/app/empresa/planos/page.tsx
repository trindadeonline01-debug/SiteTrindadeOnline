'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Plan = { id: string; name: string; days: number; value: number; description: string; display_order: number; highlight?: boolean; highlight_label?: string }

export default function PlanosPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<string | null>(null)
  const [pixData, setPixData] = useState<{qr: string|null; copy: string|null; valor: number; plano: string} | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
    })
    supabase.from('plans').select('id,name,days,value,description,display_order,highlight,highlight_label')
      .eq('type', 'subscription').eq('active', true).order('display_order')
      .then(({ data }) => { setPlans((data || []) as Plan[]); setLoading(false) })
  }, [])

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

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #111; font-family: 'Inter', sans-serif; }
        .wrap { min-height: 100vh; padding: 48px 20px; } @media(max-width:600px){.wrap{padding:16px 10px;}}
        .header { text-align: center; margin-bottom: 40px; } @media(max-width:600px){.header{margin-bottom:14px;}}
        .title { font-family: 'Bebas Neue', sans-serif; font-size: 36px; color: #fff; letter-spacing: 2px; }
        .title span { color: #C9951A; }
        .subtitle { font-size: 13px; color: #666; margin-top: 8px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; max-width: 860px; margin: 0 auto; } @media(max-width:600px){.grid{gap:8px;}}
        .card { background: #1A1A1A; border: 1.5px solid #333; border-radius: 16px; padding: 28px 22px; text-align: center; position: relative; } @media(max-width:600px){.card{padding:14px 12px;border-radius:12px;}}
        .card.popular { border: 2px solid #C9951A; }
        .popular-badge { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: #C9951A; color: #111; font-size: 10px; font-weight: 800; padding: 4px 16px; border-radius: 20px; letter-spacing: 1px; white-space: nowrap; }
        .plan-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; margin-bottom: 16px; color: #888; text-transform: uppercase; } @media(max-width:600px){.plan-label{font-size:14px;margin-bottom:8px;}}
        .card.popular .plan-label { color: #C9951A; }
        .price { font-family: 'Bebas Neue', sans-serif; font-size: 52px; color: #fff; line-height: 1; } @media(max-width:600px){.price{font-size:42px;}}
        .price-note { font-size: 11px; color: #555; margin-bottom: 8px; } @media(max-width:600px){.price-note{font-size:13px;margin-bottom:4px;}}
        .desc { font-size: 12px; color: #888; line-height: 1.8; margin: 16px 0 24px; min-height: 60px; } @media(max-width:600px){.desc{display:none;}}
        .plan-total { display: inline-block; background: #FEF3E2; color: #854F0B; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 6px; margin-top: 8px; } @media(max-width:600px){.plan-total{font-size:13px;margin-top:4px;padding:3px 10px;}}
        .btn-plan { width: 100%; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif; border: 1.5px solid #C9951A; background: transparent; color: #C9951A; } @media(max-width:600px){.btn-plan{padding:10px;font-size:15px;margin-top:6px;}}
        .btn-plan.popular { background: #C9951A; color: #111; border: none; }
        .btn-plan:disabled { opacity: 0.6; cursor: not-allowed; }
        .footer-note { text-align: center; margin-top: 28px; font-size: 12px; color: #444; }
        .back { text-align: center; margin-top: 16px; }
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
        ) : (
          <div className="grid">
            {plans.map((plan, i) => {
              const months = Math.max(1, Math.round(plan.days / 30))
              const parcela = plan.value / months
              return (
              <div key={plan.id} className={`card ${plan.highlight ? 'popular' : ''}`}>
                {plan.highlight && <div className="popular-badge">{plan.highlight_label || 'MAIS POPULAR'}</div>}
                <div className="plan-label">{plan.name}</div>
                <div className="price">R$ {parcela.toFixed(2).replace('.', ',')}</div>
                <div className="price-note">{months > 1 ? `em ${months}x de R$ ${parcela.toFixed(2).replace('.',',')}` : 'por mês'}</div>
                {months > 1 && <div className="plan-total">Total: R$ {Number(plan.value).toFixed(2).replace('.',',')}</div>}
                <div className="desc">{plan.description}</div>
                <button className={`btn-plan ${plan.highlight ? 'popular' : ''}`}
                  disabled={paying === plan.id}
                  onClick={() => handleAssinar(plan)}>
                  {paying === plan.id ? 'Aguarde...' : 'Assinar'}
                </button>
              </div>
              )
            })}
          </div>
        )}
        <div className="footer-note">Todos os planos incluem ativação imediata via Pix · Cancele quando quiser</div>
        <div className="back"><a href="/painel">← Ir para o painel sem assinar agora</a></div>
      </div>

      {pixData && (
        <div className="pix-overlay" onClick={() => setPixData(null)}>
          <div className="pix-modal" onClick={e => e.stopPropagation()}>
            <div className="pix-close" onClick={() => setPixData(null)}>×</div>
            <div className="pix-title">PAGUE COM <span>PIX</span></div>
            <div className="pix-plano">{pixData.plano} · R$ {Number(pixData.valor).toFixed(2).replace('.', ',')}</div>
            {pixData.qr && (
              <div className="pix-qr-wrap">
                <img src={`data:image/png;base64,${pixData.qr}`} alt="QR Code Pix" className="pix-qr" />
              </div>
            )}
            <div className="pix-instr">Escaneie o QR Code acima ou copie o código abaixo no app do seu banco</div>
            {pixData.copy && (
              <>
                <div className="pix-copy-wrap">
                  <input type="text" readOnly value={pixData.copy} className="pix-copy-input" />
                  <button className="pix-copy-btn" onClick={copiarPix}>
                    {copied ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
              </>
            )}
            <button className="pix-done-btn" onClick={() => router.push('/painel')}>Já paguei — ir para o painel →</button>
            <div className="pix-note">Após o pagamento, seu plano é ativado automaticamente em até 2 minutos</div>
          </div>
        </div>
      )}
    </>
  )
}
