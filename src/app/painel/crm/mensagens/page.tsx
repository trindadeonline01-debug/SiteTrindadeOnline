'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CrmShell from '@/components/CrmShell'

type Company = { id: string; name: string; crm_whatsapp_enabled: boolean }
type Instance = { id: string; instance_name: string; status: string; phone: string | null }
type Contact = { id: string; phone: string; name: string | null; last_message_at: string | null; last_read_at: string | null }
type Message = { id: string; direction: 'in' | 'out'; body: string | null; media_type: string | null; sent_at: string }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function MensagensPage() {
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<Company | null>(null)
  const [instance, setInstance] = useState<Instance | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connectError, setConnectError] = useState('')

  const [contacts, setContacts] = useState<Contact[]>([])
  const [selected, setSelected] = useState<Contact | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const companyRef = useRef<Company | null>(null)
  const selectedRef = useRef<Contact | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login?redirect=/painel/crm/mensagens'; return }
      const { data: comp } = await supabase
        .from('companies').select('id, name, crm_whatsapp_enabled')
        .eq('owner_id', session.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!comp) { window.location.href = '/painel/crm'; return }
      setCompany(comp as Company)
      companyRef.current = comp as Company
      if (comp.crm_whatsapp_enabled) await loadInstance(comp.id)
      setLoading(false)
    })
  }, [])

  async function loadInstance(companyId: string) {
    const { data } = await supabase
      .from('crm_whatsapp_instances').select('id, instance_name, status, phone')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    setInstance((data as Instance) || null)
    if (data?.status === 'connected') await loadContacts(companyId)
    return data as Instance | null
  }

  async function loadContacts(companyId: string) {
    const { data } = await supabase
      .from('crm_contacts').select('id, phone, name, last_message_at, last_read_at')
      .eq('company_id', companyId).not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false })
    setContacts((data || []) as Contact[])
  }

  async function loadMessages(contactId: string) {
    const { data } = await supabase
      .from('crm_messages').select('id, direction, body, media_type, sent_at')
      .eq('contact_id', contactId).order('sent_at', { ascending: true })
    setMessages((data || []) as Message[])
  }

  async function openContact(c: Contact) {
    setSelected(c)
    selectedRef.current = c
    await loadMessages(c.id)
    if (c.last_message_at && (!c.last_read_at || c.last_read_at < c.last_message_at)) {
      await supabase.from('crm_contacts').update({ last_read_at: new Date().toISOString() }).eq('id', c.id)
      setContacts(prev => prev.map(x => x.id === c.id ? { ...x, last_read_at: new Date().toISOString() } : x))
    }
  }

  // Poll leve: lista de contatos a cada 8s, thread aberta a cada 4s — mesmo
  // padrão de polling já usado na aba Disparos do admin (sem Realtime aqui).
  useEffect(() => {
    if (instance?.status !== 'connected' || !company) return
    const iv = setInterval(() => loadContacts(company.id), 8000)
    return () => clearInterval(iv)
  }, [instance?.status, company?.id])

  useEffect(() => {
    if (!selected) return
    const iv = setInterval(() => loadMessages(selected.id), 4000)
    return () => clearInterval(iv)
  }, [selected?.id])

  // Poll de conexão enquanto o QR está na tela, até status virar 'connected'
  useEffect(() => {
    if (!qrCode || !company) return
    const iv = setInterval(async () => {
      const inst = await loadInstance(company.id)
      if (inst?.status === 'connected') { setQrCode(null); clearInterval(iv) }
    }, 3000)
    return () => clearInterval(iv)
  }, [qrCode, company?.id])

  async function connectWhatsapp() {
    if (!company) return
    setConnecting(true); setConnectError(''); setQrCode(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setConnecting(false); return }
    try {
      const res = await fetch('/api/crm/whatsapp/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, company_id: company.id }),
      })
      const data = await res.json()
      if (!res.ok) { setConnectError(data.error || 'falha ao conectar'); setConnecting(false); return }
      setQrCode(data.qrcode_base64 || null)
      if (!data.qrcode_base64) setConnectError('Instância criada mas sem QR code na resposta — me chama que eu vejo o retorno bruto da Evolution.')
      await loadInstance(company.id)
    } catch (err: any) {
      setConnectError(err.message || 'falha ao conectar')
    }
    setConnecting(false)
  }

  async function sendMessage() {
    if (!text.trim() || !selected || !company || sending) return
    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const body = text.trim()
    setText('')
    const res = await fetch('/api/crm/enviar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token, company_id: company.id, contact_id: selected.id, text: body }),
    })
    if (res.ok) await loadMessages(selected.id)
    else setText(body)
    setSending(false)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#AAA' }}>Carregando...</div>

  if (!company?.crm_whatsapp_enabled) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter,sans-serif', background: '#F0EDE8', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>💬</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>CRM de WhatsApp</div>
        <div style={{ fontSize: 13, color: '#666', maxWidth: 300, lineHeight: 1.6, marginBottom: 20 }}>
          Atenda seus clientes pelo WhatsApp direto do painel, com histórico de conversa e filtros de quem sumiu. Ainda não está ativo pra {company?.name}.
        </div>
        <a href="/painel/crm" style={{ background: '#C9951A', color: '#fff', padding: '11px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>Voltar</a>
      </div>
    )
  }

  return (
    <CrmShell active="mensagens" companyName={company.name}>
      <div className="msg-page">
        <style>{`
          .msg-page{padding:20px 16px 80px;min-width:0;}
          @media(min-width:768px){.msg-page{padding:28px 32px;}}
          .msg-connect{max-width:360px;margin:40px auto;text-align:center;background:#fff;border:1px solid #EDE8E0;border-radius:16px;padding:28px 22px;}
          .msg-qr{width:200px;height:200px;margin:16px auto;border-radius:12px;border:1px solid #EDE8E0;overflow:hidden;background:#F7F5F0;display:flex;align-items:center;justify-content:center;}
          .msg-qr img{width:100%;height:100%;object-fit:contain;}
          .msg-btn{padding:11px 22px;border-radius:10px;border:none;background:#C9951A;color:#1A1610;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;}
          .msg-btn:disabled{opacity:.5;cursor:not-allowed;}
          .msg-err{color:#C43D3D;font-size:12px;margin-top:12px;line-height:1.5;}
          .msg-shell{display:grid;grid-template-columns:1fr;border:1px solid #EDE8E0;border-radius:14px;overflow:hidden;background:#fff;height:calc(100vh - 140px);min-height:420px;}
          @media(min-width:768px){.msg-shell{grid-template-columns:280px 1fr;}}
          .msg-list{border-right:1px solid #EDE8E0;overflow-y:auto;}
          @media(max-width:767px){.msg-list{display:${selected ? 'none' : 'block'};}}
          .msg-item{display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid #F0EDE8;cursor:pointer;align-items:center;}
          .msg-item.sel{background:#FBF1DC;}
          .msg-item:hover{background:#F7F5F0;}
          .msg-avatar{width:34px;height:34px;border-radius:50%;background:#F0EDE8;border:1px solid #EDE8E0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#6E6656;flex:none;}
          .msg-item-txt{flex:1;min-width:0;}
          .msg-item-name{font-weight:700;font-size:13px;}
          .msg-item-time{font-size:10.5px;color:#A79E8B;}
          .msg-unread{width:8px;height:8px;border-radius:50%;background:#C9951A;flex:none;}
          .msg-thread{display:flex;flex-direction:column;}
          @media(max-width:767px){.msg-thread{display:${selected ? 'flex' : 'none'};}}
          .msg-thead{padding:12px 16px;border-bottom:1px solid #EDE8E0;display:flex;align-items:center;gap:10px;}
          .msg-back{display:none;background:none;border:none;font-size:18px;cursor:pointer;color:#8A6410;}
          @media(max-width:767px){.msg-back{display:block;}}
          .msg-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:#F7F5F0;}
          .msg-bubble-row{display:flex;}
          .msg-bubble-row.out{justify-content:flex-end;}
          .msg-bubble{max-width:76%;padding:9px 13px;border-radius:14px;font-size:13px;line-height:1.45;}
          .msg-bubble-row.in .msg-bubble{background:#fff;border:1px solid #EDE8E0;border-bottom-left-radius:4px;}
          .msg-bubble-row.out .msg-bubble{background:#FBF1DC;border:1px solid #F0E2BC;border-bottom-right-radius:4px;}
          .msg-bubble .t{font-size:10px;color:#A79E8B;margin-top:5px;text-align:right;}
          .msg-composer{padding:12px 14px;border-top:1px solid #EDE8E0;display:flex;gap:8px;}
          .msg-composer input{flex:1;padding:11px 14px;border-radius:22px;border:1px solid #EDE8E0;background:#F7F5F0;font-size:13px;font-family:inherit;}
          .msg-send{width:38px;height:38px;border-radius:50%;background:#C9951A;border:none;color:#1A1610;font-weight:800;cursor:pointer;flex:none;}
          .msg-empty{flex:1;display:flex;align-items:center;justify-content:center;color:#A79E8B;font-size:13px;}
        `}</style>

        {instance?.status !== 'connected' ? (
          <div className="msg-connect">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📱</div>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Conectar WhatsApp</div>
            <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.6 }}>Escaneie o QR code com o WhatsApp da loja pra ativar o atendimento aqui dentro.</div>
            {qrCode ? (
              <>
                <div className="msg-qr"><img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code" /></div>
                <div style={{ fontSize: 11.5, color: '#888' }}>Aguardando leitura...</div>
              </>
            ) : (
              <button className="msg-btn" style={{ marginTop: 16 }} disabled={connecting} onClick={connectWhatsapp}>
                {connecting ? 'Gerando QR code...' : 'Gerar QR code'}
              </button>
            )}
            {connectError && <div className="msg-err">{connectError}</div>}
          </div>
        ) : (
          <div className="msg-shell">
            <div className="msg-list">
              {contacts.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: '#A79E8B', textAlign: 'center' }}>Nenhuma conversa ainda.</div>}
              {contacts.map(c => {
                const unread = !!c.last_message_at && (!c.last_read_at || c.last_read_at < c.last_message_at)
                return (
                  <div key={c.id} className={`msg-item ${selected?.id === c.id ? 'sel' : ''}`} onClick={() => openContact(c)}>
                    <div className="msg-avatar">{(c.name || c.phone).slice(0, 2).toUpperCase()}</div>
                    <div className="msg-item-txt">
                      <div className="msg-item-name">{c.name || c.phone}</div>
                      <div className="msg-item-time">{c.last_message_at ? fmtTime(c.last_message_at) : ''}</div>
                    </div>
                    {unread && <div className="msg-unread" />}
                  </div>
                )
              })}
            </div>
            <div className="msg-thread">
              {!selected ? (
                <div className="msg-empty">Selecione uma conversa</div>
              ) : (
                <>
                  <div className="msg-thead">
                    <button className="msg-back" onClick={() => setSelected(null)}>‹</button>
                    <div className="msg-avatar">{(selected.name || selected.phone).slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.name || selected.phone}</div>
                      <div style={{ fontSize: 11.5, color: '#888' }}>{selected.phone}</div>
                    </div>
                  </div>
                  <div className="msg-body">
                    {messages.map(m => (
                      <div key={m.id} className={`msg-bubble-row ${m.direction === 'out' ? 'out' : 'in'}`}>
                        <div className="msg-bubble">{m.body}<div className="t">{fmtTime(m.sent_at)}</div></div>
                      </div>
                    ))}
                  </div>
                  <div className="msg-composer">
                    <input placeholder="Escrever mensagem..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} />
                    <button className="msg-send" disabled={sending || !text.trim()} onClick={sendMessage}>➤</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </CrmShell>
  )
}
