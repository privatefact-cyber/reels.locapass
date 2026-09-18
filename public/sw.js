// Web Push通知専用のService Worker。オフライン対応やキャッシュ戦略は持たない
// (アプリ全体のキャッシュ化は別途PWA化する場合に検討する)。

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "LOCAPASS", body: event.data.text() };
  }

  const title = payload.title || "LOCAPASS";
  const options = {
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知をタップしたら、既に開いているLOCAPASSのタブがあればそれをフォーカスし、
// 無ければ新しいタブで遷移先URLを開く。
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
