const version = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `todoay-static-${version}`;
const basePath = self.location.pathname.replace(/\/sw\.js$/, "");
const appShellRoutes = [
  `${basePath}/`,
  `${basePath}/tasks/`,
  `${basePath}/today/`,
  `${basePath}/notes/`,
  `${basePath}/misc/`,
  `${basePath}/library/`,
  `${basePath}/settings/`,
  `${basePath}/manifest.webmanifest`,
  `${basePath}/icons/icon-192.png`,
  `${basePath}/icons/icon-512.png`,
  `${basePath}/icons/apple-touch-icon.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(appShellRoutes)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(`${basePath}/tasks/`)));
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        const responseToCache = networkResponse.clone();

        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));

        return networkResponse;
      });
    }),
  );
});
