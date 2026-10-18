// Безопасная работа с localStorage: в приватном режиме или при запрете хранилища
// игра продолжает работать, просто без сохранения.
export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* хранилище недоступно */ }
}
