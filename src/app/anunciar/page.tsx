'use client'

import { compressImage } from '@/lib/compressImage'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import BusinessHoursEditor from '@/components/BusinessHoursEditor'
import { IGREJAS_CATEGORY_ID, DIAS_SEMANA, HourRow } from '@/lib/businessHours'

type Category = { id: string; name: string; emoji: string }
type Subcategory = { id: string; name: string; emoji: string; category_id: string }

const LINK_LABELS = [
  'Ver cardápio', 'Fazer pedido', 'Acessar site',
  'Ver catálogo', 'Agendar consulta', 'Fazer uma visita',
  'Solicitar contato', 'Personalizado'
]

const BAIRROS = [
  'Trindade', 'Alcântara', 'Arsenal', 'Boa Vista', 'Colubande', 'Coelho',
  'Engenho Pequeno', 'Estrela do Norte', 'Galo Branco', 'Guaxindiba', 'Itaoca',
  'Jardim Catarina', 'Maria Paula', 'Mutuá', 'Neves', 'Nova Cidade', 'Paraíso',
  'Porto Velho', 'Santa Catarina', 'Vista Alegre', 'Outro bairro de SG',
]

// Cadastro unificado: quem não tem conta ainda cria ela aqui mesmo (fase "conta"),
// sem sair da página — antes isso era /cadastro criando a conta e redirecionando
// pra /empresa/cadastrar, ou seja, dois cadastros percebidos como um só que quebrava
// no meio. Quem já está logado (ex: "cadastrar outro negócio" no menu) pula direto
// pra fase "negocio".
export default function AnunciarPage() {
  const [checkingSession, setCheckingSession] = useState(true)
  const [phase, setPhase] = useState<'conta' | 'verify' | 'negocio'>('conta')
  const [userId, setUserId] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)

  // ── Conta ──
  const [respNome, setRespNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [bairroPessoal, setBairroPessoal] = useState('Trindade')
  const [whatsappPessoal, setWhatsappPessoal] = useState('')
  const [code, setCode] = useState('')
  const [pendingData, setPendingData] = useState<any>(null)

  // ── Negócio ──
  const [bizStep, setBizStep] = useState(1)
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcats] = useState<Subcategory[]>([])
  const [subcatOpen, setSubcatOpen] = useState(false)
  const subcatRef = useRef<HTMLDivElement>(null)

  const [nome, setNome] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [selectedSubs, setSelectedSubs] = useState<string[]>([])
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [endereco, setEndereco] = useState('')
  const [cep, setCep] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState(false)
  const [numero, setNumero] = useState('')
  const [cepData, setCepData] = useState<{ logradouro: string; bairro: string; localidade: string; uf: string } | null>(null)

  const [phone, setPhone] = useState('')
  const [linkLabel, setLinkLabel] = useState('Ver cardápio')
  const [linkUrl, setLinkUrl] = useState('')
  const [hours, setHours] = useState<HourRow[]>([])
  const [churchHours, setChurchHours] = useState<{ day: string; manha: string; noite: string }[]>(
    DIAS_SEMANA.map(day => ({ day, manha: '', noite: '' }))
  )
  const [deliveryAvailable, setDeliveryAvailable] = useState(false)
  const [flexibleHours, setFlexibleHours] = useState(false)

  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [descricao, setDescricao] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [subcatSearch, setSubcatSearch] = useState('')
  const [subcatSugestao, setSubcatSugestao] = useState('')
  const [subcatSugestoes, setSubcatSugestoes] = useState<string[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setUserId(session.user.id); setPhase('negocio') }
      setCheckingSession(false)
    })
    supabase.from('categories').select('*').order('order').then(({ data }) => setCategories(data || []))
    supabase.from('subcategories').select('*').order('name', { ascending: true }).then(({ data }) => setSubcats(data || []))
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (subcatRef.current && !subcatRef.current.contains(e.target as Node)) setSubcatOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredSubs = subcategories.filter(s => s.category_id === categoryId)
  const catSel = categories.find(c => c.id === categoryId)

  function formatCep(v: string) { return v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2') }
  function buildAddress(data: { logradouro: string; bairro: string; localidade: string; uf: string }, num: string) {
    return [data.logradouro + (num ? ', ' + num : ''), data.bairro, `${data.localidade}-${data.uf}`].filter(Boolean).join(', ')
  }
  async function handleCepChange(v: string) {
    setCep(formatCep(v))
    setCepError(false)
    const digits = v.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) { setCepError(true); setCepData(null) } else {
        const parsed = { logradouro: data.logradouro || '', bairro: data.bairro || '', localidade: data.localidade || '', uf: data.uf || '' }
        setCepData(parsed)
        setEndereco(buildAddress(parsed, numero))
      }
    } catch { setCepError(true) }
    setCepLoading(false)
  }
  function handleNumeroChange(v: string) {
    setNumero(v)
    if (cepData) setEndereco(buildAddress(cepData, v))
  }

  function toggleSub(id: string) {
    setSelectedSubs(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const total = photos.length + files.length
    if (total > 5) { setErro('Máximo de 5 fotos.'); return }
    setErro('')
    const newFiles = [...photos, ...files].slice(0, 5)
    setPhotos(newFiles)
    setPreviews(newFiles.map(f => URL.createObjectURL(f)))
  }

  function removePhoto(i: number) {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
    setPreviews(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Conta: envia código ──
  async function handleContaSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!respNome.trim()) { setErro('Digite seu nome.'); return }
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== confirma) { setErro('As senhas não coincidem.'); return }
    if (whatsappPessoal.length < 10) { setErro('Informe um número de WhatsApp válido.'); return }
    setLoading(true)
    const res = await fetch('/api/auth/send-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.error) { setErro(data.error); return }
    setPendingData({ respNome, email, senha, bairroPessoal, whatsappPessoal })
    setPhase('verify')
  }

  // ── Conta: confirma código e cria a conta, sem sair da página ──
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingData.email, code }),
    })
    const data = await res.json()
    if (data.error) { setErro(data.error); setLoading(false); return }
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: pendingData.email,
      password: pendingData.senha,
      options: { data: { name: pendingData.respNome, user_type: 'company', neighborhood: pendingData.bairroPessoal, phone: pendingData.whatsappPessoal } },
    })
    if (error || !signUpData.user) {
      setErro(error?.message.includes('already registered') ? 'Este e-mail já está cadastrado.' : 'Erro ao criar conta.')
      setLoading(false); return
    }
    setUserId(signUpData.user.id)
    setPhase('negocio')
    setLoading(false)
  }

  function nextBizStep() {
    setErro('')
    if (bizStep === 1) {
      if (!nome.trim()) { setErro('Digite o nome da empresa.'); return }
      if (!categoryId) { setErro('Selecione uma categoria.'); return }
      if (!endereco.trim()) { setErro('Digite o endereço.'); return }
    }
    if (bizStep === 2) {
      if (!phone.trim()) { setErro('Digite o WhatsApp da empresa.'); return }
    }
    setBizStep(s => s + 1)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (photos.length === 0) { setErro('Adicione pelo menos 1 foto da empresa.'); return }
    if (!userId) return

    setLoading(true)
    try {
      const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now()

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          owner_id: userId,
          name: nome.toUpperCase(),
          slug,
          category_id: categoryId || null,
          description: descricao || null,
          tags,
          address: endereco || null,
          phone: phone || null,
          external_link: linkUrl || null,
          external_link_label: linkUrl ? linkLabel : null,
          delivery_available: deliveryAvailable,
          flexible_hours: flexibleHours,
          status: 'pending',
          plan: 'free',
        })
        .select()
        .single()

      if (companyError) throw new Error('Erro ao criar empresa.')

      fetch('/api/admin/notify-whatsapp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'nova_empresa', nome: company.name, categoria: catSel?.name }),
      }).catch(() => {})

      if (selectedSubs.length > 0) {
        await supabase.from('company_subcategories').insert(
          selectedSubs.map((sid, i) => ({ company_id: company.id, subcategory_id: sid, is_primary: i === 0 }))
        )
      }

      if (subcatSugestoes.length > 0) {
        await supabase.from('subcategory_suggestions').insert(
          subcatSugestoes.map(s => ({ company_id: company.id, suggestion: s }))
        )
        fetch('/api/admin/notify-whatsapp', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'nova_sugestao', empresa: company.name, sugestoes: subcatSugestoes }),
        }).catch(() => {})
      }

      const isIgreja = categoryId === IGREJAS_CATEGORY_ID
      if (isIgreja) {
        const cultosEntries: { company_id: string; label: string; hours: string; order: number }[] = []
        let order = 0
        churchHours.forEach(({ day, manha, noite }) => {
          if (manha.trim()) cultosEntries.push({ company_id: company.id, label: `${day} manhã`, hours: manha.trim(), order: order++ })
          if (noite.trim()) cultosEntries.push({ company_id: company.id, label: `${day} noite`, hours: noite.trim(), order: order++ })
        })
        if (cultosEntries.length > 0) await supabase.from('company_hours').insert(cultosEntries)
      } else if (!flexibleHours) {
        const validHours = hours.filter(h => h.closed || (h.open_time?.trim() && h.close_time?.trim()))
        if (validHours.length > 0) {
          await supabase.from('company_hours').insert(
            validHours.map((h, i) => ({
              company_id: company.id, day_of_week: h.day_of_week,
              open_time: h.closed ? null : h.open_time, close_time: h.closed ? null : h.close_time,
              closed: h.closed, order: i,
            }))
          )
        }
      }

      for (let i = 0; i < photos.length; i++) {
        const file = photos[i]
        const ext = file.name.split('.').pop()
        const path = `${company.id}/${i}-${Date.now()}.${ext}`
        const compressed = await compressImage(file)
        const { data: upload } = await supabase.storage.from('company-photos').upload(path, compressed, { upsert: true })
        if (upload) {
          const { data: urlData } = supabase.storage.from('company-photos').getPublicUrl(path)
          await supabase.from('company_photos').insert({ company_id: company.id, url: urlData.publicUrl, order: i })
        }
      }

      await supabase.from('profiles').update({ user_type: 'company' }).eq('id', userId)
      setOk(true)
    } catch (err: any) {
      setErro(err.message || 'Erro inesperado. Tente novamente.')
    }
    setLoading(false)
  }

  function senhaForca() {
    if (senha.length === 0) return null
    if (senha.length < 6) return { cor: '#E24B4A', label: 'Muito fraca', pct: '25%' }
    if (senha.length < 8) return { cor: '#C9951A', label: 'Fraca', pct: '50%' }
    if (senha.length < 12) return { cor: '#185FA5', label: 'Boa', pct: '75%' }
    return { cor: '#0F8050', label: 'Forte', pct: '100%' }
  }
  const forca = senhaForca()

  const styles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: #F0EDE8; }
    .page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 24px 16px 48px; }
    .card { background: #fff; border-radius: 20px; padding: 32px 28px; width: 100%; max-width: 520px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .logo { text-align: center; margin-bottom: 24px; }
    .logo a { font-family: 'Bebas Neue', sans-serif; font-size: 26px; letter-spacing: 2px; text-decoration: none; color: #111; }
    .logo span { color: #C9951A; }
    .page-title { font-size: 18px; font-weight: 700; color: #111; margin-bottom: 4px; }
    .page-sub { font-size: 13px; color: #AAA; margin-bottom: 24px; }
    .stage-tag { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: #C9951A; background: #FEF3E2; border-radius: 20px; padding: 3px 10px; margin-bottom: 10px; }

    .steps { display: flex; align-items: center; gap: 6px; margin-bottom: 28px; }
    .step-grp { display: flex; align-items: center; gap: 5px; flex: 1; }
    .step-circle { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #E0DDD8; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #AAA; flex-shrink: 0; transition: all .2s; }
    .step-circle.on { border-color: #C9951A; background: #C9951A; color: #fff; }
    .step-circle.done { border-color: #0F8050; background: #0F8050; color: #fff; }
    .step-lbl { font-size: 10px; color: #AAA; }
    .step-lbl.on { color: #C9951A; font-weight: 600; }
    .step-line { flex: 1; height: 2px; background: #E0DDD8; border-radius: 2px; margin: 0 4px; }
    .step-line.done { background: #0F8050; }

    .field { margin-bottom: 14px; }
    .field label { display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 6px; }
    .field input, .field textarea, .field select { width: 100%; padding: 12px 14px; border: 1.5px solid #E0DDD8; border-radius: 11px; font-size: 14px; font-family: 'Inter', sans-serif; color: #222; background: #FAFAF8; outline: none; transition: border-color .15s; }
    .field input:focus, .field textarea:focus, .field select:focus { border-color: #C9951A; background: #fff; }
    .field textarea { resize: none; }
    .field-hint { font-size: 11px; color: #AAA; margin-top: 5px; }
    .uppercase-input { text-transform: uppercase; letter-spacing: 1px; font-family: 'Bebas Neue', sans-serif !important; }

    .subcat-dropdown-wrap { position: relative; }
    .subcat-dropdown-btn { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border: 1px solid #E0DDD8; background: #fff; border-radius: 10px; cursor: pointer; font-size: 14px; color: #333; }
    .subcat-dropdown-btn:hover { border-color: #C9951A; }
    .subcat-dropdown-arrow { font-size: 10px; color: #888; margin-left: 8px; }
    .subcat-dropdown-panel { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #E0DDD8; border-radius: 10px; margin-top: 4px; max-height: 260px; overflow-y: auto; z-index: 20; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    .subcat-option { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; font-size: 13px; color: #333; transition: background .15s; }
    .subcat-option:hover { background: #FEF3E2; }
    .subcat-option input[type=checkbox] { accent-color: #C9951A; width: 16px; height: 16px; cursor: pointer; }

    .church-row { display: grid; grid-template-columns: 72px 1fr 1fr; gap: 8px; align-items: center; padding: 8px 10px; background: #FAFAF8; border: 0.5px solid #E0DDD8; border-radius: 10px; margin-bottom: 6px; }
    .church-day { font-size: 12px; font-weight: 600; color: #222; }
    .church-period { display: flex; flex-direction: column; gap: 3px; }
    .church-period-lbl { font-size: 9px; color: #AAA; font-weight: 700; letter-spacing: .3px; }
    .church-time { width: 100%; padding: 6px 8px; border: 1px solid #E0DDD8; border-radius: 7px; font-size: 12px; font-family: 'Inter',sans-serif; color: #222; background: #fff; outline: none; }
    .church-time:focus { border-color: #C9951A; }

    .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
    .photo-slot { height: 90px; border: 2px dashed #E0DDD8; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 24px; transition: all .15s; background: #FAFAF8; position: relative; overflow: hidden; }
    .photo-slot:hover { border-color: #C9951A; background: #FEF3E2; }
    .photo-slot img { width: 100%; height: 100%; object-fit: cover; }
    .photo-remove { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; background: rgba(0,0,0,.6); color: #fff; border: none; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .photo-add-btn { height: 90px; border: 2px dashed #C9951A; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; background: #FEF3E2; color: #C9951A; font-size: 11px; font-weight: 600; transition: all .15s; }
    .photo-add-btn:hover { background: #FDE8C0; }

    .note-box { background: #FEF3E2; border: 0.5px solid #F5C77A; border-radius: 10px; padding: 10px 14px; font-size: 12px; color: #854F0B; margin-bottom: 14px; line-height: 1.6; }
    .btn-primary { width: 100%; padding: 13px; background: #C9951A; color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; transition: background .15s; margin-bottom: 10px; }
    .btn-primary:hover:not(:disabled) { background: #B8841A; }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
    .btn-secondary { width: 100%; padding: 11px; background: #fff; color: #888; border: 1.5px solid #E0DDD8; border-radius: 12px; font-size: 13px; font-family: 'Inter', sans-serif; cursor: pointer; transition: all .15s; }
    .btn-secondary:hover { border-color: #CCC; color: #555; }
    .erro-msg { background: #FEF0F0; border: 1px solid #F5BCBC; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #C0392B; margin-bottom: 14px; }
    .auth-footer { text-align: center; font-size: 13px; color: #AAA; }
    .auth-footer a { color: #C9951A; font-weight: 500; text-decoration: none; }
  `

  if (checkingSession) {
    return <><style>{styles}</style><div className="page"><div className="card" style={{ textAlign: 'center', color: '#AAA', fontSize: 13 }}>Carregando...</div></div></>
  }

  return (
    <>
      <style>{styles}</style>
      <div className="page">
        <div className="card">
          <div className="logo"><a href="/">TRINDADE <span>ONLINE</span></a></div>

          {ok ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 8 }}>Cadastro recebido!</div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.9, marginBottom: 16 }}>
                <strong>{nome.toUpperCase()}</strong> foi cadastrada e está em análise.<br />
                Em até 24h sua empresa estará no ar para todos os moradores da Trindade encontrarem.
              </div>
              <div style={{ background: '#fff8e6', border: '1.5px solid #f0d080', borderRadius: 12, padding: '14px 16px', marginBottom: 24, textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92600a', marginBottom: 6 }}>💡 Enquanto isso, que tal já escolher seu plano?</div>
                <div style={{ fontSize: 12, color: '#b89030', lineHeight: 1.7 }}>
                  Empresas com plano pago aparecem em destaque, mostram o WhatsApp e recebem muito mais clientes. Você pode escolher agora e ativar quando quiser.
                </div>
              </div>
              <button className="btn-primary" onClick={() => window.location.href = '/empresa/planos'}>🚀 Destaque sua empresa agora</button>
              <div style={{ marginTop: 12 }}><a href="/" style={{ fontSize: 12, color: '#aaa', textDecoration: 'none' }}>Voltar ao início</a></div>
            </div>
          ) : phase === 'conta' ? (
            <>
              <div className="page-title">Anunciar meu negócio</div>
              <div className="page-sub">Primeiro, seus dados de acesso — o cadastro do negócio vem em seguida, sem sair daqui.</div>
              <form onSubmit={handleContaSubmit}>
                <div className="field">
                  <label>Seu nome</label>
                  <input type="text" placeholder="Como quer ser chamado" value={respNome} onChange={e => setRespNome(e.target.value)} required />
                </div>
                <div className="field">
                  <label>E-mail</label>
                  <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
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
                <div className="field">
                  <label>Confirmar senha</label>
                  <input type="password" placeholder="Repita a senha" value={confirma} onChange={e => setConfirma(e.target.value)} required
                    style={{ borderColor: confirma && senha !== confirma ? '#E24B4A' : confirma && senha === confirma ? '#0F8050' : '#E0DDD8' }} />
                  {confirma && senha !== confirma && <div style={{ fontSize: 11, color: '#E24B4A', marginTop: 4 }}>As senhas não coincidem</div>}
                </div>
                <div className="field">
                  <label>Seu bairro</label>
                  <select value={bairroPessoal} onChange={e => setBairroPessoal(e.target.value)}>
                    {BAIRROS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Seu WhatsApp <span style={{ color: '#E24B4A' }}>*</span></label>
                  <input type="tel" placeholder="(21) 99999-9999" value={whatsappPessoal}
                    onChange={e => setWhatsappPessoal(e.target.value.replace(/[^0-9]/g, ''))} required maxLength={11} />
                </div>
                {erro && <div className="erro-msg">⚠️ {erro}</div>}
                <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Enviando código...' : 'Continuar →'}</button>
                <div className="auth-footer">Já tem conta? <a href="/login?redirect=/anunciar">Fazer login</a></div>
              </form>
            </>
          ) : phase === 'verify' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>Verifique seu email</div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.7, marginBottom: 24 }}>
                Enviamos um código de 6 dígitos para<br /><strong>{pendingData?.email}</strong>
              </div>
              <form onSubmit={handleVerify}>
                <input type="text" inputMode="numeric" maxLength={6} value={code}
                  onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))} placeholder="000000"
                  style={{ width: '100%', padding: '14px', textAlign: 'center', fontSize: 28, fontWeight: 700, letterSpacing: 12, border: '1.5px solid #E0DDD8', borderRadius: 12, fontFamily: 'Inter,sans-serif', marginBottom: 12, outline: 'none' }} />
                {erro && <div className="erro-msg">⚠️ {erro}</div>}
                <button type="submit" disabled={loading || code.length < 6} className="btn-primary"
                  style={{ background: code.length === 6 ? '#C9951A' : '#E0DDD8', color: code.length === 6 ? '#fff' : '#AAA', cursor: code.length === 6 ? 'pointer' : 'not-allowed' }}>
                  {loading ? 'Verificando...' : 'Confirmar código'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => { setPhase('conta'); setCode(''); setErro('') }}>← Voltar</button>
              </form>
            </div>
          ) : (
            <>
              <div className="stage-tag">Etapa 2 de 2 · seu negócio</div>
              <div className="page-title">Cadastrar empresa</div>
              <div className="page-sub">Preencha os dados para aparecer no Trindade Online</div>

              <div className="steps">
                <div className="step-grp">
                  <div className={`step-circle ${bizStep === 1 ? 'on' : bizStep > 1 ? 'done' : ''}`}>{bizStep > 1 ? '✓' : '1'}</div>
                  <span className={`step-lbl ${bizStep === 1 ? 'on' : ''}`}>Dados</span>
                </div>
                <div className={`step-line ${bizStep > 1 ? 'done' : ''}`} />
                <div className="step-grp">
                  <div className={`step-circle ${bizStep === 2 ? 'on' : bizStep > 2 ? 'done' : ''}`}>{bizStep > 2 ? '✓' : '2'}</div>
                  <span className={`step-lbl ${bizStep === 2 ? 'on' : ''}`}>Contato</span>
                </div>
                <div className={`step-line ${bizStep > 2 ? 'done' : ''}`} />
                <div className="step-grp">
                  <div className={`step-circle ${bizStep === 3 ? 'on' : ''}`}>3</div>
                  <span className={`step-lbl ${bizStep === 3 ? 'on' : ''}`}>Fotos</span>
                </div>
              </div>

              {bizStep === 1 && (
                <>
                  <div className="field">
                    <label>Nome da empresa *</label>
                    <input className="uppercase-input" type="text" placeholder="NOME DA EMPRESA" value={nome} onChange={e => setNome(e.target.value.toUpperCase())} />
                    <div className="field-hint">Nome exibido em letras maiúsculas automaticamente</div>
                  </div>
                  <div className="field">
                    <label>CPF / CNPJ *</label>
                    <input type="text" placeholder="000.000.000-00 ou 00.000.000/0001-00" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Categoria *</label>
                    <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setSelectedSubs([]) }}>
                      <option value="">Selecione a categoria...</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                    </select>
                  </div>

                  {categoryId && filteredSubs.length > 0 && (
                    <div className="field">
                      <label>Subcategorias <span style={{ fontSize: 11, color: '#AAA', fontWeight: 400 }}>(selecione todas que se aplicam)</span></label>
                      <div className="subcat-dropdown-wrap" ref={subcatRef}>
                        <div className="subcat-dropdown-btn" onClick={() => setSubcatOpen(!subcatOpen)}>
                          <span>
                            {selectedSubs.length === 0 && 'Selecione as subcategorias'}
                            {selectedSubs.length === 1 && (() => { const s = filteredSubs.find(x => x.id === selectedSubs[0]); return s ? `${s.emoji} ${s.name}` : '1 subcategoria selecionada' })()}
                            {selectedSubs.length > 1 && `${selectedSubs.length} subcategorias selecionadas`}
                          </span>
                          <span className="subcat-dropdown-arrow">{subcatOpen ? '▲' : '▼'}</span>
                        </div>
                        {subcatOpen && (
                          <div className="subcat-dropdown-panel">
                            {[...filteredSubs].sort((a, b) => {
                              const aSel = selectedSubs.includes(a.id), bSel = selectedSubs.includes(b.id)
                              if (aSel && !bSel) return -1
                              if (!aSel && bSel) return 1
                              return a.name.localeCompare(b.name)
                            }).map(s => (
                              <label key={s.id} className="subcat-option">
                                <input type="checkbox" checked={selectedSubs.includes(s.id)} onChange={() => toggleSub(s.id)} />
                                <span>{s.emoji} {s.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="field" style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 12, color: '#888' }}>Não encontrou sua subcategoria? Sugira aqui</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="text" placeholder="Ex: Barbearia infantil" value={subcatSugestao}
                        onChange={e => setSubcatSugestao(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && subcatSugestao.trim()) { e.preventDefault(); setSubcatSugestoes(s => [...s, subcatSugestao.trim()]); setSubcatSugestao('') } }}
                        style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #E0DDD8', borderRadius: 10, fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none' }} />
                      <button type="button" onClick={() => { if (subcatSugestao.trim()) { setSubcatSugestoes(s => [...s, subcatSugestao.trim()]); setSubcatSugestao('') } }}
                        style={{ padding: '10px 16px', background: '#F5F2EC', border: '1.5px solid #E0DDD8', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#555' }}>+ Adicionar</button>
                    </div>
                    {subcatSugestoes.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {subcatSugestoes.map((s, i) => (
                          <span key={i} style={{ background: '#FEF3E2', border: '1px solid #F5C77A', borderRadius: 20, padding: '3px 10px', fontSize: 12, color: '#854F0B', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {s}
                            <button type="button" onClick={() => setSubcatSugestoes(ss => ss.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9951A', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label>Endereço *</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input style={{ flex: 1 }} type="text" placeholder="CEP" inputMode="numeric" value={cep} onChange={e => handleCepChange(e.target.value)} />
                      <input style={{ width: 100 }} type="text" placeholder="Número" value={numero} onChange={e => handleNumeroChange(e.target.value)} />
                    </div>
                    {cepLoading && <div className="field-hint" style={{ marginTop: 0, marginBottom: 6 }}>Buscando endereço...</div>}
                    {cepError && <div className="field-hint" style={{ marginTop: 0, marginBottom: 6, color: '#C43D3D' }}>CEP não encontrado — preenche o endereço direto embaixo</div>}
                    <input type="text" placeholder="Rua, bairro, complemento" value={endereco} onChange={e => setEndereco(e.target.value)} />
                  </div>
                  {erro && <div className="erro-msg">⚠️ {erro}</div>}
                  <button className="btn-primary" onClick={nextBizStep}>Continuar →</button>
                </>
              )}

              {bizStep === 2 && (
                <>
                  <div className="field">
                    <label>WhatsApp da empresa *</label>
                    <input type="tel" placeholder="(21) 9 0000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Link externo <span style={{ fontSize: 11, color: '#AAA', fontWeight: 400 }}>(opcional)</span></label>
                    <select value={linkLabel} onChange={e => setLinkLabel(e.target.value)} style={{ marginBottom: 8 }}>
                      {LINK_LABELS.map(l => <option key={l}>{l}</option>)}
                    </select>
                    <input type="url" placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
                    <div className="field-hint">Ex: link do cardápio, site, iFood, Instagram...</div>
                  </div>
                  <div className="field">
                    <label>
                      {categoryId === IGREJAS_CATEGORY_ID ? '⛪ Horários de culto' : 'Horário de funcionamento'}
                      <span style={{ fontSize: 11, color: '#AAA', fontWeight: 400 }}> (opcional)</span>
                    </label>
                    {categoryId === IGREJAS_CATEGORY_ID ? (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 10, padding: '6px 10px', background: '#FEF3E2', borderRadius: 8, borderLeft: '3px solid #C9951A' }}>
                          Preencha os horários dos cultos. Deixe em branco os dias sem culto.
                        </div>
                        {churchHours.map((ch, i) => (
                          <div key={i} className="church-row">
                            <div className="church-day">{ch.day}</div>
                            <div className="church-period">
                              <div className="church-period-lbl">MANHÃ</div>
                              <input type="time" className="church-time" value={ch.manha} onChange={e => { const n = [...churchHours]; n[i] = { ...n[i], manha: e.target.value }; setChurchHours(n) }} />
                            </div>
                            <div className="church-period">
                              <div className="church-period-lbl">NOITE</div>
                              <input type="time" className="church-time" value={ch.noite} onChange={e => { const n = [...churchHours]; n[i] = { ...n[i], noite: e.target.value }; setChurchHours(n) }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <BusinessHoursEditor hours={hours} setHours={setHours} flexible={flexibleHours} setFlexible={setFlexibleHours} />
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label>🛵 Entrega</label>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAF8', border: '0.5px solid #E0DDD8', borderRadius: 10, padding: '10px 14px', marginTop: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>Fazemos entrega própria</div>
                        <div style={{ fontSize: 11, color: '#AAA' }}>Aparece pros clientes quando ativado</div>
                      </div>
                      <div onClick={() => setDeliveryAvailable(d => !d)}
                        style={{ width: 44, height: 24, borderRadius: 12, background: deliveryAvailable ? '#0F8050' : '#E0DDD8', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 2, left: deliveryAvailable ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.2)', transition: 'left .2s' }} />
                      </div>
                    </div>
                  </div>
                  {erro && <div className="erro-msg">⚠️ {erro}</div>}
                  <button className="btn-primary" onClick={nextBizStep}>Continuar →</button>
                  <button className="btn-secondary" onClick={() => setBizStep(1)}>← Voltar</button>
                </>
              )}

              {bizStep === 3 && (
                <form onSubmit={handleSubmit}>
                  <div className="field">
                    <label>Fotos da empresa * <span style={{ fontSize: 11, color: '#AAA', fontWeight: 400 }}>mínimo 1 · máximo 5 · primeira é a capa</span></label>
                    <div className="photo-grid">
                      {previews.map((p, i) => (
                        <div key={i} className="photo-slot">
                          <img src={p} alt={`foto ${i + 1}`} />
                          <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
                          {i === 0 && <div style={{ position: 'absolute', bottom: 4, left: 4, background: '#C9951A', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 5 }}>CAPA</div>}
                        </div>
                      ))}
                      {photos.length < 5 && (
                        <div className="photo-add-btn" onClick={() => fileRef.current?.click()}>
                          <span style={{ fontSize: 24 }}>📷</span>
                          <span>Adicionar foto</span>
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotos} />
                    <div className="field-hint">JPG ou PNG · Máx. 5MB cada</div>
                  </div>
                  <div className="field">
                    <label>Descrição <span style={{ fontSize: 11, color: '#AAA', fontWeight: 400 }}>(opcional)</span></label>
                    <textarea rows={4} placeholder="Conte sobre sua empresa, o que oferece, diferenciais..." value={descricao} onChange={e => setDescricao(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Tags <span style={{ fontSize: 11, color: '#AAA', fontWeight: 400 }}>Digite e pressione Enter (máx. 30)</span></label>
                    <div style={{ border: '1.5px solid #E0DDD8', borderRadius: 11, padding: '8px 10px', background: '#FAFAF8', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {tags.map((tag, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#FEF3E2', border: '1px solid #C9951A', borderRadius: 20, fontSize: 12, color: '#854F0B', fontWeight: 600 }}>
                          #{tag}
                          <button onClick={() => setTags(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#C9951A', padding: 0, lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                      <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => {
                          if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                            e.preventDefault()
                            const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9àáâãéêíóôõúç ]/g, '')
                            if (tag && !tags.includes(tag)) setTags(prev => [...prev, tag])
                            setTagInput('')
                          }
                        }}
                        placeholder={tags.length === 0 ? 'ex: pizza, delivery, hambúrguer...' : ''}
                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: "'Inter',sans-serif", minWidth: 120, flex: 1 }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#AAA', marginTop: 4 }}>{tags.length} tags</div>
                  </div>
                  <div className="note-box">
                    ✅ Nossa equipe vai revisar e aprovar seu cadastro em até 24h.<br />
                    Você receberá uma notificação assim que estiver no ar.
                  </div>
                  {erro && <div className="erro-msg">⚠️ {erro}</div>}
                  <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Enviando...' : 'Enviar para aprovação →'}</button>
                  <button type="button" className="btn-secondary" onClick={() => setBizStep(2)}>← Voltar</button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
