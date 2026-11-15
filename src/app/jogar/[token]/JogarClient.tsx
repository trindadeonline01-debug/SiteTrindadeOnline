'use client'
import { useCallback, useEffect, useState } from 'react'

type Oferta = { premiada: boolean; valorTxt: string | null; jogoUsado: 'quiz' | 'caca' | null; vencida: boolean } | null
type Estado = { ativo: boolean; slug?: string; loja?: string; jogador?: { apelido: string } | null; premio?: boolean; oferta?: Oferta }

const API = '/api/mesa/quiz'

export default function JogarClient({ token, caca }: { token: string; caca: boolean }) {
  const TK = `pedido:${token}`
  const LS = `quizjt:${TK}`
  const [est, setEst] = useState<Estado | null>(null)
  const [erro, setErro] = useState('')
  const [passo, setPasso] = useState<'dados' | 'codigo'>('dados')
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [cod, setCod] = useState('')
  const [maior, setMaior] = useState(false)
  const [aceite, setAceite] = useState(false)
  const [busy, setBusy] = useState(false)

  const jt = () => { try { return localStorage.getItem(LS) || '' } catch { return '' } }
  const call = useCallback(async (acao: string, extra: Record<string, unknown> = {}) => {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, token: TK, jt: jt(), ...extra }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'Não consegui agora. Tente de novo.')
    return d
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TK])

  const carregar = useCallback(() => {
    call('estado').then(async d => {
      // O link chegou no WhatsApp do pedido: o número já é do cliente, então entra direto (sem código).
      if (d.ativo && !d.jogador && d.slug) {
        try {
          const r1 = await fetch('/api/jogos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'ident_link', slug: d.slug, p: token }) })
          const i = await r1.json()
          if (r1.ok && i.token) {
            try { localStorage.setItem('trindade_ident', JSON.stringify({ nome: i.nome, telefone: i.telefone, token: i.token })) } catch {}
            const c = await call('cadastro_ident', { ident: i.token, idade: true, aceite: true })
            try { localStorage.setItem(LS, c.jt) } catch {}
            d = await call('estado')
          }
        } catch { /* cai no cadastro com código */ }
      }
      setEst(d)
    }).catch(e => setErro(e.message === 'Mesa não encontrada.' ? 'Este link não existe ou não está mais ativo.' : e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, token])
  useEffect(() => { carregar() }, [carregar])
  // Conta o acesso ao link (1 vez por aba) para o monitor em admin → Jogos.
  useEffect(() => {
    try { if (sessionStorage.getItem('jgp:' + token)) return; sessionStorage.setItem('jgp:' + token, '1') } catch {}
    fetch('/api/jogos/abriu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p: token }) }).catch(() => {})
  }, [token])

  async function enviar() {
    setErro('')
    if (nome.trim().length < 3) return setErro('Digite seu nome (pelo menos 3 letras).')
    if (tel.replace(/\D/g, '').length < 10) return setErro('Confira o WhatsApp: DDD mais o número.')
    if (!maior) return setErro('Os jogos são para maiores de 18 anos.')
    if (!aceite) return setErro('Para jogar, aceite aparecer no ranking com seu nome.')
    setBusy(true)
    try {
      const d = await call('cadastro_enviar', { apelido: nome.trim().slice(0, 16), telefone: tel, idade: true, aceite: true })
      if (d.jaCadastrado) setNome(d.jaCadastrado)
      setPasso('codigo')
    } catch (e) { setErro((e as Error).message) } finally { setBusy(false) }
  }
  async function verificar() {
    setErro('')
    if (cod.replace(/\D/g, '').length !== 6) return setErro('Digite os 6 números do código.')
    setBusy(true)
    try {
      const d = await call('cadastro_verificar', { telefone: tel, codigo: cod, apelido: nome.trim().slice(0, 16) })
      try { localStorage.setItem(LS, d.jt) } catch {}
      carregar()
    } catch (e) { setErro((e as Error).message) } finally { setBusy(false) }
  }

  const o = est?.oferta
  const aviso = !est ? null
    : o?.premiada ? { ok: true, t: `🎁 Você ganhou ${o.valorTxt} de cashback`, s: 'Já está no seu saldo para a próxima compra. Pode continuar jogando pelo ranking.' }
    : est.premio ? { ok: true, t: 'Sua primeira jogada vale cashback', s: 'Escolha o Quiz ou o Caça-Palavras. Só a primeira rodada que você começar vale prêmio, então capriche! O bônus garantido cai no seu saldo na hora.' }
    : o?.vencida ? { ok: false, t: 'Este link venceu', s: 'Os jogos continuam valendo para o ranking da loja.' }
    : o?.jogoUsado ? { ok: false, t: 'A jogada que valia cashback já foi usada', s: 'Desta vez não deu prêmio. No próximo pedido tem mais! Os jogos continuam valendo para o ranking.' }
    : est.jogador ? { ok: false, t: 'Esta jogada vale só ranking', s: 'O cashback do link é só para o WhatsApp do pedido, e cada WhatsApp ganha 1 prêmio a cada 7 dias.' }
    : null

  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #3A3A3A', background: '#111', color: '#F0EDE8', fontSize: 16, boxSizing: 'border-box' }
  const btn: React.CSSProperties = { width: '100%', padding: '14px 16px', borderRadius: 12, border: 0, background: '#C9951A', color: '#111', fontWeight: 700, fontSize: 16, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block' }

  return (
    <main style={{ minHeight: '100vh', background: '#111111', color: '#F0EDE8', padding: '24px 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🎣</div>
          <h1 style={{ fontFamily: '"Bebas Neue", Inter, sans-serif', fontSize: 36, letterSpacing: '.02em', color: '#C9951A', margin: '6px 0 2px' }}>Jogue e ganhe cashback</h1>
          {est?.loja && <p style={{ margin: 0, opacity: .8 }}>{est.loja.trim()}</p>}
        </div>

        {erro && !est && <p role="alert" style={{ color: '#F87171', textAlign: 'center' }}>{erro}</p>}
        {!est && !erro && <p style={{ textAlign: 'center', opacity: .7 }}>Carregando…</p>}
        {est && !est.ativo && <p style={{ textAlign: 'center' }}>Os jogos não estão ligados nesta loja agora.</p>}

        {est?.ativo && !est.jogador && (
          <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 16, padding: 20, display: 'grid', gap: 12 }}>
            {passo === 'dados' ? (
              <>
                <p style={{ margin: 0, lineHeight: 1.5 }}>Confirme seu WhatsApp para jogar. Use o <b>mesmo número do pedido</b>: é nele que o cashback entra.</p>
                <input style={inp} placeholder="Seu nome" maxLength={16} value={nome} onChange={e => setNome(e.target.value)} />
                <input style={inp} placeholder="WhatsApp com DDD" inputMode="tel" value={tel} onChange={e => setTel(e.target.value)} />
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={maior} onChange={e => setMaior(e.target.checked)} /> Tenho 18 anos ou mais</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} /> Aceito aparecer no ranking com meu nome</label>
                <button style={btn} disabled={busy} onClick={enviar}>{busy ? 'Enviando…' : 'Enviar código no WhatsApp'}</button>
              </>
            ) : (
              <>
                <p style={{ margin: 0 }}>Enviamos 6 números para o seu WhatsApp. Vale por 10 minutos.</p>
                <input style={{ ...inp, fontSize: 24, letterSpacing: '.3em', textAlign: 'center' }} inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="000000" value={cod} onChange={e => setCod(e.target.value)} />
                <button style={btn} disabled={busy} onClick={verificar}>{busy ? 'Confirmando…' : 'Confirmar'}</button>
                <button style={{ ...btn, background: 'transparent', color: '#C9951A', border: '1px solid #C9951A' }} onClick={() => { setPasso('dados'); setCod(''); setErro('') }}>Trocar o número</button>
              </>
            )}
            {erro && <p role="alert" style={{ color: '#F87171', margin: 0 }}>{erro}</p>}
          </div>
        )}

        {est?.ativo && est.jogador && (
          <>
            {aviso && (
              <div style={{ background: aviso.ok ? '#2A2110' : '#1A1A1A', border: `1px solid ${aviso.ok ? '#C9951A' : '#2A2A2A'}`, borderRadius: 16, padding: 16 }}>
                <b style={{ display: 'block', fontSize: 17 }}>{aviso.t}</b>
                <span style={{ opacity: .85, lineHeight: 1.5 }}>{aviso.s}</span>
              </div>
            )}
            <p style={{ margin: 0, opacity: .7, textAlign: 'center' }}>Jogando como <b>{est.jogador.apelido}</b></p>
            <a style={btn} href={`/jogar/${token}/quiz`}>🧠 Quiz Pesca Premiada</a>
            {caca && <a style={btn} href={`/jogar/${token}/caca`}>🔤 Caça-Palavras</a>}
            <a style={{ ...btn, background: 'transparent', color: '#C9951A', border: '1px solid #C9951A' }} href="/meu-cashback">Ver meu saldo</a>
          </>
        )}
      </div>
    </main>
  )
}
