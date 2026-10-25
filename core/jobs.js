// Auftrags-Ablauf für KI-Anfragen, unabhängig vom Hosting:
//   1. starte()   – prüft Zugang und Limit, legt den Auftrag an, gibt die ID zurück
//   2. bearbeite() – führt ihn aus (eigener Server: sofort im Hintergrund,
//                    Netlify: in einer Background-Function mit bis zu 15 Minuten)
//   3. hole()      – die App fragt den Stand ab; ein fertiges Ergebnis wird beim
//                    Abholen gelöscht, damit keine Inhalte liegen bleiben.
// Der Speicher ist austauschbar: Map im Arbeitsspeicher oder Netlify Blobs.

import { randomUUID, createHash } from 'node:crypto';
import { pruefeZugang, fuehreAus, fehlerText, KiFehler, TYPEN, LIMIT_PRO_STUNDE } from './ki.js';

const MAX_ALTER_MS = 30 * 60000;

// Speicher im Arbeitsspeicher (eigener Server). Gleiche Schnittstelle wie Blobs.
export function speicherImRam() {
  const m = new Map();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => { m.set(k, v); },
    del: async (k) => { m.delete(k); },
  };
}

// Begrenzung pro IP und Stunde. Die IP wird nur als Hash gespeichert.
async function limit(store, ip) {
  const stunde = Math.floor(Date.now() / 3600000);
  const key = `limit-${createHash('sha256').update(String(ip ?? '')).digest('hex').slice(0, 24)}-${stunde}`;
  const n = ((await store.get(key))?.n ?? 0) + 1;
  if (n > LIMIT_PRO_STUNDE) throw new KiFehler(429, 'Zu viele Anfragen – bitte in einer Stunde erneut versuchen.');
  await store.set(key, { n, bis: (stunde + 2) * 3600000 });
}

export async function starte(store, { typ, body, zugang, ip }) {
  pruefeZugang(zugang);
  if (!TYPEN.includes(typ)) throw new KiFehler(404, 'Unbekannte Aufgabe.');
  await limit(store, ip);
  const id = randomUUID();
  await store.set(`job-${id}`, { status: 'wartet', typ, body, at: Date.now() });
  return id;
}

export async function bearbeite(store, id) {
  const key = `job-${id}`;
  const job = await store.get(key);
  if (!job || job.status !== 'wartet') return; // nur einmal ausführen
  await store.set(key, { status: 'laeuft', typ: job.typ, at: job.at });
  try {
    const ergebnis = await fuehreAus(job.typ, job.body);
    await store.set(key, { status: 'fertig', ergebnis, at: job.at });
  } catch (err) {
    const { status, fehler } = fehlerText(err);
    await store.set(key, { status: 'fehler', code: status, fehler, at: job.at });
  }
}

export async function hole(store, id, zugang) {
  pruefeZugang(zugang);
  if (!/^[0-9a-f-]{36}$/.test(String(id))) throw new KiFehler(400, 'Ungültige Auftrags-ID.');
  const key = `job-${id}`;
  const job = await store.get(key);
  if (!job) throw new KiFehler(404, 'Auftrag nicht gefunden – bitte neu starten.');
  if (job.status === 'fertig' || job.status === 'fehler') {
    await store.del(key);
    return job;
  }
  if (Date.now() - job.at > MAX_ALTER_MS) {
    await store.del(key);
    return { status: 'fehler', code: 504, fehler: 'Die KI hat zu lange gebraucht – bitte erneut versuchen.' };
  }
  return { status: job.status, seit: Date.now() - job.at };
}
