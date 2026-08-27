'use client'
import { useRef } from 'react'

// Envolve uma faixa de cards que já rola na horizontal (mobile, arrastando
// com o dedo) e adiciona setinhas nas laterais só no desktop, onde não dá
// pra arrastar com o mouse. A página que usa isso (home) é Server
// Component, então esse pedacinho interativo (ref + onClick) precisa
// ficar num Client Component à parte.
export default function ScrollRow({ children, trackClassName }: { children: React.ReactNode; trackClassName: string }) {
  const ref = useRef<HTMLDivElement>(null)
  function scroll(dir: number) {
    ref.current?.scrollBy({ left: dir * 280, behavior: 'smooth' })
  }
  return (
    <div className="scrollrow-wrap">
      <style>{`
        .scrollrow-wrap { display: flex; align-items: center; gap: 6px; }
        .scrollrow-track { flex: 1; min-width: 0; }
        .scrollrow-arrow { display: none; }
        @media(min-width: 768px) {
          .scrollrow-arrow { flex: none; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--line); background: var(--paper); color: var(--ink); font-size: 17px; font-weight: 700; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
          .scrollrow-arrow:hover { border-color: var(--sign-dark); color: var(--sign-dark); }
        }
      `}</style>
      <button className="scrollrow-arrow" onClick={() => scroll(-1)} aria-label="Anterior">‹</button>
      <div className={`scrollrow-track ${trackClassName}`} ref={ref}>{children}</div>
      <button className="scrollrow-arrow" onClick={() => scroll(1)} aria-label="Próximo">›</button>
    </div>
  )
}
