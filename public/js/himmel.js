// Satelliten: Bahndaten (TLE) von CelesTrak werden einmal geladen, danach
// rechnet die App die Positionen komplett offline aus (SGP4 via satellite.js).
// Die Genauigkeit lässt nach etwa 1–2 Wochen ohne neue Bahndaten nach.

import * as db from './db.js';
import { $, esc, ago, fmtDateTime, fetchChecked, toast, compass } from './util.js';

const sat = window.satellite;
const GRUPPEN = {
  stations: 'Raumstationen (ISS, Tiangong)',
  visual: 'Hellste Satelliten (mit bloßem Auge)',
  weather: 'Wettersatelliten',
  'gps-ops': 'GPS',
  galileo: 'Galileo',
  iridium: 'Iridium (Satellitentelefon)',
  amateur: 'Amateurfunk',
  starlink: 'Starlink (sehr viele, langsamer)',
};
const DEG = Math.PI / 180;

let gruppe = 'stations';
let satrecs = [];
let timer = null;
let auswahl = null;

function parseTle(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]];
    if (!l1?.startsWith('1 ') || !l2?.startsWith('2 ')) continue;
    out.push({ name: name.trim(), l1, l2 });
  }
  return out;
}

function epochOf(rec) {
  const year = rec.epochyr < 57 ? 2000 + rec.epochyr : 1900 + rec.epochyr;
  return Date.UTC(year, 0, 1) + (rec.epochdays - 1) * 86400000;
}

// Speichern läuft nacheinander, damit parallele Ladevorgänge sich nicht
// gegenseitig überschreiben (alle Gruppen liegen unter einem Schlüssel).
let queue = Promise.resolve();

export function refresh(g = gruppe) {
  const job = queue.then(() => load(g));
  queue = job.catch(() => {});
  return job;
}

async function load(g) {
  const text = await fetchChecked(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`, { as: 'text', timeout: 40000 });
  const tles = parseTle(text);
  if (!tles.length) throw new Error('Keine Bahndaten erhalten.');
  const all = await db.get('tle', {});
  all[g] = { tles, fetchedAt: Date.now() };
  await db.set('tle', all);
  return tles.length;
}

async function observer() {
  const { standort } = await db.settings();
  if (!standort) return null;
  return { longitude: standort.lon * DEG, latitude: standort.lat * DEG, height: 0.05 };
}

function lookAt(rec, obs, date) {
  const pv = sat.propagate(rec, date);
  if (!pv.position || typeof pv.position === 'boolean') return null;
  const gmst = sat.gstime(date);
  const ecf = sat.eciToEcf(pv.position, gmst);
  const look = sat.ecfToLookAngles(obs, ecf);
  const geo = sat.eciToGeodetic(pv.position, gmst);
  return {
    az: look.azimuth / DEG,
    el: look.elevation / DEG,
    range: look.rangeSat,
    height: geo.height,
  };
}

// Überflüge der nächsten 24 h mit mehr als 10° Höhe über dem Horizont.
function passes(rec, obs, hours = 24) {
  const out = [];
  const start = Date.now();
  let cur = null;
  for (let t = start; t < start + hours * 3600000; t += 20000) {
    const la = lookAt(rec, obs, new Date(t));
    if (!la) break;
    if (la.el > 10) {
      if (!cur) cur = { start: t, maxEl: la.el, maxAz: la.az, startAz: la.az };
      if (la.el > cur.maxEl) { cur.maxEl = la.el; cur.maxAz = la.az; }
      cur.end = t;
      cur.endAz = la.az;
    } else if (cur) {
      out.push(cur);
      cur = null;
      if (out.length >= 8) break;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function skyPlot(points) {
  const r = 190;
  const c = 200;
  const pos = (az, el) => {
    const rr = ((90 - el) / 90) * r;
    return [c + rr * Math.sin(az * DEG), c - rr * Math.cos(az * DEG)];
  };
  const dots = points.map((p) => {
    const [x, y] = pos(p.az, p.el);
    const sel = auswahl === p.name;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sel ? 6 : 3.5}" fill="${sel ? '#f97316' : '#e2e8f0'}"><title>${esc(p.name)}</title></circle>`;
  }).join('');
  return `
    <svg class="plot" viewBox="0 0 400 400" role="img" aria-label="Himmelskarte">
      <circle class="bg" cx="200" cy="200" r="${r}"/>
      ${[30, 60].map((el) => `<circle class="ring" cx="200" cy="200" r="${((90 - el) / 90) * r}"/>`).join('')}
      <line class="ring" x1="200" y1="10" x2="200" y2="390"/><line class="ring" x1="10" y1="200" x2="390" y2="200"/>
      <text class="lbl" x="200" y="24" text-anchor="middle">N</text>
      <text class="lbl" x="382" y="204" text-anchor="middle">O</text>
      <text class="lbl" x="200" y="388" text-anchor="middle">S</text>
      <text class="lbl" x="18" y="204" text-anchor="middle">W</text>
      ${dots}
    </svg>`;
}

