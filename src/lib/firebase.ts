import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: 'AIzaSyDdyVUUp93DAouOiXG9JbhQXxjP6brHMJY',
  authDomain: 'trindade-online-web.firebaseapp.com',
  projectId: 'trindade-online-web',
  storageBucket: 'trindade-online-web.firebasestorage.app',
  messagingSenderId: '763558716405',
  appId: '1:763558716405:web:8e82483d73725a91d5b6bc'
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const VAPID_KEY = 'P7GXNTWLKJ9WW-yiFm-VCdMn2afjY1WYB2PFMDAaf1Q'

export function getFirebaseMessaging() {
  if (typeof window === 'undefined') return null
  return getMessaging(app)
}

export { getToken, onMessage }
