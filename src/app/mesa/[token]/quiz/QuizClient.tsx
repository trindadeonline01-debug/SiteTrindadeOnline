'use client'
import { useEffect, useRef } from 'react'
import { ESTILO } from '@/components/mesa/quizEstilo'
import { montarQuiz } from '@/components/mesa/quizJogo'

// Tela cheia do jogo. O jogo em si (telas, sons, fluxo) mora em components/mesa/quizJogo.ts.
export default function QuizClient({ token }: { token: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    return montarQuiz(ref.current, token)
  }, [token])
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700&display=swap" />
      <style>{ESTILO}</style>
      <div className="qz"><div id="qz-view" ref={ref} /></div>
    </>
  )
}
