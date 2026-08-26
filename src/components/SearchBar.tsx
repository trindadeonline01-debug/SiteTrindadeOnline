'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Suggestion = { type: string; label: string; sub: string; slug?: string; categorySlug?: string }

// Versão compacta da busca — mesma lógica de sugestões da home
// (HomeSearchBox), mas dimensionada pra caber numa barra de header fina em
// vez do hero grande. Fica sempre visível, em toda página (ESPECIFICACAO.md
// §4.1/§12 dívida #2 — hoje a busca só existe na home).
export default function SearchBar({ compact }: { compact?: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  async function fetchSuggestions(term: string) {
    if (term.length < 2) { setSuggestions([]); return }
    const { data } = await supabase.rpc('buscar_empresas', { termo: term })
    const results: Suggestion[] = []
    if (data) {
      data.slice(0, 5).forEach((c: any) => {
        results.push({ type: 'empresa', label: c.name, sub: c.category_name || '', slug: c.slug })
      })
    }
    const { data: subcatData } = await supabase
      .from('subcategories')
      .select('id, name, slug, category:categories(slug)')
      .ilike('name', `%${term}%`)
      .limit(3)
    if (subcatData) {
      subcatData.forEach((s: any) => {
        if (!results.find(r => r.label.toLowerCase() === s.name.toLowerCase())) {
          results.push({ type: 'subcat', label: s.name, sub: 'Ver subcategoria', slug: s.slug as string, categorySlug: s.category?.slug as string })
        }
      })
    }
    setSuggestions(results.slice(0, 6))
    setOpen(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const raw = e.currentTarget.querySelector('input')?.value ?? q
    if (!raw.trim()) return
    const term = raw.trim()
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabase.from('search_logs').insert({ query: term, user_id: session?.user?.id || null }).then(() => {})
    })
    setOpen(false)
    router.push(`/busca?q=${encodeURIComponent(term)}`)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0, maxWidth: compact ? 420 : 560 }}>
      <style>{`
        .sb-form{display:flex;align-items:center;gap:8px;background:#fff;border-radius:8px;padding:0 12px;height:${compact ? 36 : 40}px;border:1px solid #E0DDD8;}
        .sb-form input{flex:1;min-width:0;border:0;outline:0;font-size:13.5px;font-family:'Inter',sans-serif;background:transparent;}
        .sb-form input::placeholder{color:#AAA;}
        .sb-icon{flex-shrink:0;opacity:.45;}
        .sb-list{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid #E0DDD8;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.14);z-index:1200;overflow:hidden;max-height:340px;overflow-y:auto;}
        .sb-item{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;text-align:left;}
        .sb-item:hover{background:#FEF3E2;}
        .sb-item-ico{font-size:15px;flex-shrink:0;}
        .sb-item-label{font-size:13px;font-weight:600;color:#111;}
        .sb-item-sub{font-size:11px;color:#999;}
      `}</style>
      <form className="sb-form" onSubmit={handleSubmit}>
        <svg className="sb-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text" value={q} placeholder="Produto, loja ou serviço..."
          onChange={e => { setQ(e.target.value); fetchSuggestions(e.target.value) }}
          onFocus={() => q.length >= 2 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
      </form>
      {open && suggestions.length > 0 && (
        <div className="sb-list">
          {suggestions.map((s, i) => (
            <div key={i} className="sb-item" onMouseDown={() => {
              setOpen(false)
              if (s.type === 'empresa' && s.slug) window.location.href = `/empresa/${s.slug}`
              else if (s.type === 'subcat' && s.categorySlug && s.slug) window.location.href = `/categoria/${s.categorySlug}?sub=${s.slug}`
              else window.location.href = `/busca?q=${encodeURIComponent(s.label)}`
            }}>
              <span className="sb-item-ico">{s.type === 'empresa' ? '🏪' : '📂'}</span>
              <span>
                <span className="sb-item-label" style={{ display: 'block' }}>{s.label}</span>
                {s.sub && <span className="sb-item-sub">{s.sub}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
