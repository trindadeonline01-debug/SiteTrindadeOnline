'use client'
import { useRef, useState } from 'react'
import { MOTOBOY_TERMS_SECTIONS } from '@/lib/motoboyTerms'

type PhotoKey = 'cnh' | 'moto_frente' | 'moto_tras' | 'documento_moto' | 'selfie'
const PHOTO_SLOTS: { key: PhotoKey; label: string; icon: string }[] = [
  { key: 'cnh', label: 'CNH (frente)', icon: '🪪' },
  { key: 'moto_frente', label: 'Moto — frente', icon: '🏍️' },
  { key: 'moto_tras', label: 'Moto — trás (com placa)', icon: '🔢' },
  { key: 'documento_moto', label: 'Documento da moto', icon: '📄' },
  { key: 'selfie', label: 'Selfie sua', icon: '🤳' },
]

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
function normNome(s: string) { return (s || '').trim().toLowerCase().replace(/\s+/g, ' ') }

export default function MotoboyCadastroPage() {
  const [step, setStep] = useState(1)
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [endereco, setEndereco] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [code, setCode] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [photos, setPhotos] = useState<Record<PhotoKey, string | null>>({ cnh: null, moto_frente: null, moto_tras: null, documento_moto: null, selfie: null })
  const [pixKey, setPixKey] = useState('')
  const [pixType, setPixType] = useState('celular')
  const [nomeDigitado, setNomeDigitado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const fileInputs = useRef<Record<PhotoKey, HTMLInputElement | null>>({ cnh: null, moto_frente: null, moto_tras: null, documento_moto: null, selfie: null })

  async function enviarCodigo() {
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
    if (data.error) { setErro(data.error); return }
    setStep(2)
  }

  async function confirmarCodigo() {
    setCodeError('')
    setVerifyingCode(true)
    const res = await fetch('/api/motoboy/verificar-codigo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: whatsapp, code, purpose: 'cadastro' }),
    })
    const data = await res.json()
    setVerifyingCode(false)
    if (data.error) { setCodeError(data.error); return }
    setStep(3)
  }

  async function onPickPhoto(key: PhotoKey, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotos(p => ({ ...p, [key]: null }))
    const b64 = await readFileAsBase64(file)
    setPhotos(p => ({ ...p, [key]: b64 }))
  }

  const allPhotosOk = PHOTO_SLOTS.every(p => !!photos[p.key])
  const nomeConfere = normNome(nomeDigitado) === normNome(nome)

  async function enviarCadastro() {
    setErro('')
    setEnviando(true)
    const res = await fetch('/api/motoboy/cadastrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome, cpf, endereco, email, phone: whatsapp,
        cnh_base64: photos.cnh, moto_frente_base64: photos.moto_frente, moto_tras_base64: photos.moto_tras,
        documento_moto_base64: photos.documento_moto, selfie_base64: photos.selfie,
        pix_key: pixKey, pix_key_type: pixType, nome_digitado: nomeDigitado,
      }),
    })
    const data = await res.json()
    setEnviando(false)
    if (data.error) { setErro(data.error); return }
    setStep(6)
  }

  return (
    <div className="mc-wrap">
      <style>{`
        .mc-wrap{max-width:480px;margin:0 auto;padding:28px 20px 60px;font-family:'Archivo',sans-serif;font-size:14px;color:var(--ink);background:var(--concrete);min-height:100vh;}
        .mc-logo{text-align:center;font-family:'Anton',sans-serif;font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;}
        .mc-logo span{color:var(--sign-dark);}
        .mc-logo-sub{text-align:center;font-size:11.5px;color:#8A8478;margin-bottom:22px;}
        .mc-stage{display:block;width:fit-content;margin:0 auto 10px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--sign-dark);background:#FEF3E2;border-radius:20px;padding:4px 11px;}
        .mc-title{font-family:'Anton',sans-serif;font-size:24px;text-align:center;letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;}
        .mc-sub{font-size:12.5px;color:#8A8478;text-align:center;line-height:1.6;margin-bottom:22px;}
        .mc-card{background:#fff;border:1px solid #E0DDD8;border-radius:16px;padding:22px;}
        .mc-field{margin-bottom:14px;}
        .mc-field label{display:block;font-size:11.5px;font-weight:700;color:#8A8478;margin-bottom:6px;}
        .mc-field .req{color:#D6392B;}
        .mc-field input,.mc-field select{width:100%;padding:12px 13px;border:1.5px solid #E0DDD8;border-radius:11px;font-size:14px;font-family:inherit;color:var(--ink);background:#FAFAF8;outline:none;box-sizing:border-box;}
        .mc-hint{font-size:10.5px;color:#8A8478;margin-top:5px;line-height:1.5;}
        .mc-btn{width:100%;padding:14px;background:var(--sign);color:var(--ink);border:none;border-radius:12px;font-size:14.5px;font-weight:800;font-family:inherit;cursor:pointer;margin-top:6px;}
        .mc-btn:disabled{background:#E0DDD8;color:#8A8478;cursor:not-allowed;}
        .mc-btn-2{width:100%;padding:11px;background:transparent;color:#8A8478;border:1.5px solid #E0DDD8;border-radius:12px;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:8px;}
        .mc-code{width:100%;padding:15px;text-align:center;font-size:26px;font-weight:800;letter-spacing:10px;border:1.5px solid #E0DDD8;border-radius:12px;margin:16px 0 6px;outline:none;background:#FAFAF8;box-sizing:border-box;}
        .mc-photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;}
        .mc-photo-slot{aspect-ratio:1;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:9px;font-weight:700;text-align:center;cursor:pointer;padding:6px;line-height:1.25;overflow:hidden;position:relative;}
        .mc-photo-slot.empty{border:2px dashed var(--sign-dark);background:#FEF3E2;color:var(--sign-dark);}
        .mc-photo-slot.filled{border:2px solid #0F8A57;}
        .mc-photo-slot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
        .mc-note{background:#FAFAF8;border:1px dashed #E0DDD8;border-radius:10px;padding:11px 13px;font-size:10.5px;color:#8A8478;line-height:1.6;margin-bottom:14px;}
        .mc-terms{max-height:200px;overflow-y:auto;background:#FAFAF8;border:1.5px solid #E0DDD8;border-radius:12px;padding:14px 15px;font-size:11.5px;line-height:1.7;margin-bottom:14px;}
        .mc-terms h4{font-size:11.5px;margin:12px 0 4px;color:var(--sign-dark);}
        .mc-terms h4:first-child{margin-top:0;}
        .mc-terms p{margin:0 0 8px;}
        .mc-sig{background:#FEF3E2;border:1.5px solid var(--sign-dark);border-radius:12px;padding:14px;margin-bottom:10px;}
        .mc-sig label{display:block;font-size:12px;font-weight:700;margin-bottom:8px;line-height:1.5;}
        .mc-sig input{width:100%;padding:12px 13px;border:1.5px solid var(--sign-dark);border-radius:10px;font-size:16px;font-family:'Anton',sans-serif;letter-spacing:.4px;background:#fff;outline:none;box-sizing:border-box;}
        .mc-sig input.ok{border-color:#0F8A57;background:#E4F3EC;}
        .mc-error{color:#D6392B;font-size:12px;margin-top:10px;}
        .mc-success{text-align:center;padding:10px 0;}
        .mc-success .ic{font-size:52px;margin-bottom:14px;}
      `}</style>

      <div className="mc-logo">TRINDADE <span>ONLINE</span></div>
      <div className="mc-logo-sub">Cadastro de motoboy parceiro 🏍️</div>

      <div className="mc-card">
        {step === 1 && (
          <>
            <div className="mc-stage">Etapa 1 de 5</div>
            <div className="mc-title">Seus dados</div>
            <div className="mc-sub">É rápido — leva uns 3 minutos. Precisamos disso pra você já poder receber corridas.</div>
            <div className="mc-field"><label>Nome completo <span className="req">*</span></label><input value={nome} onChange={e => setNome(e.target.value)} /></div>
            <div className="mc-field"><label>CPF <span className="req">*</span></label><input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="Só números" /></div>
            <div className="mc-field"><label>Endereço completo <span className="req">*</span></label><input value={endereco} onChange={e => setEndereco(e.target.value)} /></div>
            <div className="mc-field">
              <label>E-mail</label>
              <input value={email} onChange={e => setEmail(e.target.value)} />
              <div className="mc-hint">Só pra registro — a confirmação do cadastro é pelo WhatsApp, não precisa clicar em nada no e-mail.</div>
            </div>
            <div className="mc-field"><label>Seu WhatsApp <span className="req">*</span></label><input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(21) 99999-9999" /></div>
            {erro && <div className="mc-error">{erro}</div>}
            <button className="mc-btn" disabled={sendingCode} onClick={enviarCodigo}>{sendingCode ? 'Enviando código...' : 'Continuar →'}</button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mc-stage">Etapa 2 de 5</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>📱</div>
              <div className="mc-title" style={{ fontSize: 20 }}>Confirme seu WhatsApp</div>
              <div className="mc-sub">Mandamos um código de 6 dígitos pro seu WhatsApp<br /><b>{whatsapp}</b></div>
              <input className="mc-code" maxLength={6} inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
              <a style={{ display: 'block', textAlign: 'center', fontSize: 11.5, color: 'var(--sign-dark)', fontWeight: 700, marginTop: 12, cursor: 'pointer' }} onClick={enviarCodigo}>Não chegou? Reenviar código</a>
            </div>
            {codeError && <div className="mc-error">{codeError}</div>}
            <button className="mc-btn" disabled={verifyingCode || code.length < 6} onClick={confirmarCodigo}>{verifyingCode ? 'Verificando...' : 'Confirmar código'}</button>
            <button className="mc-btn-2" onClick={() => setStep(1)}>← Voltar</button>
          </>
        )}

        {step === 3 && (
          <>
            <div className="mc-stage">Etapa 3 de 5</div>
            <div className="mc-title">Documentos e fotos</div>
            <div className="mc-sub">Tira as fotos na hora ou manda da galeria — precisa estar legível.</div>
            <div className="mc-photo-grid">
              {PHOTO_SLOTS.map(slot => (
                <div key={slot.key} className={`mc-photo-slot ${photos[slot.key] ? 'filled' : 'empty'}`} onClick={() => fileInputs.current[slot.key]?.click()}>
                  <input ref={el => { fileInputs.current[slot.key] = el }} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => onPickPhoto(slot.key, e)} />
                  {photos[slot.key] ? <img src={photos[slot.key]!} alt={slot.label} /> : <><span style={{ fontSize: 18 }}>{slot.icon}</span>{slot.label}</>}
                </div>
              ))}
            </div>
            <div className="mc-note">📌 Na foto de trás da moto, a <b>placa precisa aparecer legível</b> — é como a gente confirma que a moto é sua.</div>
            {erro && <div className="mc-error">{erro}</div>}
            <button className="mc-btn" disabled={!allPhotosOk} onClick={() => setStep(4)}>Continuar →</button>
            <button className="mc-btn-2" onClick={() => setStep(2)}>← Voltar</button>
          </>
        )}

        {step === 4 && (
          <>
            <div className="mc-stage">Etapa 4 de 5</div>
            <div className="mc-title">Chave Pix</div>
            <div className="mc-sub">É onde você recebe o valor das entregas.</div>
            <div className="mc-field">
              <label>Tipo da chave</label>
              <select value={pixType} onChange={e => setPixType(e.target.value)}>
                <option value="celular">Celular</option><option value="cpf">CPF</option><option value="email">E-mail</option><option value="aleatoria">Aleatória</option>
              </select>
            </div>
            <div className="mc-field"><label>Chave Pix <span className="req">*</span></label><input value={pixKey} onChange={e => setPixKey(e.target.value)} /></div>
            <button className="mc-btn" disabled={!pixKey.trim()} onClick={() => setStep(5)}>Continuar →</button>
            <button className="mc-btn-2" onClick={() => setStep(3)}>← Voltar</button>
          </>
        )}

        {step === 5 && (
          <>
            <div className="mc-stage">Etapa 5 de 5</div>
            <div className="mc-title">Termo de parceria</div>
            <div className="mc-sub">Última etapa — lê com calma antes de aceitar.</div>
            <div className="mc-terms">
              {MOTOBOY_TERMS_SECTIONS.map(sec => (
                <div key={sec.title}><h4>{sec.title}</h4><p>{sec.body}</p></div>
              ))}
            </div>
            <div className="mc-sig">
              <label>Digite seu nome completo pra confirmar que leu e concorda</label>
              <input className={nomeConfere ? 'ok' : ''} value={nomeDigitado} onChange={e => setNomeDigitado(e.target.value)} placeholder="Seu nome completo" />
              <div className="mc-hint" style={{ color: nomeConfere ? '#0F8A57' : 'var(--sign-dark)', fontWeight: nomeConfere ? 700 : 400 }}>
                {nomeConfere ? '✓ Confere com o nome do cadastro — pode enviar.' : <>Precisa bater com o nome do cadastro: <b>{nome}</b></>}
              </div>
            </div>
            <div className="mc-note" style={{ background: '#FAFAF8' }}>
              📄 Isso vale como sua assinatura eletrônica no Termo de Parceria. Junto com o nome, a gente registra a data/hora, o texto exato que você leu e o dispositivo usado — e gera um documento (PDF) guardado no seu cadastro.
            </div>
            <div className="mc-note" style={{ background: '#FEF3E2', borderStyle: 'dashed', borderColor: 'var(--sign-dark)' }}>
              <b>Seu cadastro passa por uma aprovação rápida da Trindade Online.</b> Assim que for aprovado, você recebe a confirmação no seu próprio WhatsApp e já pode começar a receber corridas.
            </div>
            {erro && <div className="mc-error">{erro}</div>}
            <button className="mc-btn" disabled={!nomeConfere || enviando} onClick={enviarCadastro}>{enviando ? 'Enviando...' : '✅ Enviar cadastro'}</button>
            <button className="mc-btn-2" onClick={() => setStep(4)}>← Voltar</button>
          </>
        )}

        {step === 6 && (
          <div className="mc-success">
            <div className="ic">🎉</div>
            <div className="mc-title" style={{ fontSize: 22 }}>Cadastro enviado!</div>
            <div className="mc-sub">A Trindade Online vai conferir seus dados e documentos. Assim que aprovar, você recebe a confirmação no seu WhatsApp — pode fechar essa página.</div>
          </div>
        )}
      </div>
    </div>
  )
}
