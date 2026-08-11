'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function OneSignalInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as any).OneSignalDeferred = (window as any).OneSignalDeferred || []
    ;(window as any).OneSignalDeferred.push(async function(OneSignal: any) {
      await OneSignal.init({
        appId: '237b0896-717c-4ba7-8585-73ca162fa751',
      })
      ;(window as any).OneSignalReact = OneSignal

      const syncLogin = (userId: string | null) => {
        if (userId) OneSignal.login(userId)
        else OneSignal.logout()
      }
      const { data: { session } } = await supabase.auth.getSession()
      syncLogin(session?.user.id || null)
      supabase.auth.onAuthStateChange((_event, session) => syncLogin(session?.user.id || null))
    })
  }, [])
  return null
}
