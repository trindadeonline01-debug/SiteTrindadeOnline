'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function CadastroForm() {
  const searchParams = useSearchParams()
  const tipoInicial  = searchParams.get('tipo') === 'empresa' ? 'empresa' : 'usuario'

  const [tipo, setTipo]           = useState(tipoInicial)
  const [nome, setNome]           = useState('')
  const [email, setEmail]         = useState('')
  const [senha, setSenha]         = useState('')
  const [confirma, setConfirma]   = useState('')
  const [bairro, setBairro]       = useState('Trindade')
  const [erro, setErro]           = useState('')
  const [loading, setLoading]     = useState(false)
  const [ok, setOk]               = useState(false)
  const [step, setStep]           = useState<'form'|'verify'>('form')
  const [code, setCode]           = useState('')
  const [pendingData, setPendingData] = useState<any>(null)

  // Força visual da senha
  function senhaForca() {
    if (senha.length === 0) return null
    if (senha.length < 6)  return { cor: '#E24B4A', label: 'Muito fraca', pct: '25%' }
    if (senha.length < 8)  return { cor: '#C9951A', label: 'Fraca',       pct: '50%' }
    if (senha.length < 12) return { cor: '#185FA5', label: 'Boa',         pct: '75%' }
    return                        { cor: '#0F8050', label: 'Forte',        pct: '100%' }
  }
  const forca = senhaForca()

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== confirma) { setErro('As senhas não coincidem.'); return }
    setLoading(true)
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
    const data = await res.json()
    setLoading(false)
    if (data.error) { setErro(data.error); return }
    setPendingData({ nome, email, senha, tipo, bairro })
    setStep('verify')
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingData.email, code })
    })
    const data = await res.json()
    if (data.error) { setErro(data.error); setLoading(false); return }
    const { error } = await supabase.auth.signUp({
      email: pendingData.email,
      password: pendingData.senha,
      options: { data: { name: pendingData.nome, user_type: pendingData.tipo === 'empresa' ? 'company' : 'user', neighborhood: pendingData.bairro } }
    })
    if (error) {
      setErro(error.message.includes('already registered') ? 'Este e-mail já está cadastrado.' : 'Erro ao criar conta.')
      setLoading(false); return
    }
    if (pendingData.tipo === 'empresa') {
      window.location.href = '/empresa/cadastrar'
    } else {
      setOk(true)
    }
    setLoading(false)
  }
    if (tipo === 'empresa') {
      window.location.href = '/empresa/cadastrar'
    } else {
      setOk(true)
    }
    setLoading(false)
  }

  if (ok) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>Conta criada!</div>
        <div style={{ fontSize: 13, color: '#888', lineHeight: 1.7, marginBottom: 24 }}>
          Bem-vindo ao Trindade Online, <strong>{nome}</strong>!
        </div>
        <a href="/" style={{ background: '#C9951A', color: '#fff', padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
          Explorar o Guia →
        </a>
      </div>
    )
  }

  if (step === 'verify') {
    return (
      <div style={{textAlign:'center',padding:'20px 0'}}>
        <div style={{fontSize:48,marginBottom:12}}>📧</div>
        <div style={{fontSize:20,fontWeight:700,color:'#111',marginBottom:8}}>Verifique seu email</div>
        <div style={{fontSize:13,color:'#888',lineHeight:1.7,marginBottom:24}}>
          Enviamos um código de 6 dígitos para<br/><strong>{pendingData?.email}</strong>
        </div>
        <form onSubmit={handleVerify}>
          <input type="text" inputMode="numeric" maxLength={6} value={code}
            onChange={e => setCode(e.target.value.replace(/[^0-9]/g,''))}
            placeholder="000000"
            style={{width:'100%',padding:'14px',textAlign:'center',fontSize:28,fontWeight:700,letterSpacing:12,border:'1.5px solid #E0DDD8',borderRadius:12,fontFamily:'Inter,sans-serif',marginBottom:12,outline:'none'}}
          />
          {erro && <div style={{color:'#E24B4A',fontSize:13,marginBottom:12}}>{erro}</div>}
          <button type="submit" disabled={loading || code.length < 6}
            style={{width:'100%',padding:'13px',background:code.length===6?'#C9951A':'#E0DDD8',color:code.length===6?'#fff':'#AAA',border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:code.length===6?'pointer':'not-allowed',fontFamily:'Inter,sans-serif',marginBottom:12}}>
            {loading ? 'Verificando...' : 'Confirmar código'}
          </button>
          <button type="button" onClick={() => { setStep('form'); setCode(''); setErro('') }}
            style={{width:'100%',padding:'10px',background:'transparent',color:'#AAA',border:'1px solid #ddd',borderRadius:12,fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif',marginBottom:8}}>
            ← Voltar
          </button>
          <button type="button" onClick={() => handleCadastro({preventDefault:()=>{}} as any)}
            style={{fontSize:12,color:'#C9951A',background:'none',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
            Reenviar código
          </button>
        </form>
      </div>
    )
  }
  return (
    <form onSubmit={handleCadastro}>

      {/* TIPO */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button type="button" onClick={() => setTipo('usuario')} style={{ flex:1, padding:'10px', borderRadius:10, border:'1.5px solid', borderColor:tipo==='usuario'?'#C9951A':'#E0DDD8', background:tipo==='usuario'?'#FEF3E2':'#FAFAF8', color:tipo==='usuario'?'#854F0B':'#888', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Inter, sans-serif' }}>
          👤 Sou morador
        </button>
        <button type="button" onClick={() => setTipo('empresa')} style={{ flex:1, padding:'10px', borderRadius:10, border:'1.5px solid', borderColor:tipo==='empresa'?'#C9951A':'#E0DDD8', background:tipo==='empresa'?'#FEF3E2':'#FAFAF8', color:tipo==='empresa'?'#854F0B':'#888', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Inter, sans-serif' }}>
          🏪 Tenho empresa
        </button>
      </div>

      {/* NOME */}
      <div className="field">
        <label>{tipo === 'empresa' ? 'Nome do responsável' : 'Nome ou apelido'}</label>
        <input type="text" placeholder="Como quer ser chamado" value={nome} onChange={e => setNome(e.target.value)} required />
      </div>

      {/* EMAIL */}
      <div className="field">
        <label>E-mail</label>
        <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
      </div>

      {/* SENHA */}
      <div className="field">
        <label>Senha</label>
        <input type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} required />
        {forca && (
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 4, background: '#F0EDE8', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: forca.pct, background: forca.cor, borderRadius: 2, transition: 'all .3s' }} />
            </div>
            <div style={{ fontSize: 11, color: forca.cor, marginTop: 3, fontWeight: 500 }}>{forca.label}</div>
          </div>
        )}
      </div>

      {/* CONFIRMAR SENHA */}
      <div className="field">
        <label>Confirmar senha</label>
        <input
          type="password"
          placeholder="Repita a senha"
          value={confirma}
          onChange={e => setConfirma(e.target.value)}
          required
          style={{ borderColor: confirma && senha !== confirma ? '#E24B4A' : confirma && senha === confirma ? '#0F8050' : '#E0DDD8' }}
        />
        {confirma && senha !== confirma && (
          <div style={{ fontSize: 11, color: '#E24B4A', marginTop: 4 }}>As senhas não coincidem</div>
        )}
        {confirma && senha === confirma && senha.length >= 6 && (
          <div style={{ fontSize: 11, color: '#0F8050', marginTop: 4 }}>✓ Senhas coincidem</div>
        )}
      </div>

      {/* BAIRRO */}
      <div className="field">
        <label>Bairro</label>
        <select value={bairro} onChange={e => setBairro(e.target.value)}
          style={{ width:'100%', padding:'12px 14px', border:'1.5px solid #E0DDD8', borderRadius:11, fontSize:14, fontFamily:'Inter, sans-serif', color:'#222', background:'#FAFAF8', outline:'none', cursor:'pointer' }}>
          <option>Trindade</option>
          <option>Alcântara</option>
          <option>Arsenal</option>
          <option>Boa Vista</option>
          <option>Colubande</option>
          <option>Coelho</option>
          <option>Engenho Pequeno</option>
          <option>Estrela do Norte</option>
          <option>Galo Branco</option>
          <option>Guaxindiba</option>
          <option>Itaoca</option>
          <option>Jardim Catarina</option>
          <option>Maria Paula</option>
          <option>Mutuá</option>
          <option>Neves</option>
          <option>Nova Cidade</option>
          <option>Paraíso</option>
          <option>Porto Velho</option>
          <option>Santa Catarina</option>
          <option>Vista Alegre</option>
          <option>Outro bairro de SG</option>
        </select>
      </div>

      {tipo === 'empresa' && (
        <div style={{ background:'#FEF3E2', border:'0.5px solid #F5C77A', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#854F0B', lineHeight:1.6 }}>
          ✅ Após criar sua conta, você será direcionado para cadastrar sua empresa gratuitamente por 30 dias.
        </div>
      )}

      {erro && <div className="erro-msg">⚠️ {erro}</div>}

      <button className="btn-primary" type="submit" disabled={loading}>
        {loading ? 'Criando conta...' : tipo === 'empresa' ? 'Criar conta e cadastrar empresa →' : 'Criar conta grátis'}
      </button>

      <div className="auth-footer">
        Já tem conta? <a href="/login">Fazer login</a>
      </div>
    </form>
  )
}

export default function CadastroPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; }
        .auth-page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; }
        .auth-card { background: #fff; border-radius: 20px; padding: 36px 32px; width: 100%; max-width: 420px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
        .auth-logo { text-align: center; margin-bottom: 28px; }
        .auth-logo a { font-family: 'Bebas Neue', sans-serif; font-size: 28px; letter-spacing: 2px; text-decoration: none; color: #111; }
        .auth-logo span { color: #C9951A; }
        .auth-title { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 6px; }
        .auth-sub { font-size: 13px; color: #AAA; margin-bottom: 24px; }
        .field { margin-bottom: 14px; }
        .field label { display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 6px; }
        .field input { width: 100%; padding: 12px 14px; border: 1.5px solid #E0DDD8; border-radius: 11px; font-size: 14px; font-family: 'Inter', sans-serif; color: #222; background: #FAFAF8; outline: none; transition: border-color .15s; }
        .field input:focus { border-color: #C9951A; background: #fff; }
        .erro-msg { background: #FEF0F0; border: 1px solid #F5BCBC; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #C0392B; margin-bottom: 14px; }
        .btn-primary { width: 100%; padding: 13px; background: #C9951A; color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; transition: background .15s; margin-bottom: 16px; }
        .btn-primary:hover:not(:disabled) { background: #B8841A; }
        .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .auth-footer { text-align: center; font-size: 13px; color: #AAA; }
        .auth-footer a { color: #C9951A; font-weight: 500; text-decoration: none; }
        .auth-footer a:hover { text-decoration: underline; }
      `}</style>

      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <a href="/">TRINDADE <span>ONLINE</span></a>
          </div>
          <div className="auth-title">Criar conta grátis</div>
          <div className="auth-sub">Faça parte da comunidade digital da Trindade</div>
          <Suspense fallback={<div>Carregando...</div>}>
            <CadastroForm />
          </Suspense>
        </div>
      </div>
    </>
  )
}