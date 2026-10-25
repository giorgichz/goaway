// Reisen auf dem Globus: Live-GPS mit Lichtsäule, leuchtende Bögen von dir zu
// Zielen, 3 KI-Routen mit Kameraflug Stopp für Stopp, Dossiers zu jedem Ort
// und Buchungs-Links (Flüge, Unterkünfte, Bahn/Bus/Fähre) mit Ziel und Datum.

import * as db from './db.js';
import { $, esc, ago, toast, fetchChecked, distanceKm } from './util.js';
import { api, kontext } from './ki.js';
import { landName } from './laender.js';
import * as stadt from './stadt.js';

export const ROUTEN_FARBEN = ['#3ee6a8', '#7dd3fc', '#f2b53c'];
const MITTEL = { start: 'Start', flug: 'Flug', zug: 'Zug', bus: 'Bus', faehre: 'Fähre', auto: 'Auto', zu_fuss: 'zu Fuß' };
const TYPEN = { schnell: 'Schnell', guenstig: 'Günstig', ruhig: 'Ruhig', abenteuer: 'Abenteuer', sicher: 'Sicher' };

let C;
let viewer;
let sheet;
let ich = null;
let watchId = null;
let letzteSpeicherung = 0;
let routenLayer = null;
let balkenLayer = null;
let tourAktiv = null;
let ichEntities = null;

export function setup(ctx) {
  ({ C, viewer, sheet } = ctx);
  routenLayer = null;
  balkenLayer = null;
  ichEntities = null;
}

export function stop() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  tourAktiv = null;
  viewer = null;
}

export const meinOrt = () => ich;
export const tourLaeuft = () => tourAktiv !== null;

// --- Live-GPS -----------------------------------------------------------------

