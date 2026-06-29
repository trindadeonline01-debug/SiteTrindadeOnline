'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Category = { id: string; name: string; emoji: string }
type Subcategory = { id: string; name: string; emoji: string; category_id: string }

const IGREJAS_CATEGORY_ID = '00000000-0000-0000-0000-000000000008'

const DIAS_SEMANA = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo']

const HOURS_DEFAULT = [
  { label: 'Seg–Sex', hours: '' },
  { label: 'Sábado', hours: '' },
  { label: 'Domingo', hours: '' },
  { label: 'Feriados', hours: '' },
]

const LINK_LABELS = [
  'Ver cardápio', 'Fazer pedido', 'Acessar site',
  'Ver catálogo', 'Agendar consulta', 'Fazer uma visita',
  'Solicitar contato', 'Personalizado'
]

export default function EmpresaCadastrarPage() {
  const [step, setStep]                 = useState(1)
  const [loading, setLoading]           = useState(false)
  const [erro, setErro]                 = useState('')
  const [ok, setOk]                     = useState(false)
  const [categories, setCategories]     = useState<Category[]>([])
  const [subcategories, setSubcats]     = useState<Subcategory[]>([])
  const [userId, setUserId]             = useState<string|null>(null)

  // Etapa 1
  const [nome, setNome]                 = useState('')
  const [categoryId, setCategoryId]     = useState('')
  const [selectedSubs, setSelectedSubs] = useState<string[]>([])
  const [cpfCnpj, setCpfCnpj]             = useState('')
  const [endereco, setEndereco]         = useState('')

  // Etapa 2
  const [phone, setPhone]               = useState('')
  const [linkLabel, setLinkLabel]       = useState('Ver cardápio')
  const [linkUrl, setLinkUrl]           = useState('')
  const [hours, setHours]               = useState(HOURS_DEFAULT)
  const [churchHours, setChurchHours]   = useState<{day:string;manha:string;noite:string}[]>(
    DIAS_SEMANA.map(day => ({ day, manha: '', noite: '' }))
  )

  // Etapa 3
  const [photos, setPhotos]             = useState<File[]>([])
  const [previews, setPreviews]         = useState<string[]>([])
  const [descricao, setDescricao]       = useState('')
  const fileRef                         = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      setUserId(session.user.id)
    })
    supabase.from('categories').select('*').order('order').then(({ data }) => setCategories(data || []))
    supabase.from('subcategories').select('*').order('order').then(({ data }) => setSubcats(data || []))
  }, [])

  const [subcatSearch, setSubcatSearch] = useState('')
  const [subcatSearch, setSubcatSearch] = useState('')
  const filteredSubs = subcategories.filter(s => s.category_id === categoryId)
  const filteredSubsSearch = filteredSubs.filter(s => s.name.toLowerCase().includes(subcatSearch.toLowerCase()))

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
    const newPreviews = newFiles.map(f => URL.createObjectURL(f))
    setPreviews(newPreviews)
  }

  function removePhoto(i: number) {
    const newFiles = photos.filter((_, idx) => idx !== i)
    const newPrevs = previews.filter((_, idx) => idx !== i)
    setPhotos(newFiles)
    setPreviews(newPrevs)
  }

  function nextStep() {
    setErro('')
    if (step === 1) {
      if (!nome.trim()) { setErro('Digite o nome da empresa.'); return }
      if (!categoryId)  { setErro('Selecione uma categoria.'); return }
      if (!endereco.trim()) { setErro('Digite o endereço.'); return }
    }
    if (step === 2) {
      if (!phone.trim()) { setErro('Digite o WhatsApp da empresa.'); return }
    }
    setStep(s => s + 1)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (photos.length === 0) { setErro('Adicione pelo menos 1 foto da empresa.'); return }
    if (!userId) return

    setLoading(true)

    try {
      // 1. Cria a empresa
      const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now()

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          owner_id: userId,
          name: nome.toUpperCase(),
          slug,
          category_id: categoryId || null,
          description: descricao || null,
          address: endereco || null,
          phone: phone || null,
          external_link: linkUrl || null,
          external_link_label: linkUrl ? linkLabel : null,
          status: 'pending',
          plan: 'free',
        })
        .select()
        .single()

      if (companyError) throw new Error('Erro ao criar empresa.')

      // 2. Subcategorias
      if (selectedSubs.length > 0) {
        await supabase.from('company_subcategories').insert(
          selectedSubs.map((sid, i) => ({ company_id: company.id, subcategory_id: sid, is_primary: i === 0 }))
        )
      }

      // 3. Horários
      const isIgreja = categoryId === IGREJAS_CATEGORY_ID
      if (isIgreja) {
        const cultosEntries: {company_id:string;label:string;hours:string;order:number}[] = []
        let order = 0
        churchHours.forEach(({ day, manha, noite }) => {
          if (manha.trim()) cultosEntries.push({ company_id: company.id, label: `${day} manhã`, hours: manha.trim(), order: order++ })
          if (noite.trim()) cultosEntries.push({ company_id: company.id, label: `${day} noite`, hours: noite.trim(), order: order++ })
        })
        if (cultosEntries.length > 0) await supabase.from('company_hours').insert(cultosEntries)
      } else {
        const validHours = hours.filter(h => h.hours.trim())
        if (validHours.length > 0) {
          await supabase.from('company_hours').insert(
            validHours.map((h, i) => ({ company_id: company.id, label: h.label, hours: h.hours, order: i }))
          )
        }
      }

      // 4. Upload das fotos
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i]
        const ext = file.name.split('.').pop()
        const path = `${company.id}/${i}-${Date.now()}.${ext}`

        const { data: upload } = await supabase.storage
          .from('company-photos')
          .upload(path, file, { upsert: true })

        if (upload) {
          const { data: urlData } = supabase.storage.from('company-photos').getPublicUrl(path)
          await supabase.from('company_photos').insert({
            company_id: company.id,
            url: urlData.publicUrl,
            order: i,
          })
        }
      }

      // 5. Atualiza user_type para company
      await supabase.from('profiles').update({ user_type: 'company' }).eq('id', userId)

      setOk(true)

    } catch (err: any) {
      setErro(err.message || 'Erro inesperado. Tente novamente.')
    }
    setLoading(false)
  }

  const catSel = categories.find(c => c.id === categoryId)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #F0EDE8; }
        .page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 24px 16px 48px; }
        .card { background: #fff; border-radius: 20px; padding: 32px 28px; width: 100%; max-width: 520px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
        .logo { text-align: center; margin-bottom: 24px; }
        .logo a { font-family: 'Bebas Neue', sans-serif; font-size: 26px; letter-spacing: 2px; text-decoration: none; color: #111; }
        .logo span { color: #C9951A; }
        .page-title { font-size: 18px; font-weight: 700; color: #111; margin-bottom: 4px; }
        .page-sub   { font-size: 13px; color: #AAA; margin-bottom: 24px; }

        /* STEPS */
        .steps { display: flex; align-items: center; gap: 6px; margin-bottom: 28px; }
        .step-grp { display: flex; align-items: center; gap: 5px; flex: 1; }
        .step-circle { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #E0DDD8; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #AAA; flex-shrink: 0; transition: all .2s; }
        .step-circle.on   { border-color: #C9951A; background: #C9951A; color: #fff; }
        .step-circle.done { border-color: #0F8050; background: #0F8050; color: #fff; }
        .step-lbl { font-size: 10px; color: #AAA; }
        .step-lbl.on { color: #C9951A; font-weight: 600; }
        .step-line { flex: 1; height: 2px; background: #E0DDD8; border-radius: 2px; margin: 0 4px; }
        .step-line.done { background: #0F8050; }

        /* FIELDS */
        .field { margin-bottom: 14px; }
        .field label { display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 6px; }
        .field input, .field textarea, .field select {
          width: 100%; padding: 12px 14px; border: 1.5px solid #E0DDD8;
          border-radius: 11px; font-size: 14px; font-family: 'Inter', sans-serif;
          color: #222; background: #FAFAF8; outline: none; transition: border-color .15s;
        }
        .field input:focus, .field textarea:focus, .field select:focus { border-color: #C9951A; background: #fff; }
        .field textarea { resize: none; }
        .field-hint { font-size: 11px; color: #AAA; margin-top: 5px; }
        .uppercase-input { text-transform: uppercase; letter-spacing: 1px; font-family: 'Bebas Neue', sans-serif !important; }

        /* SUBCATS */
        .subcats-wrap { display: flex; flex-wrap: wrap; gap: 7px; max-height: 140px; overflow-y: auto; padding: 2px; }
        .subcat-chip { padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid #E0DDD8; background: #FAFAF8; color: #666; transition: all .15s; }
        .subcat-chip.on { border-color: #C9951A; background: #FEF3E2; color: #854F0B; font-weight: 600; }

        /* HOURS */
        .hours-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .church-row { display: grid; grid-template-columns: 72px 1fr 1fr; gap: 8px; align-items: center; padding: 8px 10px; background: #FAFAF8; border: 0.5px solid #E0DDD8; border-radius: 10px; margin-bottom: 6px; }
        .church-day { font-size: 12px; font-weight: 600; color: #222; }
        .church-period { display: flex; flex-direction: column; gap: 3px; }
        .church-period-lbl { font-size: 9px; color: #AAA; font-weight: 700; letter-spacing: .3px; }
        .church-time { width: 100%; padding: 6px 8px; border: 1px solid #E0DDD8; border-radius: 7px; font-size: 12px; font-family: 'Inter',sans-serif; color: #222; background: #fff; outline: none; }
        .church-time:focus { border-color: #C9951A; }
        .hour-box { background: #FAFAF8; border: 0.5px solid #E0DDD8; border-radius: 9px; padding: 9px 10px; }
        .hour-day { font-size: 9px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
        .hour-input { width: 100%; border: none; background: transparent; font-size: 12px; color: #444; font-family: 'Inter', sans-serif; outline: none; }

        /* PHOTOS */
        .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
        .photo-slot {
          height: 90px; border: 2px dashed #E0DDD8; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-size: 24px; transition: all .15s; background: #FAFAF8;
          position: relative; overflow: hidden;
        }
        .photo-slot:hover { border-color: #C9951A; background: #FEF3E2; }
        .photo-slot img { width: 100%; height: 100%; object-fit: cover; }
        .photo-remove {
          position: absolute; top: 4px; right: 4px;
          width: 20px; height: 20px; border-radius: 50%;
          background: rgba(0,0,0,.6); color: #fff; border: none;
          font-size: 11px; cursor: pointer; display: flex;
          align-items: center; justify-content: center;
        }
        .photo-add-btn {
          height: 90px; border: 2px dashed #C9951A; border-radius: 10px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 4px; cursor: pointer; background: #FEF3E2; color: #C9951A;
          font-size: 11px; font-weight: 600; transition: all .15s;
        }
        .photo-add-btn:hover { background: #FDE8C0; }

        /* NOTE */
        .note-box { background: #FEF3E2; border: 0.5px solid #F5C77A; border-radius: 10px; padding: 10px 14px; font-size: 12px; color: #854F0B; margin-bottom: 14px; line-height: 1.6; }

        /* BUTTONS */
        .btn-primary { width: 100%; padding: 13px; background: #C9951A; color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: 'Inter', sans-serif; cursor: pointer; transition: background .15s; margin-bottom: 10px; }
        .btn-primary:hover:not(:disabled) { background: #B8841A; }
        .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .btn-secondary { width: 100%; padding: 11px; background: #fff; color: #888; border: 1.5px solid #E0DDD8; border-radius: 12px; font-size: 13px; font-family: 'Inter', sans-serif; cursor: pointer; transition: all .15s; }
        .btn-secondary:hover { border-color: #CCC; color: #555; }
        .erro-msg { background: #FEF0F0; border: 1px solid #F5BCBC; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #C0392B; margin-bottom: 14px; }
      `}</style>

      <div className="page">
        <div className="card">
          <div className="logo"><a href="/">TRINDADE <span>ONLINE</span></a></div>

          {ok ? (
            <div style={{ textAlign:'center', padding:'16px 0' }}>
              <div style={{ fontSize:56, marginBottom:16 }}>⏳</div>
              <div style={{ fontSize:20, fontWeight:700, color:'#111', marginBottom:8 }}>Cadastro enviado!</div>
              <div style={{ fontSize:13, color:'#888', lineHeight:1.8, marginBottom:24 }}>
                <strong>{nome.toUpperCase()}</strong> está em análise.<br/>
                Nossa equipe do Trindade Online vai verificar e você receberá uma notificação assim que estiver no ar.<br/>
                Prazo: até 24 horas.
              </div>
              <button className="btn-primary" onClick={() => window.location.href = '/'}>Voltar ao início</button>
            </div>
          ) : (
            <>
              <div className="page-title">Cadastrar empresa</div>
              <div className="page-sub">Preencha os dados para aparecer no Trindade Online</div>

              {/* STEPS */}
              <div className="steps">
                <div className="step-grp">
                  <div className={`step-circle ${step===1?'on':step>1?'done':''}`}>{step>1?'✓':'1'}</div>
                  <span className={`step-lbl ${step===1?'on':''}`}>Dados</span>
                </div>
                <div className={`step-line ${step>1?'done':''}`}/>
                <div className="step-grp">
                  <div className={`step-circle ${step===2?'on':step>2?'done':''}`}>{step>2?'✓':'2'}</div>
                  <span className={`step-lbl ${step===2?'on':''}`}>Contato</span>
                </div>
                <div className={`step-line ${step>2?'done':''}`}/>
                <div className="step-grp">
                  <div className={`step-circle ${step===3?'on':''}`}>3</div>
                  <span className={`step-lbl ${step===3?'on':''}`}>Fotos</span>
                </div>
              </div>

              {/* ── ETAPA 1 ── */}
              {step === 1 && (
                <>
                  <div className="field">
                    <label>Nome da empresa *</label>
                    <input
                      className="uppercase-input"
                      type="text"
                      placeholder="NOME DA EMPRESA"
                      value={nome}
                      onChange={e => setNome(e.target.value.toUpperCase())}
                    />
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
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                      ))}
                    </select>
                  </div>

                  {categoryId && filteredSubs.length > 0 && (
                    <div className="field">
                      <label>Subcategorias <span style={{fontSize:11,color:'#AAA',fontWeight:400}}>(selecione todas que se aplicam)</span></label>
                      <div className="subcats-wrap">
                        {filteredSubs.map(s => (
                          <div key={s.id} className={`subcat-chip ${selectedSubs.includes(s.id)?'on':''}`} onClick={() => toggleSub(s.id)}>
                            {s.emoji} {s.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="field">
                    <label>Endereço completo *</label>
                    <input type="text" placeholder="Rua, número, bairro" value={endereco} onChange={e => setEndereco(e.target.value)} />
                  </div>

                  {erro && <div className="erro-msg">⚠️ {erro}</div>}
                  <button className="btn-primary" onClick={nextStep}>Continuar →</button>
                </>
              )}

              {/* ── ETAPA 2 ── */}
              {step === 2 && (
                <>
                  <div className="field">
                    <label>WhatsApp da empresa *</label>
                    <input type="tel" placeholder="(21) 9 0000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>

                  <div className="field">
                    <label>Link externo <span style={{fontSize:11,color:'#AAA',fontWeight:400}}>(opcional)</span></label>
                    <select value={linkLabel} onChange={e => setLinkLabel(e.target.value)} style={{ marginBottom:8 }}>
                      {LINK_LABELS.map(l => <option key={l}>{l}</option>)}
                    </select>
                    <input type="url" placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
                    <div className="field-hint">Ex: link do cardápio, site, iFood, Instagram...</div>
                  </div>

                  <div className="field">
                    <label>
                      {categoryId === IGREJAS_CATEGORY_ID ? '⛪ Horários de culto' : 'Horário de funcionamento'}
                      <span style={{fontSize:11,color:'#AAA',fontWeight:400}}> (opcional)</span>
                    </label>

                    {categoryId === IGREJAS_CATEGORY_ID ? (
                      <div style={{marginTop:8}}>
                        <div style={{fontSize:11,color:'#888',marginBottom:10,padding:'6px 10px',background:'#FEF3E2',borderRadius:8,borderLeft:'3px solid #C9951A'}}>
                          Preencha os horários dos cultos. Deixe em branco os dias sem culto.
                        </div>
                        {churchHours.map((ch, i) => (
                          <div key={i} className="church-row">
                            <div className="church-day">{ch.day}</div>
                            <div className="church-period">
                              <div className="church-period-lbl">MANHÃ</div>
                              <input type="time" className="church-time" value={ch.manha}
                                onChange={e => { const n=[...churchHours]; n[i]={...n[i],manha:e.target.value}; setChurchHours(n) }}/>
                            </div>
                            <div className="church-period">
                              <div className="church-period-lbl">NOITE</div>
                              <input type="time" className="church-time" value={ch.noite}
                                onChange={e => { const n=[...churchHours]; n[i]={...n[i],noite:e.target.value}; setChurchHours(n) }}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="hours-grid">
                        {hours.map((h, i) => (
                          <div key={i} className="hour-box">
                            <div className="hour-day">{h.label}</div>
                            <input className="hour-input" value={h.hours} placeholder="Ex: 08:00–18:00"
                              onChange={e => { const newH=[...hours]; newH[i]={...newH[i],hours:e.target.value}; setHours(newH) }}/>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {erro && <div className="erro-msg">⚠️ {erro}</div>}
                  <button className="btn-primary" onClick={nextStep}>Continuar →</button>
                  <button className="btn-secondary" onClick={() => setStep(1)}>← Voltar</button>
                </>
              )}

              {/* ── ETAPA 3 ── */}
              {step === 3 && (
                <form onSubmit={handleSubmit}>
                  <div className="field">
                    <label>Fotos da empresa * <span style={{fontSize:11,color:'#AAA',fontWeight:400}}>mínimo 1 · máximo 5 · primeira é a capa</span></label>
                    <div className="photo-grid">
                      {previews.map((p, i) => (
                        <div key={i} className="photo-slot">
                          <img src={p} alt={`foto ${i+1}`} />
                          <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
                          {i === 0 && <div style={{ position:'absolute', bottom:4, left:4, background:'#C9951A', color:'#fff', fontSize:8, fontWeight:700, padding:'1px 6px', borderRadius:5 }}>CAPA</div>}
                        </div>
                      ))}
                      {photos.length < 5 && (
                        <div className="photo-add-btn" onClick={() => fileRef.current?.click()}>
                          <span style={{ fontSize:24 }}>📷</span>
                          <span>Adicionar foto</span>
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={handlePhotos} />
                    <div className="field-hint">JPG ou PNG · Máx. 5MB cada</div>
                  </div>

                  <div className="field">
                    <label>Descrição <span style={{fontSize:11,color:'#AAA',fontWeight:400}}>(opcional)</span></label>
                    <textarea rows={4} placeholder="Conte sobre sua empresa, o que oferece, diferenciais..." value={descricao} onChange={e => setDescricao(e.target.value)} />
                  </div>

                  <div className="note-box">
                    ✅ Nossa equipe vai revisar e aprovar seu cadastro em até 24h.<br/>
                    Você receberá uma notificação assim que estiver no ar.
                  </div>

                  {erro && <div className="erro-msg">⚠️ {erro}</div>}

                  <button className="btn-primary" type="submit" disabled={loading}>
                    {loading ? 'Enviando...' : 'Enviar para aprovação →'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setStep(2)}>← Voltar</button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}