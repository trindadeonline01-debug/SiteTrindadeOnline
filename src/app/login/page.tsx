'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail]         = useState('')
  const [senha, setSenha]         = useState('')
  const [erro, setErro]           = useState('')
  const [loading, setLoading]     = useState(false)
  const [modo, setModo]           = useState<'login'|'reset'>('login')
  const [resetOk, setResetOk]     = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setErro('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', data.user.id)
      .single()

    if (profile?.user_type === 'company') {
      window.location.href = '/painel'
    } else if (profile?.user_type === 'admin') {
      window.location.href = '/admin'
    } else {
      window.location.href = '/'
    }
    setLoading(false)
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })

    if (error) {
      setErro('Não foi possível enviar o e-mail. Verifique o endereço.')
    } else {
      setResetOk(true)
    }
    setLoading(false)
  }

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
        .ok-msg { background: #EDFAF3; border: 1px solid #A8E6C4; border-radius: 10px; padding: 12px 14px; font-size: 13px; color: #0F5C3A; margin-bottom: 14px; line-height: 1.6; }
        .btn-primary { width: 100%; padding: 13px; background: #C9951A; color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; transition: background .15s; margin-bottom: 12px; }
        .btn-primary:hover:not(:disabled) { background: #B8841A; }
        .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .btn-link { width: 100%; padding: 10px; background: transparent; color: #888; border: 1.5px solid #E0DDD8; border-radius: 12px; font-size: 13px; font-family: 'Inter', sans-serif; cursor: pointer; transition: all .15s; margin-bottom: 16px; }
        .btn-link:hover { border-color: #CCC; color: #555; }
        .forgot-link { display: block; text-align: right; font-size: 12px; color: #C9951A; cursor: pointer; margin-bottom: 16px; font-weight: 500; background: none; border: none; font-family: 'Inter', sans-serif; }
        .forgot-link:hover { text-decoration: underline; }
        .auth-footer { text-align: center; font-size: 13px; color: #AAA; line-height: 2; }
        .auth-footer a { color: #C9951A; font-weight: 500; text-decoration: none; }
        .auth-footer a:hover { text-decoration: underline; }
      `}</style>

      <div className="auth-page">
        <div className="auth-card">

          <div className="auth-logo">
            <a href="/">TRINDADE <span>ONLINE</span></a>
          </div>

          {/* ── LOGIN ── */}
          {modo === 'login' && (
            <>
              <div className="auth-title">Bem-vindo de volta</div>
              <div className="auth-sub">Entre na sua conta para continuar</div>

              <form onSubmit={handleLogin}>
                <div className="field">
                  <label>E-mail</label>
                  <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Senha</label>
                  <input type="password" placeholder="Sua senha" value={senha} onChange={e => setSenha(e.target.value)} required />
                </div>

                <button type="button" className="forgot-link" onClick={() => { setModo('reset'); setErro('') }}>
                  Esqueci minha senha
                </button>

                {erro && <div className="erro-msg">⚠️ {erro}</div>}

                <button className="btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>

              <div className="auth-footer">
                Não tem conta? <a href="/cadastro">Criar conta grátis</a>
                <br/>
                <a href="/cadastro?tipo=empresa">Cadastrar minha empresa →</a>
              </div>
            </>
          )}

          {/* ── ESQUECI A SENHA ── */}
          {modo === 'reset' && !resetOk && (
            <>
              <div className="auth-title">Redefinir senha</div>
              <div className="auth-sub">Digite seu e-mail e enviaremos um link para criar uma nova senha.</div>

              <form onSubmit={handleReset}>
                <div className="field">
                  <label>E-mail cadastrado</label>
                  <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>

                {erro && <div className="erro-msg">⚠️ {erro}</div>}

                <button className="btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar link de redefinição'}
                </button>
                <button type="button" className="btn-link" onClick={() => { setModo('login'); setErro('') }}>
                  ← Voltar para o login
                </button>
              </form>
            </>
          )}

          {/* ── CONFIRMAÇÃO RESET ── */}
          {modo === 'reset' && resetOk && (
            <>
              <div style={{ textAlign:'center', padding:'16px 0' }}>
                <div style={{ fontSize:48, marginBottom:16 }}>📧</div>
                <div style={{ fontSize:18, fontWeight:700, color:'#111', marginBottom:8 }}>E-mail enviado!</div>
              </div>
              <div className="ok-msg">
                Enviamos um link para <strong>{email}</strong>.<br/>
                Clique no link do e-mail para criar uma nova senha.<br/>
                Verifique também a caixa de spam.
              </div>
              <button type="button" className="btn-link" onClick={() => { setModo('login'); setResetOk(false); setEmail('') }}>
                ← Voltar para o login
              </button>
            </>
          )}

        </div>
      </div>
    </>
  )
}