export async function starteGps() {
  const { standort } = await db.settings();
  if (standort) ich = { lat: standort.lat, lon: standort.lon, acc: null };
  zeichneIch();
  if (!navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition((p) => {
    ich = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
    zeichneIch();
    if (stadt.istAktiv()) stadt.setGps(ich.lat, ich.lon);
    if (Date.now() - letzteSpeicherung > 300000) {
      letzteSpeicherung = Date.now();
      db.updateSettings({ standort: { lat: ich.lat, lon: ich.lon, at: Date.now() } }).catch(() => {});
    }
  }, () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
}

function zeichneIch() {
  if (!viewer || !ich || ichEntities) return;
  const gruen = C.Color.fromCssColorString('#3ee6a8');
  const pos = new C.CallbackProperty(() => C.Cartesian3.fromDegrees(ich.lon, ich.lat), false);
  const puls = () => (Date.now() % 2400) / 2400;
  ichEntities = [
    viewer.entities.add({
      name: 'Du (GPS live)',
      position: pos,
      point: { pixelSize: 11, color: gruen, outlineColor: C.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: 'DU', font: '600 12px ui-monospace, monospace', fillColor: gruen, pixelOffset: new C.Cartesian2(0, -20), disableDepthTestDistance: Number.POSITIVE_INFINITY },
    }),
    viewer.entities.add({
      position: pos,
      ellipse: {
        semiMajorAxis: new C.CallbackProperty(() => 800 + puls() * 40000, false),
        semiMinorAxis: new C.CallbackProperty(() => 800 + puls() * 40000, false),
        material: new C.ColorMaterialProperty(new C.CallbackProperty(() => gruen.withAlpha(0.45 * (1 - puls())), false)),
        height: 0,
      },
    }),
    // Lichtsäule ins All, damit man sich auch aus dem Orbit findet.
    viewer.entities.add({
      polyline: {
        positions: new C.CallbackProperty(() => C.Cartesian3.fromDegreesArrayHeights([ich.lon, ich.lat, 0, ich.lon, ich.lat, 600000]), false),
        width: 6,
        material: new C.PolylineGlowMaterialProperty({ glowPower: 0.3, taperPower: 0.6, color: gruen }),
      },
    }),
  ];
}

// --- Leuchtende Bögen ------------------------------------------------------------

function bogenPunkte(a, b, faktor = 1) {
  const g = new C.EllipsoidGeodesic(C.Cartographic.fromDegrees(a.lon, a.lat), C.Cartographic.fromDegrees(b.lon, b.lat));
  const dist = g.surfaceDistance;
  const peak = Math.min(dist * 0.22, 1800000) * faktor;
  const n = Math.max(24, Math.min(96, Math.round(dist / 40000)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const c = g.interpolateUsingFraction(f);
    pts.push(C.Cartesian3.fromRadians(c.longitude, c.latitude, 2000 + peak * 4 * f * (1 - f)));
  }
  return { pts, km: dist / 1000 };
}

// Bogen mit Glühen und einem Lichtpunkt, der von a nach b wandert.
function bogen(parent, a, b, farbe, { faktor = 1, label = null, breite = 4 } = {}) {
  const { pts, km } = bogenPunkte(a, b, faktor);
  const col = C.Color.fromCssColorString(farbe);
  const dauer = 2500 + Math.min(km, 8000) * 0.5;
  const versatz = Math.random() * dauer;
  viewer.entities.add({ parent, polyline: { positions: pts, width: breite, material: new C.PolylineGlowMaterialProperty({ glowPower: 0.22, color: col.withAlpha(0.9) }) } });
  viewer.entities.add({
    parent,
    position: new C.CallbackProperty(() => {
      const t = ((Date.now() + versatz) % dauer) / dauer;
      const i = t * (pts.length - 1);
      const lo = Math.floor(i);
      return C.Cartesian3.lerp(pts[lo], pts[Math.min(lo + 1, pts.length - 1)], i - lo, new C.Cartesian3());
    }, false),
    point: { pixelSize: 7, color: C.Color.WHITE, outlineColor: col, outlineWidth: 4 },
  });
  if (label) {
    viewer.entities.add({
      parent,
      position: pts[Math.floor(pts.length / 2)],
      label: { text: label, font: '500 12px ui-monospace, monospace', fillColor: col, showBackground: true, backgroundColor: C.Color.fromCssColorString('#050607bb'), distanceDisplayCondition: new C.DistanceDisplayCondition(0, 2.5e7) },
    });
  }
  return km;
}

const flugzeit = (km) => { const h = km / 800 + 0.5; return h < 1.5 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`; };

// Bögen von dir zum Zielland und zu gemerkten Orten.
export async function zeichneBalken() {
  if (!viewer) return;
  if (balkenLayer) viewer.entities.remove(balkenLayer);
  balkenLayer = viewer.entities.add(new C.Entity());
  if (!ich) return;
  const { zielland } = await db.settings();
  const ziele = [...(await db.get('globusBalken', []))];
  if (zielland) {
    let k = await db.get('zielKoord');
    if (k?.code !== zielland && navigator.onLine) {
      try {
        const r = await fetchChecked(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=de&countrycodes=${zielland.toLowerCase()}&q=${encodeURIComponent(landName(zielland))}`);
        if (r[0]) { k = { code: zielland, lat: Number(r[0].lat), lon: Number(r[0].lon) }; await db.set('zielKoord', k); }
      } catch { /* offline: kein Zielbogen */ }
    }
    if (k?.code === zielland) ziele.unshift({ name: `Ziel: ${landName(zielland)}`, lat: k.lat, lon: k.lon, haupt: true });
  }
  if (!viewer) return;
  for (const z of ziele) {
    const km = distanceKm(ich, z);
    bogen(balkenLayer, ich, z, z.haupt ? '#ff5a5f' : '#c084fc', { label: `${z.name} · ${Math.round(km).toLocaleString('de-DE')} km · ✈ ${flugzeit(km)}`, breite: z.haupt ? 5 : 3 });
  }
}

