'use client'
import { useEffect, useState } from 'react'

const TOKEN_KEY = 'motoboy_session_token'

const STATUS_LABEL: Record<string, string> = {
  buscando_motoboy: 'Chamando motoboy', a_caminho: 'A caminho', entregue: 'Entregue', cancelada: 'Cancelada', sem_credito: 'Sem crédito',
}

function fmt(n: number) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',') }

interface PainelData {
  motoboy: { name: string; phone: string; pix_key: string | null; pix_key_type: string | null; status: string; available: boolean; has_password: boolean }
  entregasSemana: number; aReceber: number; jaRecebido: number
  recentOrders: { id: string; company_name: string; customer_name: string; status: string; fee: number; created_at: string; pago: boolean }[]
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

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
    if (saved) { setToken(saved); loadData(saved) }
  }, [])

  async function loadData(tok: string) {
    setLoadingData(true)
    const res = await fetch('/api/motoboy/painel', { headers: { Authorization: `Bearer ${tok}` } })
    if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); setToken(null); setLoadingData(false); return }
    const j = await res.json()
    setData(j)
    setPixKey(j.motoboy.pix_key || '')
    setPixType(j.motoboy.pix_key_type || 'celular')
    setLoadingData(false)
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
    loadData(j.token)
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
    loadData(j.token)
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
    .p-field-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #E0DDD8;font-size:13px;font-weight:600;}
    .p-field-row:last-child{border-bottom:none;}
    .p-field-edit{font-size:11px;color:var(--sign-dark);font-weight:800;cursor:pointer;flex:none;background:none;border:none;}
    .p-msg{text-align:center;font-size:12px;font-weight:700;color:#0F8A57;margin-bottom:10px;}
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
                  <div className="p-field"><label>Seu WhatsApp</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(21) 98123-4567" /></div>
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
                <div className="p-field"><label>Seu WhatsApp</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(21) 98123-4567" /></div>
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

        <div className="p-kpis">
          <div className="p-kpi"><div className="v">{data.entregasSemana}</div><div className="l">Essa semana</div></div>
          <div className="p-kpi"><div className="v" style={{ color: '#C97A0E' }}>{fmt(data.aReceber)}</div><div className="l">A receber</div></div>
          <div className="p-kpi"><div className="v" style={{ color: '#0F8A57' }}>{fmt(data.jaRecebido)}</div><div className="l">Já recebido</div></div>
        </div>

        <div className="p-card2">
          <div className="p-card2-hd">📦 Entregas recentes</div>
          {data.recentOrders.length === 0 && <div className="p-empty">Nenhuma entrega ainda.</div>}
          {data.recentOrders.map(o => (
            <div className="p-row" key={o.id}>
              <div className="p-row-mid">
                <div className="p-row-title">{o.company_name}</div>
                <div className="p-row-sub">{new Date(o.created_at).toLocaleDateString('pt-BR')} · {STATUS_LABEL[o.status] || o.status}</div>
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
    </div>
  )
}
