// Globus: 3D-Erde (CesiumJS) mit Sternenhimmel, Atmosphäre und Tag-Nacht-Grenze.
// Von oben: Satellitenbild, Stadtlichter der Nachtseite, Bevölkerungsdichte,
// Weltlage nach Ländern, Satelliten live, Flüge. Vom Boden: Unterkünfte, Arbeit,
// Versorgung, Orte nach Einwohnern, Höhe, Wetter, Straßenansicht, KI-Suche.
// Cesium (~6 MB) wird erst beim Öffnen geladen; angesehene Kacheln bleiben offline.

import * as db from './db.js';
import { $, esc, ago, fetchChecked, toast, distanceKm } from './util.js';
import { frageStellen } from './ki.js';
import * as reise from './reise.js';
import * as stadt from './stadt.js';
import * as lageModul from './lage.js';
import * as himmelModul from './himmel.js';

const sat = window.satellite;
const CESIUM_URL = 'vendor/cesium/';
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const START_HOEHE = () => (window.innerWidth < 700 ? 15000000 : 22000000);
// Ländergrenzen lokal (Natural Earth 1:110m über world-atlas, mit ISO-Codes und deutschen Namen).
const LAENDER_GEOJSON = 'data/laender.geojson';

const BASIS = {
  satellit: { name: 'Satellit', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, credit: 'Esri, Maxar, Earthstar Geographics' },
  dunkel: { name: 'Dunkel', url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png', sub: 'abcd', max: 19, credit: '© OpenStreetMap © CARTO' },
  gelaende: { name: 'Gelände', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', sub: 'abc', max: 17, credit: '© OpenStreetMap, SRTM © OpenTopoMap' },
};

const EBENEN = {
  licht: { name: 'Tag & Nacht', an: true },
  nachtlicht: { name: 'Stadtlichter', an: true, url: `${GIBS}/VIIRS_CityLights_2012/default//GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg`, max: 8, credit: 'NASA Earth Observatory / GIBS' },
  labels: { name: 'Beschriftung', an: true, url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png', sub: 'abcd', max: 19, credit: '© OpenStreetMap © CARTO' },
  bevoelkerung: { name: 'Bevölkerung', an: false, url: `${GIBS}/GPW_Population_Density_2020/default/2020-01-01/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`, max: 7, alpha: 0.65, credit: 'NASA SEDAC GPWv4 / GIBS' },
  weltlage: { name: 'Weltlage', an: false },
  satelliten: { name: 'Satelliten', an: false },
  fluege: { name: 'Flüge', an: false },
  gefahren: { name: 'Gefahren live', an: false },
};

const KATEGORIEN = {
  unterkunft: { name: 'Unterkünfte', farbe: '#3ee6a8', filter: ['["tourism"~"^(hotel|hostel|guest_house|apartment|motel|camp_site|chalet)$"]'] },
  arbeit: { name: 'Arbeit & Coworking', farbe: '#7dd3fc', filter: ['["office"="employment_agency"]', '["office"="coworking"]', '["amenity"="coworking_space"]'] },
  versorgung: { name: 'Klinik, Apotheke, Polizei, Markt', farbe: '#f2b53c', filter: ['["amenity"~"^(hospital|clinic|pharmacy|police)$"]', '["shop"="supermarket"]'] },
  botschaft: { name: 'Botschaften', farbe: '#c084fc', filter: ['["office"="diplomatic"]', '["amenity"="embassy"]'] },
  autark: { name: 'Wasser & Treibstoff', farbe: '#38bdf8', filter: ['["amenity"="drinking_water"]', '["natural"="spring"]', '["amenity"="fuel"]'] },
  verkehr: { name: 'Flughafen, Fähre, Bahn', farbe: '#ff5a5f', filter: ['["aeroway"="aerodrome"]["iata"]', '["amenity"="ferry_terminal"]', '["railway"="station"]'] },
};

const TYP = {
  hotel: 'Hotel', hostel: 'Hostel', guest_house: 'Pension', apartment: 'Ferienwohnung', motel: 'Motel', camp_site: 'Campingplatz', chalet: 'Hütte',
  employment_agency: 'Arbeitsamt', coworking: 'Coworking', coworking_space: 'Coworking', hospital: 'Krankenhaus', clinic: 'Klinik',
  pharmacy: 'Apotheke', police: 'Polizei', supermarket: 'Supermarkt', diplomatic: 'Vertretung', embassy: 'Botschaft',
  drinking_water: 'Trinkwasser', spring: 'Quelle', fuel: 'Tankstelle', aerodrome: 'Flughafen', ferry_terminal: 'Fähre', station: 'Bahnhof',
};
const ORTSTYP = { city: 'Stadt', town: 'Kleinstadt', village: 'Dorf', hamlet: 'Weiler' };

const ICON = {
  ebenen: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  erkunden: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  standort: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
  welt: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  zu: '<path d="M6 6l12 12M18 6 6 18"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

let C = null;            // window.Cesium nach dem Laden
let viewer = null;
let basisLayer = null;
const layer = {};        // Bildebenen und Datenquellen nach Schlüssel
let satPoints = null;
let satTimer = null;
let spin = null;
let readoutTimer = null;
let zustand = { basis: 'satellit', ebenen: Object.fromEntries(Object.entries(EBENEN).map(([k, e]) => [k, e.an])) };

function ladeCesium() {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  window.CESIUM_BASE_URL = CESIUM_URL;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = `${CESIUM_URL}Widgets/widgets.css`;
  document.head.append(css);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${CESIUM_URL}Cesium.js`;
    s.onload = () => resolve(window.Cesium);
    s.onerror = () => reject(new Error('3D-Globus konnte nicht geladen werden.'));
    document.head.append(s);
  });
}

function provider(def) {
  return new C.UrlTemplateImageryProvider({
    url: def.url,
    subdomains: def.sub,
    maximumLevel: def.max,
    credit: def.credit,
  });
}

export async function render() {
  const el = $('#welt');
  el.innerHTML = `
    <div class="globe">
      <div id="g-view" class="g-view"></div>
      <div id="g-stadt" class="g-stadt"></div>
      <div class="g-top glass">
        <input id="g-suche" placeholder="Ort suchen – Stadt, Insel, Region …" autocomplete="off">
        <button class="g-icon" id="g-go" aria-label="Suchen">${icon('erkunden')}</button>
      </div>
      <div class="g-side">
        <button class="g-icon glass" data-panel="ebenen" title="Ebenen">${icon('ebenen')}</button>
        <button class="g-icon glass" data-panel="erkunden" title="Was ist hier?">${icon('erkunden')}</button>
        <button class="g-icon glass" data-panel="routen" title="Routen planen">${icon('route')}</button>
        <button class="g-icon glass" data-panel="info" title="Infos zur Bildmitte">${icon('info')}</button>
        <button class="g-icon glass" id="g-ich" title="Zu meinem Standort">${icon('standort')}</button>
        <button class="g-icon glass" id="g-welt" title="Ganze Erde">${icon('welt')}</button>
      </div>
      <div class="g-cross" aria-hidden="true"></div>
      <div class="g-readout mono" id="g-readout">—</div>
      <div class="g-sheet glass" id="g-sheet" hidden>
        <div class="g-sheet-head"><span class="mono" id="g-sheet-titel"></span><button class="g-icon" id="g-zu" aria-label="Schließen">${icon('zu')}</button></div>
        <div id="g-sheet-body"></div>
      </div>
      <div class="g-tour glass" id="g-tour" hidden></div>
      <div class="g-credits" id="g-credits"></div>
      <div class="g-boot mono" id="g-boot">INITIALISIERE ORBIT …</div>
    </div>`;

  try {
    C = await ladeCesium();
  } catch (err) {
    $('#g-boot').textContent = `${err.message} Der Globus braucht beim ersten Öffnen Internet und den Neustart-Server.`;
    return;
  }
  if (!$('#g-view')) return; // inzwischen Bereich gewechselt oder gesperrt

  zustand = { ...zustand, ...(await db.get('globus', {})) };
  if (zustand.nah) stadt.setModus(zustand.nah);
  stop();
  try { viewer?.destroy(); } catch { /* Container schon geleert */ }
  Object.keys(layer).forEach((k) => delete layer[k]);

  try {
    viewer = new C.Viewer('g-view', {
      baseLayer: false,
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, creditContainer: $('#g-credits'),
      // Volle Displayauflösung statt halber – sonst wirkt alles auf Handys unscharf.
      useBrowserRecommendedResolution: false,
      msaaSamples: 4,
    });
    const dpr = window.devicePixelRatio || 1;
    if (dpr > 2) viewer.resolutionScale = 2 / dpr; // Obergrenze für Akku und Speicher
  } catch {
    $('#g-boot').textContent = 'Dieses Gerät unterstützt kein WebGL – der 3D-Globus kann nicht starten.';
    return;
  }
  const scene = viewer.scene;
  scene.globe.baseColor = C.Color.fromCssColorString('#04070a');
  scene.globe.showGroundAtmosphere = true;
  scene.skyAtmosphere.show = true;
  scene.fog.enabled = true;
  scene.backgroundColor = C.Color.BLACK;
  scene.globe.maximumScreenSpaceError = 1.5; // feinere Kacheln, schärferes Bild
  viewer.clock.shouldAnimate = true;

  // Grundschicht, die immer da ist: Natural Earth aus dem Cesium-Paket (lokal,
  // ~600 KB). Ohne Internet oder bei Ausfall eines Kartendienstes bleiben so
  // Kontinente, Gebirge und Wüsten sichtbar; die Online-Karten liegen darüber.
  viewer.imageryLayers.add(C.ImageryLayer.fromProviderAsync(
    C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl('Assets/Textures/NaturalEarthII')),
  ), 0);
  setBasis(zustand.basis);
  for (const [k, an] of Object.entries(zustand.ebenen)) if (an) await setEbene(k, true);

  const view = await db.get('karteView');
  if (view?.height) {
    viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(view.lon, view.lat, view.height) });
  } else {
    viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(10, 25, START_HOEHE()) });
    starteDrehung();
  }

  const handler = new C.ScreenSpaceEventHandler(scene.canvas);
  [C.ScreenSpaceEventType.LEFT_DOWN, C.ScreenSpaceEventType.WHEEL, C.ScreenSpaceEventType.PINCH_START]
    .forEach((t) => handler.setInputAction(stoppeDrehung, t));
  handler.setInputAction((e) => waehle(scene.pick(e.position)), C.ScreenSpaceEventType.LEFT_CLICK);
  viewer.camera.moveEnd.addEventListener(merkeAnsicht);
  viewer.camera.moveEnd.addEventListener(pruefeStadt);
  readoutTimer = setInterval(readout, 500);

  reise.setup({ C, viewer, sheet });
  await reise.starteGps();
  reise.zeichneBalken();
  reise.zeichneGespeicherteRouten();

  $('#g-boot').remove();
  $('#g-go').onclick = sucheOrt;
  $('#g-suche').onkeydown = (e) => { if (e.key === 'Enter') sucheOrt(); };
  $('#g-zu').onclick = () => { $('#g-sheet').hidden = true; };
  $('#g-ich').onclick = zuMir;
  $('#g-welt').onclick = () => viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(10, 25, START_HOEHE()), duration: 2.5 });
  el.querySelectorAll('[data-panel]').forEach((b) => { b.onclick = () => panel(b.dataset.panel); });

  const treffer = await db.get('erkunden');
  if (treffer) zeigeTreffer(treffer, false);
}

// --- Kamera ---------------------------------------------------------------

function starteDrehung() {
  stoppeDrehung();
  spin = viewer.clock.onTick.addEventListener(() => {
    viewer.scene.camera.rotate(C.Cartesian3.UNIT_Z, -0.0006);
    viewer.scene.requestRender();
  });
}

function stoppeDrehung() {
  if (spin) { spin(); spin = null; }
}

// --- Übergang Globus ⇄ Stadtansicht -------------------------------------------------
// Unter STADT_AB Metern übernimmt die scharfe Vektor-Stadtansicht mit 3D-Gebäuden.
const STADT_AB = 15000;
let stadtBereit = null;

const zoomAusHoehe = (h, lat) => Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180) * viewer.scene.canvas.clientHeight * 0.866) / Math.max(h, 50));
const hoeheAusZoom = (z, lat) => (156543.03392 * Math.cos((lat * Math.PI) / 180) * viewer.scene.canvas.clientHeight * 0.866) / 2 ** z;

async function stadtLaden() {
  stadtBereit ??= stadt.init($('#g-stadt'), { zurueck: zumGlobus }).then((m) => {
    const tippe = (e) => { const p = e.features?.[0]?.properties; if (p) waehle({ id: { treffer: { ...p, lat: Number(p.lat), lon: Number(p.lon), ew: p.ew ? Number(p.ew) : undefined } } }); };
    m.on('click', 'treffer-punkt', tippe);
    m.on('click', 'orte-saeulen', tippe);
    m.on('moveend', () => { if (stadt.istAktiv()) { const c = stadt.mitte(); db.set('karteView', { lat: c.lat, lon: c.lon, height: stadt.hoehe() }).catch(() => {}); } });
    window.addEventListener('stadt-bereit', stadtDatenSync);
    return m;
  }).catch((err) => { stadtBereit = null; toast(`Stadtansicht: ${err.message}`); throw err; });
  return stadtBereit;
}

// Treffer, Routen und GPS nach jedem Stilwechsel in die Stadtansicht übernehmen.
async function stadtDatenSync() {
  const ich = reise.meinOrt();
  if (ich) stadt.setGps(ich.lat, ich.lon);
  stadt.setTreffer(await db.get('erkunden'));
  const r = await db.get('kiRouten');
  if (r) stadt.setRouten(r.routen, r.aktiv, reise.ROUTEN_FARBEN);
}

async function pruefeStadt() {
  if (!viewer || stadt.istAktiv() || reise.tourLaeuft()) return;
  const h = hoehe();
  if (h > STADT_AB) return;
  const m = mitteCesium();
  if (!m) return;
  try { await stadtLaden(); } catch { return; }
  if (!viewer || hoehe() > STADT_AB) return;
  stadt.zeige({ lat: m.lat, lon: m.lon, zoom: Math.min(18, zoomAusHoehe(h, m.lat)), bearing: C.Math.toDegrees(viewer.camera.heading) });
  stadtDatenSync();
  $('.globe')?.classList.add('stadt-an');
  viewer.useDefaultRenderLoop = false; // Globus pausiert, solange die Stadt offen ist
}

function zumGlobus({ lat, lon, zoom }) {
  if (!viewer) return;
  stadt.verstecke();
  $('.globe')?.classList.remove('stadt-an');
  viewer.useDefaultRenderLoop = true;
  const h = Math.max(STADT_AB * 2.2, hoeheAusZoom(zoom, lat) * 1.4);
  viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(lon, lat, h) });
}

// Andere Module (Tour, Routen-Übersicht) brauchen den Globus.
window.addEventListener('zum-globus', () => {
  if (stadt.istAktiv()) { const c = stadt.mitte(); zumGlobus({ lat: c.lat, lon: c.lon, zoom: 9 }); }
});

function mitte() {
  if (stadt.istAktiv()) return stadt.mitte();
  return mitteCesium();
}

function mitteCesium() {
  const canvas = viewer.scene.canvas;
  const p = viewer.camera.pickEllipsoid(new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
  if (!p) return null;
  const c = C.Cartographic.fromCartesian(p);
  return { lat: C.Math.toDegrees(c.latitude), lon: C.Math.toDegrees(c.longitude) };
}

const hoehe = () => (stadt.istAktiv() ? stadt.hoehe() : viewer.camera.positionCartographic.height);

function readout() {
  if (!viewer || viewer.isDestroyed()) return;
  const m = mitte();
  const h = hoehe();
  const hTxt = h > 10000 ? `${Math.round(h / 1000).toLocaleString('de-DE')} km` : `${Math.round(h).toLocaleString('de-DE')} m`;
  const r = $('#g-readout');
  if (r) r.textContent = m ? `${m.lat.toFixed(4)}°  ${m.lon.toFixed(4)}°  ·  ${stadt.istAktiv() ? '3D-STADT' : 'ALT'} ${hTxt}` : `ORBIT  ·  ALT ${hTxt}`;
}

function merkeAnsicht() {
  const c = viewer.camera.positionCartographic;
  db.set('karteView', { lat: C.Math.toDegrees(c.latitude), lon: C.Math.toDegrees(c.longitude), height: c.height }).catch(() => {});
}

function flieg(lat, lon, height = 4000) {
  stoppeDrehung();
  if (stadt.istAktiv()) {
    if (height <= STADT_AB) { stadt.flieg(lat, lon, Math.min(18, zoomAusHoehe(height, lat))); return; }
    window.dispatchEvent(new Event('zum-globus'));
  }
  viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(lon, lat, height), duration: 2.8 });
}

async function zuMir() {
  const ich = reise.meinOrt();
  if (!ich) { toast('Noch kein GPS-Signal – Standortfreigabe erlauben.'); return; }
  flieg(ich.lat, ich.lon, 6000);
}

// --- Ebenen -----------------------------------------------------------------

function setBasis(key) {
  const def = BASIS[key] ?? BASIS.satellit;
  const layers = viewer.imageryLayers;
  if (basisLayer) layers.remove(basisLayer);
  basisLayer = new C.ImageryLayer(provider(def));
  layers.add(basisLayer, 1);
  zustand.basis = key;
  speichereZustand();
  viewer.scene.requestRender();
}

async function setEbene(key, an) {
  zustand.ebenen[key] = an;
  speichereZustand();
  const def = EBENEN[key];
  const scene = viewer.scene;

  if (key === 'licht') {
    scene.globe.enableLighting = an;
    scene.globe.dynamicAtmosphereLighting = an;
    if (layer.nachtlicht) layer.nachtlicht.dayAlpha = an ? 0 : 1;
  } else if (def.url) {
    if (an && !layer[key]) {
      const l = new C.ImageryLayer(provider(def), { alpha: def.alpha ?? 1 });
      if (key === 'nachtlicht') { l.dayAlpha = zustand.ebenen.licht ? 0 : 1; l.nightAlpha = 1; l.brightness = 1.6; }
      if (key === 'labels') l.alpha = 0.9;
      let fehler = 0;
      l.imageryProvider.errorEvent.addEventListener(() => { if (++fehler === 4) toast(`${def.name}: Quelle gerade nicht erreichbar.`); });
      viewer.imageryLayers.add(l);
      layer[key] = l;
      if (key !== 'labels' && layer.labels) viewer.imageryLayers.raiseToTop(layer.labels);
    } else if (!an && layer[key]) {
      viewer.imageryLayers.remove(layer[key]);
      delete layer[key];
    }
  } else if (key === 'weltlage') {
    await weltlage(an);
  } else if (key === 'satelliten') {
    satelliten(an);
  } else if (key === 'fluege') {
    await fluege(an);
  } else if (key === 'gefahren') {
    await gefahren(an);
  }
  scene.requestRender();
}

function speichereZustand() {
  db.set('globus', { basis: zustand.basis, ebenen: zustand.ebenen, nah: zustand.nah }).catch(() => {});
}

// Länder eingefärbt nach Reisewarnungen des Auswärtigen Amts.
async function weltlage(an) {
  if (!an) { if (layer.weltlage) viewer.dataSources.remove(layer.weltlage, true); delete layer.weltlage; return; }
  let lage = await db.get('lage');
  if (!lage && navigator.onLine) {
    toast('Lade Weltlage …');
    await lageModul.refresh().catch(() => {});
    lage = await db.get('lage');
  }
  if (!lage) { toast('Weltlage nicht verfügbar – einmal online öffnen.'); zustand.ebenen.weltlage = false; return; }
  const stufe = new Map(lage.list.map((l) => [l.code, l.warning ? 3 : l.partialWarning ? 2 : (l.situationWarning || l.situationPartWarning) ? 1 : 0]));
  const farben = [null, '#f2b53c', '#ff8a3c', '#ff3b47'];
  try {
    const ds = await C.GeoJsonDataSource.load(LAENDER_GEOJSON);
    const grenze = C.Color.fromCssColorString('#3ee6a8').withAlpha(0.35);
    for (const e of ds.entities.values) {
      const iso = e.properties?.iso?.getValue();
      const s = stufe.get(iso) ?? 0;
      if (!e.polygon) continue;
      e.polygon.height = 0;
      e.polygon.outline = true;
      e.polygon.outlineColor = s ? C.Color.fromCssColorString(farben[s]).withAlpha(0.8) : grenze;
      // Länder ohne Warnung nur als Grenzlinie: unsichtbare Flächen würden sonst
      // durchscheinende Bögen und Routen darüber verdecken.
      e.polygon.fill = s > 0;
      if (s) e.polygon.material = C.Color.fromCssColorString(farben[s]).withAlpha(0.18 + s * 0.1);
      e.name = `${e.properties?.name?.getValue()} · ${['keine Warnung', 'Lagehinweis', 'Teilreisewarnung', 'Reisewarnung'][s]}`;
    }
    viewer.dataSources.add(ds);
    layer.weltlage = ds;
  } catch {
    toast('Ländergrenzen konnten nicht geladen werden.');
    zustand.ebenen.weltlage = false;
  }
}

function satelliten(an) {
  clearInterval(satTimer);
  satTimer = null;
  if (satPoints) { viewer.scene.primitives.remove(satPoints); satPoints = null; }
  if (layer.issBahn) { viewer.entities.remove(layer.issBahn); delete layer.issBahn; }
  if (!an) return;
  (async () => {
    let all = await db.get('tle', {});
    if (!Object.keys(all).length && navigator.onLine) {
      toast('Lade Satellitenbahnen …');
      await Promise.allSettled([himmelModul.refresh('stations'), himmelModul.refresh('visual')]);
      all = await db.get('tle', {});
    }
    return all;
  })().then((all) => {
    if (!viewer || !zustand.ebenen.satelliten) return;
    const tles = Object.values(all).flatMap((g) => g.tles).slice(0, 600);
    if (!tles.length) { toast('Satellitenbahnen nicht verfügbar – einmal online öffnen.'); return; }
    const recs = tles.map((t) => ({ name: t.name, rec: sat.twoline2satrec(t.l1, t.l2), iss: /ISS/.test(t.name) }));
    satPoints = viewer.scene.primitives.add(new C.PointPrimitiveCollection());
    const pts = recs.map((r) => satPoints.add({
      id: { sat: r.name },
      pixelSize: r.iss ? 9 : 4,
      color: C.Color.fromCssColorString(r.iss ? '#f97316' : '#cfe9ff'),
      outlineColor: C.Color.fromCssColorString(r.iss ? '#f9731666' : '#38bdf833'),
      outlineWidth: r.iss ? 6 : 3,
    }));
    const ecf = (rec, date) => {
      const pv = sat.propagate(rec, date);
      if (!pv.position || typeof pv.position === 'boolean') return null;
      const p = sat.eciToEcf(pv.position, sat.gstime(date));
      return new C.Cartesian3(p.x * 1000, p.y * 1000, p.z * 1000);
    };
    const tick = () => {
      const now = new Date();
      recs.forEach((r, i) => { const p = ecf(r.rec, now); if (p) { pts[i].position = p; pts[i].show = true; } else pts[i].show = false; });
      viewer.scene.requestRender();
    };
    tick();
    satTimer = setInterval(tick, 1000);
    const iss = recs.find((r) => r.iss);
    if (iss) {
      const bahn = [];
      for (let m = 0; m <= 92; m++) { const p = ecf(iss.rec, new Date(Date.now() + m * 60000)); if (p) bahn.push(p); }
      layer.issBahn = viewer.entities.add({ polyline: { positions: bahn, width: 1.5, material: new C.PolylineDashMaterialProperty({ color: C.Color.fromCssColorString('#f97316') }) } });
    }
  });
}

async function fluege(an) {
  if (layer.fluege) { viewer.entities.remove(layer.fluege); delete layer.fluege; }
  if (!an) return;
  const data = await db.get('fluege');
  if (!data?.fluege.length) { toast('Keine Flugdaten – unter „Mehr → Luftraum“ abrufen.'); return; }
  const parent = viewer.entities.add(new C.Entity());
  data.fluege.forEach((f) => viewer.entities.add({
    parent,
    name: `${f.callsign} · ${f.country} · ${f.baroAlt != null ? `${Math.round(f.baroAlt)} m` : 'Höhe ?'}`,
    position: C.Cartesian3.fromDegrees(f.lon, f.lat, f.baroAlt ?? 0),
    point: { pixelSize: 6, color: C.Color.fromCssColorString('#f2b53c') },
  }));
  layer.fluege = parent;
  toast(`Flüge von ${ago(data.fetchedAt)}`);
}

// --- Seitenleiste (Ebenen / Erkunden / Info / Auswahl) --------------------------

function sheet(titel, html) {
  $('#g-sheet-titel').textContent = titel;
  $('#g-sheet-body').innerHTML = html;
  $('#g-sheet').hidden = false;
}

function panel(name) {
  if (name === 'ebenen') {
    sheet('EBENEN', `
      <div class="g-label">Oberfläche</div>
      <div class="row">${Object.entries(BASIS).map(([k, b]) => `<button class="chip ${zustand.basis === k ? 'on' : ''}" data-basis="${k}">${b.name}</button>`).join('')}</div>
      <div class="g-label">Nahansicht (unter 15 km)</div>
      <div class="row">
        <button class="chip ${stadt.aktuellerModus() === 'vektor' ? 'on' : ''}" data-nah="vektor">3D-Stadt</button>
        <button class="chip ${stadt.aktuellerModus() === 'satellit' ? 'on' : ''}" data-nah="satellit">Satellit + 3D</button>
      </div>
      <div class="g-label">Daten</div>
      <div class="row">${Object.entries(EBENEN).map(([k, e]) => `<button class="chip ${zustand.ebenen[k] ? 'on' : ''}" data-ebene="${k}">${e.name}</button>`).join('')}</div>
      <p class="muted small">Stadtlichter leuchten auf der Nachtseite. Bevölkerung: gelb = dicht besiedelt, dunkel = menschenleer. Weltlage färbt Länder nach Reisewarnungen.</p>`);
    $$s('[data-basis]').forEach((b) => { b.onclick = () => { setBasis(b.dataset.basis); panel('ebenen'); }; });
    $$s('[data-nah]').forEach((b) => { b.onclick = () => { stadt.setModus(b.dataset.nah); zustand.nah = b.dataset.nah; speichereZustand(); panel('ebenen'); }; });
    $$s('[data-ebene]').forEach((b) => { b.onclick = async () => { await setEbene(b.dataset.ebene, !zustand.ebenen[b.dataset.ebene]); panel('ebenen'); }; });
  } else if (name === 'erkunden') {
    sheet('WAS IST HIER?', `
      <div class="row">${Object.entries(KATEGORIEN).map(([k, c]) => `<button class="chip" data-kat="${k}" style="border-color:${c.farbe}66">${c.name}</button>`).join('')}</div>
      <div class="row" style="margin-top:8px">
        <button class="chip" id="g-voll">▲ Meiste Menschen</button>
        <button class="chip" id="g-leer">▼ Wenigste Menschen</button>
      </div>
      <div id="g-treffer" style="margin-top:10px"></div>`);
    $$s('[data-kat]').forEach((b) => { b.onclick = () => sucheKategorie(b.dataset.kat); });
    $('#g-voll').onclick = () => sucheOrte('desc');
    $('#g-leer').onclick = () => sucheOrte('asc');
    db.get('erkunden').then((d) => { if (d) zeigeListe(d); });
  } else if (name === 'routen') {
    reise.routenPanel();
  } else if (name === 'info') {
    ladeInfos();
  }
}

const $$s = (sel) => [...$('#g-sheet-body').querySelectorAll(sel)];

// Punkte tragen { sat }, Treffer-Entities ihr Objekt unter .treffer.
function waehle(picked) {
  if (!picked) return;
  const id = picked.id;
  if (id?.sat) { sheet('SATELLIT', `<p><strong>${esc(id.sat)}</strong></p><p class="muted">Live-Position aus gespeicherten Bahndaten.</p>`); return; }
  if (id?.treffer) {
    const x = id.treffer;
    sheet(x.ew ? 'ORT' : 'ORT AM BODEN', `
      <p><strong>${esc(x.name)}</strong><br><span class="muted">${esc(x.typ)}${x.ew ? ` · ${x.ew.toLocaleString('de-DE')} Einwohner` : ''}</span></p>
      ${x.tel ? `<p><a href="tel:${esc(x.tel)}">${esc(x.tel)}</a></p>` : ''}
      ${x.web ? `<p><a href="${esc(x.web)}" target="_blank" rel="noopener">Website öffnen</a></p>` : ''}
      <button class="ghost" id="g-hin">Hinfliegen</button>`);
    $('#g-hin').onclick = () => flieg(x.lat, x.lon, x.ew ? 15000 : 900);
    return;
  }
  if (id?.info) {
    const x = id.info;
    sheet(x.kategorie.toUpperCase(), `
      <h3 style="margin:0">${esc(x.titel)}</h3>
      <div class="muted small mono">${esc(x.zeit)}</div>
      <p class="small" style="margin-top:8px">${esc(x.text)}</p>
      <div class="row" style="margin-top:8px">
        <button class="chip" id="g-hin">Hinfliegen</button>
        <button class="chip" id="g-dos">Dossier zur Region</button>
      </div>
      <p class="muted small" style="margin-top:8px">Quelle: ${esc(x.quelle)}</p>`);
    $('#g-hin').onclick = () => flieg(x.lat, x.lon, 120000);
    $('#g-dos').onclick = () => reise.dossier(x.region || x.titel, '', x.lat, x.lon);
    return;
  }
  if (id?.name) sheet('AUSWAHL', `<p>${esc(id.name)}</p>`);
}

// Gefahren live: Erdbeben (USGS, M4.5+, 7 Tage) und Naturereignisse (NASA EONET:
// Waldbrände, Stürme, Vulkane, Überschwemmungen …). Letzter Stand bleibt offline.
const EONET_FARBE = { wildfires: '#ff7a1a', severeStorms: '#c084fc', volcanoes: '#ff3b47', floods: '#38bdf8', seaLakeIce: '#cfe9ff', drought: '#f2b53c', landslides: '#a3826c', dustHaze: '#d6b98c', snow: '#e2e8f0', tempExtremes: '#ff5a5f', earthquakes: '#ff3b47', manmade: '#94a3b8' };
const EONET_NAME = { wildfires: 'Waldbrand', severeStorms: 'Sturm', volcanoes: 'Vulkan', floods: 'Überschwemmung', seaLakeIce: 'Eis', drought: 'Dürre', landslides: 'Erdrutsch', dustHaze: 'Staub', snow: 'Schnee', tempExtremes: 'Extremtemperatur', earthquakes: 'Erdbeben', manmade: 'Menschgemacht' };

async function gefahren(an) {
  if (layer.gefahren) { viewer.entities.remove(layer.gefahren); delete layer.gefahren; }
  if (!an) return;
  let daten = await db.get('gefahren');
  if (navigator.onLine && (!daten || Date.now() - daten.at > 15 * 60000)) {
    const [beben, eonet] = await Promise.allSettled([
      fetchChecked('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson'),
      fetchChecked('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=60&limit=300'),
    ]);
    const neu = { at: Date.now(), ereignisse: [] };
    if (beben.status === 'fulfilled') {
      for (const f of beben.value.features ?? []) {
        const [lon, lat, tiefe] = f.geometry.coordinates;
        neu.ereignisse.push({ art: 'earthquakes', lat, lon, staerke: f.properties.mag, titel: `Erdbeben M${f.properties.mag.toFixed(1)}`, region: f.properties.place ?? '', zeit: new Date(f.properties.time).toLocaleString('de-DE'), text: `${f.properties.place ?? ''} · Tiefe ${Math.round(tiefe)} km${f.properties.tsunami ? ' · Tsunami-Hinweis' : ''}`, quelle: 'USGS' });
      }
    }
    if (eonet.status === 'fulfilled') {
      for (const e of eonet.value.events ?? []) {
        const g = e.geometry?.at(-1);
        if (!g || g.type !== 'Point') continue;
        const kat = e.categories?.[0]?.id ?? 'manmade';
        neu.ereignisse.push({ art: kat, lat: g.coordinates[1], lon: g.coordinates[0], titel: e.title, region: e.title, zeit: new Date(g.date).toLocaleString('de-DE'), text: `${EONET_NAME[kat] ?? kat} · ${e.sources?.map((x) => x.id).join(', ') ?? ''}`, quelle: 'NASA EONET' });
      }
    }
    if (neu.ereignisse.length) { daten = neu; await db.set('gefahren', daten); }
  }
  if (!daten) { toast('Gefahren-Daten nicht erreichbar.'); return; }
  const parent = viewer.entities.add(new C.Entity());
  for (const x of daten.ereignisse) {
    const farbe = C.Color.fromCssColorString(EONET_FARBE[x.art] ?? '#ff5a5f');
    const groesse = x.staerke ? 4 + (x.staerke - 4) * 4 : 7;
    const e = viewer.entities.add({
      parent,
      position: C.Cartesian3.fromDegrees(x.lon, x.lat),
      point: { pixelSize: groesse, color: farbe.withAlpha(0.85), outlineColor: farbe.withAlpha(0.3), outlineWidth: 6, disableDepthTestDistance: 2e6 },
    });
    e.info = { ...x, kategorie: EONET_NAME[x.art] ?? 'Ereignis' };
  }
  layer.gefahren = parent;
  toast(`${daten.ereignisse.length} aktive Ereignisse · Stand ${ago(daten.at)}`);
}

// --- Suche & Overpass -----------------------------------------------------------

async function sucheOrt() {
  const q = $('#g-suche').value.trim();
  if (!q) return;
  try {
    const r = await fetchChecked(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=de&q=${encodeURIComponent(q)}`);
    if (!r.length) { toast('Ort nicht gefunden.'); return; }
    const [s, n, w, e] = r[0].boundingbox.map(Number);
    stoppeDrehung();
    $('#g-suche').blur();
    if (stadt.istAktiv()) { stadt.passeAn(w, s, e, n); return; }
    viewer.camera.flyTo({ destination: C.Rectangle.fromDegrees(w, s, e, n), duration: 3 });
    $('#g-suche').blur();
  } catch (err) { toast(err.message); }
}

async function overpass(query) {
  if (!navigator.onLine) throw new Error('Kein Internet – zeige gespeicherte Treffer.');
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }) });
  if (res.status === 429) throw new Error('Kartendienst überlastet – bitte kurz warten.');
  if (!res.ok) throw new Error(`Kartendienst antwortet mit ${res.status}`);
  return (await res.json()).elements ?? [];
}