export async function balkenHierhin(name, lat, lon) {
  const liste = (await db.get('globusBalken', [])).filter((b) => b.name !== name);
  liste.unshift({ name, lat, lon });
  await db.set('globusBalken', liste.slice(0, 5));
  await zeichneBalken();
  toast(`Bogen zu ${name} gesetzt`);
}

export async function balkenLoeschen() {
  await db.set('globusBalken', []);
  await zeichneBalken();
}

// --- Routen ------------------------------------------------------------------------

const heutePlus = (tage) => new Date(Date.now() + tage * 86400000).toISOString().slice(0, 10);
const plusTage = (iso, n) => new Date(new Date(iso).getTime() + n * 86400000).toISOString().slice(0, 10);

export async function routenPanel(vorschlag = '') {
  const { abreise, zielland } = await db.settings();
  const gespeichert = await db.get('kiRouten');
  sheet('ROUTEN', `
    <div class="stack">
      <input id="r-ziel" placeholder="Ziel – Land, Insel, Stadt …" value="${esc(vorschlag || gespeichert?.ziel || (zielland ? landName(zielland) : ''))}">
      <div class="row"><input type="date" id="r-datum" class="grow" value="${esc(gespeichert?.datum || abreise || heutePlus(14))}"></div>
      <textarea id="r-wunsch" placeholder="Wünsche: z. B. ohne Flugzeug, mit Hund, unter 800 €, möglichst unauffällig, über Inseln …" style="min-height:60px">${esc(gespeichert?.wuensche ?? '')}</textarea>
      <button id="r-los">3 Routen planen</button>
      <p class="muted small">Start ist dein GPS-Standort (auf ~10 km gerundet an die KI). Dauert bis zu 1–2 Minuten.</p>
    </div>
    <div id="r-liste"></div>`);
  $('#r-los').onclick = planeRouten;
  if (gespeichert) zeigeRouten(gespeichert);
}

async function planeRouten() {
  const ziel = $('#r-ziel').value.trim();
  if (!ziel) { toast('Ziel eingeben.'); return; }
  const btn = $('#r-los');
  btn.disabled = true;
  btn.textContent = 'KI berechnet Routen …';
  try {
    const von = ich ? { lat: Math.round(ich.lat * 10) / 10, lon: Math.round(ich.lon * 10) / 10 } : null;
    const datum = $('#r-datum').value;
    const wuensche = $('#r-wunsch').value.trim();
    const { routen } = await api('route', { von, ziel, datum, wuensche, kontext: await kontext() });
    const eintrag = { ziel, datum, wuensche, routen, at: Date.now(), aktiv: 0 };
    await db.set('kiRouten', eintrag);
    zeigeRouten(eintrag);
  } catch (err) {
    toast(err.message);
  }
  if ($('#r-los')) { $('#r-los').disabled = false; $('#r-los').textContent = '3 Routen planen'; }
}

