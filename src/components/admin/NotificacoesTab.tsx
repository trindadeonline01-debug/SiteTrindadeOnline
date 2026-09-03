'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const EVENTOS = [
  { key: 'notify_new_coupon', label: 'Novo cupom publicado', desc: 'Notifica moradores quando uma empresa criar um cupom' },
  { key: 'notify_new_promo', label: 'Nova promoção publicada', desc: 'Notifica moradores quando uma empresa criar uma promoção' },
  { key: 'notify_new_company', label: 'Nova empresa cadastrada', desc: 'Notifica moradores quando uma nova empresa entrar no site' },
]

export default function NotificacoesTab() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [target, setTarget] = useState<'all'|'user'|'company'>('all')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{sent:number,total:number}|null>(null)
  const [flags, setFlags] = useState<Record<string,boolean>>({})
  const [savingFlags, setSavingFlags] = useState(false)

  useEffect(() => { loadFlags() }, [])

  async function loadFlags() {
    const { data } = await supabase.from('feature_flags').select('key,enabled').in('key', EVENTOS.map(e => e.key))
    if (data) setFlags(Object.fromEntries(data.map((f:any) => [f.key, f.enabled])))
  }

  async function toggleFlag(key: string) {
    setSavingFlags(true)
    const newVal = !flags[key]
    setFlags(f => ({ ...f, [key]: newVal }))
    const { data } = await supabase.from('feature_flags').select('id').eq('key', key).maybeSingle()
    if (data) await supabase.from('feature_flags').update({ enabled: newVal }).eq('key', key)
    else await supabase.from('feature_flags').insert({ key, enabled: newVal })
    setSavingFlags(false)
  }

  const TARGET_LABEL: Record<typeof target, string> = { all: 'TODOS os moradores e empresas', user: 'todos os moradores', company: 'todas as empresas' }

  async function sendNotification() {
    if (!title.trim() || !body.trim()) return
    // Notificação push manual dispara na hora, sem preview de quantos
    // dispositivos vai atingir — um clique errado manda pra base inteira.
    if (!confirm(`Enviar essa notificação push para ${TARGET_LABEL[target]} agora?`)) return
    setSending(true); setResult(null)
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, target })
      })
      const data = await res.json()
      setResult(data); setTitle(''); setBody('')
    } catch {}
    setSending(false)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{background:'#fff',border:'0.5px solid #EDE8E0',borderRadius:14,overflow:'hidden'}}>
        <div style={{padding:'14px 18px',borderBottom:'0.5px solid #F0EDE8'}}>
          <span style={{fontFamily:"'Archivo',sans-serif",fontWeight:700,fontSize:12,color:'#888',letterSpacing:.8,textTransform:'uppercase'}}>📢 DISPARAR NOTIFICAÇÃO MANUAL</span>
        </div>
        <div style={{padding:'16px 18px',display:'flex',flexDirection:'column',gap:12}}>
          <div>
            <label style={{fontSize:12,fontWeight:600,color:'#444',display:'block',marginBottom:6}}>DESTINATÁRIOS</label>
            <div style={{display:'flex',gap:8}}>
              {([['all','🌍 Todos','#185FA5'],['user','👤 Moradores','#0F8050'],['company','🏪 Empresas','#A87200']] as const).map(([val,lbl,color]) => (
                <button key={val} onClick={()=>setTarget(val)}
                  style={{flex:1,padding:'10px 8px',borderRadius:10,border:`2px solid ${target===val?color:'#E0DDD8'}`,background:target===val?`${color}15`:'#FAFAF8',fontSize:12,fontWeight:600,color:target===val?color:'#888',cursor:'pointer',fontFamily:'Archivo,sans-serif'}}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{fontSize:12,fontWeight:600,color:'#444',display:'block',marginBottom:6}}>TÍTULO</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex: Novidade no Trindade Online!"
              style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Archivo,sans-serif',outline:'none'}}/>
          </div>
          <div>
            <label style={{fontSize:12,fontWeight:600,color:'#444',display:'block',marginBottom:6}}>MENSAGEM</label>
            <textarea value={body} onChange={e=>setBody(e.target.value)} rows={3} placeholder="Ex: Confira os novos cupons disponíveis no bairro!"
              style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:10,fontSize:13,fontFamily:'Archivo,sans-serif',outline:'none',resize:'none'}}/>
          </div>
          <button onClick={sendNotification} disabled={sending||!title.trim()||!body.trim()}
            style={{padding:'12px',background:sending||!title.trim()||!body.trim()?'#E0DDD8':'var(--sign)',color:sending||!title.trim()||!body.trim()?'#AAA':'var(--ink)',border:'none',borderRadius:10,fontSize:14,fontWeight:700,cursor:sending?'not-allowed':'pointer',fontFamily:'Archivo,sans-serif'}}>
            {sending ? 'Enviando...' : '🔔 Enviar notificação'}
          </button>
          {result && (
            <div style={{background:'#EDFAF3',border:'1px solid #A8E6C4',borderRadius:10,padding:'12px 16px',fontSize:13,color:'#0F5C3A',fontWeight:600}}>
              Enviado para {result.sent} de {result.total} dispositivos
            </div>
          )}
        </div>
      </div>
      <div style={{background:'#fff',border:'0.5px solid #EDE8E0',borderRadius:14,overflow:'hidden'}}>
        <div style={{padding:'14px 18px',borderBottom:'0.5px solid #F0EDE8',display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontFamily:"'Archivo',sans-serif",fontWeight:700,fontSize:12,color:'#888',letterSpacing:.8,textTransform:'uppercase'}}>⚙️ NOTIFICAÇÕES AUTOMÁTICAS</span>
          {savingFlags && <span style={{fontSize:11,color:'var(--sign-dark)'}}>Salvando...</span>}
        </div>
        <div style={{padding:'16px 18px',display:'flex',flexDirection:'column',gap:10}}>
          {EVENTOS.map(ev => (
            <div key={ev.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'12px 14px',background:'#FAFAF8',borderRadius:10,border:'0.5px solid #E0DDD8'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'#111',marginBottom:2}}>{ev.label}</div>
                <div style={{fontSize:11,color:'#AAA'}}>{ev.desc}</div>
              </div>
              <div onClick={()=>toggleFlag(ev.key)}
                style={{width:44,height:24,borderRadius:12,background:flags[ev.key]?'var(--sign-dark)':'#E0DDD8',cursor:'pointer',position:'relative',transition:'background .2s',flexShrink:0}}>
                <div style={{position:'absolute',top:2,left:flags[ev.key]?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 4px rgba(0,0,0,.2)'}}/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
