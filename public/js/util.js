// Kleine DOM- und Formatierungshelfer, die alle Bereiche teilen.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function fmtDateTime(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export function fmtDate(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleDateString('de-DE');
}

export function fmtNum(n, digits = 2) {
  if (!Number.isFinite(n)) return '–';
  return n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function ago(ts) {
  if (!ts) return 'nie';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 48) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fetch mit Timeout; wirft verständliche Fehler statt "Failed to fetch".
export async function fetchChecked(url, { timeout = 20000, as = 'json' } = {}) {
  if (!navigator.onLine) throw new Error('Kein Internet – zeige gespeicherte Daten.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`Server antwortet mit ${res.status}`);
    return as === 'text' ? await res.text() : await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Zeitüberschreitung beim Laden.');
    if (err instanceof TypeError) throw new Error('Quelle nicht erreichbar (Netz oder Browser blockiert).');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Haversine-Distanz in km und Peilung in Grad von Punkt a nach b.
export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDeg(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat))
    - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function compass(deg) {
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// Eigener Dialog statt confirm()/prompt(): passt ins Design, per Tastatur bedienbar.
// Gibt true/false zurück, mit `eingabe` den eingegebenen Text (oder null).
export function dialog({ titel, text = '', ok = 'OK', abbrechen = 'Abbrechen', gefahr = false, eingabe = null }) {
  const box = $('#dialog');
  box.innerHTML = `
    <div class="dialog-karte glass" role="dialog" aria-modal="true" aria-labelledby="dlg-titel">
      <h2 id="dlg-titel">${esc(titel)}</h2>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${eingabe ? `<input id="dlg-eingabe" placeholder="${esc(eingabe)}" autocomplete="off">` : ''}
      <div class="dialog-knoepfe">
        <button class="ghost" id="dlg-nein">${esc(abbrechen)}</button>
        <button class="${gefahr ? 'danger' : ''}" id="dlg-ja">${esc(ok)}</button>
      </div>
    </div>`;
  box.hidden = false;
  const feld = $('#dlg-eingabe');
  (feld ?? $('#dlg-ja')).focus();
  return new Promise((resolve) => {
    const ende = (wert) => {
      box.hidden = true;
      box.innerHTML = '';
      document.removeEventListener('keydown', taste);
      resolve(wert);
    };
    const taste = (e) => {
      if (e.key === 'Escape') ende(eingabe ? null : false);
      if (e.key === 'Enter') ende(eingabe ? feld.value : true);
    };
    document.addEventListener('keydown', taste);
    $('#dlg-ja').onclick = () => ende(eingabe ? feld.value : true);
    $('#dlg-nein').onclick = () => ende(eingabe ? null : false);
    box.onclick = (e) => { if (e.target === box) ende(eingabe ? null : false); };
  });
}