function zeigeRouten(e) {
  zeichneRouten(e);
  const box = $('#r-liste');
  if (!box) return;
  box.innerHTML = `
    <div class="g-label">${esc(e.ziel)} · ${ago(e.at)}</div>
    ${e.routen.map((r, i) => `
      <div class="g-route ${i === e.aktiv ? 'on' : ''}" style="--rc:${ROUTEN_FARBEN[i % 3]}">
        <div class="row" style="justify-content:space-between">
          <strong>${esc(r.titel)}</strong>
          <span class="badge info">${esc(TYPEN[r.typ] ?? r.typ)}</span>
        </div>
        <div class="mono small" style="margin:4px 0">${r.dauer_tage} Tage · ~${Math.round(r.kosten_eur).toLocaleString('de-DE')} € · ${r.stopps.length} Stopps</div>
        <p class="small" style="margin-bottom:6px">${esc(r.zusammenfassung)}</p>
        <details><summary class="small">Vor- & Nachteile</summary>
          <div class="small"><span style="color:var(--ok)">＋</span> ${r.vorteile.map(esc).join('<br><span style="color:var(--ok)">＋</span> ')}</div>
          <div class="small" style="margin-top:4px"><span style="color:var(--bad)">－</span> ${r.nachteile.map(esc).join('<br><span style="color:var(--bad)">－</span> ')}</div>
        </details>
        <div class="row" style="margin-top:8px">
          <button class="chip on" data-live="${i}">▶ Live ansehen</button>
          <button class="chip" data-zeig="${i}">Zeigen</button>
          <button class="chip" data-buch="${i}">Buchen</button>
          <button class="chip" data-plan="${i}">In Plan</button>
        </div>
        <div id="r-buch-${i}"></div>
      </div>`).join('')}`;
  const setAktiv = async (i) => { e.aktiv = i; await db.set('kiRouten', e); zeigeRouten(e); };
  box.querySelectorAll('[data-zeig]').forEach((b) => { b.onclick = () => { setAktiv(Number(b.dataset.zeig)); zeigeGanz(e.routen[b.dataset.zeig]); }; });
  box.querySelectorAll('[data-live]').forEach((b) => { b.onclick = () => { setAktiv(Number(b.dataset.live)); tour(e, Number(b.dataset.live)); }; });
  box.querySelectorAll('[data-buch]').forEach((b) => {
    b.onclick = () => {
      const ziel = $(`#r-buch-${b.dataset.buch}`);
      ziel.innerHTML = ziel.innerHTML ? '' : buchungsLinks(e.routen[b.dataset.buch], e.datum);
      ziel.querySelectorAll('[data-re]').forEach((x) => { x.onclick = () => recherche(x.dataset.re, x.dataset.ort, { datum: x.dataset.datum, details: x.dataset.details }); });
    };
  });
  box.querySelectorAll('[data-plan]').forEach((b) => { b.onclick = () => inPlan(e.routen[b.dataset.plan], e.datum); });
}

export async function zeichneGespeicherteRouten() {
  const e = await db.get('kiRouten');
  if (e) zeichneRouten(e);
}

function zeichneRouten(e) {
  if (!viewer) return;
  stadt.setRouten(e.routen, e.aktiv, ROUTEN_FARBEN);
  if (routenLayer) viewer.entities.remove(routenLayer);
  routenLayer = viewer.entities.add(new C.Entity());
  e.routen.forEach((r, i) => {
    const aktiv = i === e.aktiv;
    const farbe = ROUTEN_FARBEN[i % 3];
    for (let s = 1; s < r.stopps.length; s++) {
      bogen(routenLayer, r.stopps[s - 1], r.stopps[s], aktiv ? farbe : `${farbe}55`, { faktor: 0.7 + i * 0.25, breite: aktiv ? 5 : 2 });
    }
    if (!aktiv) return;
    r.stopps.forEach((s, n) => viewer.entities.add({
      parent: routenLayer,
      name: `${s.name} (${s.land}) · ${s.info}`,
      position: C.Cartesian3.fromDegrees(s.lon, s.lat),
      point: { pixelSize: 10, color: C.Color.fromCssColorString(farbe), outlineColor: C.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: `${n + 1} · ${s.name}`, font: '500 12px system-ui', fillColor: C.Color.WHITE, showBackground: true, backgroundColor: C.Color.fromCssColorString('#050607cc'), pixelOffset: new C.Cartesian2(0, -20), disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: new C.DistanceDisplayCondition(0, 1.2e7) },
    }));
  });
}

function zeigeGanz(r) {
  window.dispatchEvent(new Event('zum-globus'));
  const lats = r.stopps.map((s) => s.lat);
  const lons = r.stopps.map((s) => s.lon);
  const pad = 2;
  viewer.camera.flyTo({ destination: C.Rectangle.fromDegrees(Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad), duration: 2.5 });
}

