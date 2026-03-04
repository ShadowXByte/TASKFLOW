self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("taskflow-shell-v1").then((cache) =>
      cache.addAll([
        "/",
        "/workspace",
        "/workspace?mode=guest",
        "/workspace?mode=account",
        "/unnamed.jpg",
        "/unnamed.png",
        "/manifest.webmanifest",
      ]),
    ),
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== "taskflow-shell-v1").map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open("taskflow-shell-v1").then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open("taskflow-shell-v1");
          const cached = (await cache.match(request)) || (await cache.match("/workspace")) || (await cache.match("/"));
          return cached || new Response("Offline", { status: 503, statusText: "Offline" });
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open("taskflow-shell-v1").then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() => new Response("Offline", { status: 503, statusText: "Offline" }));
    }),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const title = data.title || "TASKFLOW";
  const options = {
    body: data.body || "You have a reminder",
    icon: "/unnamed.jpg",
    badge: "/unnamed.jpg",
    data: {
      url: data.url || "/workspace",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/workspace";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
