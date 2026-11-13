'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

// Conexões de WhatsApp no WAHA (só admin): quem está conectado, quem espera o QR, quem caiu.
type Sessao = { sessao: string; loja: string; status: string; telefone: string | null; noBanco: string | null }
const ROTULO: Record<string, [string, string]> = {
  WORKING: ['Conectado', '#0F8A57'], SCAN_QR_CODE: ['Esperando o QR', '#C97A0E'], STARTING: ['Iniciando…', '#6F6C67'],
  STOPPED: ['Parado', '#6F6C67'], FAILED: ['Falhou', '#D6392B'],
}

export default function WaConexoesPage() {
  const [lista, setLista] = useState<Sessao[] | null>(null)
  const [evo, setEvo] = useState(0)
  const [erro, setErro] = useState('')
  const [qr, setQr] = useState<{ sessao: string; img: string | null } | null>(null)

  const carregar = useCallback(async () => {
    const r = await adminFetch('/api/admin/wa-sessoes', { method: 'POST', body: JSON.stringify({}) })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setLista(d.sessoes); setEvo(d.aindaNaEvolution || 0); setErro('') } else setErro(d?.error || 'Não consegui consultar (você está logado como admin?)')
  }, [])

  useEffect(() => {
    carregar()
    const iv = setInterval(carregar, 5000)
    return () => clearInterval(iv)
  }, [carregar])

  async function verQr(sessao: string) {
    const r = await adminFetch('/api/admin/wa-sessoes', { method: 'POST', body: JSON.stringify({ qrDe: sessao }) })
    const d = await r.json().catch(() => ({}))
    setQr({ sessao, img: d?.qr || null })
  }

  const total = lista?.length || 0
  const conectadas = (lista || []).filter(s => s.status === 'WORKING').length

  return (
    <div style={{ minHeight: '100vh', background: '#E9EAE5', color: '#151210', fontFamily: 'Archivo, system-ui, sans-serif' }}>
      <div style={{ background: '#151210', color: '#fff', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <a href="/admin" style={{ color: '#FFC531', textDecoration: 'none', fontWeight: 700 }}>← Admin</a>
        <strong style={{ fontSize: 18 }}>Conexões de WhatsApp (WAHA)</strong>
        <a href="/admin/wa-plataforma" style={{ marginLeft: 'auto', color: '#FFC531', fontSize: 14 }}>Número da plataforma</a>
      </div>
      <div style={{ maxWidth: 720, margin: '20px auto', padding: '0 16px', display: 'grid', gap: 12 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 14, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 28, fontWeight: 800 }}>{lista ? `${conectadas}/${total}` : '…'}</div><div style={{ fontSize: 13, color: '#6F6C67' }}>conectadas no WAHA</div></div>
          <div><div style={{ fontSize: 28, fontWeight: 800 }}>{evo}</div><div style={{ fontSize: 13, color: '#6F6C67' }}>lojas ainda na Evolution</div></div>
        </div>
        {erro && <div style={{ background: '#FFF4D6', borderRadius: 8, padding: 10 }}>{erro}</div>}
        {lista && lista.length === 0 && <div style={{ background: '#fff', borderRadius: 12, padding: 14 }}>Nenhuma sessão criada ainda. A sessão nasce quando a loja toca em "Gerar QR code" em Mensagens.</div>}
        {(lista || []).map(s => {
          const [txt, cor] = ROTULO[s.status] || [s.status || '—', '#6F6C67']
          return (
            <div key={s.sessao} style={{ background: '#fff', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700 }}>{s.loja}</div>
                <div style={{ fontSize: 13, color: '#6F6C67' }}>{s.telefone ? `+${s.telefone}` : 'sem número ainda'}</div>
              </div>
              <span style={{ color: '#fff', background: cor, borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>{txt}</span>
              {s.status === 'SCAN_QR_CODE' && <button onClick={() => verQr(s.sessao)} style={{ background: '#151210', color: '#FFC531', border: 0, borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Ver QR</button>}
            </div>
          )
        })}
        {qr && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, textAlign: 'center' }}>
            {qr.img ? <img src={qr.img} alt="QR code" style={{ width: 260, height: 260 }} /> : <div>QR indisponível agora, tente de novo.</div>}
            <div style={{ marginTop: 8 }}><button onClick={() => setQr(null)} style={{ border: 0, background: 'none', textDecoration: 'underline', cursor: 'pointer' }}>Fechar</button></div>
          </div>
        )}
      </div>
    </div>
  )
}
