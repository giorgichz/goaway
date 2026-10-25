// Schlüssel-Wert-Speicher auf IndexedDB. Alles bleibt auf dem Gerät.
// Persönliche Schlüssel (PRIVAT) werden transparent mit dem Master-Schlüssel
// verschlüsselt; öffentliche Daten (Lage, Kurse, Bahndaten) bleiben lesbar.

import { encryptJson, decryptJson, isUnlocked, toB64, fromB64 } from './crypto.js';

const DB_NAME = 'neustart';
const STORE = 'kv';
const PRIVAT = new Set([
  'settings', 'plan', 'budget', 'brief', 'kontakte', 'medizin', 'fluege',
  'umrechner', 'eigeneKurse', 'kiPlaene', 'kiChat', 'kiZugang', 'erkunden', 'karteView',
  'kiRouten', 'dossiers', 'zielKoord', 'globusBalken', 'globus', 'recherchen',
]);
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const rawGet = (key) => tx('readonly', (s) => s.get(key));
const rawSet = (key, value) => tx('readwrite', (s) => s.put(value, key));
const isEnc = (v) => v && typeof v === 'object' && v.__enc === 1;

export async function get(key, fallback = undefined) {
  const value = await rawGet(key);
  if (value === undefined) return fallback;
  if (isEnc(value)) return decryptJson(value);
  return value;
}

export async function set(key, value) {
  if (!PRIVAT.has(key)) return rawSet(key, value);
  if (!isUnlocked()) throw new Error('App ist gesperrt.');
  return rawSet(key, { __enc: 1, ...(await encryptJson(value)) });
}

export const del = (key) => tx('readwrite', (s) => s.delete(key));
export const keys = () => tx('readonly', (s) => s.getAllKeys());
export const wipeAll = () => tx('readwrite', (s) => s.clear());

// Nach dem ersten Entsperren: alte, noch unverschlüsselte Privatdaten nachziehen.
export async function migratePrivate() {
  for (const key of PRIVAT) {
    const value = await rawGet(key);
    if (value !== undefined && !isEnc(value)) await set(key, value);
  }
}

// Einstellungen, die mehrere Bereiche brauchen (Abreise, Zielland, Standort …).
export async function settings() {
  return get('settings', {});
}

export async function updateSettings(patch) {
  const next = { ...(await settings()), ...patch };
  await set('settings', next);
  return next;
}

// Komplette Sicherung: Rohdaten (Privates bleibt verschlüsselt), Binärdaten als Base64.
export async function exportAll() {
  const out = {};
  for (const key of await keys()) out[key] = await rawGet(key);
  return JSON.stringify({ format: 'neustart-system', version: 2, data: out }, (_, v) => {
    if (v instanceof ArrayBuffer || v instanceof Uint8Array) return { __b64: toB64(v) };
    return v;
  });
}

export async function importAll(text) {
  const parsed = JSON.parse(text, (_, v) => (v && typeof v === 'object' && typeof v.__b64 === 'string' ? fromB64(v.__b64) : v));
  if (parsed.format === 'neustart-tresor') {
    // Sicherung aus Version 1 (nur Tresor).
    const { salt, iter, check, items } = parsed;
    const unpack = (b) => ({ iv: fromB64(b.iv), ct: fromB64(b.ct) });
    await wipeAll();
    await rawSet('tresorMeta', { salt: fromB64(salt), iter, check: unpack(check) });
    await rawSet('tresorItems', items.map((i) => ({ id: i.id, meta: unpack(i.meta), data: unpack(i.data) })));
    return;
  }
  if (parsed.format !== 'neustart-system' || !parsed.data?.tresorMeta) throw new Error('Keine gültige Neustart-Sicherung.');
  await wipeAll();
  for (const [key, value] of Object.entries(parsed.data)) await rawSet(key, value);
}
