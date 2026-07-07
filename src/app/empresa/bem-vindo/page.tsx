'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function BemVindoPage() {
  const router = useRouter()
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [trialEnabled, setTrialEnabled] = useState(false)
  const [trialDays, setTrialDays] = useState(7)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const { data } = await supabase.from('companies').select('name').eq('owner_id', session.user.id).single()
      if (data) setNomeEmpresa(data.name)
    })
    supabase.from('site_settings').select('key,value').then(({ data }) => {
      if (data) {
        const enabled = data.find((s: any) => s.key === 'trial_enabled')
        const days = data.find((s: any) => s.key === 'trial_days')
        if (enabled) setTrialEnabled(enabled.value === 'true')
        if (days) setTrialDays(Number(days.value) || 7)
      }
    })
  }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #111; font-family: 'Inter', sans-serif; }
        .wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 20px; text-align: center; }
        .logo { font-family: 'Bebas Neue', sans-serif; font-size: 28px; color: #fff; letter-spacing: 3px; margin-bottom: 4px; }
        .logo span { color: #C9951A; }
        .divider { width: 40px; height: 2px; background: #C9951A; margin: 16px auto; }
        .badge { font-size: 11px; font-weight: 700; color: #C9951A; letter-spacing: 1px; margin-bottom: 12px; }
        .title { font-family: 'Bebas Neue', sans-serif; font-size: 36px; color: #fff; letter-spacing: 2px; line-height: 1.1; margin-bottom: 16px; }
        .desc { font-size: 15px; color: #aaa; max-width: 400px; line-height: 1.7; margin-bottom: 32px; }
        .btn { background: #C9951A; color: #111; border: none; border-radius: 10px; padding: 16px 40px; font-size: 16px; font-weight: 800; cursor: pointer; font-family: 'Inter', sans-serif; }
        .btn:hover { background: #B8841A; }
        .note { font-size: 12px; color: #555; margin-top: 16px; }
        .skip { margin-top: 20px; font-size: 12px; color: #666; text-decoration: none; }
        .skip:hover { color: #C9951A; }
      `}</style>
      <div className="wrap">
        <div className="logo">TRINDADE <span>ONLINE</span></div>
        <div className="divider" />
        <div className="badge">CADASTRO CONCLUÍDO</div>
        <div className="title">SEU NEGÓCIO ESTÁ<br/>QUASE NO AR!</div>
        <div className="desc">
          {nomeEmpresa ? `"${nomeEmpresa}" foi cadastrado com sucesso. ` : ''}
          {trialEnabled
            ? `Você tem ${trialDays} dias grátis para testar. Escolha um plano quando quiser.`
            : 'Escolha um plano para que sua empresa apareça para todos os moradores da Trindade.'}
        </div>
        <button className="btn" onClick={() => router.push('/empresa/planos')}>
          {trialEnabled ? 'Ver planos disponíveis →' : 'Escolher meu plano →'}
        </button>
        <div className="note">Pagamento via Pix · Ativação imediata</div>
        {trialEnabled && (
          <a className="skip" href="/painel">Usar o período de teste primeiro →</a>
        )}
      </div>
    </>
  )
}
