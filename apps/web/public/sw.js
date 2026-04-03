self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = String(payload.title || "New notification");
  const body = String(payload.body || "");
  const eventId = String(payload.eventId || "");

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: eventId ? `inbox:${eventId}` : undefined,
      data: {
        eventId
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const eventId = String(event.notification?.data?.eventId || "");

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      if (clientsList.length > 0) {
        const target = clientsList[0];
        target.postMessage({
          type: "push-open",
          eventId
        });
        return target.focus();
      }

      const encodedEventId = encodeURIComponent(eventId);
      return self.clients.openWindow(`/?pushOpen=${encodedEventId}`);
    })
  );
});
