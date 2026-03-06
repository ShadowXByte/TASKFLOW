const CACHE_NAME = "taskflow-shell-v3";

const CORE_SHELL_URLS = [
  "/",
  "/workspace",
  "/workspace?mode=guest",
  "/workspace?mode=account",
  "/unnamed.jpg",
  "/unnamed.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(CORE_SHELL_URLS),
    ),
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
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

  if (url.pathname.startsWith("/_next/webpack-hmr") || url.pathname.startsWith("/__nextjs_original-stack-frames")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cached = (await cache.match(request)) || (await cache.match("/workspace")) || (await cache.match("/"));
          return cached || new Response("Offline", { status: 503, statusText: "Offline" });
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkUpdate = fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() => null);

      if (cached) {
        void networkUpdate;
        return cached;
      }

      return networkUpdate.then((response) => response || new Response("Offline", { status: 503, statusText: "Offline" }));
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

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "WARMUP_URLS" || !Array.isArray(data.urls)) {
    return;
  }

  const urls = Array.from(new Set([...CORE_SHELL_URLS, ...data.urls]))
    .filter((url) => typeof url === "string" && url.startsWith("/"));

  const notifyClients = async (payload) => {
    const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    windowClients.forEach((client) => client.postMessage(payload));
  };

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const total = urls.length;
      let completed = 0;

      await notifyClients({ type: "WARMUP_PROGRESS", total, completed, done: false });

      await Promise.allSettled(
        urls.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "no-store" });
            if (response && response.ok) {
              await cache.put(url, response.clone());
            }
          } catch {
            return;
          } finally {
            completed += 1;
            await notifyClients({ type: "WARMUP_PROGRESS", total, completed, done: completed >= total });
          }
        }),
      );

      await notifyClients({ type: "WARMUP_DONE", total, completed: total, done: true });
    })(),
  );
});
