// Офлайн-кэш: после первого запуска с сетью игра открывается и без интернета.
const CACHE = "ash-and-iron-v12";
const CORE = [
  "./", "index.html", "style.css", "manifest.webmanifest",
  "game.js", "motion.js", "exercises.js", "player.js", "sfx.js", "gear.js",
  "cosmetics.js", "leaderboard.js", "profile.js", "store.js", "storage.js", "ui.js", "config.js", "platform.js", "i18n.js",
  "atlas.png", "atlas.json",
  "press-start-2p-cyrillic-400-normal.woff2", "press-start-2p-latin-400-normal.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Сначала сеть (чтобы обновления доходили), при её отсутствии — кэш.
// Картинки, модель позы и wasm кэшируются по мере загрузки.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("/rest/v1/")) return; // рейтинг: свой кэш в leaderboard.js, без сети честно «нет сети»
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
