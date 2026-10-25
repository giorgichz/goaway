// Einstieg: Sperrbildschirm, dann die Welt. Der 3D-Globus läuft dauerhaft im
// Hintergrund; alle Bereiche öffnen sich als Glas-Panel darüber (URL-Hash).

import { $, $$, toast } from './util.js';
import { isUnlocked, lockKey } from './crypto.js';
import * as sperre from './sperre.js';
import * as start from './start.js';
import * as ki from './ki.js';
import * as karte from './karte.js';
import * as mehr from './mehr.js';
import * as lage from './lage.js';
import * as himmel from './himmel.js';
import * as fluege from './fluege.js';
import * as geld from './geld.js';
import * as plan from './plan.js';
import * as tresor from './tresor.js';
import * as briefe from './briefe.js';
import * as notfall from './notfall.js';

const VIEWS = {
  start: { titel: 'Cockpit', render: () => start.render({ refreshAll }) },
  ki: { titel: 'KI-Planer', render: ki.render },
  mehr: { titel: 'Mehr', render: mehr.render },
  lage: { titel: 'Weltlage', render: lage.render, eltern: 'mehr' },
  himmel: { titel: 'Himmel', render: himmel.render, eltern: 'mehr' },
  fluege: { titel: 'Luftraum', render: fluege.render, eltern: 'mehr' },
  geld: { titel: 'Geld', render: geld.render, eltern: 'mehr' },
  plan: { titel: 'Plan', render: plan.render },
  tresor: { titel: 'Tresor', render: tresor.render },
  briefe: { titel: 'Kündigungen', render: briefe.render, eltern: 'mehr' },
  notfall: { titel: 'Notfall', render: notfall.render, eltern: 'mehr' },
};
const AUTO_LOCK_HIDDEN_MS = 60000;
const AUTO_LOCK_IDLE_MS = 10 * 60000;

async function refreshAll() {
  const jobs = [
    ['Weltlage', lage.refresh()],
    ['Kurse', geld.refresh()],
    ['Raumstationen', himmel.refresh('stations')],
    ['Helle Satelliten', himmel.refresh('visual')],
  ];
  const results = await Promise.allSettled(jobs.map(([, p]) => p));
  const fehler = results.map((r, i) => (r.status === 'rejected' ? `${jobs[i][0]}: ${r.reason.message}` : null)).filter(Boolean);
  toast(fehler.length ? `Teilweise fehlgeschlagen – ${fehler.join(' · ')}` : 'Alles aktualisiert und offline gespeichert');
}

let aktuell = null;

function show() {
  if (!isUnlocked()) return;
  const name = location.hash.slice(1);
  const view = VIEWS[name];
  himmel.stop();
  if (name !== 'fluege') fluege.stop();
  $$('#dock a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${view ? (view.eltern ?? name) : 'welt'}`));

  if (!view) {
    aktuell = null;
    $('#panel').hidden = true;
    document.body.classList.remove('panel-open');
    karte.pause(false);
    return;
  }
  const wechsel = aktuell !== name;
  aktuell = name;
  document.body.classList.add('panel-open');
  karte.pause(true);
  $('#panel').hidden = false;
  $('#panel-titel').textContent = view.titel;
  $('#panel-zurueck').hidden = !view.eltern;
  $('#panel-zurueck').onclick = () => { location.hash = view.eltern; };
  $$('.view').forEach((v) => { v.hidden = v.id !== name; });
  if (wechsel) $('#panel-body').scrollTop = 0;
  view.render().catch((err) => { console.error(err); toast(`Fehler: ${err.message}`); });
}

function netz() {
  const n = $('#netz');
  n.textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE';
  n.classList.toggle('online', navigator.onLine);
  n.classList.toggle('offline', !navigator.onLine);
}

// Sperren: Schlüssel weg, Timer stoppen, alle angezeigten Inhalte aus dem DOM.
function onLocked() {
  himmel.stop();
  fluege.stop();
  karte.stop();
  $('#welt').innerHTML = '';
  $$('.view').forEach((v) => { v.innerHTML = ''; });
  $('#panel').hidden = true;
  aktuell = null;
  document.body.classList.add('locked');
  sperre.show(unlocked);
}

function unlocked() {
  document.body.classList.remove('locked');
  bumpIdle();
  karte.render().catch((err) => { console.error(err); toast(`Globus: ${err.message}`); });
  show();
}

let idleTimer;
function bumpIdle() {
  clearTimeout(idleTimer);
  if (isUnlocked()) idleTimer = setTimeout(lockKey, AUTO_LOCK_IDLE_MS);
}

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    himmel.stop();
    fluege.stop();
    karte.pause(true);
  } else if (isUnlocked() && Date.now() - hiddenAt > AUTO_LOCK_HIDDEN_MS) {
    lockKey();
  } else if (isUnlocked()) {
    show();
  }
});
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, bumpIdle, { passive: true }));
window.addEventListener('gesperrt', onLocked);
window.addEventListener('hashchange', show);
window.addEventListener('online', netz);
window.addEventListener('offline', netz);
window.addEventListener('ki-status', (e) => { $('#ki-pill').hidden = e.detail.laufend === 0; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aktuell && $('#dialog').hidden) location.hash = 'welt'; });
$('#sperren').onclick = () => lockKey();
netz();

if (!globalThis.crypto?.subtle) {
  $('#sperre').hidden = false;
  $('#sperre').innerHTML = '<div class="sperre-box"><h1>Neustart</h1><p>Verschlüsselung braucht eine sichere Verbindung. Bitte die App über https:// öffnen.</p></div>';
} else {
  onLocked();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker nicht registriert:', err));
}
