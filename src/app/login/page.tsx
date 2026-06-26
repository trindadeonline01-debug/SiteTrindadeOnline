'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [erro, setErro]       = useState('')
  const [loading, setLoading] = useState(false)

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

    // Busca o tipo de usuário no banco
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', data.user.id)
      .single()

    // Redireciona conforme o tipo
    if (profile?.user_type === 'company') {
      window.location.href = '/painel'
    } else if (profile?.user_type === 'admin') {
      window.location.href = '/admin'
    } else {
      window.location.href = '/'
    }
    setLoading(false)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; }

        .auth-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
        }
        .auth-card {
          background: #fff;
          border-radius: 20px;
          padding: 36px 32px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 4px 24px rgba(0,0,0,.08);
        }
        .auth-logo {
          text-align: center;
          margin-bottom: 28px;
        }
        .auth-logo a {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 28px;
          letter-spacing: 2px;
          text-decoration: none;
          color: #111;
        }
        .auth-logo span { color: #C9951A; }
        .auth-title {
          font-size: 20px;
          font-weight: 700;
          color: #111;
          margin-bottom: 6px;
        }
        .auth-sub {
          font-size: 13px;
          color: #AAA;
          margin-bottom: 24px;
        }
        .field { margin-bottom: 14px; }
        .field label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #444;
          margin-bottom: 6px;
        }
        .field input {
          width: 100%;
          padding: 12px 14px;
          border: 1.5px solid #E0DDD8;
          border-radius: 11px;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          color: #222;
          background: #FAFAF8;
          outline: none;
          transition: border-color .15s;
        }
        .field input:focus { border-color: #C9951A; background: #fff; }
        .erro-msg {
          background: #FEF0F0;
          border: 1px solid #F5BCBC;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          color: #C0392B;
          margin-bottom: 14px;
        }
        .btn-primary {
          width: 100%;
          padding: 13px;
          background: #C9951A;
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: background .15s;
          margin-bottom: 16px;
        }
        .btn-primary:hover:not(:disabled) { background: #B8841A; }
        .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .auth-footer {
          text-align: center;
          font-size: 13px;
          color: #AAA;
          line-height: 2;
        }
        .auth-footer a {
          color: #C9951A;
          font-weight: 500;
          text-decoration: none;
        }
        .auth-footer a:hover { text-decoration: underline; }
      `}</style>

      <div className="auth-page">
        <div className="auth-card">

          <div className="auth-logo">
            <a href="/">TRINDADE <span>ONLINE</span></a>
          </div>

          <div className="auth-title">Bem-vindo de volta</div>
          <div className="auth-sub">Entre na sua conta para continuar</div>

          <form onSubmit={handleLogin}>
            <div className="field">
              <label>E-mail</label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Senha</label>
              <input
                type="password"
                placeholder="Sua senha"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
              />
            </div>

            {erro && <div className="erro-msg">⚠️ {erro}</div>}

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="auth-footer">
            Não tem conta? <a href="/cadastro">Criar conta grátis</a>
            <br />
            <a href="/cadastro?tipo=empresa">Cadastrar minha empresa →</a>
          </div>

        </div>
      </div>
    </>
  )
}