// Kameraflug Stopp für Stopp mit Infokarte.
async function tour(e, idx) {
  const r = e.routen[idx];
  const id = Symbol('tour');
  window.dispatchEvent(new Event('zum-globus'));
  tourAktiv = id;
  $('#g-sheet').hidden = true;
  let i = 0;
  let auto = true;
  let timer = null;
  const karte = $('#g-tour');

  const zeige = () => {
    if (tourAktiv !== id || !viewer) return;
    clearTimeout(timer);
    const s = r.stopps[i];
    const prev = r.stopps[i - 1];
    const km = prev ? distanceKm(prev, s) : 0;
    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(s.lon, s.lat - 0.9, 90000),
      orientation: { heading: 0, pitch: C.Math.toRadians(-38), roll: 0 },
      duration: i === 0 ? 2.5 : Math.min(6, 2.5 + km / 1500),
    });
    const datum = plusTage(e.datum, s.tag);
    karte.hidden = false;
    karte.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <span class="mono small" style="color:${ROUTEN_FARBEN[idx % 3]}">STOPP ${i + 1}/${r.stopps.length} · TAG ${s.tag} · ${new Date(datum).toLocaleDateString('de-DE')}</span>
        <button class="g-icon" id="t-ende" aria-label="Tour beenden" style="width:30px;height:30px">✕</button>
      </div>
      <h3 style="margin:6px 0 2px">${esc(s.name)} <span class="muted" style="font-weight:400">· ${esc(s.land)}</span></h3>
      <div class="mono small muted">${prev ? `via ${MITTEL[s.verkehrsmittel] ?? s.verkehrsmittel} · ${Math.round(km).toLocaleString('de-DE')} km` : 'Start'}${s.naechte ? ` · ${s.naechte} Nächte` : ''}</div>
      <p class="small" style="margin:8px 0">${esc(s.info)}</p>
      <div class="row">
        <button class="chip" id="t-zurueck" ${i === 0 ? 'disabled' : ''}>◀</button>
        <button class="chip" id="t-pause">${auto ? '❚❚ Pause' : '▶ Weiter'}</button>
        <button class="chip" id="t-vor" ${i === r.stopps.length - 1 ? 'disabled' : ''}>▶▶</button>
        <button class="chip" id="t-dossier">Dossier</button>
      </div>
      <div class="row" style="margin-top:6px">
        ${prev && s.verkehrsmittel === 'flug' ? '<button class="chip" id="t-flug">Flüge prüfen</button>' : ''}
        ${s.naechte ? '<button class="chip" id="t-unterkunft">Unterkünfte</button>' : ''}
      </div>
      <div class="row" style="margin-top:6px">${legLinks(prev, s, datum, true)}</div>`;
    $('#t-ende').onclick = () => { tourAktiv = null; clearTimeout(timer); karte.hidden = true; };
    $('#t-zurueck').onclick = () => { i = Math.max(0, i - 1); zeige(); };
    $('#t-vor').onclick = () => { i = Math.min(r.stopps.length - 1, i + 1); zeige(); };
    $('#t-pause').onclick = () => { auto = !auto; zeige(); };
    const abbrechen = () => { tourAktiv = null; clearTimeout(timer); karte.hidden = true; };
    $('#t-flug')?.addEventListener('click', () => { abbrechen(); recherche('fluege', s.name, { datum, details: `von ${prev.name}${prev.iata ? ` (${prev.iata})` : ''} nach ${s.name}${s.iata ? ` (${s.iata})` : ''}` }); });
    $('#t-unterkunft')?.addEventListener('click', () => { abbrechen(); recherche('unterkuenfte', `${s.name}, ${s.land}`, { datum, details: `${s.naechte} Nächte ab ${datum}` }); });
    $('#t-dossier').onclick = () => { tourAktiv = null; clearTimeout(timer); karte.hidden = true; dossier(s.name, s.land, s.lat, s.lon); };
    if (auto && i < r.stopps.length - 1) timer = setTimeout(() => { i += 1; zeige(); }, 9000);
  };
  zeige();
}

// --- Buchen ---------------------------------------------------------------------------

const link = (href, text) => `<a class="chip" target="_blank" rel="noopener" href="${esc(href)}">${text}</a>`;

function legLinks(prev, s, datum, kurz = false) {
  const out = [];
  if (prev) {
    const von = encodeURIComponent(prev.name);
    const nach = encodeURIComponent(s.name);
    if (s.verkehrsmittel === 'flug') {
      const a = (prev.iata || '').toUpperCase();
      const b = (s.iata || '').toUpperCase();
      const q = a && b ? `Flights from ${a} to ${b} on ${datum}` : `Flights from ${prev.name} to ${s.name} on ${datum}`;
      out.push(link(`https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`, '✈ Google Flights'));
      if (a && b) {
        out.push(link(`https://www.skyscanner.de/transport/fluge/${a.toLowerCase()}/${b.toLowerCase()}/${datum.slice(2).replace(/-/g, '')}/`, '✈ Skyscanner'));
        if (!kurz) out.push(link(`https://www.kayak.de/flights/${a}-${b}/${datum}`, '✈ Kayak'));
      }
    } else if (s.verkehrsmittel === 'faehre') {
      out.push(link('https://www.directferries.de/', '⛴ Direct Ferries'));
      out.push(link(`https://www.rome2rio.com/map/${von}/${nach}`, 'Rome2Rio'));
    } else if (s.verkehrsmittel !== 'start') {
      out.push(link(`https://www.rome2rio.com/map/${von}/${nach}`, `${s.verkehrsmittel === 'zug' ? '🚆' : s.verkehrsmittel === 'bus' ? '🚌' : '→'} Rome2Rio`));
      if (s.verkehrsmittel === 'bus' && !kurz) out.push(link('https://global.flixbus.com/', 'FlixBus'));
    }
  }
  if (s.naechte > 0) {
    const ort = encodeURIComponent(s.name);
    const bis = plusTage(datum, s.naechte);
    out.push(link(`https://www.booking.com/searchresults.html?ss=${ort}&checkin=${datum}&checkout=${bis}&group_adults=1`, '🛏 Booking'));
    out.push(link(`https://www.airbnb.com/s/${ort}/homes?checkin=${datum}&checkout=${bis}&adults=1`, '🛏 Airbnb'));
  }
  return out.join('');
}

