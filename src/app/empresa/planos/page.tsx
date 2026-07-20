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
  const [pixData, setPixData] = useState<{qr: string|null; copy: string|null; valor: number; plano: string} | null>(null)
  const [copied, setCopied] = useState(false)
  const [activePlan, setActivePlan] = useState<{name:string; endsAt:string; daysLeft:number} | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data: company } = await supabase
        .from('companies')
        .select('id,name,plan,plan_ends_at')
        .eq('owner_id', session.user.id)
        .single()

      if (company?.plan === 'paid' && company.plan_ends_at) {
        const endsAt = new Date(company.plan_ends_at)
        const daysLeft = Math.ceil((endsAt.getTime() - Date.now()) / 86400000)
        if (daysLeft > 60) {
          setActivePlan({ name: company.name, endsAt: company.plan_ends_at, daysLeft })
          setLoading(false)
          return
        }
      }

      const { data } = await supabase.from('plans')
        .select('id,name,days,value,description,display_order,highlight,highlight_label')
        .eq('type', 'subscription').eq('active', true).order('display_order')
      setPlans((data || []) as Plan[])
      setLoading(false)
    })()
  }, [])

  const mensalPlan = useMemo(() => plans.find(p => Number(p.days) <= 31), [plans])
  const semestralPlan = useMemo(() => plans.find(p => Number(p.days) > 31 && Number(p.days) <= 200), [plans])
  const anualPlan = useMemo(() => plans.find(p => Number(p.days) > 200), [plans])

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
        .wrap { min-height: 100vh; padding: 32px 20px; max-width: 420px; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; }
        @media(max-width:480px){ .wrap { padding: 24px 16px; } }

        .header { text-align: center; margin-bottom: 24px; }
        .logo { font-family: 'Bebas Neue', sans-serif; font-size: 22px; color: #fff; letter-spacing: 3px; margin-bottom: 4px; }
        .logo span { color: #C9951A; }
        .tagline { font-size: 14px; color: #888; font-weight: 600; }

        .main-card { background: #1a1a1a; border: 1.5px solid #2a2a2a; border-radius: 20px; padding: 28px 24px; margin-bottom: 12px; text-align: center; }
        .plan-label { font-size: 13px; font-weight: 700; color: #888; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px; }
        .price-big { font-family: 'Bebas Neue', sans-serif; font-size: 72px; color: #fff; line-height: 1; }
        .price-big sup { font-size: 28px; vertical-align: super; }
        .price-big small { font-size: 28px; }
        .price-sub { font-size: 13px; color: #888; font-weight: 600; margin-top: 4px; margin-bottom: 20px; }
        .divider { height: 1px; background: #2a2a2a; margin-bottom: 18px; }
        .features { text-align: left; }
        .feature { font-size: 14px; color: #ccc; font-weight: 600; padding: 6px 0; display: flex; align-items: center; gap: 10px; }
        .feature .ok { color: #4ADE80; font-weight: 800; font-size: 16px; }
        .btn-mensal { width: 100%; background: #C9951A; color: #111; border: none; padding: 16px; border-radius: 12px; font-size: 16px; font-weight: 800; cursor: pointer; font-family: 'Inter', sans-serif; margin-top: 20px; }
        .btn-mensal:disabled { opacity: 0.6; cursor: not-allowed; }

        .discount-btn { width: 100%; background: #1a1a1a; border: 1.5px solid #333; border-radius: 14px; padding: 18px 20px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; text-align: left; transition: all 0.2s; gap: 12px; font-family: 'Inter', sans-serif; }
        .discount-btn:hover { border-color: #C9951A; background: #1e1a12; }
        .discount-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .discount-left { flex: 1; }
        .discount-title { font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 4px; }
        .discount-sub { font-size: 13px; color: #aaa; font-weight: 600; }
        .discount-badge { background: #4ADE80; color: #0a3520; font-size: 13px; font-weight: 800; padding: 6px 14px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; }
        .discount-badge.fire { background: #ff6b35; color: #fff; }

        .footer { text-align: center; margin-top: 18px; }
        .footer-note { font-size: 13px; color: #666; font-weight: 600; margin-bottom: 10px; }
        .back { font-size: 13px; color: #555; text-decoration: none; font-weight: 600; }
        .back:hover { color: #C9951A; }

        .pix-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pix-modal { background: #fff; border-radius: 20px; padding: 32px 28px; max-width: 420px; width: 100%; position: relative; text-align: center; max-height: 90vh; overflow-y: auto; }
        .pix-close { position: absolute; top: 12px; right: 16px; font-size: 28px; color: #888; cursor: pointer; line-height: 1; background: none; border: none; }
        .pix-title { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: #111; letter-spacing: 2px; margin-bottom: 4px; }
        .pix-title span { color: #C9951A; }
        .pix-plano { font-size: 13px; color: #666; margin-bottom: 20px; font-weight: 600; }
        .pix-qr-wrap { background: #fff; padding: 8px; border: 2px solid #EDE8E0; border-radius: 12px; display: inline-block; margin-bottom: 16px; }
        .pix-qr { width: 220px; height: 220px; display: block; }
        .pix-instr { font-size: 12px; color: #888; margin-bottom: 16px; line-height: 1.5; }
        .pix-copy-wrap { display: flex; gap: 6px; margin-bottom: 20px; }
        .pix-copy-input { flex: 1; padding: 10px 12px; border: 1.5px solid #E0DDD8; border-radius: 8px; font-size: 11px; font-family: monospace; color: #333; background: #FAFAF8; outline: none; }
        .pix-copy-btn { background: #C9951A; color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; font-family: 'Inter', sans-serif; }
        .pix-done-btn { width: 100%; background: #111; color: #fff; border: none; padding: 14px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif; margin-bottom: 12px; }
        .pix-note { font-size: 11px; color: #999; line-height: 1.5; }
      `}</style>

      {activePlan ? (
        <div className="wrap">
          <div style={{textAlign:'center',padding:'40px 20px'}}>
            <div style={{fontSize:64,marginBottom:16}}>🎉</div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:'#fff',letterSpacing:2,marginBottom:8}}>PLANO <span style={{color:'#C9951A'}}>ATIVO</span></div>
            <div style={{fontSize:14,color:'#888',marginBottom:32}}>Sua empresa <strong style={{color:'#fff'}}>{activePlan.name}</strong> já tem um plano ativo</div>
            <div style={{background:'linear-gradient(135deg,#C9951A 0%,#B8841A 100%)',borderRadius:20,padding:'28px 24px',color:'#fff',marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,letterSpacing:1,opacity:0.9,marginBottom:6}}>✓ VÁLIDO ATÉ</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:36,marginBottom:8}}>{new Date(activePlan.endsAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}</div>
              <div style={{fontSize:14,fontWeight:600,opacity:0.9}}>{activePlan.daysLeft} dias restantes</div>
            </div>
            <div style={{background:'#1A1A1A',borderRadius:12,padding:'14px 18px',fontSize:13,color:'#888',lineHeight:1.6,marginBottom:24}}>💡 A renovação estará disponível quando faltarem <strong style={{color:'#C9951A'}}>60 dias</strong> para o vencimento.</div>
            <button onClick={()=>router.push('/painel')} style={{width:'100%',background:'#C9951A',color:'#111',border:'none',padding:'16px',borderRadius:12,fontSize:15,fontWeight:800,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>← Ir para o painel</button>
          </div>
        </div>
      ) : (
        <div className="wrap">
          <div className="header">
            <div className="logo">TRINDADE <span>ONLINE</span></div>
            <div className="tagline">Apareça para quem mora na Trindade</div>
          </div>

          {loading ? (
            <div style={{textAlign:'center',color:'#555',paddingTop:60}}>Carregando planos...</div>
          ) : (
            <>
              {mensalPlan && (
                <div className="main-card">
                  <div className="plan-label">Plano Mensal</div>
                  <div className="price-big"><sup>R$</sup>{Math.floor(mensalPlan.value)}<small>,{mensalPlan.value.toFixed(2).split('.')[1]}</small></div>
                  <div className="price-sub">por mês · cancele quando quiser</div>
                  <div className="divider"></div>
                  <div className="features">
                    <div className="feature"><span className="ok">✓</span> WhatsApp visível para clientes</div>
                    <div className="feature"><span className="ok">✓</span> Endereço completo e mapa</div>
                    <div className="feature"><span className="ok">✓</span> Link externo e fotos</div>
                    <div className="feature"><span className="ok">✓</span> Cupons e promoções da semana</div>
                  </div>
                  <button className="btn-mensal" disabled={paying === mensalPlan.id} onClick={() => handleAssinar(mensalPlan)}>
                    {paying === mensalPlan.id ? 'Aguarde...' : `Assinar por R$ ${fmtBRL(mensalPlan.value)}/mês`}
                  </button>
                </div>
              )}

              {semestralPlan && (
                <button className="discount-btn" disabled={paying === semestralPlan.id} onClick={() => handleAssinar(semestralPlan)}>
                  <div className="discount-left">
                    <div className="discount-title">Assine por 6 meses 👆</div>
                    <div className="discount-sub">R$ {fmtBRL(semestralPlan.value / 6)}/mês · Total R$ {fmtBRL(semestralPlan.value)}</div>
                  </div>
                  <div className="discount-badge">{paying === semestralPlan.id ? '...' : '10% OFF'}</div>
                </button>
              )}

              {anualPlan && (
                <button className="discount-btn" disabled={paying === anualPlan.id} onClick={() => handleAssinar(anualPlan)}>
                  <div className="discount-left">
                    <div className="discount-title">Assine por 1 ano 👆</div>
                    <div className="discount-sub">R$ {fmtBRL(anualPlan.value / 12)}/mês · Total R$ {fmtBRL(anualPlan.value)}</div>
                  </div>
                  <div className="discount-badge fire">{paying === anualPlan.id ? '...' : '20% OFF'}</div>
                </button>
              )}

              <div className="footer">
                <div className="footer-note">💠 Pagamento via Pix · Ativação imediata</div>
                <a href="/painel" className="back">← Voltar ao painel sem assinar</a>
              </div>
            </>
          )}
        </div>
      )}

      {pixData && (
        <div className="pix-overlay" onClick={() => setPixData(null)}>
          <div className="pix-modal" onClick={e => e.stopPropagation()}>
            <button className="pix-close" onClick={() => setPixData(null)}>×</button>
            <div className="pix-title">PAGUE COM <span>PIX</span></div>
            <div className="pix-plano">{pixData.plano} · R$ {fmtBRL(pixData.valor)}</div>
            {pixData.qr && (
              <div className="pix-qr-wrap">
                <img src={`data:image/png;base64,${pixData.qr}`} alt="QR Code Pix" className="pix-qr" />
              </div>
            )}
            <div className="pix-instr">Escaneie o QR Code ou copie o código abaixo no app do seu banco</div>
            {pixData.copy && (
              <div className="pix-copy-wrap">
                <input type="text" readOnly value={pixData.copy} className="pix-copy-input" />
                <button className="pix-copy-btn" onClick={copiarPix}>{copied ? '✓ Copiado' : 'Copiar'}</button>
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