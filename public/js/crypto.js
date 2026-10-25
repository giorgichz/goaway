// Gemeinsame Verschlüsselung der ganzen App. Ein Master-Passwort wird per
// PBKDF2 (600 000 Runden, SHA-256) zu einem AES-256-GCM-Schlüssel. Der Schlüssel
// liegt nur im Arbeitsspeicher und verschwindet beim Sperren.

export const ITER = 600000;
const PRUEF = 'neustart-tresor-v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

let key = null;

export const isUnlocked = () => key !== null;

export function lockKey() {
  key = null;
  window.dispatchEvent(new Event('gesperrt'));
}

async function deriveKey(password, salt, iterations = ITER) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encrypt(data) {
  if (!key) throw new Error('Gesperrt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv, ct };
}

export function decrypt({ iv, ct }) {
  if (!key) throw new Error('Gesperrt');
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
}

export const encryptJson = (value) => encrypt(enc.encode(JSON.stringify(value)));
export const decryptJson = async (box) => JSON.parse(dec.decode(await decrypt(box)));
export const encodeText = (s) => enc.encode(s);
export const decodeText = (b) => dec.decode(b);

// Legt ein neues Master-Passwort an und gibt die zu speichernden Metadaten zurück.
export async function createMaster(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  key = await deriveKey(password, salt);
  return { salt, iter: ITER, check: await encrypt(enc.encode(PRUEF)) };
}

// Prüft das Passwort gegen die gespeicherten Metadaten. true = entsperrt.
export async function unlockMaster(password, meta) {
  try {
    key = await deriveKey(password, meta.salt, meta.iter ?? ITER);
    if (dec.decode(await decrypt(meta.check)) === PRUEF) return true;
  } catch { /* falsches Passwort lässt GCM scheitern */ }
  key = null;
  return false;
}

// Base64 stückweise, damit große Dateien den Stack nicht sprengen.
export function toB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
