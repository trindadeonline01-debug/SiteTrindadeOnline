'use client'
import { useEffect } from 'react'

export default function OneSignalInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const script = document.createElement('script')
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
    script.defer = true
    document.head.appendChild(script)
    script.onload = () => {
      window.OneSignal = window.OneSignal || []
      window.OneSignal.push(function() {
        window.OneSignal.init({
          appId: '237b0896-717c-4ba7-8585-73ca162fa751',
          safari_web_id: '',
          notifyButton: { enable: false },
          allowLocalhostAsSecureOrigin: true,
        })
      })
    }
  }, [])
  return null
}
