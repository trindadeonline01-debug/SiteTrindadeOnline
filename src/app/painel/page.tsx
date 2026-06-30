                           <span className="pt-d-day">{d}</span><span className="pt-d-price">{p}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-dest-card">
                    <div className="pt-dest-visual sub">
                      <div className="pt-dest-ico">🏷️</div>
                      <div className="pt-dest-badge-gold">★ 1º LUGAR</div>
                      <div className="pt-dest-position"><strong>Página da subcategoria</strong>Primeiro quando o morador busca pela especialidade (ex: Pizzaria)</div>
                      <div className="pt-rank-row">
                        <div className="pt-rank-item you">★ você</div>
                        <div className="pt-rank-item other"/><div className="pt-rank-item other"/>
                      </div>
                    </div>
                    <div className="pt-dest-info">
                      <div className="pt-dest-info-title">Destaque Subcategoria</div>
                      <div className="pt-dest-info-desc">Primeiro na sua subcategoria (ex: Pizzaria, Barbearia, Padaria)</div>
                      <div className="pt-dest-opts">
                        {[['7 dias','R$ 14,90'],['15 dias','R$ 27,90'],['30 dias','R$ 49,90']].map(([d,p],i)=>(
                          <button key={i} className="pt-d-opt" onClick={()=>assinarDestaque('subcat', [7,15,30][i])}>
                            <span className="pt-d-day">{d}</span><span className="pt-d-price">{p}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>

              {highlights.filter(h=>h.status==='expired').length > 0 && (
                <>
                  <div className="section-label">HISTÓRICO</div>
                  {highlights.filter(h=>h.status==='expired').map(h => (
                    <div key={h.id} className="hl-card exp">
                      <div className="hl-top">
                        <span style={{fontSize:13,fontWeight:600,color:'#888'}}>{h.level==='home'?'Home':h.level==='category'?'Categoria':'Subcategoria'} · {h.duration_days}d</span>
                        <span className="hl-badge b-exp">Encerrado</span>
                      </div>
                      <div style={{fontSize:11,color:'#CCC',marginBottom:8}}>{fmtDate(h.starts_at)} – {fmtDate(h.expires_at)}</div>
                      <div className="hl-stats">
                        <div><div className="hs-num" style={{color:'#AAA'}}>{h.clicks_count}</div><div className="hs-lbl">Cliques</div></div>
                        <div><div className="hs-num" style={{color:'#AAA'}}>{h.impressions_count}</div><div className="hs-lbl">Impressões</div></div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {/* AVALIAÇÕES */}
          {tab === 'avaliacoes' && (
            <div className="content">
              {reviews.length === 0 ? (
                <div className="empty"><div>⭐</div><div>Nenhuma avaliação ainda</div><div style={{fontSize:13,marginTop:8}}>Quando clientes avaliarem sua empresa, aparecem aqui</div></div>
              ) : (
                <>
                  <div className="rating-summary">
                    <div style={{textAlign:'center'}}>
                      <div className="rating-big">{company.avg_rating>0?company.avg_rating.toFixed(1):'—'}</div>
                      <div style={{fontSize:18,color:'#C9951A',margin:'4px 0 2px'}}>{'★'.repeat(Math.round(company.avg_rating))}</div>
                      <div style={{fontSize:12,color:'#AAA'}}>{company.total_reviews} avaliações</div>
                    </div>
                    <div className="rating-bars">
                      {[5,4,3,2,1].map(star => {
                        const cnt = reviews.filter(r=>r.rating===star).length
                        const pct = reviews.length>0?(cnt/reviews.length)*100:0
                        return (
                          <div key={star} className="bar-row">
                            <span className="bar-lbl">{star}</span>
                            <div className="bar-bg"><div className="bar-fill" style={{width:`${pct}%`}}/></div>
                            <span className="bar-cnt">{cnt}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="review-grid">
                    {reviews.map(r => (
                      <div key={r.id} className="review-card">
                        <div className="review-top">
                          <div className="review-av">{r.user?.name?.[0]||'?'}</div>
                          <div><div className="review-name">{r.user?.name||'Usuário'}</div></div>
                          <span className="review-date">{fmtDate(r.created_at)}</span>
                        </div>
                        <div className="review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
                        {r.text && <div className="review-text">{r.text}</div>}
                        {r.response ? (
                          <div className="reply-existing"><div className="reply-lbl">Sua resposta:</div><div className="reply-txt">{r.response.text}</div></div>
                        ) : replyId===r.id ? (
                          <div className="reply-box">
                            <textarea className="reply-input" rows={3} placeholder="Escreva sua resposta pública..." value={replyText} onChange={e=>setReplyText(e.target.value)}/>
                            <button className="reply-send" onClick={()=>sendReply(r.id)}>Publicar resposta</button>
                          </div>
                        ) : (
                          <div className="review-actions">
                            <button className="btn-reply" onClick={()=>{setReplyId(r.id);setReplyText('')}}>💬 Responder</button>
                            <button className="btn-flag" onClick={()=>flagReview(r.id)}>⚑ Sinalizar</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* PERFIL */}
          {tab === 'perfil' && (
            <div className="content">
              <div className="sec-card">
                <div className="sec-hdr"><span className="sec-title">FOTOS ({photos.length}/5)</span></div>
                <div className="sec-body">
                  <div className="photos-grid">
                    {photos.map((p,i) => (
                      <div key={p.id} className="photo-item">
                        <img src={p.url} alt={`foto ${i+1}`}/>
                        <button className="photo-rm" onClick={()=>removePhoto(p.id)}>✕</button>
                        {i===0 && <div className="photo-capa">CAPA</div>}
                      </div>
                    ))}
                    {photos.length < 5 && <div className="photo-add" onClick={()=>fileRef.current?.click()}><span style={{fontSize:28}}>📷</span><span>Adicionar</span></div>}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={addPhoto}/>
                </div>
              </div>
              <div className="sec-card">
                <div className="sec-hdr"><span className="sec-title">DADOS DA EMPRESA</span></div>
                <div className="sec-body">
                  <div className="form-grid">
                    <div className="field">
                      <label>Nome da empresa</label>
                      <input type="text" value={editNome} onChange={e=>setEditNome(e.target.value.toUpperCase())} style={{textTransform:'uppercase',fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}/>
                    </div>
                    <div className="field">
                      <label>Categoria *</label>
                      <select value={editCategoryId} onChange={e=>{setEditCategoryId(e.target.value);setEditSubcatIds([])}}>
                        <option value="">Selecionar categoria...</option>
                        {allCategories.map(cat=><option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>)}
                      </select>
                    </div>
                    {editCategoryId && allSubcats.filter(s=>s.category_id===editCategoryId).length > 0 && (
                      <div className="field">
                        <label>Subcategorias <span style={{fontSize:11,color:'#666',fontWeight:400}}>(selecione até 3)</span></label>
                        <div className="subcat-search-wrap">
                          <input
                            type="text"
                            placeholder="🔍 Buscar ou escolha da lista..."
                            value={subcatSearch}
                            onChange={e => setSubcatSearch(e.target.value)}
                            onFocus={() => setSubcatSearch(subcatSearch || ' ')}
                            onBlur={() => setTimeout(() => setSubcatSearch(''), 200)}
                            style={{width:'100%',padding:'10px 12px',border:'1.5px solid #E0DDD8',borderRadius:11,fontSize:13,fontFamily:"'Inter',sans-serif",outline:'none'}}
                          />
                          {subcatSearch && (
                            <div className="subcat-dropdown">
                              {allSubcats
                                .filter(s => s.category_id === editCategoryId && s.name.toLowerCase().includes(subcatSearch.trim().toLowerCase()))
                                .map(s => {
                                  const selected = editSubcatIds.includes(s.id)
                                  const maxed = editSubcatIds.length >= 3 && !selected
                                  return (
                                    <div key={s.id} className="subcat-option" style={{color: maxed ? '#CCC' : '#333', cursor: maxed ? 'not-allowed' : 'pointer', background: selected ? '#FEF3E2' : undefined}}
                                      onMouseDown={() => { if (!maxed) { setEditSubcatIds(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]) } }}>
                                      <span>{s.emoji} {s.name}</span>
                                      {selected ? <span style={{color:'#C9951A',fontWeight:700}}>✓ Selecionado</span> : !maxed ? <span style={{color:'#AAA',fontSize:11}}>+ Adicionar</span> : <span style={{fontSize:11,color:'#CCC'}}>máx. 3</span>}
                                    </div>
                                  )
                              })}
                              {allSubcats.filter(s => s.category_id === editCategoryId && s.name.toLowerCase().includes(subcatSearch.trim().toLowerCase())).length === 0 && (
                                <div style={{padding:'12px 14px',fontSize:13,color:'#AAA'}}>Nenhuma subcategoria encontrada</div>
                              )}
                            </div>
                          )}
                          {editSubcatIds.length > 0 && (
                            <div className="subcat-selected-wrap">
                              {editSubcatIds.map(sid => {
                                const s = allSubcats.find(x => x.id === sid)
                                if (!s) return null
                                return (
                                  <div key={sid} className="subcat-tag">
                                    {s.emoji} {s.name}
                                    <button onClick={() => setEditSubcatIds(prev => prev.filter(x => x !== sid))}>×</button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="field">
                      <label>WhatsApp</label>
                      <input type="tel" value={editPhone} onChange={e=>setEditPhone(e.target.value)} placeholder="(21) 9 0000-0000"/>
                    </div>
                    <div className="field">
                      <label>CPF / CNPJ <span style={{fontSize:11,color:'#C9951A',fontWeight:400}}>* necessário para pagamento via Pix</span></label>
                      <input type="text" value={editCpfCnpj} onChange={e=>setEditCpfCnpj(e.target.value)} placeholder="000.000.000-00 ou 00.000.000/0001-00"/>
                    </div>
                    <div className="field" style={{gridColumn:'1/-1'}}>
                      <label>Endereço</label>
                      <input type="text" value={editAddress} onChange={e=>setEditAddress(e.target.value)} placeholder="Rua, número, bairro"/>
                    </div>
                    <div className="field">
                      <label>Label do link externo</label>
                      <select value={editLinkLabel} onChange={e=>setEditLinkLabel(e.target.value)}>
                        {LINK_LABELS.map(l=><option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>URL do link externo</label>
                      <input type="url" value={editLinkUrl} onChange={e=>setEditLinkUrl(e.target.value)} placeholder="https://..."/>
                    </div>
                    <div className="field" style={{gridColumn:'1/-1'}}>
                      <label>Descrição</label>
                      <textarea rows={4} value={editDesc} onChange={e=>setEditDesc(e.target.value)} placeholder="Sobre sua empresa..."/>
                    </div>
                    <div className="field">
                      <label>Tags <span style={{fontSize:11,color:'#AAA',fontWeight:400}}>Digite e pressione Enter para adicionar</span></label>
                      <div style={{border:'1.5px solid #E0DDD8',borderRadius:11,padding:'8px 10px',background:'#FAFAF8',display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                        {editTags.map((tag,i) => (
                          <div key={i} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 10px',background:'#FEF3E2',border:'1px solid #C9951A',borderRadius:20,fontSize:12,color:'#854F0B',fontWeight:600}}>
                            #{tag}
                            <button onClick={() => setEditTags(prev => prev.filter((_,j) => j !== i))} style={{background:'none',border:'none',cursor:'pointer',fontSize:14,color:'#C9951A',padding:0,lineHeight:1}}>×</button>
                          </div>
                        ))}
                        <input
                          type="text"
                          value={tagInput}
                          onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => {
                            if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                              e.preventDefault()
                              const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9àáâãéêíóôõúç ]/g, '')
                              if (tag && !editTags.includes(tag) && editTags.length < 30) {
                                setEditTags(prev => [...prev, tag])
                              }
                              setTagInput('')
                            }
                          }}
                          placeholder={editTags.length === 0 ? "ex: pizza, delivery, hambúrguer..." : ""}
                          style={{border:'none',background:'transparent',outline:'none',fontSize:13,fontFamily:"'Inter',sans-serif",minWidth:120,flex:1}}
                        />
                      </div>
                      <div style={{fontSize:11,color:'#AAA',marginTop:4}}>{editTags.length}/30 tags · {company?.plan === 'paid' ? '✓ Aparece nas buscas' : '⚠ Ative o plano pago para aparecer nas buscas'}</div>
                    </div>
                  </div>
                  <div className="field">
                    <label>{company.category_id === IGREJAS_CATEGORY_ID ? '⛪ Horários de culto' : 'Horários de funcionamento'}</label>
                    {company.category_id === IGREJAS_CATEGORY_ID ? (
                      <div style={{marginTop:8}}>
                        <div style={{fontSize:11,color:'#888',marginBottom:10,padding:'6px 10px',background:'rgba(201,149,26,.1)',borderRadius:8,borderLeft:'3px solid #C9951A'}}>
                          Preencha os horários dos cultos. Deixe em branco os dias sem culto.
                        </div>
                        {churchHours.map((ch,i)=>(
                          <div key={i} className="church-row">
                            <div className="church-day">{ch.day}</div>
                            <div className="church-period">
                              <div className="church-period-lbl">MANHÃ</div>
                              <input type="time" className="church-time" value={ch.manha} onChange={e=>{const n=[...churchHours];n[i]={...n[i],manha:e.target.value};setChurchHours(n)}}/>
                            </div>
                            <div className="church-period">
                              <div className="church-period-lbl">NOITE</div>
                              <input type="time" className="church-time" value={ch.noite} onChange={e=>{const n=[...churchHours];n[i]={...n[i],noite:e.target.value};setChurchHours(n)}}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="hours-grid">
                        {editHours.map((h,i)=>(
                          <div key={i} className="hour-box">
                            <div className="hour-day">{h.label}</div>
                            <input className="hour-input" value={h.hours} placeholder="08:00–18:00" onChange={e=>{const n=[...editHours];n[i]={...n[i],hours:e.target.value};setEditHours(n)}}/>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="btn-primary" onClick={saveProfile} disabled={saving}>{saving?'Salvando...':'Salvar alterações'}</button>
                </div>
              </div>
            </div>
          )}

          {/* PLANO — conteúdo centralizado com max-width */}
          {tab === 'plano' && (
            <div className="content-plano">
              <div className="plano-inner">

                {company.status === 'pending' && (
                  <div className="alert-pending">⏳ Sua empresa está aguardando aprovação da nossa equipe. Você receberá uma notificação em até 24h.</div>
                )}

                {/* STATUS */}
                <div className="pt-sec-lbl">STATUS ATUAL</div>
                <div className="pt-status">
                  <div className="pt-status-top">
                    <div className="pt-status-name">{company.plan === 'paid' ? 'PLANO ATIVO' : 'TRIAL GRATUITO'}</div>
                    <div className={`pt-status-badge ${company.status !== 'active' ? 'pending' : ''}`}>
                      {company.status === 'active' ? '● Ativo' : '⏳ Pendente'}
                    </div>
                  </div>
                  {company.plan !== 'paid' && company.trial_ends_at && (
                    <>
                      <div className="pt-trial-label">
                        <span>Trial gratuito</span>
                        <span style={{color:'#C9951A',fontWeight:700}}>{daysLeft(company.trial_ends_at)} dia{daysLeft(company.trial_ends_at)!==1?'s':''} restante{daysLeft(company.trial_ends_at)!==1?'s':''}</span>
                      </div>
                      <div className="pt-trial-bar">
                        <div className="pt-trial-fill" style={{width:`${Math.min(100,Math.max(0,(daysLeft(company.trial_ends_at)/7)*100))}%`}}/>
                      </div>
                    </>
                  )}
                  {company.plan === 'paid' && company.plan_ends_at && (() => {
                    const total = Math.ceil((new Date(company.plan_ends_at).getTime() - new Date(company.plan_ends_at).getTime() + daysLeft(company.plan_ends_at) * 86400000 + 86400000) / 86400000)
                    const remaining = daysLeft(company.plan_ends_at)
                    const pct = Math.min(100, Math.max(0, (remaining / total) * 100))
                    const venceEm = new Date(company.plan_ends_at).toLocaleDateString('pt-BR')
                    return (
                      <>
                        <div className="pt-trial-label">
                          <span style={{color:'#5EE8A0'}}>✓ Plano ativo</span>
                          <span style={{color:'#C9951A',fontWeight:700}}>{remaining} dia{remaining!==1?'s':''} restante{remaining!==1?'s':''}</span>
                        </div>
                        <div className="pt-trial-bar">
                          <div className="pt-trial-fill" style={{width:`${pct}%`, background:'#5EE8A0'}}/>
                        </div>
                        <div style={{fontSize:11,color:'#555',marginTop:6}}>Vence em: {venceEm}</div>
                      </>
                    )
                  })()}
                </div>

                {/* PLANO BASE */}
                <div className="pt-sec-lbl">PLANO BASE</div>
                <p className="pt-sec-sub">Escolha o período e ative todas as funcionalidades do seu perfil</p>
                <div className="pt-plan-grid">
                  <div className="pt-plan-opt">
                    <div className="pt-plan-period">Mensal</div>
                    <div className="pt-plan-price">R$ 29,90<span>/mês</span></div>
                    <button className="pt-btn-assinar off" onClick={() => assinar('mensal')}>Assinar</button>
                  </div>
                  <div className="pt-plan-opt popular">
                    <div className="pt-popular-badge">MAIS POPULAR</div>
                    <div className="pt-plan-period">Trimestral</div>
                    <div className="pt-plan-price">R$ 79,90<span>/3 meses</span></div>
                    <div className="pt-plan-economy">↓ Economize R$9,80</div>
                    <button className="pt-btn-assinar" onClick={() => assinar('trimestral')}>Assinar</button>
                  </div>
                  <div className="pt-plan-opt">
                    <div className="pt-plan-period">Semestral</div>
                    <div className="pt-plan-price">R$ 149,90<span>/6 meses</span></div>
                    <div className="pt-plan-economy">↓ Economize R$29,50</div>
                    <button className="pt-btn-assinar off" onClick={() => assinar('semestral')}>Assinar</button>
                  </div>
                </div>
                <p className="pt-ben-label">O que está incluído no plano</p>
                <div className="pt-beneficios">
                  {[
                    {ico:'📱',title:'WhatsApp clicável',desc:'Clientes entram em contato direto'},
                    {ico:'📍',title:'Endereço e mapa',desc:'Google Maps na sua página'},
                    {ico:'⭐',title:'Avaliações',desc:'Receba e responda clientes'},
                    {ico:'🔗',title:'Link externo',desc:'Cardápio, site, iFood...'},
                    {ico:'📊',title:'Estatísticas',desc:'Visualizações e cliques'},
                    {ico:'🏷️',title:'Subcategorias',desc:'Apareça em mais buscas'},
                  ].map((b,i)=>(
                    <div key={i} className="pt-ben-card">
                      <div className="pt-ben-ico">{b.ico}</div>
                      <div className="pt-ben-title">{b.title}</div>
                      <div className="pt-ben-desc">{b.desc}</div>
                    </div>
                  ))}
                </div>

                <div className="pt-footer-note">Pagamento via Pix · Ativação imediata após confirmação</div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* BOTTOM NAV */}
      <div className="bottom-nav">
        {navItems.map(n=>(
          <div key={n.id} className={`nav-item ${tab===n.id?'on':''}`} onClick={()=>setTab(n.id as any)}>
            {n.badge > 0 && <span className="nav-bdg">{n.badge}</span>}
            <div className="nav-ico">{n.ico}</div>
            <div className="nav-lbl">{n.lbl}</div>
          </div>
        ))}
      </div>
    </>
  )
}