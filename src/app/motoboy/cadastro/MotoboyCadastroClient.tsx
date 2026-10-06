'use client'
import { useEffect, useRef, useState } from 'react'
import { MOTOBOY_TERMS_SECTIONS } from '@/lib/motoboyTerms'
import { compressImage } from '@/lib/compressImage'

// Cadastro guardado no sessionStorage a cada mudança e restaurado ao abrir
// a página — tirar foto pela câmera do celular manda o navegador pro app
// nativo da câmera, e ao voltar o Safari/Chrome mobile às vezes recarrega a
// aba do zero (pressão de memória), o que apagava tudo (nome, CPF, fotos já
// tiradas) sem aviso nenhum e obrigava recomeçar do zero.
//
// NUNCA inclui as fotos em base64 aqui — elas sozinhas já passam de 2-3MB
// juntas, e esse efeito reserializa o rascunho INTEIRO a cada troca de
// campo (até digitar uma letra no nome). Era exatamente isso que causava
// "memória insuficiente" bem na hora de tirar a foto (achado real do
// Ricardo, out/2026): comprimir a foto já pesa sozinho, e logo em seguida
// o app tentava escrever vários MB de base64 no sessionStorage de novo —
// dobrando a pressão de memória no pior momento possível, no aparelho mais
// fraco que já tem dificuldade de sobra pra isso. Só os campos de texto,
// leves de verdade, valem a pena persistir.
const DRAFT_KEY = 'motoboy_cadastro_draft_v2'
type Draft = {
  fieldStep: number; nome: string; cpf: string; endereco: string; email: string; whatsapp: string
  pixKey: string; pixType: string; nomeDigitado: string
}

type PhotoKey = 'cnh' | 'moto_frente' | 'moto_tras' | 'documento_moto' | 'selfie'
const PHOTO_SLOTS: { key: PhotoKey; label: string; hint?: string; icon: string }[] = [
  { key: 'cnh', label: 'Foto da sua CNH', hint: 'Foto ou PDF (CNH Digital)', icon: '🪪' },
  { key: 'moto_frente', label: 'Foto da moto — frente', icon: '🏍️' },
  { key: 'moto_tras', label: 'Foto da moto — trás', hint: 'Com a placa legível', icon: '🔢' },
  { key: 'documento_moto', label: 'Documento da moto', hint: 'Foto ou PDF (CRLV-e)', icon: '📄' },
  { key: 'selfie', label: 'Uma selfie sua', icon: '🤳' },
]
const PIX_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Celular', value: 'celular' },
  { label: 'CPF', value: 'cpf' },
  { label: 'E-mail', value: 'email' },
  { label: 'Aleatória', value: 'aleatoria' },
]

// Mapa fixo de cada uma das 14 telas pra sua etapa macro (1-5) e sua posição
// dentro dela — alimenta a barra de etapas + os pontinhos do cabeçalho.
// Sem herdar o `step` antigo (1-6): aqui cada CAMPO é a própria tela, não
// cada grupo de campos — é a mudança pedida pelo Ricardo, out/2026: "um
// campo por vez", não "aquela lista corrida".
const STEP_META: { stage: number; pos: number; stageLen: number }[] = [
  { stage: 1, pos: 1, stageLen: 5 }, { stage: 1, pos: 2, stageLen: 5 }, { stage: 1, pos: 3, stageLen: 5 },
  { stage: 1, pos: 4, stageLen: 5 }, { stage: 1, pos: 5, stageLen: 5 },
  { stage: 2, pos: 1, stageLen: 1 },
  { stage: 3, pos: 1, stageLen: 5 }, { stage: 3, pos: 2, stageLen: 5 }, { stage: 3, pos: 3, stageLen: 5 },
  { stage: 3, pos: 4, stageLen: 5 }, { stage: 3, pos: 5, stageLen: 5 },
  { stage: 4, pos: 1, stageLen: 2 }, { stage: 4, pos: 2, stageLen: 2 },
  { stage: 5, pos: 1, stageLen: 1 },
]
const STAGE_LABELS = ['Seus dados', 'Confirmação', 'Documentos', 'Pix', 'Termo']
const TOTAL_STEPS = STEP_META.length
const SUCCESS_STEP = TOTAL_STEPS + 1

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
function normNome(s: string) { return (s || '').trim().toLowerCase().replace(/\s+/g, ' ') }

