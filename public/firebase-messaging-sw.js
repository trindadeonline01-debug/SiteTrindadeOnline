importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyDdyVUUp93DAouOiXG9JbhQXxjP6brHMJY',
  authDomain: 'trindade-online-web.firebaseapp.com',
  projectId: 'trindade-online-web',
  storageBucket: 'trindade-online-web.firebasestorage.app',
  messagingSenderId: '763558716405',
  appId: '1:763558716405:web:8e82483d73725a91d5b6bc'
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage(function(payload) {
  const { title, body, icon } = payload.notification
  self.registration.showNotification(title, {
    body: body || '',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png'
  })
})
