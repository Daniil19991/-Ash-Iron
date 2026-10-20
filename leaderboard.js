// Рейтинг игроков по побеждённым боссам и уровню (сервер — Supabase, см. config.js).
// Игра не зависит от сети: результат ставится в очередь и уходит, когда появится интернет;
// без сети показывается последняя сохранённая таблица, без сервера — только свой результат.
import { IOS, LEADERBOARD } from "./config.js";
import { isIOS } from "./platform.js";
import { loadJSON, saveJSON } from "./storage.js";

const QUEUE_KEY = "ash-and-iron-lb-queue";
const CACHE_KEY = "ash-and-iron-lb-cache";
const TIMEOUT_MS = 6000;
const TOP = 50;

const byRank = (a, b) => b.bosses - a.bosses || b.level - a.level || b.wave - a.wave;

export class Leaderboard {
  constructor(config = LEADERBOARD, fetchImpl = globalThis.fetch?.bind(globalThis), { offline = isIOS() && !IOS.leaderboardOnline } = {}) {
    this.config = config;
    this.offline = offline; // iOS до исправления правил сервера: только свой результат, без сети
    this.fetch = fetchImpl;
    this.pending = loadJSON(QUEUE_KEY, null); // последний неотправленный результат
    this.cache = loadJSON(CACHE_KEY, { rows: [], at: 0 });
    this.sending = false;
    if (typeof addEventListener === "function") addEventListener("online", () => this.flush());
  }

  get configured() {
    if (this.offline) return false;
    return !!(this.config.url && this.config.anonKey && this.fetch);
  }

  headers(extra = {}) {
    return {
      apikey: this.config.anonKey,
      Authorization: `Bearer ${this.config.anonKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async request(path, options = {}) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetch(`${this.config.url}/rest/v1/${this.config.table}${path}`, {
        ...options,
        signal: ctrl && ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Запоминает результат профиля и пытается отправить его (не ждёт сети). */
  submit(profile) {
    this.pending = {
      player_id: profile.id,
      name: profile.name,
      bosses: profile.best.bosses,
      level: profile.best.level,
      wave: profile.best.wave,
    };
    saveJSON(QUEUE_KEY, this.pending);
    return this.flush();
  }

  /** Отправляет очередь. true — отправлено (или нечего отправлять). */
  async flush() {
    if (!this.pending) return true;
    if (!this.configured || this.sending) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    this.sending = true;
    const entry = this.pending;
    try {
      await this.request("?on_conflict=player_id", {
        method: "POST",
        headers: this.headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(entry),
      });
      if (this.pending === entry) {
        this.pending = null;
        saveJSON(QUEUE_KEY, null);
      }
      return true;
    } catch (e) {
      return false; // нет сети или сервер недоступен — попробуем позже
    } finally {
      this.sending = false;
    }
  }

  /**
   * Таблица для экрана рейтинга.
   * source: "online" — свежая с сервера, "cache" — сохранённая (нет сети), "local" — сервер не настроен.
   */
  async top(profile) {
    const me = {
      player_id: profile.id, name: profile.name,
      bosses: profile.best.bosses, level: profile.best.level, wave: profile.best.wave,
    };
    if (!this.configured) return { rows: [me], rank: 1, source: "local", pending: false };
    await this.flush();
    try {
      const res = await this.request(
        `?select=player_id,name,bosses,level,wave&order=bosses.desc,level.desc,wave.desc&limit=${TOP}`,
        { headers: this.headers() },
      );
      const rows = await res.json();
      this.cache = { rows, at: Date.now() };
      saveJSON(CACHE_KEY, this.cache);
      return { rows, rank: await this.rankOf(me, rows), source: "online", pending: !!this.pending };
    } catch (e) {
      // без сети: сохранённая таблица со своим актуальным результатом
      const rows = this.cache.rows.filter((r) => r.player_id !== me.player_id).concat([me]).sort(byRank);
      return { rows, rank: rows.indexOf(me) + 1, source: "cache", at: this.cache.at, pending: !!this.pending };
    }
  }

  async rankOf(me, rows) {
    const i = rows.findIndex((r) => r.player_id === me.player_id);
    if (i >= 0) return i + 1;
    // не в топе — считаем, сколько игроков выше
    try {
      const better = `or=(bosses.gt.${me.bosses},and(bosses.eq.${me.bosses},level.gt.${me.level}))`;
      const res = await this.request(`?select=player_id&${better}`, {
        method: "HEAD",
        headers: this.headers({ Prefer: "count=exact" }),
      });
      const total = Number((res.headers.get("content-range") || "").split("/")[1]);
      return Number.isFinite(total) ? total + 1 : null;
    } catch (e) {
      return null;
    }
  }
}