function bbox() {
  if (stadt.istAktiv()) {
    const g = stadt.grenzen();
    return `${g.sued.toFixed(4)},${g.west.toFixed(4)},${g.nord.toFixed(4)},${g.ost.toFixed(4)}`;
  }
  const r = viewer.camera.computeViewRectangle();
  if (!r) return null;
  const d = (x) => C.Math.toDegrees(x).toFixed(4);
  return `${d(r.south)},${d(r.west)},${d(r.north)},${d(r.east)}`;
}

function typOf(tags) {
  for (const k of ['tourism', 'office', 'amenity', 'shop', 'natural', 'aeroway', 'railway']) if (TYP[tags[k]]) return TYP[tags[k]];
  return '';
}

async function sucheKategorie(key) {
  if (hoehe() > 60000) { toast('Näher heranfliegen (unter ca. 60 km Höhe).'); return; }
  const kat = KATEGORIEN[key];
  const b = bbox();
  $('#g-treffer').innerHTML = '<p class="muted mono">SCANNE …</p>';
  try {
    const els = await overpass(`[out:json][timeout:25];(${kat.filter.map((f) => `nwr${f}(${b});`).join('')});out center 300;`);
    const m = mitte() ?? { lat: 0, lon: 0 };
    const liste = els.map((e) => ({
      lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon,
      typ: typOf(e.tags ?? {}), name: e.tags?.name || typOf(e.tags ?? {}) || 'ohne Namen',
      web: e.tags?.website || e.tags?.['contact:website'], tel: e.tags?.phone || e.tags?.['contact:phone'],
    })).filter((x) => x.lat != null).map((x) => ({ ...x, km: distanceKm(m, x) })).sort((a, z) => a.km - z.km);
    const daten = { art: 'kat', titel: kat.name, farbe: kat.farbe, liste, at: Date.now() };
    await db.set('erkunden', daten);
    zeigeTreffer(daten, true);
  } catch (err) { $('#g-treffer').innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
}

async function sucheOrte(richtung) {
  const h = hoehe();
  if (h > 2500000) { toast('Auf ein Land oder eine Region heranfliegen.'); return; }
  const typen = h < 150000 ? 'city|town|village|hamlet' : 'city|town|village';
  $('#g-treffer').innerHTML = '<p class="muted mono">ZÄHLE MENSCHEN …</p>';
  try {
    const els = await overpass(`[out:json][timeout:25];node["place"~"^(${typen})$"]["population"](${bbox()});out 800;`);
    const liste = els.map((e) => ({ lat: e.lat, lon: e.lon, name: e.tags.name || '?', typ: ORTSTYP[e.tags.place] ?? e.tags.place, ew: parseInt(String(e.tags.population).replace(/[^\d]/g, ''), 10) }))
      .filter((x) => x.ew > 0)
      .sort((a, z) => (richtung === 'desc' ? z.ew - a.ew : a.ew - z.ew))
      .slice(0, 40);
    const daten = { art: 'orte', titel: richtung === 'desc' ? 'Meiste Menschen' : 'Wenigste Menschen', farbe: richtung === 'desc' ? '#ff5a5f' : '#3ee6a8', liste, at: Date.now() };
    await db.set('erkunden', daten);
    zeigeTreffer(daten, true);
    schraegAuf(liste);
  } catch (err) { $('#g-treffer').innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
}

// Treffer als leuchtende Säulen (Orte, Höhe ~ Einwohner) bzw. Punkte (Orte am Boden).
function zeigeTreffer(d, liste) {
  if (layer.treffer) viewer.entities.remove(layer.treffer);
  const parent = viewer.entities.add(new C.Entity());
  const farbe = C.Color.fromCssColorString(d.farbe);
  const maxEw = Math.max(1, ...d.liste.map((x) => x.ew ?? 0));
  const ausdehnungKm = ausdehnung(d.liste);
  const maxLen = Math.min(80000, Math.max(8000, ausdehnungKm * 1000 * 0.35));
  const maxRadius = Math.min(4000, Math.max(600, ausdehnungKm * 1000 * 0.015));
  for (const x of d.liste) {
    if (d.art === 'orte') {
      const anteil = Math.sqrt(x.ew / maxEw);
      const len = 1500 + anteil * maxLen;
      const radius = maxRadius * (0.45 + anteil * 0.55);
      viewer.entities.add({
        parent,
        position: C.Cartesian3.fromDegrees(x.lon, x.lat, len / 2),
        cylinder: { length: len, topRadius: radius * 0.6, bottomRadius: radius, material: farbe.withAlpha(0.6), outline: true, outlineColor: farbe.withAlpha(0.9), numberOfVerticalLines: 0 },
        label: { text: x.name, font: '500 12px system-ui', fillColor: C.Color.WHITE, pixelOffset: new C.Cartesian2(0, -14), distanceDisplayCondition: new C.DistanceDisplayCondition(0, 600000), heightReference: C.HeightReference.NONE },
      }).treffer = x;
    } else {
      viewer.entities.add({
        parent,
        position: C.Cartesian3.fromDegrees(x.lon, x.lat),
        point: { pixelSize: 9, color: farbe, outlineColor: C.Color.BLACK.withAlpha(0.6), outlineWidth: 2, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: x.name, font: '500 12px system-ui', fillColor: C.Color.WHITE, showBackground: true, backgroundColor: C.Color.fromCssColorString('#050607cc'), pixelOffset: new C.Cartesian2(0, -18), distanceDisplayCondition: new C.DistanceDisplayCondition(0, 6000), heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }).treffer = x;
    }
  }
  layer.treffer = parent;
  if (stadt.istAktiv()) stadt.setTreffer(d);
  viewer.scene.requestRender();
  if (liste) zeigeListe(d);
}

// Schräger Blick auf die Säulen, damit sie als 3D-Höhen lesbar sind.
function ausdehnung(liste) {
  if (!liste.length) return 0;
  const lats = liste.map((x) => x.lat);
  const lons = liste.map((x) => x.lon);
  const mlat = (Math.min(...lats) + Math.max(...lats)) / 2;
  return Math.max(Math.max(...lats) - Math.min(...lats), (Math.max(...lons) - Math.min(...lons)) * Math.cos(mlat * Math.PI / 180)) * 111;
}

function schraegAuf(liste) {
  if (!liste.length) return;
  const lats = liste.map((x) => x.lat);
  const lons = liste.map((x) => x.lon);
  const mlat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const mlon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const h = Math.min(1500000, Math.max(30000, ausdehnung(liste) * 1000 * 1.3));
  stoppeDrehung();
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(mlon, mlat - (h / 111000) * 1.25, h),
    orientation: { heading: 0, pitch: C.Math.toRadians(-38), roll: 0 },
    duration: 2.5,
  });
}

function zeigeListe(d) {
  const box = $('#g-treffer');
  if (!box) return;
  box.innerHTML = `
    <p class="mono small"><span style="color:${d.farbe}">●</span> ${esc(d.titel.toUpperCase())} · ${d.liste.length} <span class="muted">· ${ago(d.at)}</span></p>
    <ul class="list">${d.liste.slice(0, 40).map((x, i) => `<li data-i="${i}" style="cursor:pointer"><div class="row">
      <span><strong>${esc(x.name)}</strong><br><span class="muted">${x.typ !== x.name ? esc(x.typ) : ''}${x.tel ? ` · ${esc(x.tel)}` : ''}</span></span>
      <span class="muted mono">${x.ew ? `${x.ew.toLocaleString('de-DE')}` : `${x.km.toFixed(1)} km`}</span></div></li>`).join('') || '<li class="muted">Nichts gefunden – größeren Ausschnitt oder andere Kategorie wählen.</li>'}</ul>`;
  box.querySelectorAll('[data-i]').forEach((li) => {
    li.onclick = () => { const x = d.liste[li.dataset.i]; flieg(x.lat, x.lon, x.ew ? 15000 : 900); };
  });
}

// --- Bildmitte: Wissen, Wetter, Land, Recherche – alles direkt in der App ----------

const WMO = { 0: 'klar', 1: 'heiter', 2: 'wolkig', 3: 'bedeckt', 45: 'Nebel', 48: 'Nebel', 51: 'Niesel', 53: 'Niesel', 55: 'Niesel', 61: 'Regen', 63: 'Regen', 65: 'starker Regen', 71: 'Schnee', 73: 'Schnee', 75: 'starker Schnee', 80: 'Schauer', 81: 'Schauer', 82: 'heftige Schauer', 95: 'Gewitter', 96: 'Gewitter', 99: 'Gewitter' };

async function ladeInfos() {
  const m = mitte();
  if (!m) { toast('Die Bildmitte zeigt ins All – auf die Erde zielen.'); return; }
  const lat = m.lat.toFixed(4);
  const lon = m.lon.toFixed(4);
  sheet('SCAN', '<div class="scan-lade"><span></span><p class="mono">EMPFANGE DATEN …</p></div>');
  const [hoeheR, wetter, ort, luft, wiki] = await Promise.allSettled([
    fetchChecked(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`),
    fetchChecked(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=7`),
    fetchChecked(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=de&lat=${lat}&lon=${lon}`),
    fetchChecked(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi`),
    fetchChecked(`https://de.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}%7C${lon}&ggsradius=10000&ggslimit=8&prop=pageimages%7Cextracts%7Ccoordinates&piprop=thumbnail&pithumbsize=320&exintro=1&explaintext=1&exsentences=2&format=json&origin=*`),
  ]);
  const ok = (r) => (r.status === 'fulfilled' ? r.value : null);
  const a = ok(ort)?.address ?? {};
  const name = a.city || a.town || a.village || a.municipality || a.county || a.state || ok(ort)?.display_name?.split(',')[0] || '';
  const land = a.country ?? '';
  const code = (a.country_code ?? '').toUpperCase();
  const w = ok(wetter);
  const aqi = ok(luft)?.current?.european_aqi;
  const artikel = Object.values(ok(wiki)?.query?.pages ?? {})
    .map((p) => ({ ...p, km: p.coordinates?.[0] ? distanceKm(m, { lat: p.coordinates[0].lat, lon: p.coordinates[0].lon }) : 99 }))
    .sort((x, y) => x.km - y.km);
  const landInfo = code ? await landDaten(code) : null;
  const ziel = name ? `${name}${land ? `, ${land}` : ''}` : `${lat}, ${lon}`;

  sheet('SCAN', `
    <div class="scan-kopf">
      ${landInfo?.flagge ? `<img src="${esc(landInfo.flagge)}" alt="" class="flagge">` : ''}
      <div><h3>${esc(name || 'Unbekannte Gegend')}</h3><div class="muted small">${esc(land)} · <span class="mono">${lat}°, ${lon}°</span></div></div>
    </div>
    <div class="g-stats">
      <div><div class="g-num">${ok(hoeheR) ? `${Math.round(ok(hoeheR).elevation?.[0])}<small> m</small>` : '–'}</div><div class="stat">Höhe</div></div>
      <div><div class="g-num">${w?.current ? `${Math.round(w.current.temperature_2m)}<small>°C</small>` : '–'}</div><div class="stat">${esc(WMO[w?.current?.weather_code] ?? 'Wetter')}</div></div>
      <div><div class="g-num">${aqi != null ? `${Math.round(aqi)}` : '–'}</div><div class="stat">Luft (EAQI)</div></div>
    </div>
    ${w?.daily ? `<div class="wetter-leiste">${w.daily.time.map((t, i) => `
      <div><span>${new Date(t).toLocaleDateString('de-DE', { weekday: 'short' })}</span><b>${Math.round(w.daily.temperature_2m_max[i])}°</b><i>${Math.round(w.daily.temperature_2m_min[i])}°</i><em>${w.daily.precipitation_sum[i] ? `${w.daily.precipitation_sum[i].toFixed(0)} mm` : ''}</em></div>`).join('')}</div>` : ''}

    <div class="g-label">Planen</div>
    <div class="aktionen">
      <button class="aktion haupt" id="g-dossier"><b>Dossier</b><span>Vor- & Nachteile, aktuell & Geschichte</span></button>
      <button class="aktion" id="g-route"><b>3 Routen</b><span>von dir hierhin, live in 3D</span></button>
      <button class="aktion" id="g-bogen"><b>Bogen</b><span>Verbindung zu dir zeigen</span></button>
    </div>

    <div class="g-label">Recherche vor Ort</div>
    <div class="aktionen klein">
      ${Object.entries(RECHERCHE).map(([k, r]) => `<button class="aktion" data-suche="${k}"><b>${r.titel}</b><span>${r.text}</span></button>`).join('')}
    </div>

    ${landInfo ? `
      <div class="g-label">Land · ${esc(landInfo.name)}</div>
      <div class="fakten">
        <div><span>Hauptstadt</span><b>${esc(landInfo.hauptstadt)}</b></div>
        <div><span>Einwohner</span><b>${landInfo.einwohner}</b></div>
        <div><span>Sprachen</span><b>${esc(landInfo.sprachen)}</b></div>
        <div><span>Währung</span><b>${esc(landInfo.waehrung)}</b></div>
        <div><span>Vorwahl</span><b>${esc(landInfo.vorwahl)}</b></div>
        <div><span>Region</span><b>${esc(landInfo.region)}</b></div>
      </div>` : ''}

    ${artikel.length ? `
      <div class="g-label">Wissen aus der Umgebung</div>
      <div class="wissen">${artikel.map((p) => `
        <article>
          ${p.thumbnail ? `<img src="${esc(p.thumbnail.source)}" alt="" loading="lazy">` : '<div class="ph"></div>'}
          <div><b>${esc(p.title)}</b><span class="muted mono small">${p.km < 99 ? `${p.km.toFixed(1)} km` : ''}</span><p>${esc(p.extract ?? '')}</p></div>
        </article>`).join('')}</div>
      <p class="muted small">Quelle: Wikipedia (CC BY-SA)</p>` : ''}
    <button class="breit" id="g-ki">Mit der KI über ${esc(name || 'diese Gegend')} sprechen</button>`);

  $('#g-dossier').onclick = () => reise.dossier(name || ziel, land, m.lat, m.lon);
  $('#g-route').onclick = () => reise.routenPanel(ziel);
  $('#g-bogen').onclick = () => reise.balkenHierhin(name || ziel, m.lat, m.lon);
  $$s('[data-suche]').forEach((b) => { b.onclick = () => reise.recherche(b.dataset.suche, ziel); });
  $('#g-ki').onclick = () => frageStellen(`Ich überlege, nach ${ziel} zu ziehen. Was sollte ich über das Leben dort wissen – Unterkünfte, Jobs, Kosten, Menschen, Sicherheit – und wie fange ich am besten an?`);
}

const RECHERCHE = {
  fluege: { titel: 'Flüge', text: 'Verbindungen & Preise' },
  unterkuenfte: { titel: 'Unterkünfte', text: 'erste Wochen' },
  wohnungen: { titel: 'Wohnungen', text: 'Mieten & Viertel' },
  jobs: { titel: 'Jobs', text: 'Stellen & Gehälter' },
  visum: { titel: 'Papiere', text: 'Visum, Anmeldung, Konto' },
  kosten: { titel: 'Kosten', text: 'Monatsbudget vor Ort' },
};

// Länderdaten (REST Countries), verschlüsselt zwischengespeichert für offline.
async function landDaten(code) {
  const cache = await db.get('laenderDaten', {});
  if (cache[code]) return cache[code];
  try {
    const [d] = await fetchChecked(`https://restcountries.com/v3.1/alpha/${code}?fields=name,translations,capital,population,languages,currencies,idd,region,subregion,flags`);
    const info = {
      name: d.translations?.deu?.common ?? d.name?.common,
      hauptstadt: d.capital?.join(', ') ?? '–',
      einwohner: d.population ? d.population.toLocaleString('de-DE') : '–',
      sprachen: Object.values(d.languages ?? {}).join(', '),
      waehrung: Object.entries(d.currencies ?? {}).map(([k, v]) => `${v.name} (${k})`).join(', '),
      vorwahl: d.idd?.root ? `${d.idd.root}${d.idd.suffixes?.length === 1 ? d.idd.suffixes[0] : ''}` : '–',
      region: [d.region, d.subregion].filter(Boolean).join(' · '),
      flagge: d.flags?.svg,
    };
    cache[code] = info;
    await db.set('laenderDaten', cache);
    return info;
  } catch {
    return null;
  }
}

// Panel offen: Globus auf dem Handy anhalten (Akku), am großen Bildschirm weiterlaufen lassen.
export function pause(an) {
  if (!viewer || viewer.isDestroyed()) return;
  viewer.useDefaultRenderLoop = !(an && (document.hidden || window.innerWidth < 900));
}

export function stop() {
  reise.stop();
  stadt.zerstoere();
  stadtBereit = null;
  window.removeEventListener('stadt-bereit', stadtDatenSync);
  clearInterval(satTimer);
  satTimer = null;
  clearInterval(readoutTimer);
  readoutTimer = null;
  if (viewer && !viewer.isDestroyed()) {
    stoppeDrehung();
    try { viewer.destroy(); } catch { /* bereits entfernt */ }
  }
  viewer = null;
  basisLayer = null;
  satPoints = null;
}
