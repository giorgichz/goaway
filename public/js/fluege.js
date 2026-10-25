// Flüge in der Umgebung über das OpenSky Network (ADS-B, frei zugänglich).
// Live-Daten gehen nur mit Internet; der letzte Stand bleibt offline sichtbar.
// Anonym gibt OpenSky ein begrenztes Tageskontingent – daher nur jede Minute.

import * as db from './db.js';
import { $, esc, ago, fetchChecked, toast, distanceKm, bearingDeg, compass } from './util.js';

const RADIUS_KM = 150;
let timer = null;
let auto = false;

const FELDER = ['icao24', 'callsign', 'country', 'timePos', 'lastContact', 'lon', 'lat', 'baroAlt', 'onGround', 'velocity', 'track', 'vRate', 'sensors', 'geoAlt', 'squawk'];

export async function refresh() {
  const { standort } = await db.settings();
  if (!standort) throw new Error('Zuerst im „Cockpit“ den Standort bestimmen.');
  const dLat = RADIUS_KM / 111;
  const dLon = RADIUS_KM / (111 * Math.cos((standort.lat * Math.PI) / 180));
  const q = new URLSearchParams({
    lamin: (standort.lat - dLat).toFixed(3), lamax: (standort.lat + dLat).toFixed(3),
    lomin: (standort.lon - dLon).toFixed(3), lomax: (standort.lon + dLon).toFixed(3),
  });
  const json = await fetchChecked(`https://opensky-network.org/api/states/all?${q}`);
  const fluege = (json.states ?? []).map((s) => Object.fromEntries(FELDER.map((f, i) => [f, s[i]])))
    .filter((f) => f.lat != null && f.lon != null)
    .map((f) => {
      const p = { lat: f.lat, lon: f.lon };
      return { ...f, callsign: (f.callsign ?? '').trim() || f.icao24, dist: distanceKm(standort, p), bearing: bearingDeg(standort, p) };
    })
    .filter((f) => f.dist <= RADIUS_KM)
    .sort((a, b) => a.dist - b.dist);
  await db.set('fluege', { fluege, fetchedAt: Date.now(), standort });
  return fluege.length;
}

function radar(fluege) {
  const c = 200;
  const r = 190;
  const items = fluege.map((f) => {
    const rr = (f.dist / RADIUS_KM) * r;
    const x = c + rr * Math.sin((f.bearing * Math.PI) / 180);
    const y = c - rr * Math.cos((f.bearing * Math.PI) / 180);
    const rot = f.track ?? 0;
    const col = f.squawk === '7700' || f.squawk === '7600' || f.squawk === '7500' ? '#f87171' : f.onGround ? '#94a3b8' : '#fbbf24';
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})"><path d="M0 -7 L4 5 L0 2 L-4 5 Z" fill="${col}"><title>${esc(f.callsign)} · ${Math.round(f.dist)} km</title></path></g>`;
  }).join('');
  return `
    <svg class="plot" viewBox="0 0 400 400" role="img" aria-label="Radar">
      <circle class="bg" cx="200" cy="200" r="${r}"/>
      ${[50, 100].map((km) => `<circle class="ring" cx="200" cy="200" r="${(km / RADIUS_KM) * r}"/><text class="lbl" x="${204 + (km / RADIUS_KM) * r * 0.707}" y="${196 - (km / RADIUS_KM) * r * 0.707}">${km} km</text>`).join('')}
      <text class="lbl" x="200" y="24" text-anchor="middle">N</text>
      <circle cx="200" cy="200" r="4" fill="#38bdf8"/>
      ${items}
    </svg>`;
}

export async function render() {
  const el = $('#fluege');
  const data = await db.get('fluege');
  const notfall = data?.fluege.filter((f) => ['7500', '7600', '7700'].includes(f.squawk)) ?? [];

  el.innerHTML = `
    <h2>Flüge in der Nähe</h2>
    <div class="card">
      <div class="row">
        <button id="fl-laden">Jetzt abrufen</button>
        <label class="row" style="margin:0"><input type="checkbox" id="fl-auto" ${auto ? 'checked' : ''}> jede Minute neu laden</label>
      </div>
      <p class="muted" style="margin-top:8px">Umkreis ${RADIUS_KM} km · Quelle: OpenSky Network · ${data ? `Stand ${ago(data.fetchedAt)}` : 'noch nichts geladen'}</p>
    </div>
    ${notfall.length ? `<div class="card" style="border-color:var(--bad)"><strong class="overdue">Notfall-Code im Luftraum:</strong> ${notfall.map((f) => `${esc(f.callsign)} (Squawk ${f.squawk})`).join(', ')}</div>` : ''}
    ${data ? `
      <div class="card">${radar(data.fluege)}<p class="muted" style="text-align:center">Gelb = in der Luft · Grau = am Boden · Rot = Notfall-Code</p></div>
      <div class="card"><h3>${data.fluege.length} Flugzeuge</h3><div class="scroll"><table>
        <tr><th>Flug</th><th>Herkunft</th><th>Entfernung</th><th>Höhe</th><th>Tempo</th><th>Kurs</th></tr>
        ${data.fluege.map((f) => `<tr>
          <td><strong>${esc(f.callsign)}</strong></td>
          <td>${esc(f.country)}</td>
          <td>${Math.round(f.dist)} km ${compass(f.bearing)}</td>
          <td>${f.onGround ? 'am Boden' : f.baroAlt != null ? `${Math.round(f.baroAlt).toLocaleString('de-DE')} m` : '–'}</td>
          <td>${f.velocity != null ? `${Math.round(f.velocity * 3.6)} km/h` : '–'}</td>
          <td>${f.track != null ? `${Math.round(f.track)}° ${compass(f.track)}` : '–'}</td>
        </tr>`).join('')}
      </table></div></div>` : ''}`;

  $('#fl-laden').onclick = () => doRefresh();
  $('#fl-auto').onchange = (e) => {
    auto = e.target.checked;
    clearInterval(timer);
    if (auto) { timer = setInterval(doRefresh, 60000); doRefresh(); }
  };
}

async function doRefresh() {
  try { toast(`${await refresh()} Flugzeuge gefunden`); } catch (err) { toast(err.message); }
  if (!$('#fluege').hidden) render();
}

export function stop() {
  clearInterval(timer);
  timer = null;
  auto = false;
}
