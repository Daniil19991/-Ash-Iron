// Безопасная работа с localStorage: в приватном режиме или при запрете хранилища
// игра продолжает работать, просто без сохранения.
// В приложении каждая запись дублируется в нативное хранилище (см. platform.js).
import { backup } from "./platform.js";

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
    const raw = JSON.stringify(value);
    localStorage.setItem(key, raw);
    backup(key, raw);
  } catch (e) { /* хранилище недоступно */ }
}
