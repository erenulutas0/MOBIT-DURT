self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "DocsBot notification";
  const options = {
    body: payload.body || "New notification",
    tag: payload.notificationId ? `docsbot-${payload.notificationId}` : "docsbot-notification",
    data: {
      url: payload.url || "/",
      notificationId: payload.notificationId || null,
      taskId: payload.taskId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client && client.url.startsWith(self.location.origin)) {
        await client.focus();
        if ("navigate" in client) {
          await client.navigate(targetUrl);
        }
        return;
      }
    }
    await clients.openWindow(targetUrl);
  })());
});
