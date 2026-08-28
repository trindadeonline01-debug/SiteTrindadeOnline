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
        .um-avatar{background:var(--concrete-2);border:1px solid var(--line);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);}
        .um-dropdown{position:absolute;top:calc(100% + 8px);right:0;background:var(--paper);border:1px solid var(--line);border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.15);min-width:250px;z-index:2000;overflow:hidden;padding:6px 0;}
        .um-block-label{font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;padding:10px 14px 4px;}
        .um-item{display:flex;align-items:center;gap:9px;padding:9px 14px;text-decoration:none;color:var(--ink);font-size:13.5px;font-weight:600;font-family:'Archivo',sans-serif;width:100%;text-align:left;background:none;border:none;cursor:pointer;}
        .um-item:hover{background:var(--concrete-2);}
        .um-divider{height:1px;background:var(--line);margin:6px 0;}
        .um-sair{color:var(--alert);}
        .um-switcher{padding:8px 10px 4px;display:flex;flex-direction:column;gap:6px;}
        .um-idcard{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;border:1.5px solid var(--line);font-size:13px;font-weight:700;color:var(--ink);text-decoration:none;}
        .um-idcard.active{border-color:var(--sign-dark);background:rgba(168,114,0,.08);}
        .um-idico{width:26px;height:26px;border-radius:7px;background:var(--concrete-2);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;}
        .um-idcard.active .um-idico{background:var(--sign);}
        .um-idtag{margin-left:auto;font-size:10.5px;color:var(--sign-dark);font-weight:800;}
        .um-idarrow{margin-left:auto;color:var(--muted);font-size:13px;}
        .um-idadd{font-size:11.5px;font-weight:700;color:var(--sign-dark);padding:6px 14px 2px;text-decoration:none;display:block;}
        .um-idcard-add{border-style:dashed;border-color:var(--sign-dark);color:var(--sign-dark);}
        .um-idcard-add .um-idico{background:none;color:var(--sign-dark);font-size:16px;}
      `}</style>
      <button className="um-avatar" onClick={() => setOpen(o => !o)} aria-label="Minha conta">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      </button>
      {open && (
        <div className="um-dropdown">
          <div className="um-switcher">
            <div className="um-idcard active">
              <span className="um-idico">👤</span> Pessoal <span className="um-idtag">● aqui</span>
            </div>
            {businesses.map(b => (
              <a key={b.id} className="um-idcard" href="/painel">
                <span className="um-idico">📊</span> {b.name} <span className="um-idarrow">→</span>
              </a>
            ))}
            {businesses.length === 0 && (
              <a className="um-idcard um-idcard-add" href="/anunciar">
                <span className="um-idico">➕</span> Cadastrar minha empresa
              </a>
            )}
          </div>
          {businesses.length > 0 && (
            <a className="um-idadd" href="/anunciar">➕ Cadastrar outro negócio</a>
          )}
          <div className="um-divider" />

          <div className="um-block-label">Minha conta</div>
          <a className="um-item" href="/perfil">👤 Meu perfil</a>
          <a className="um-item" href="/perfil?tab=favoritos">❤️ Favoritos</a>
          <a className="um-item" href="/perfil?tab=avaliacoes">⭐ Minhas avaliações</a>
          <a className="um-item" href="/perfil?tab=pedidos">🧾 Meus pedidos</a>

          {hasListings && (
            <>
              <div className="um-divider" />
              <div className="um-block-label">Meus anúncios</div>
              <a className="um-item" href="/perfil?tab=anuncios">📋 Desapega, vagas, imóveis</a>
            </>
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
