// Service Worker for Web Push Notifications

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(name) { return caches.delete(name); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('push', function(event) {
  var data = {};
  if (event.data) {
    try { data = event.data.json(); } catch(e) { /* ignore parse errors */ }
  }
  var title = data.title || 'New WhatsApp Message';
  var options = {
    body: data.body || 'You have a new message',
    tag: 'whatsapp-msg',
    renotify: true,
    data: { url: '/' },
    silent: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