export async function render() {
  stop();
  const el = $('#himmel');
  const all = await db.get('tle', {});
  const data = all[gruppe];
  const obs = await observer();

  el.innerHTML = `
    <h2>Satelliten über dir</h2>
    <div class="card">
      <div class="row">
        <select class="grow" id="sat-gruppe">${Object.entries(GRUPPEN).map(([k, v]) => `<option value="${k}" ${k === gruppe ? 'selected' : ''}>${v}${all[k] ? ' ✓' : ''}</option>`).join('')}</select>
        <button class="ghost" id="sat-laden">Bahndaten laden</button>
      </div>
      <p class="muted" id="sat-info"></p>
    </div>
    <div id="sat-body"></div>`;

  $('#sat-gruppe').onchange = (e) => { gruppe = e.target.value; auswahl = null; render(); };
  $('#sat-laden').onclick = async () => {
    try { toast(`${await refresh()} Satelliten geladen`); } catch (err) { toast(err.message); }
    render();
  };

  const info = $('#sat-info');
  const body = $('#sat-body');
  if (!data) {
    info.textContent = 'Für diese Gruppe sind noch keine Bahndaten gespeichert.';
    return;
  }
  satrecs = data.tles.map((t) => ({ name: t.name, rec: sat.twoline2satrec(t.l1, t.l2) }));
  const age = (Date.now() - Math.min(...satrecs.slice(0, 50).map((s) => epochOf(s.rec)))) / 86400000;
  info.innerHTML = `${satrecs.length} Satelliten · geladen ${ago(data.fetchedAt)}${age > 14 ? ' · <span class="overdue">Bahndaten älter als 2 Wochen – Positionen ungenau</span>' : ''}`;

  if (!obs) {
    body.innerHTML = '<div class="card">Zuerst im „Cockpit“ deinen Standort bestimmen (funktioniert per GPS auch offline).</div>';
    return;
  }

  body.innerHTML = `
    <div class="card"><div id="sat-plot"></div><p class="muted" style="text-align:center">Mitte = senkrecht über dir, Rand = Horizont</p></div>
    <div class="card" id="sat-pass"></div>
    <div class="card"><h3>Jetzt sichtbar über dem Horizont</h3><div class="scroll"><table id="sat-tab"></table></div></div>`;

  const tick = () => {
    const now = new Date();
    const vis = [];
    for (const s of satrecs) {
      const la = lookAt(s.rec, obs, now);
      if (la && la.el > 0) vis.push({ name: s.name, ...la });
    }
    vis.sort((a, b) => b.el - a.el);
    $('#sat-plot').innerHTML = skyPlot(vis);
    $('#sat-tab').innerHTML = `<tr><th>Name</th><th>Höhe ü. Horizont</th><th>Richtung</th><th>Entfernung</th></tr>${
      vis.slice(0, 60).map((v) => `<tr data-sat="${esc(v.name)}" style="cursor:pointer"><td>${esc(v.name)}</td><td>${v.el.toFixed(0)}°</td><td>${v.az.toFixed(0)}° ${compass(v.az)}</td><td>${Math.round(v.range).toLocaleString('de-DE')} km</td></tr>`).join('')
      || '<tr><td colspan="4" class="muted">Gerade ist kein Satellit dieser Gruppe über dem Horizont.</td></tr>'}`;
    $('#sat-tab').querySelectorAll('[data-sat]').forEach((tr) => { tr.onclick = () => { auswahl = tr.dataset.sat; showPasses(obs); }; });
  };
  tick();
  timer = setInterval(tick, 2000);
  if (!auswahl) auswahl = satrecs.find((s) => /ISS/.test(s.name))?.name ?? satrecs[0]?.name;
  showPasses(obs);
}

function showPasses(obs) {
  const s = satrecs.find((x) => x.name === auswahl);
  const box = $('#sat-pass');
  if (!s || !box) return;
  const list = passes(s.rec, obs);
  box.innerHTML = `
    <h3>Nächste Überflüge: ${esc(s.name)}</h3>
    ${list.length ? `<div class="scroll"><table>
      <tr><th>Beginn</th><th>Ende</th><th>Max. Höhe</th><th>Von → nach</th></tr>
      ${list.map((p) => `<tr><td>${fmtDateTime(p.start)}</td><td>${new Date(p.end).toLocaleTimeString('de-DE', { timeStyle: 'short' })}</td><td>${p.maxEl.toFixed(0)}° (${compass(p.maxAz)})</td><td>${compass(p.startAz)} → ${compass(p.endAz)}</td></tr>`).join('')}
    </table></div>` : '<p class="muted">In den nächsten 24 Stunden kein Überflug höher als 10°.</p>'}
    <p class="muted">Tippe in der Tabelle unten auf einen Satelliten, um seine Überflüge zu sehen.</p>`;
}

export function stop() {
  clearInterval(timer);
  timer = null;
}
