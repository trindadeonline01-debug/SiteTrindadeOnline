'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Suggestion = { type: string; label: string; sub: string; slug?: string; categorySlug?: string }

export default function HomeSearchBox() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  async function fetchSuggestions(q: string) {
    if (q.length < 2) { setSuggestions([]); return }
    const { data } = await supabase.rpc('buscar_empresas', { termo: q })
    const results: Suggestion[] = []
    if (data) {
      data.slice(0, 5).forEach((c: any) => {
        const q_lower = q.toLowerCase()
        let motivo = c.category_name || ''
        if (c.address && c.address.toLowerCase().includes(q_lower)) motivo = `📍 ${c.address}`
        else if (c.category_name) motivo = c.category_name
        results.push({ type: 'empresa', label: c.name, sub: motivo, slug: c.slug })
      })
    }
    const { data: tagData } = await supabase
      .from('companies')
      .select('name, tags')
      .eq('status', 'active')
      .eq('plan', 'paid')
      .limit(50)
    if (tagData) {
      tagData.forEach((c: any) => {
        if (c.tags) {
          c.tags.filter((t: string) => t.toLowerCase().includes(q.toLowerCase())).slice(0, 2).forEach((t: string) => {
            if (!results.find(r => r.label.toLowerCase() === t.toLowerCase())) {
              results.push({ type: 'tag', label: t, sub: c.name })
            }
          })
        }
      })
    }
    const { data: subcatData } = await supabase
      .from('subcategories')
      .select('id, name, slug, category:categories(slug)')
      .ilike('name', `%${q}%`)
      .limit(3)
    if (subcatData) {
      subcatData.forEach((s: any) => {
        if (!results.find(r => r.label.toLowerCase() === s.name.toLowerCase())) {
          results.push({ type: 'subcat', label: s.name, sub: 'Ver subcategoria', slug: s.slug as string, categorySlug: s.category?.slug as string })
        }
      })
    }
    setSuggestions(results.slice(0, 8))
    setShowSuggestions(true)
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Lê direto do input na hora do submit (não do state) — no Enter logo
    // após digitar rápido no celular, o onChange às vezes ainda não
    // terminou de atualizar o state, e a busca saía com o termo cortado
    const raw = e.currentTarget.querySelector('input')?.value ?? searchQuery
    if (raw.trim()) {
      const q = raw.trim()
      supabase.auth.getSession().then(({ data: { session } }) => {
        supabase.from('search_logs').insert({ query: q, user_id: session?.user?.id || null }).then(() => {})
      })
      router.push(`/busca?q=${encodeURIComponent(q)}`)
    }
  }

  return (
    <div ref={searchRef} style={{ position: 'relative', width: '100%', maxWidth: 600, margin: '0 auto' }}>
      <form className="hero-search-wrap" onSubmit={handleSearch}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9951A" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input type="text" value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); fetchSuggestions(e.target.value) }}
          onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="O que você está procurando?" />
        <button type="submit" className="hero-search-btn">Buscar</button>
      </form>
      {showSuggestions && suggestions.length > 0 && (
        <div className="search-suggestions">
          {suggestions.map((s, i) => (
            <div key={i} className="sug-item" onMouseDown={() => {
              setSearchQuery(s.label)
              setShowSuggestions(false)
              if (s.type === 'empresa' && s.slug) {
                window.location.href = `/empresa/${s.slug}`
              } else if (s.type === 'subcat' && s.categorySlug && s.slug) {
                window.location.href = `/categoria/${s.categorySlug}?sub=${s.slug}`
              } else {
                window.location.href = `/busca?q=${encodeURIComponent(s.label)}`
              }
            }}>
              <div className="sug-ico">{s.type === 'empresa' ? '🏪' : s.type === 'subcat' ? '📂' : '🏷️'}</div>
              <div>
                <div className="sug-label">{s.label}</div>
                {s.sub && <div className="sug-sub">{s.type === 'tag' ? `em ${s.sub}` : s.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
