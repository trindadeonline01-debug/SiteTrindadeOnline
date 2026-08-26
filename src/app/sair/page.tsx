'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function SairPage() {
  useEffect(() => {
    supabase.auth.signOut().then(() => {
      window.location.href = '/'
    })
  }, [])
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:'Archivo,sans-serif', color:'#AAA' }}>
      Saindo...
    </div>
  )
}