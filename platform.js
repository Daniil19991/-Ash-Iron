// Где запущена игра (сайт / Android / iOS) и нативные замены браузерных функций.
// В браузере все функции работают как раньше; внутри приложения Capacitor они вызывают
// нативные плагины напрямую через мост Capacitor (без сборщика и без @capacitor/core).

const cap = () => (typeof window !== "undefined" ? window.Capacitor : null);

/** "web", "ios" или "android". */
export function platform() {
  const c = cap();
  try {
    return c && c.getPlatform ? c.getPlatform() : "web";
  } catch (e) {
    return "web";
  }
}

export const isNative = () => platform() !== "web";
export const isIOS = () => platform() === "ios";

/** Есть ли нативный плагин (сведения о плагинах передаёт само приложение). */
export function hasPlugin(name) {
  const c = cap();
  if (!c || !isNative()) return false;
  return (c.PluginHeaders || []).some((h) => h.name === name);
}

/** Вызов метода нативного плагина. Без плагина — отклонённый промис. */
export function native(pluginName, method, options = {}) {
  const c = cap();
  if (!hasPlugin(pluginName) || !c.nativePromise) return Promise.reject(new Error(`нет плагина ${pluginName}`));
  return c.nativePromise(pluginName, method, options);
}

/** Вибрация: на iOS — нативная (navigator.vibrate там нет), на Android и сайте — браузерная, как раньше. */
export function vibrate(pattern) {
  if (isIOS() && hasPlugin("Haptics")) {
    const ms = Array.isArray(pattern) ? pattern.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) : pattern;
    native("Haptics", "impact", { style: ms >= 200 ? "HEAVY" : ms >= 100 ? "MEDIUM" : "LIGHT" }).catch(() => {});
    return;
  }
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* нет вибрации */ }
}

/** Экран не гаснет во время тренировки. Вызывать снова после возврата в приложение. */
export async function keepAwake() {
  if (hasPlugin("KeepAwake")) {
    await native("KeepAwake", "keepAwake").catch(() => {});
    return;
  }
  try {
    if (navigator.wakeLock && document.visibilityState === "visible") await navigator.wakeLock.request("screen");
  } catch (e) { /* не поддерживается */ }
}

/**
 * Внешняя ссылка (Telegram, настройки). В приложении переход по внешнему адресу Capacitor
 * сам отдаёт системе; на сайте — новая вкладка, а если её заблокировали — переход.
 */
export function openUrl(url) {
  if (isNative()) {
    window.location.href = url;
    return;
  }
  const w = window.open(url, "_blank", "noopener");
  if (!w) window.location.href = url;
}

/** Системные настройки приложения (iOS) — например, чтобы разрешить камеру. */
export const openAppSettings = () => openUrl("app-settings:");

// --- резервная копия сохранений в нативном хранилище (Preferences / UserDefaults)
const BACKUP_PREFIX = "ash-and-iron";

/** Копия записи в нативное хранилище (не ждёт ответа). */
export function backup(key, raw) {
  if (!key.startsWith(BACKUP_PREFIX) || !hasPlugin("Preferences")) return;
  const call = raw == null ? native("Preferences", "remove", { key }) : native("Preferences", "set", { key, value: raw });
  call.catch(() => {});
}

/**
 * При запуске приложения: вернуть в localStorage записи, которых там нет, из нативной копии
 * (на случай, если система очистила данные встроенного браузера). На сайте ничего не делает.
 */
export async function restoreBackup(storage = globalThis.localStorage) {
  if (!hasPlugin("Preferences") || !storage) return 0;
  let restored = 0;
  try {
    const { keys = [] } = await native("Preferences", "keys");
    for (const key of keys) {
      if (!key.startsWith(BACKUP_PREFIX) || storage.getItem(key) != null) continue;
      const { value } = await native("Preferences", "get", { key });
      if (value != null) {
        storage.setItem(key, value);
        restored += 1;
      }
    }
    // и наоборот: старые сохранения (до появления копии) переносим в нативное хранилище
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(BACKUP_PREFIX) && !keys.includes(key)) backup(key, storage.getItem(key));
    }
  } catch (e) { /* без копии игра работает как раньше */ }
  return restored;
}
