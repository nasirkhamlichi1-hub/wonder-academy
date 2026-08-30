// Shared helpers for the Worker.

export const TZ = 'Asia/Dubai';

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}

export function err(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, status);
}

export const now = () => Date.now();

export function uuid() {
  return crypto.randomUUID();
}

/** Chronologically sortable id: base36 ms + 8 random chars. */
export function id(prefix = '') {
  const t = Date.now().toString(36).padStart(9, '0');
  const r = [...crypto.getRandomValues(new Uint8Array(5))]
    .map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8);
  return `${prefix}${t}${r}`;
}

const enc = new TextEncoder();

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256(pin + salt, pepper) — pepper is a Worker secret, never in the DB. */
export async function hashPin(pin, salt, pepper) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${pin}:${salt}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 32) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time-ish string compare. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 'YYYY-MM-DD' in the family's timezone — the unit for "distinct days" in mastery. */
export function dayKey(ms = Date.now(), tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

export const DAY_MS = 86_400_000;
export const addDays = (ms, d) => ms + d * DAY_MS;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function parseJson(text, fallback = null) {
  if (text == null) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

/** Deterministic PRNG so a generated maths item is reproducible from its seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function corsHeaders(origin, allowed) {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '86400',
  };
}
