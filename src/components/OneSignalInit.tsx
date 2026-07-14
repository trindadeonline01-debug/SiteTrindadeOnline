'use client'
import { useEffect } from 'react'

export default function OneSignalInit() {
  useEffect(() => {
    async function init() {
      const OneSignal = (await import('react-onesignal')).default
      await OneSignal.init({
        appId: '237b0896-717c-4ba7-8585-73ca162fa751',
        notifyButton: { enable: false },
        allowLocalhostAsSecureOrigin: true,
      })
      // expor globalmente para CookieBanner e NotificationPrompt
      ;(window as any).OneSignalReact = OneSignal
    }
    init().catch(console.error)
  }, [])
  return null
}