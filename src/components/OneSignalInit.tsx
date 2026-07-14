'use client'
import { useEffect } from 'react'

export default function OneSignalInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.OneSignal = window.OneSignal || []
    window.OneSignal.push(async function() {
      await window.OneSignal.init({
        appId: '237b0896-717c-4ba7-8585-73ca162fa751',
        notifyButton: { enable: false },
        allowLocalhostAsSecureOrigin: true,
      })
    })
  }, [])
  return null
}
