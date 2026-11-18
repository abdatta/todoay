// Todoay service worker.
//
// BUILD_ID and PRECACHE_PATHS are filled in by scripts/generate-sw.mjs after
// `next build`, from the real contents of the static export. Every file of a
// build is precached under one cache name, so the app shell, its scripts and
// its route payloads always come from the same build and never need the
// network to open.
const BUILD_ID = "__BUILD_ID__";
const PRECACHE_PATHS = /*__PRECACHE_PATHS__*/ [];

const basePath = self.location.pathname.replace(/\/sw\.js$/, "");
const CACHE_PREFIX = "todoay-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${BUILD_ID}`;
const FONT_CACHE = `${CACHE_PREFIX}fonts-v1`;
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const MATCH_OPTIONS = { ignoreSearch: true, ignoreVary: true };

const toUrl = (path) => `${basePath}/${path}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // "reload" bypasses the HTTP cache so files from two builds never mix.
      cache.addAll(PRECACHE_PATHS.map((path) => new Request(toUrl(path), { cache: "reload" }))),
    ),
  );
  // No skipWaiting here: a new build takes over only when the page asks for
  // it (while hidden) or once every tab is closed, never under a live page.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== FONT_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const handleNavigation = async (request, url) => {
  const cache = await caches.open(SHELL_CACHE);
  let pathname = url.pathname;

  if (!pathname.endsWith("/") && !/\.[a-z0-9]+$/i.test(pathname)) {
    pathname += "/";
  }

  // Cache first: opening the app never waits on the network.
  const cached = await cache.match(pathname, MATCH_OPTIONS);
  if (cached) {
    return cached;
  }

  try {
    return await fetch(request);
  } catch {
    return (await cache.match(toUrl(""), MATCH_OPTIONS)) ?? Response.error();
  }
};

const handleAsset = async (request) => {
  const cache = await caches.open(SHELL_CACHE);
  return (await cache.match(request, MATCH_OPTIONS)) ?? fetch(request);
};

const handleFont = async (request) => {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request.url);
  if (cached) {
    return cached;
  }

  // Refetch in CORS mode so the stored response is not opaque.
  const response = await fetch(request.url, { mode: "cors", credentials: "omit" });
  if (response.ok) {
    cache.put(request.url, response.clone()).catch(() => {});
  }
  return response;
};

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(handleFont(request));
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(request.mode === "navigate" ? handleNavigation(request, url) : handleAsset(request));
});
