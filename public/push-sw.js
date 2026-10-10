// Reminders (server/reminders.ts): shows each push as a notification, and opens the app
// when it is tapped. Loaded into the generated service worker (vite.config.ts,
// workbox.importScripts).

self.addEventListener('push', (event) => {
  let message = { title: 'Wordhoard', body: "Today's words are waiting.", url: '/' };
  try {
    if (event.data) message = { ...message, ...event.data.json() };
  } catch {
    // Not JSON: keep the default text.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'vocab-reminder',
      data: { url: message.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
