'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function RedefinirSenhaPage() {
  const [senha, setSenha]         = useState('')
  const [confirma, setConfirma]   = useState('')
  const [erro, setErro]           = useState('')
  const [loading, setLoading]     = useState(false)
  const [ok, setOk]               = useState(false)
  const [pronto, setPronto]       = useState(false)

  useEffect(() => {
    // Verifica se o link do e-mail é válido
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setPronto(true)
      else window.location.href = '/login'
    })
  }, [])

  async function handleRedefinir(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirma) {
      setErro('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: senha })

    if (error) {
      setErro('Não foi possível redefinir a senha. Tente solicitar um novo link.')
    } else {
      setOk(true)
      // Redireciona após 3 segundos
      setTimeout(() => window.location.href = '/', 3000)
    }
    setLoading(false)
  }

  if (!pronto) return null

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
        .btn-primary { width: 100%; padding: 13px; background: #C9951A; color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; transition: background .15s; }
        .btn-primary:hover:not(:disabled) { background: #B8841A; }
        .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .senha-strength { height: 4px; border-radius: 2px; margin-top: 6px; transition: all .3s; }
      `}</style>

      <div className="auth-page">
        <div className="auth-card">

          <div className="auth-logo">
            <a href="/">TRINDADE <span>ONLINE</span></a>
          </div>

          {!ok ? (
            <>
              <div className="auth-title">Nova senha</div>
              <div className="auth-sub">Digite sua nova senha abaixo.</div>

              <form onSubmit={handleRedefinir}>
                <div className="field">
                  <label>Nova senha</label>
                  <input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    required
                  />
                  {/* Barra de força da senha */}
                  {senha.length > 0 && (
                    <div className="senha-strength" style={{
                      width: '100%',
                      background: senha.length < 6 ? '#E24B4A' : senha.length < 10 ? '#C9951A' : '#0F8050'
                    }} />
                  )}
                </div>
                <div className="field">
                  <label>Confirmar nova senha</label>
                  <input
                    type="password"
                    placeholder="Repita a senha"
                    value={confirma}
                    onChange={e => setConfirma(e.target.value)}
                    required
                  />
                </div>

                {erro && <div className="erro-msg">⚠️ {erro}</div>}

                <button className="btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          ) : (
            <div style={{ textAlign:'center', padding:'16px 0' }}>
              <div style={{ fontSize:56, marginBottom:16 }}>🎉</div>
              <div style={{ fontSize:20, fontWeight:700, color:'#111', marginBottom:8 }}>Senha redefinida!</div>
              <div style={{ fontSize:13, color:'#AAA', lineHeight:1.7 }}>
                Sua senha foi alterada com sucesso.<br/>
                Redirecionando para o início...
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}