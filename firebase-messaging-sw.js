// firebase-messaging-sw.js
// ملف Service Worker الخاص بـ Firebase Cloud Messaging
// يجب أن يكون في مجلد الجذر (root) للمشروع

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBleBAXYH7y9KhIEZDVNFNT3UesuIlkGTA",
  authDomain: "dukhan-app.firebaseapp.com",
  projectId: "dukhan-app",
  storageBucket: "dukhan-app.firebasestorage.app",
  messagingSenderId: "771948038238",
  appId: "1:771948038238:web:a442810beedf21fbb84ccf"
});

const messaging = firebase.messaging();

// استقبال الإشعارات في الخلفية (التطبيق مغلق أو مخفي)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] رسالة في الخلفية:', payload);

  const title = payload.notification?.title || 'دخان 🔔';
  const body  = payload.notification?.body  || '';
  const icon  = payload.notification?.icon  || '/icons/icon-192.png';
  const clickUrl = payload.data?.click_action || '/index.html';

  self.registration.showNotification(title, {
    body,
    icon,
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'dukhan-notification',
    renotify: true,
    data: { url: clickUrl }
  });
});

// عند النقر على الإشعار
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
