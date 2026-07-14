'use client'
import { useEffect } from 'react'

export default function OneSignalInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as any).OneSignalDeferred = (window as any).OneSignalDeferred || []
    ;(window as any).OneSignalDeferred.push(async function(OneSignal: any) {
      await OneSignal.init({
        appId: '237b0896-717c-4ba7-8585-73ca162fa751',
      })
      ;(window as any).OneSignalReact = OneSignal
    })
  }, [])
  return null
}
