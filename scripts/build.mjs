// Build: kopiert CesiumJS (3D-Globus) und MapLibre GL (Stadtansicht) aus
// node_modules nach public/vendor/, damit Netlify und der eigene Server sie als
// normale statische Dateien ausliefern.
import { cpSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const quelle = path.join(here, '../node_modules/cesium/Build/Cesium');
const ziel = path.join(here, '../public/vendor/cesium');

if (!existsSync(quelle)) {
  console.error('CesiumJS fehlt – zuerst `npm ci` ausführen.');
  process.exit(1);
}
rmSync(ziel, { recursive: true, force: true });
cpSync(quelle, ziel, { recursive: true });
console.log('CesiumJS nach public/vendor/cesium kopiert.');

const ml = path.join(here, '../node_modules/maplibre-gl/dist');
const mlZiel = path.join(here, '../public/vendor/maplibre');
rmSync(mlZiel, { recursive: true, force: true });
// MapLibre 6 ist ein ES-Modul; der Worker wird relativ zu maplibre-gl.mjs geladen.
for (const datei of ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl.css']) cpSync(path.join(ml, datei), path.join(mlZiel, datei));
cpSync(path.join(ml, '../LICENSE.txt'), path.join(mlZiel, 'LICENSE.txt'));
console.log('MapLibre GL nach public/vendor/maplibre kopiert.');