export default function MotoboyCadastroClient() {
  const [fieldStep, setFieldStep] = useState(1)
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [endereco, setEndereco] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [code, setCode] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [photos, setPhotos] = useState<Record<PhotoKey, string | null>>({ cnh: null, moto_frente: null, moto_tras: null, documento_moto: null, selfie: null })
  const [pixKey, setPixKey] = useState('')
  const [pixType, setPixType] = useState('celular')
  const [nomeDigitado, setNomeDigitado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const fileInputs = useRef<Record<PhotoKey, HTMLInputElement | null>>({ cnh: null, moto_frente: null, moto_tras: null, documento_moto: null, selfie: null })
  const hydrated = useRef(false)

  // Restaura o rascunho (se tiver) assim que a página monta — cobre tanto
  // reload forçado pelo navegador (câmera) quanto o usuário só fechar a
  // aba sem querer no meio do cadastro. Fotos nunca são persistidas (ver
  // comentário no tipo Draft) — se o rascunho tinha parado em qualquer tela
  // de documentos, Pix ou termo (etapa 3+), volta pra primeira foto (etapa
  // 3) em vez de seguir adiante sem foto nenhuma.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d: Draft = JSON.parse(raw)
        const meta = STEP_META[Math.min(d.fieldStep, TOTAL_STEPS) - 1]
        const restored = meta && meta.stage >= 3 ? 7 : Math.min(d.fieldStep, TOTAL_STEPS)
        setFieldStep(Math.max(1, restored))
        setNome(d.nome); setCpf(d.cpf); setEndereco(d.endereco); setEmail(d.email); setWhatsapp(d.whatsapp)
        setPixKey(d.pixKey); setPixType(d.pixType || 'celular'); setNomeDigitado(d.nomeDigitado)
      }
    } catch {}
    hydrated.current = true
  }, [])

  // Salva a cada mudança — só depois de já ter tentado restaurar (senão o
  // primeiro render com os valores em branco sobrescreveria o rascunho
  // salvo antes mesmo de ler ele).
  useEffect(() => {
    if (!hydrated.current) return
    try {
      const draft: Draft = { fieldStep, nome, cpf, endereco, email, whatsapp, pixKey, pixType, nomeDigitado }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {}
  }, [fieldStep, nome, cpf, endereco, email, whatsapp, pixKey, pixType, nomeDigitado])

  function goBack() {
    setErro(''); setCodeError('')
    setFieldStep(s => Math.max(1, s - 1))
  }

  async function enviarCodigo() {
    // Sem essa trava, o link "Reenviar código" deixava disparar vários
    // POSTs seguidos num toque duplo/ansioso (achado real, set/2026: um
    // motoboy mandou 10 pedidos de código em 2 minutos sem nenhum chegar) —
    // cada um gera uma chamada nova pra Evolution API à toa, sem ajudar em
    // nada quando o problema é a instância, não a quantidade de tentativas.
    if (sendingCode || resendCooldown > 0) return
    setCodeError('')
    if (!nome.trim() || !cpf.trim() || !endereco.trim() || !whatsapp.trim()) { setErro('Preenche todos os campos obrigatórios.'); return }
    setErro('')
    setSendingCode(true)
    const res = await fetch('/api/motoboy/enviar-codigo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: whatsapp, purpose: 'cadastro' }),
    })
    const data = await res.json()
    setSendingCode(false)
    // Precisa marcar os dois — esse mesmo botão manda o código tanto saindo
    // da tela do WhatsApp (que mostra "erro") quanto no "Reenviar código" da
    // etapa de confirmação (que só mostra "codeError"); sem isso, uma falha
    // no reenvio ficava muda pro usuário, mesmo com o erro já sendo
    // devolvido pela API.
    if (data.error) { setErro(data.error); setCodeError(data.error); return }
    setResendCooldown(30)
    setFieldStep(6)
  }

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function confirmarCodigo(codeVal: string) {
    setCodeError('')
    setVerifyingCode(true)
    const res = await fetch('/api/motoboy/verificar-codigo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: whatsapp, code: codeVal, purpose: 'cadastro' }),
    })
    const data = await res.json()
    setVerifyingCode(false)
    if (data.error) { setCodeError(data.error); return }
    setFieldStep(7)
  }

  async function onPickPhoto(key: PhotoKey, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotos(p => ({ ...p, [key]: null }))
    setErro('')
    try {
      // Foto direto da câmera do celular pode vir com vários MB — as 5
      // juntas sem comprimir passavam fácil do limite de corpo de
      // requisição do servidor (~4,5MB) e o envio final ficava travado em
      // "Enviando..." pra sempre, sem erro nenhum. Mantém resolução
      // suficiente pra ler CNH/placa (1280px), só reduz o peso do arquivo.
      const compressed = await compressImage(file, 0.4, 1280)
      const b64 = await readFileAsBase64(compressed)
      setPhotos(p => ({ ...p, [key]: b64 }))
      // Avança sozinho — cada foto é a própria tela, então assim que ela
      // é aceita não tem motivo pra esperar um toque extra em "Continuar".
      setTimeout(() => setFieldStep(s => s + 1), 420)
    } catch (err: any) {
      setErro(err?.message || 'Não deu pra processar essa foto — tenta outra.')
    }
  }

  const nomeConfere = normNome(nomeDigitado) === normNome(nome)

  async function enviarCadastro() {
    setErro('')
    setEnviando(true)
    // Antes, um erro de rede/corpo grande demais aqui derrubava a função
    // sem nunca chegar no setEnviando(false) — o botão ficava preso em
    // "Enviando..." pro resto da vida, sem nenhum aviso.
    try {
      const res = await fetch('/api/motoboy/cadastrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome, cpf, endereco, email, phone: whatsapp,
          cnh_base64: photos.cnh, moto_frente_base64: photos.moto_frente, moto_tras_base64: photos.moto_tras,
          documento_moto_base64: photos.documento_moto, selfie_base64: photos.selfie,
          pix_key: pixKey, pix_key_type: pixType, nome_digitado: nomeDigitado,
        }),
      })
      const data = await res.json().catch(() => ({ error: `O servidor respondeu algo inesperado (status ${res.status}). Tenta de novo.` }))
      if (data.error) { setErro(data.error); return }
      try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
      setFieldStep(SUCCESS_STEP)
    } catch (err: any) {
      setErro(err?.message || 'Não deu pra enviar o cadastro agora — confere sua internet e tenta de novo.')
    } finally {
      setEnviando(false)
    }
  }

  function restart() {
    setFieldStep(1); setErro(''); setCodeError('')
  }

  const meta = fieldStep <= TOTAL_STEPS ? STEP_META[fieldStep - 1] : null
  const done = fieldStep > TOTAL_STEPS

  function requireThenAdvance(val: string, msg = 'Preenche esse campo pra continuar.') {
    if (!val.trim()) { setErro(msg); return }
    setErro('')
    setFieldStep(s => s + 1)
  }

  function onCpfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
    setCpf(digits)
    setErro('')
    if (digits.length === 11) setTimeout(() => setFieldStep(s => s + 1), 220)
  }
  function onCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    setCodeError('')
    if (digits.length === 6) confirmarCodigo(digits)
  }
  function pickPixType(value: string) {
    setPixType(value)
    setTimeout(() => setFieldStep(s => s + 1), 260)
  }

  return (
    <div className="mw-stage">
      <style>{`
        .mw-stage{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:28px 18px;box-sizing:border-box;background:linear-gradient(180deg,#F6F4EF 0%,#ECE8E0 100%);font-family:'Archivo',sans-serif;color:var(--ink);}
        .mw-brand{font-family:'Anton',sans-serif;font-size:12px;letter-spacing:.6px;color:#B6AF9F;text-transform:uppercase;text-align:center;}
        .mw-brand span{color:var(--sign-dark);}
        .mw-card{width:100%;max-width:380px;background:#fff;border-radius:22px;box-shadow:0 28px 54px -16px rgba(21,18,16,.28), 0 0 0 1px rgba(21,18,16,.05);padding:26px 24px 22px;}
        .mw-headrow{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
        .mw-back{width:28px;height:28px;border-radius:50%;border:1.5px solid #E0DDD8;background:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;flex:none;color:var(--ink);padding:0;}
        .mw-back.hidden{visibility:hidden;}
        .mw-eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--sign-dark);line-height:1.3;}
        .mw-counter{margin-left:auto;font-size:10.5px;font-weight:700;color:#8A8478;flex:none;}
        .mw-stagebar{display:flex;gap:4px;margin-bottom:9px;}
        .mw-stageseg{height:4px;flex:1;border-radius:3px;background:#E0DDD8;}
        .mw-stageseg.on{background:var(--sign);}
        .mw-dots{display:flex;gap:5px;justify-content:flex-end;margin-bottom:18px;}
        .mw-dot{width:6px;height:6px;border-radius:50%;background:#E0DDD8;}
        .mw-dot.on{background:var(--sign-dark);}
        .mw-q{font-family:'Anton',sans-serif;font-size:22px;line-height:1.25;letter-spacing:.2px;margin:0 0 7px;}
        .mw-hint{font-size:12.5px;color:#8A8478;line-height:1.55;margin-bottom:18px;}
        .mw-input{width:100%;padding:14px 15px;border:1.5px solid #E0DDD8;border-radius:12px;font-size:15px;font-family:inherit;color:var(--ink);background:#FAFAF8;outline:none;box-sizing:border-box;}
        .mw-input:focus{border-color:var(--sign-dark);}
        .mw-otp{width:100%;padding:17px;text-align:center;font-size:25px;font-weight:800;letter-spacing:9px;border:1.5px solid #E0DDD8;border-radius:12px;background:#FAFAF8;outline:none;font-family:inherit;color:var(--ink);box-sizing:border-box;}
        .mw-choicewrap{display:flex;flex-direction:column;gap:9px;}
        .mw-choice{padding:15px;border:1.5px solid #E0DDD8;border-radius:12px;background:#fff;font-size:14px;font-weight:700;text-align:left;cursor:pointer;font-family:inherit;color:var(--ink);}
        .mw-choice.sel{border-color:var(--sign-dark);background:#FEF3E2;color:var(--sign-dark);}
        .mw-phototile{width:100%;min-height:150px;border-radius:15px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer;border:2px dashed var(--sign-dark);background:#FEF3E2;font-family:inherit;padding:12px;}
        .mw-phototile.filled{border:2px solid #0F8A57;background:#E4F3EC;}
        .mw-phototile .ic{font-size:38px;}
        .mw-phototile .lbl{font-size:12px;font-weight:800;color:var(--sign-dark);line-height:1.45;text-align:center;padding:0 16px;}
        .mw-phototile.filled .lbl{color:#0F8A57;}
        .mw-terms{max-height:150px;overflow-y:auto;background:#FAFAF8;border:1.5px solid #E0DDD8;border-radius:12px;padding:13px 14px;font-size:11.5px;line-height:1.7;margin-bottom:16px;color:#4A463F;}
        .mw-terms h4{font-size:11.5px;margin:10px 0 4px;color:var(--sign-dark);}
        .mw-terms h4:first-child{margin-top:0;}
        .mw-terms p{margin:0 0 8px;}
        .mw-sig{background:#FEF3E2;border:1.5px solid var(--sign-dark);border-radius:12px;padding:14px;}
        .mw-sig label{display:block;font-size:11.5px;font-weight:700;margin-bottom:8px;line-height:1.5;color:var(--ink);}
        .mw-sig input{width:100%;padding:12px 13px;border:1.5px solid var(--sign-dark);border-radius:10px;font-size:15px;font-family:'Anton',sans-serif;letter-spacing:.3px;background:#fff;outline:none;box-sizing:border-box;}
        .mw-sig input.ok{border-color:#0F8A57;background:#E4F3EC;}
        .mw-note{background:#FAFAF8;border:1px dashed #E0DDD8;border-radius:10px;padding:11px 13px;font-size:10.5px;color:#8A8478;line-height:1.6;margin-top:12px;}
        .mw-err{color:#D6392B;font-size:12px;margin-top:10px;}
        .mw-btn{width:100%;padding:15px;background:var(--sign);color:var(--ink);border:none;border-radius:12px;font-size:14.5px;font-weight:800;font-family:inherit;cursor:pointer;margin-top:18px;}
        .mw-btn:disabled{background:#E0DDD8;color:#8A8478;cursor:not-allowed;}
        .mw-resend{display:block;text-align:center;font-size:11.5px;color:var(--sign-dark);font-weight:700;margin-top:12px;cursor:pointer;}
        .mw-resendwait{display:block;text-align:center;font-size:11.5px;color:#8A8478;font-weight:700;margin-top:12px;}
        .mw-success{text-align:center;padding:6px 2px 2px;}
        .mw-success .ic{font-size:50px;margin-bottom:14px;}
        .mw-success h2{font-family:'Anton',sans-serif;font-size:21px;margin:0 0 10px;}
        .mw-success p{font-size:13px;color:#8A8478;line-height:1.6;margin:0;}
      `}</style>

      <div className="mw-brand">TRINDADE <span>ONLINE</span> · motoboy</div>

      {!done && meta && (
        <div className="mw-card">
          <div className="mw-headrow">
            <button className={`mw-back ${fieldStep === 1 ? 'hidden' : ''}`} onClick={goBack} aria-label="Voltar">←</button>
            <div className="mw-eyebrow">Etapa {meta.stage}/5 · {STAGE_LABELS[meta.stage - 1]}</div>
            <div className="mw-counter">{fieldStep}/{TOTAL_STEPS}</div>
          </div>
          <div className="mw-stagebar">
            {[1, 2, 3, 4, 5].map(s => <div key={s} className={`mw-stageseg ${s <= meta.stage ? 'on' : ''}`} />)}
          </div>
          <div className="mw-dots">
            {Array.from({ length: meta.stageLen }).map((_, idx) => <div key={idx} className={`mw-dot ${idx < meta.pos ? 'on' : ''}`} />)}
          </div>

          {fieldStep === 1 && (
            <>
              <div className="mw-q">Qual seu nome completo?</div>
              <div className="mw-hint">É rápido — leva uns 3 minutos. Precisamos disso pra você já poder receber corridas.</div>
              <input key={1} className="mw-input" autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" onKeyDown={e => e.key === 'Enter' && requireThenAdvance(nome)} />
              {erro && <div className="mw-err">{erro}</div>}
              <button className="mw-btn" onClick={() => requireThenAdvance(nome)}>Continuar →</button>
            </>
          )}

          {fieldStep === 2 && (
            <>
              <div className="mw-q">Qual seu CPF?</div>
              <div className="mw-hint">Só números — avança sozinho quando completar.</div>
              <input key={2} className="mw-input" autoFocus value={cpf} onChange={onCpfChange} placeholder="000.000.000-00" inputMode="numeric" onKeyDown={e => e.key === 'Enter' && cpf.length === 11 && setFieldStep(s => s + 1)} />
              {erro && <div className="mw-err">{erro}</div>}
              <button className="mw-btn" disabled={cpf.length !== 11} onClick={() => setFieldStep(s => s + 1)}>Continuar →</button>
            </>
          )}

          {fieldStep === 3 && (
            <>
              <div className="mw-q">Qual seu endereço completo?</div>
              <input key={3} className="mw-input" autoFocus value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, bairro" onKeyDown={e => e.key === 'Enter' && requireThenAdvance(endereco)} />
              {erro && <div className="mw-err">{erro}</div>}
              <button className="mw-btn" onClick={() => requireThenAdvance(endereco)}>Continuar →</button>
            </>
          )}

          {fieldStep === 4 && (
            <>
              <div className="mw-q">Qual seu e-mail?</div>
              <div className="mw-hint">Opcional — a confirmação do cadastro é pelo WhatsApp, não precisa clicar em nada no e-mail.</div>
              <input key={4} className="mw-input" autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" onKeyDown={e => e.key === 'Enter' && setFieldStep(s => s + 1)} />
              <button className="mw-btn" onClick={() => setFieldStep(s => s + 1)}>Continuar →</button>
            </>
          )}

          {fieldStep === 5 && (
            <>
              <div className="mw-q">Qual seu WhatsApp?</div>
              <input key={5} className="mw-input" autoFocus value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(21) 99999-9999" inputMode="tel" onKeyDown={e => e.key === 'Enter' && enviarCodigo()} />
              {erro && <div className="mw-err">{erro}</div>}
              <button className="mw-btn" disabled={sendingCode} onClick={enviarCodigo}>{sendingCode ? 'Enviando código...' : 'Continuar →'}</button>
            </>
          )}

          {fieldStep === 6 && (
            <>
              <div className="mw-q">Confirme seu WhatsApp</div>
              <div className="mw-hint">Mandamos um código de 6 dígitos pro seu WhatsApp <b>{whatsapp}</b></div>
              <input key={6} className="mw-otp" autoFocus maxLength={6} inputMode="numeric" value={code} onChange={onCodeChange} placeholder="000000" />
              {sendingCode || resendCooldown > 0 ? (
                <span className="mw-resendwait">{sendingCode ? 'Enviando...' : `Reenviar em ${resendCooldown}s`}</span>
              ) : (
                <a className="mw-resend" onClick={enviarCodigo}>Não chegou? Reenviar código</a>
              )}
              {codeError && <div className="mw-err">{codeError}</div>}
              <button className="mw-btn" disabled={verifyingCode || code.length < 6} onClick={() => confirmarCodigo(code)}>{verifyingCode ? 'Verificando...' : 'Confirmar código'}</button>
            </>
          )}

          {fieldStep >= 7 && fieldStep <= 11 && (() => {
            const slot = PHOTO_SLOTS[fieldStep - 7]
            const filled = !!photos[slot.key]
            const acceptsPdf = slot.key === 'cnh' || slot.key === 'documento_moto'
            const isPdf = photos[slot.key]?.startsWith('data:application/pdf')
            return (
              <>
                <div className="mw-q">{slot.label}</div>
                {slot.hint && <div className="mw-hint">{slot.hint}</div>}
                <input
                  ref={el => { fileInputs.current[slot.key] = el }} type="file"
                  accept={acceptsPdf ? 'image/*,application/pdf' : 'image/*'}
                  capture={acceptsPdf ? undefined : 'environment'}
                  style={{ display: 'none' }} onChange={e => onPickPhoto(slot.key, e)}
                />
                <button className={`mw-phototile ${filled ? 'filled' : ''}`} onClick={() => fileInputs.current[slot.key]?.click()}>
                  <div className="ic">{filled ? (isPdf ? '📄' : '✅') : slot.icon}</div>
                  <div className="lbl">{filled ? 'Recebido — toque pra trocar' : 'Toque pra tirar foto ou escolher da galeria'}</div>
                </button>
                {erro && <div className="mw-err">{erro}</div>}
                <button className="mw-btn" disabled={!filled} onClick={() => setFieldStep(s => s + 1)}>Continuar →</button>
              </>
            )
          })()}

          {fieldStep === 12 && (
            <>
              <div className="mw-q">Qual o tipo da sua chave Pix?</div>
              <div className="mw-choicewrap">
                {PIX_TYPE_OPTIONS.map(opt => (
                  <button key={opt.value} className={`mw-choice ${pixType === opt.value ? 'sel' : ''}`} onClick={() => pickPixType(opt.value)}>{opt.label}</button>
                ))}
              </div>
              <button className="mw-btn" onClick={() => setFieldStep(s => s + 1)}>Continuar →</button>
            </>
          )}

          {fieldStep === 13 && (
            <>
              <div className="mw-q">Qual sua chave Pix?</div>
              <div className="mw-hint">É onde você recebe o valor das entregas.</div>
              <input key={13} className="mw-input" autoFocus value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="Digite a chave" onKeyDown={e => e.key === 'Enter' && requireThenAdvance(pixKey)} />
              {erro && <div className="mw-err">{erro}</div>}
              <button className="mw-btn" onClick={() => requireThenAdvance(pixKey)}>Continuar →</button>
            </>
          )}

          {fieldStep === 14 && (
            <>
              <div className="mw-q">Termo de parceria</div>
              <div className="mw-hint">Última etapa — lê com calma antes de aceitar.</div>
              <div className="mw-terms">
                {MOTOBOY_TERMS_SECTIONS.map(sec => (
                  <div key={sec.title}><h4>{sec.title}</h4><p>{sec.body}</p></div>
                ))}
              </div>
              <div className="mw-sig">
                <label>Digite seu nome completo pra confirmar que leu e concorda</label>
                <input className={nomeConfere ? 'ok' : ''} value={nomeDigitado} onChange={e => setNomeDigitado(e.target.value)} placeholder="Seu nome completo" />
                <div className="mw-hint" style={{ margin: '8px 0 0', color: nomeConfere ? '#0F8A57' : 'var(--sign-dark)', fontWeight: nomeConfere ? 700 : 400 }}>
                  {nomeConfere ? '✓ Confere com o nome do cadastro — pode enviar.' : <>Precisa bater com o nome do cadastro: <b>{nome}</b></>}
                </div>
              </div>
              <div className="mw-note">📄 Isso vale como sua assinatura eletrônica no Termo de Parceria. Junto com o nome, a gente registra a data/hora, o texto exato que você leu e o dispositivo usado — e gera um documento (PDF) guardado no seu cadastro.</div>
              <div className="mw-note" style={{ background: '#FEF3E2', borderStyle: 'dashed', borderColor: 'var(--sign-dark)' }}>
                <b>Seu cadastro passa por uma aprovação rápida da Trindade Online.</b> Assim que for aprovado, você recebe a confirmação no seu próprio WhatsApp e já pode começar a receber corridas.
              </div>
              {erro && <div className="mw-err">{erro}</div>}
              <button className="mw-btn" disabled={!nomeConfere || enviando} onClick={enviarCadastro}>{enviando ? 'Enviando...' : '✅ Enviar cadastro'}</button>
            </>
          )}
        </div>
      )}

      {done && (
        <div className="mw-card">
          <div className="mw-success">
            <div className="ic">🎉</div>
            <h2>Cadastro enviado!</h2>
            <p>A Trindade Online vai conferir seus dados e documentos. Assim que aprovar, você recebe a confirmação no seu WhatsApp — pode fechar essa página.</p>
          </div>
        </div>
      )}
    </div>
  )
}