function buchungsLinks(r, start) {
  return `<div class="stack" style="margin-top:8px">${r.stopps.map((s, i) => {
    const links = legLinks(r.stopps[i - 1], s, plusTage(start, s.tag));
    const prev = r.stopps[i - 1];
    const datum = plusTage(start, s.tag);
    const inApp = `${prev && s.verkehrsmittel === 'flug' ? `<button class="chip on" data-re="fluege" data-ort="${esc(s.name)}" data-datum="${datum}" data-details="${esc(`von ${prev.name}${prev.iata ? ` (${prev.iata})` : ''} nach ${s.name}${s.iata ? ` (${s.iata})` : ''}`)}">Flüge prüfen</button>` : ''}${s.naechte ? `<button class="chip on" data-re="unterkuenfte" data-ort="${esc(`${s.name}, ${s.land}`)}" data-datum="${datum}" data-details="${esc(`${s.naechte} Nächte ab ${datum}`)}">Unterkünfte</button>` : ''}`;
    return links ? `<div><div class="small"><strong>${i + 1}. ${esc(s.name)}</strong> <span class="muted">· Tag ${s.tag}${s.naechte ? ` · ${s.naechte} N.` : ''}</span></div><div class="row" style="margin-top:4px">${inApp}${links}</div></div>` : '';
  }).join('')}<p class="muted small">„Flüge prüfen“ und „Unterkünfte“ recherchieren direkt in der App. Gebucht und bezahlt wird beim Anbieter – Ziel und Datum sind dort schon eingetragen.</p></div>`;
}

