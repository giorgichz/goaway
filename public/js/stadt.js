// Stadtansicht: scharfe Vektorkarte mit 3D-Gebäuden (MapLibre GL + OpenFreeMap,
// OpenMapTiles-Schema). Übernimmt nah am Boden vom 3D-Globus: Straßen, Gebäude
// und Schrift werden live gezeichnet und bleiben bei jedem Zoom scharf; die
// Vektor-Kacheln sind klein und werden für offline zwischengespeichert.

const ML_URL = 'vendor/maplibre/';
const QUELLE = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const SATELLIT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SCHRIFT = ['Noto Sans Regular'];
const SCHRIFT_FETT = ['Noto Sans Bold'];
const NAME = ['coalesce', ['get', 'name:de'], ['get', 'name']];

let ml = null;
let map = null;
let modus = 'vektor';
let beiRueckkehr = null;
let gpsMarker = null;
let aktiv = false;
let wachsen = null;

export const istAktiv = () => aktiv;
export const karte = () => map;

async function laden() {
  if (ml) return ml;
  if (!document.querySelector('link[data-ml]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${ML_URL}maplibre-gl.css`;
    css.dataset.ml = '1';
    document.head.append(css);
  }
  ml = await import(new URL(`../${ML_URL}maplibre-gl.mjs`, import.meta.url).href);
  return ml;
}

// Eigener dunkler Stil im Neustart-Look auf Basis des OpenMapTiles-Schemas.
function stil(m) {
  const strasse = (id, klassen, farbe, breiten, min = 5) => ({
    id, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: min,
    filter: ['in', ['get', 'class'], ['literal', klassen]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': farbe, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], ...breiten] },
  });
  const satellit = m === 'satellit';
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      omt: { type: 'vector', url: QUELLE, attribution: '© OpenMapTiles © OpenStreetMap · OpenFreeMap' },
      ...(satellit ? { sat: { type: 'raster', tiles: [SATELLIT], tileSize: 256, maxzoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' } } : {}),
    },
    layers: [
      { id: 'hintergrund', type: 'background', paint: { 'background-color': '#05080a' } },
      ...(satellit ? [{ id: 'satellit', type: 'raster', source: 'sat', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0.08 } }] : [
        { id: 'landnutzung', type: 'fill', source: 'omt', 'source-layer': 'landuse', paint: { 'fill-color': ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood'], '#0a0f12', ['commercial', 'retail', 'industrial'], '#0c1114', '#090d10'] } },
        { id: 'natur', type: 'fill', source: 'omt', 'source-layer': 'landcover', paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#0a1a12', 'grass', '#0b1813', 'sand', '#15130c', 'ice', '#16202a', '#0a140f'], 'fill-opacity': 0.9 } },
        { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#0c1d15', 'fill-outline-color': '#123124' } },
        { id: 'wasser', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#03111b' } },
        { id: 'fluss', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': '#062537', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 3] } },
        { id: 'piste', type: 'fill', source: 'omt', 'source-layer': 'aeroway', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#10171b' } },
      ]),
      strasse('weg', ['path', 'track'], satellit ? 'rgba(255,255,255,.25)' : '#18252a', [13, 0.4, 18, 1.5], 13),
      strasse('nebenstrasse', ['minor', 'service'], satellit ? 'rgba(255,255,255,.35)' : '#1a2a2f', [12, 0.4, 18, 9], 11),
      strasse('strasse', ['tertiary', 'secondary'], satellit ? 'rgba(242,181,60,.55)' : '#22403a', [9, 0.5, 18, 14], 8),
      strasse('hauptstrasse', ['primary', 'trunk'], satellit ? 'rgba(242,181,60,.75)' : '#2b5a4b', [7, 0.6, 18, 18], 6),
      strasse('autobahn', ['motorway'], satellit ? 'rgba(255,170,60,.85)' : '#3a7f67', [5, 0.6, 18, 22], 5),
      { id: 'bahn', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 10, filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': '#2b3a40', 'line-width': 1.2, 'line-dasharray': [3, 3] } },
      {
        id: 'gebaeude', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'render_height'], 0, '#0f1a1a', 20, '#13302a', 60, '#1c5545', 150, '#2a8f6e'],
          'fill-extrusion-height': ['*', ['coalesce', ['get', 'render_height'], 6], 1],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': satellit ? 0.55 : 0.92,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      {
        id: 'strassennamen', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13,
        layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': SCHRIFT, 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 13] },
        paint: { 'text-color': '#8fa3ad', 'text-halo-color': '#04070a', 'text-halo-width': 1.4 },
      },
      {
        id: 'wassernamen', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
        layout: { 'text-field': NAME, 'text-font': SCHRIFT, 'text-size': 12, 'text-letter-spacing': 0.15 },
        paint: { 'text-color': '#2f6a88', 'text-halo-color': '#03111b', 'text-halo-width': 1 },
      },
      {
        id: 'orte-klein', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'quarter', 'neighbourhood', 'village', 'hamlet']]],
        layout: { 'text-field': NAME, 'text-font': SCHRIFT, 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 14], 'text-transform': 'uppercase', 'text-letter-spacing': 0.12 },
        paint: { 'text-color': '#a9bcc6', 'text-halo-color': '#04070a', 'text-halo-width': 1.6 },
      },
      {
        id: 'orte-gross', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        layout: { 'text-field': NAME, 'text-font': SCHRIFT_FETT, 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 12, 14, 20], 'text-letter-spacing': 0.06 },
        paint: { 'text-color': '#e8fff6', 'text-halo-color': '#03140d', 'text-halo-width': 2 },
      },
      {
        id: 'poi', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 16,
        filter: ['<=', ['coalesce', ['get', 'rank'], 99], 25],
        layout: { 'text-field': NAME, 'text-font': SCHRIFT, 'text-size': 11, 'text-offset': [0, 0.6], 'text-anchor': 'top' },
        paint: { 'text-color': '#6fd6b0', 'text-halo-color': '#04070a', 'text-halo-width': 1.2 },
      },
    ],
  };
}

// Gebäude wachsen beim Betreten aus dem Boden – die „animierte“ Ansicht.
function lasseWachsen() {
  cancelAnimationFrame(wachsen);
  const start = performance.now();
  const schritt = (t) => {
    if (!map?.getLayer('gebaeude')) return;
    const f = Math.min(1, (t - start) / 1400);
    const e = 1 - (1 - f) ** 3;
    map.setPaintProperty('gebaeude', 'fill-extrusion-height', ['*', ['coalesce', ['get', 'render_height'], 6], e]);
    if (f < 1) wachsen = requestAnimationFrame(schritt);
  };
  wachsen = requestAnimationFrame(schritt);
}

function overlays() {
  const leer = { type: 'FeatureCollection', features: [] };
  for (const id of ['route', 'treffer', 'orte']) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: leer });
  map.addLayer({ id: 'route-glow', type: 'line', source: 'route', paint: { 'line-color': ['get', 'farbe'], 'line-width': 10, 'line-opacity': 0.18, 'line-blur': 6 } });
  map.addLayer({ id: 'route-linie', type: 'line', source: 'route', paint: { 'line-color': ['get', 'farbe'], 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
  map.addLayer({ id: 'orte-saeulen', type: 'fill-extrusion', source: 'orte', paint: { 'fill-extrusion-color': ['get', 'farbe'], 'fill-extrusion-height': ['get', 'hoehe'], 'fill-extrusion-opacity': 0.75 } });
  map.addLayer({ id: 'treffer-punkt', type: 'circle', source: 'treffer', paint: { 'circle-color': ['get', 'farbe'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 9], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
  map.addLayer({
    id: 'treffer-name', type: 'symbol', source: 'treffer', minzoom: 13,
    layout: { 'text-field': ['get', 'name'], 'text-font': SCHRIFT_FETT, 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top' },
    paint: { 'text-color': '#ffffff', 'text-halo-color': '#050607', 'text-halo-width': 1.6 },
  });
}

function setzeStil() {
  map.setStyle(stil(modus));
  map.once('style.load', () => {
    map.setSky({ 'sky-color': '#020405', 'horizon-color': '#0b2a20', 'fog-color': '#05080a', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4 });
    map.setLight({ anchor: 'viewport', color: '#d9fff0', intensity: 0.4, position: [1.2, 200, 35] });
    overlays();
    window.dispatchEvent(new Event('stadt-bereit'));
  });
}

export async function init(container, { zurueck }) {
  beiRueckkehr = zurueck;
  const m = await laden();
  map = new m.Map({
    container,
    style: stil(modus),
    center: [8.53, 52.02],
    zoom: 14,
    pitch: 55,
    maxPitch: 75,
    attributionControl: { compact: true },
    fadeDuration: 200,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2.5),
  });
  map.on('style.load', () => {
    map.setSky({ 'sky-color': '#020405', 'horizon-color': '#0b2a20', 'fog-color': '#05080a', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4 });
    map.setLight({ anchor: 'viewport', color: '#d9fff0', intensity: 0.4, position: [1.2, 200, 35] });
  });
  let fehlerGemeldet = false;
  map.on('error', (e) => {
    console.warn('Stadtansicht:', e.error?.message);
    if (!fehlerGemeldet && /style|layers\[/.test(e.error?.message ?? '')) { fehlerGemeldet = true; window.dispatchEvent(new CustomEvent('stadt-fehler', { detail: e.error?.message })); }
  });
  map.once('load', () => {
    overlays();
    // Quellenangabe eingeklappt starten (ⓘ öffnet sie), damit sie nichts verdeckt.
    container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    window.dispatchEvent(new Event('stadt-bereit'));
  });
  // Weit herausgezoomt: zurück zum Globus.
  map.on('zoomend', () => {
    if (aktiv && map.getZoom() < 9.5) {
      const c = map.getCenter();
      beiRueckkehr?.({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
    }
  });
  return map;
}

export function zeige({ lat, lon, zoom, bearing = 0 }) {
  if (!map) return;
  aktiv = true;
  map.getContainer().classList.add('an');
  map.resize();
  map.jumpTo({ center: [lon, lat], zoom: Math.max(zoom - 0.6, 10), pitch: 0, bearing });
  map.easeTo({ zoom, pitch: zoom >= 13 ? 58 : 35, bearing: bearing + (zoom >= 13 ? -20 : 0), duration: 1800, essential: true });
  if (map.isStyleLoaded()) lasseWachsen();
  else map.once('idle', lasseWachsen);
}

export function verstecke() {
  aktiv = false;
  map?.getContainer().classList.remove('an');
}

export function flieg(lat, lon, zoom = 16) {
  map?.flyTo({ center: [lon, lat], zoom, pitch: 58, duration: 2200, essential: true });
}

export function passeAn(west, sued, ost, nord) {
  map?.fitBounds([[west, sued], [ost, nord]], { padding: 60, pitch: 45, duration: 2200 });
}

export function setModus(m) {
  if (m === modus) return;
  modus = m;
  if (map) setzeStil();
}

export const aktuellerModus = () => modus;

export function mitte() {
  if (!map) return null;
  const c = map.getCenter();
  return { lat: c.lat, lon: c.lng };
}

export function grenzen() {
  const b = map.getBounds();
  return { west: b.getWest(), sued: b.getSouth(), ost: b.getEast(), nord: b.getNorth() };
}

// Ungefähre Kamerahöhe in Metern (für Readout und Suchgrenzen).
export function hoehe() {
  if (!map) return 0;
  const lat = map.getCenter().lat;
  const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** map.getZoom();
  return mpp * map.getCanvas().clientHeight * 0.866;
}

export function setGps(lat, lon) {
  if (!map || !ml) return;
  if (!gpsMarker) {
    const el = document.createElement('div');
    el.className = 'gps-punkt';
    el.innerHTML = '<i></i><b></b>';
    gpsMarker = new ml.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
  } else {
    gpsMarker.setLngLat([lon, lat]);
  }
}

const setDaten = (id, features) => map?.getSource(id)?.setData({ type: 'FeatureCollection', features });

export function setTreffer(d) {
  if (!map) return;
  if (!d) { setDaten('treffer', []); setDaten('orte', []); return; }
  if (d.art === 'orte') {
    const maxEw = Math.max(1, ...d.liste.map((x) => x.ew));
    setDaten('treffer', []);
    setDaten('orte', d.liste.map((x) => {
      const anteil = Math.sqrt(x.ew / maxEw);
      return { type: 'Feature', properties: { ...eigenschaften(x), farbe: d.farbe, hoehe: 300 + anteil * 2500 }, geometry: kreis(x.lon, x.lat, 120 + anteil * 260) };
    }));
  } else {
    setDaten('orte', []);
    setDaten('treffer', d.liste.map((x) => ({ type: 'Feature', properties: { ...eigenschaften(x), farbe: d.farbe }, geometry: { type: 'Point', coordinates: [x.lon, x.lat] } })));
  }
}

export function setRouten(routen, aktivIdx, farben) {
  if (!map) return;
  setDaten('route', (routen ?? []).map((r, i) => ({
    type: 'Feature',
    properties: { farbe: i === aktivIdx ? farben[i % farben.length] : `${farben[i % farben.length]}66` },
    geometry: { type: 'LineString', coordinates: r.stopps.map((s) => [s.lon, s.lat]) },
  })));
}

// Nur einfache Werte als Feature-Eigenschaften (für Klick → Detailansicht).
const eigenschaften = (x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v != null && typeof v !== 'object'));

function kreis(lon, lat, meter, n = 28) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([lon + (meter / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (meter / 110540) * Math.sin(a)]);
  }
  return { type: 'Polygon', coordinates: [pts] };
}

export function zerstoere() {
  cancelAnimationFrame(wachsen);
  gpsMarker = null;
  aktiv = false;
  try { map?.remove(); } catch { /* bereits entfernt */ }
  map = null;
}

