'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Business = { id: string; name: string; slug: string }

// Menu único do usuário logado (ESPECIFICACAO.md §3.4) — substitui os
// links soltos que hoje ficam espalhados no header (Favoritos, Painel,
// Planos, Admin...) por um só dropdown com 3 blocos: Minha conta,
// Meus anúncios (só se tiver algum) e Meus negócios (adaptativo por
// quantidade — usa a tabela `membership` criada na Fase 0).
export default function UserMenu({ user, userType, isProdTeam }: { user: any; userType: string | null; isProdTeam?: boolean }) {
  const [open, setOpen] = useState(false)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [hasListings, setHasListings] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('membership').select('business:companies(id,name,slug)').eq('person_id', user.id)
      .then(({ data }) => setBusinesses(((data || []) as any[]).map(m => m.business).filter(Boolean)))
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      .then(({ count }) => setHasListings(!!count))
  }, [user])

  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleSair() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (!user) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <style>{`
        .um-avatar{background:#F5F2EC;border:1px solid #E0DDD8;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#555;}
        .um-dropdown{position:absolute;top:calc(100% + 8px);right:0;background:#fff;border:1px solid #E0DDD8;border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.15);min-width:230px;z-index:2000;overflow:hidden;padding:6px 0;}
        .um-block-label{font-size:10.5px;font-weight:700;color:#AAA;letter-spacing:.06em;text-transform:uppercase;padding:10px 14px 4px;}
        .um-item{display:flex;align-items:center;gap:9px;padding:9px 14px;text-decoration:none;color:#222;font-size:13.5px;font-weight:600;font-family:'Inter',sans-serif;width:100%;text-align:left;background:none;border:none;cursor:pointer;}
        .um-item:hover{background:#F5F2EC;}
        .um-divider{height:1px;background:#F0EDE8;margin:6px 0;}
        .um-sair{color:#E24B4A;}
      `}</style>
      <button className="um-avatar" onClick={() => setOpen(o => !o)} aria-label="Minha conta">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      </button>
      {open && (
        <div className="um-dropdown">
          <div className="um-block-label">Minha conta</div>
          <a className="um-item" href="/perfil">👤 Meu perfil</a>
          <a className="um-item" href="/favoritos">❤️ Favoritos</a>
          <a className="um-item" href="/perfil?tab=avaliacoes">⭐ Minhas avaliações</a>
          <a className="um-item" href="/perfil?tab=pedidos">🧾 Meus pedidos</a>

          {hasListings && (
            <>
              <div className="um-divider" />
              <div className="um-block-label">Meus anúncios</div>
              <a className="um-item" href="/perfil?tab=anuncios">📋 Desapega, vagas, imóveis</a>
            </>
          )}

          <div className="um-divider" />
          <div className="um-block-label">Meus negócios</div>
          {businesses.length === 0 && (
            <a className="um-item" href="/anunciar">➕ Anunciar meu negócio</a>
          )}
          {businesses.length >= 1 && businesses.map(b => (
            <a key={b.id} className="um-item" href="/painel">📊 {b.name}</a>
          ))}
          {businesses.length >= 1 && (
            <a className="um-item" href="/anunciar">➕ Cadastrar outro negócio</a>
          )}

          {userType === 'admin' && (
            <>
              <div className="um-divider" />
              <a className="um-item" href="/admin">⚙️ Admin</a>
            </>
          )}
          {isProdTeam && <a className="um-item" href="/producao">🎬 Produção</a>}

          <div className="um-divider" />
          <button className="um-item um-sair" onClick={handleSair}>🚪 Sair</button>
        </div>
      )}
    </div>
  )
}