async function inPlan(r, start) {
  const plan = await db.get('plan', []);
  plan.push({
    phase: `Route: ${r.titel}`,
    tage: 0,
    items: r.stopps.slice(1).map((s, i) => ({ text: `Tag ${s.tag} (${new Date(plusTage(start, s.tag)).toLocaleDateString('de-DE')}): ${r.stopps[i].name} → ${s.name} per ${MITTEL[s.verkehrsmittel] ?? s.verkehrsmittel}${s.naechte ? `, ${s.naechte} Nächte buchen` : ''}`, done: false, eigen: true })),
  });
  await db.set('plan', plan);
  toast('Route in den Plan übernommen');
}

// --- Dossier ------------------------------------------------------------------------------

const balken = (wert) => `<span class="g-score">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= wert ? 'on' : ''}"></i>`).join('')}</span>`;

export async function dossier(name, land, lat, lon, neu = false) {
  const schluessel = `${name}|${land}`.toLowerCase();
  const alle = await db.get('dossiers', {});
  let d = neu ? null : alle[schluessel];
  if (!d) {
    sheet('DOSSIER', `<p class="muted mono">RECHERCHIERE ${esc(name.toUpperCase())} …</p><p class="muted small">Aktuelle Websuche und Auswertung, dauert bis zu 1–2 Minuten.</p>`);
    try {
      const r = await api('dossier', { name: land && land !== name ? `${name}, ${land}` : name, lat, lon, kontext: await kontext() });
      d = { ...r, at: Date.now(), lat, lon };
      alle[schluessel] = d;
      await db.set('dossiers', alle);
    } catch (err) {
      sheet('DOSSIER', `<p>${esc(err.message)}</p>`);
      return;
    }
  }
  const x = d.dossier;
  const abschnitt = (t, v) => (v ? `<div class="g-label">${t}</div><p class="small">${esc(v)}</p>` : '');
  sheet('DOSSIER', `
    <h3 style="margin:0">${esc(x.name)}</h3>
    <div class="muted small">${esc(x.land)} · Stand ${ago(d.at)} · offline gespeichert</div>
    <p class="small" style="margin-top:8px">${esc(x.kurzinfo)}</p>
    <div class="g-eignung">
      ${[['Ruhe', x.eignung.ruhe], ['Kosten', x.eignung.kosten], ['Sicherheit', x.eignung.sicherheit], ['Jobs', x.eignung.jobs], ['Natur', x.eignung.natur]].map(([k, v]) => `<div><span class="small">${k}</span>${balken(v)}</div>`).join('')}
    </div>
    <div class="g-label">Vorteile</div><ul class="small g-pro">${x.vorteile.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
    <div class="g-label">Nachteile</div><ul class="small g-con">${x.nachteile.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
    <div class="g-label">Aktuell</div><ul class="small">${x.aktuell.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
    ${abschnitt('Geschichte', x.geschichte)}
    ${abschnitt('Menschen', x.menschen)}
    ${abschnitt('Lebenshaltung', x.lebenshaltung)}
    ${abschnitt('Wohnen', x.wohnen)}
    ${abschnitt('Arbeit', x.arbeit)}
    ${abschnitt('Visum für Deutsche', x.visum_fuer_deutsche)}
    ${abschnitt('Sicherheit', x.sicherheit)}
    ${abschnitt('Klima', x.klima)}
    ${abschnitt('Sprache', x.sprache)}
    ${abschnitt('Gesundheit', x.gesundheit)}
    ${abschnitt('Internet & Strom', x.internet_strom)}
    <div class="g-label">Tipps</div><ul class="small">${x.tipps.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
    ${d.quellen?.length ? `<div class="g-label">Quellen</div><div class="small">${d.quellen.map((q) => `<a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.titel || q.url)}</a>`).join('<br>')}</div>` : ''}
    <p class="muted small" style="margin-top:10px">KI-Recherche – wichtige Punkte (Visum, Sicherheit) bei offiziellen Stellen prüfen.</p>
    <div class="row" style="margin-top:8px">
      <button class="chip" id="d-route">Route hierhin</button>
      <button class="chip" id="d-bogen">Bogen hierhin</button>
      <button class="chip" id="d-neu">Neu recherchieren</button>
    </div>`);
  $('#d-route').onclick = () => routenPanel(land && land !== name ? `${name}, ${land}` : name);
  $('#d-bogen').onclick = () => balkenHierhin(name, lat, lon);
  $('#d-neu').onclick = () => dossier(name, land, lat, lon, true);
}


// --- Recherche direkt in der App ---------------------------------------------------
// KI sucht im Web und liefert Ergebniskarten (Flüge, Unterkünfte, Wohnungen, Jobs,
// Papiere, Kosten). Ergebnisse werden verschlüsselt gespeichert und sind offline lesbar.

const THEMA_TITEL = { fluege: 'Flüge', unterkuenfte: 'Unterkünfte', wohnungen: 'Wohnungen', jobs: 'Jobs', visum: 'Papiere', kosten: 'Kosten', frei: 'Recherche' };

const domain = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export async function recherche(thema, ort, { datum = '', details = '', neu = false } = {}) {
  const titel = `${THEMA_TITEL[thema] ?? 'Recherche'} · ${ort}`.toUpperCase();
  const schluessel = `${thema}|${ort}|${datum}`.toLowerCase();
  const alle = await db.get('recherchen', {});
  let r = neu ? null : alle[schluessel];
  if (!r) {
    sheet(titel, '<div class="scan-lade"><span></span><p class="mono">KI DURCHSUCHT DAS WEB …</p><p class="muted small">Dauert meist 30–90 Sekunden. Du kannst solange weiter den Globus nutzen.</p></div>');
    try {
      const von = ich ? { lat: Math.round(ich.lat * 10) / 10, lon: Math.round(ich.lon * 10) / 10 } : null;
      const { abreise } = await db.settings();
      const ergebnis = await api('suche', { thema, ort, von, datum: datum || abreise || '', details, kontext: await kontext() });
      r = { ...ergebnis, at: Date.now() };
      alle[schluessel] = r;
      const keys = Object.keys(alle);
      if (keys.length > 40) delete alle[keys[0]];
      await db.set('recherchen', alle);
    } catch (err) {
      sheet(titel, `<p>${esc(err.message)}</p><button class="chip" id="re-nochmal">Erneut versuchen</button>`);
      $('#re-nochmal').onclick = () => recherche(thema, ort, { datum, details, neu: true });
      return;
    }
  }
  sheet(titel, `
    <p class="small">${esc(r.zusammenfassung)}</p>
    <div class="muted small mono">Stand ${ago(r.at)} · offline gespeichert</div>
    <div class="ergebnisse">${r.ergebnisse.map((x) => `
      <article class="ergebnis">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div><b>${esc(x.titel)}</b>${x.untertitel ? `<div class="muted small">${esc(x.untertitel)}</div>` : ''}</div>
          ${x.preis ? `<span class="preis mono">${esc(x.preis)}</span>` : ''}
        </div>
        ${x.details.length ? `<ul class="small">${x.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        ${x.vorteile.length || x.nachteile.length ? `<div class="pc small">${x.vorteile.map((v) => `<span class="p">＋ ${esc(v)}</span>`).join('')}${x.nachteile.map((v) => `<span class="c">－ ${esc(v)}</span>`).join('')}</div>` : ''}
        ${x.quelle ? `<a class="quelle mono" href="${esc(x.quelle)}" target="_blank" rel="noopener">${esc(domain(x.quelle))} ↗</a>` : ''}
      </article>`).join('')}</div>
    ${r.tipps?.length ? `<div class="g-label">Tipps</div><ul class="small">${r.tipps.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <p class="muted small" style="margin-top:10px">KI-Recherche aus dem Web – Preise und Verfügbarkeit ändern sich. Gebucht wird beim jeweiligen Anbieter.</p>
    <button class="chip" id="re-neu">Neu recherchieren</button>`);
  $('#re-neu').onclick = () => recherche(thema, ort, { datum, details, neu: true });
}
