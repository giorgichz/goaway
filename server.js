// Neustart-Server (eigenes Hosting): liefert die App aus public/ und stellt die
// KI-Aufträge bereit – dieselbe Schnittstelle wie die Netlify-Funktionen:
//   POST /api/ki/:typ   → { job }      (plan | chat | route | dossier | suche)
//   GET  /api/job/:id   → Stand / Ergebnis (wird beim Abholen gelöscht)
//   GET  /api/status    → { ki }
// Umgebungsvariablen: siehe core/ki.js, dazu PORT (Standard 3002).

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kiBereit, fehlerText } from './core/ki.js';
import { speicherImRam, starte, bearbeite, hole } from './core/jobs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3002;
const store = speicherImRam();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // hinter Proxy: echte Client-IP fürs Limit
app.use(express.json({ limit: '200kb' }));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=()',
  });
  next();
});

const fehler = (res, err) => {
  const { status, fehler: text } = fehlerText(err);
  res.status(status).json({ fehler: text });
};

app.get('/api/status', (req, res) => res.json({ ki: kiBereit(), host: 'server' }));

app.post('/api/ki/:typ', async (req, res) => {
  try {
    const id = await starte(store, { typ: req.params.typ, body: req.body, zugang: req.get('x-zugang'), ip: req.ip });
    setImmediate(() => bearbeite(store, id));
    res.status(202).json({ job: id });
  } catch (err) {
    fehler(res, err);
  }
});

app.get('/api/job/:id', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json(await hole(store, req.params.id, req.get('x-zugang')));
  } catch (err) {
    fehler(res, err);
  }
});

app.use(express.static(path.join(here, 'public'), {
  setHeaders: (res, file) => {
    if (file.endsWith('sw.js')) res.set('Cache-Control', 'no-cache');
    if (file.includes(`${path.sep}cesium${path.sep}`)) res.set('Cache-Control', 'public, max-age=2592000, immutable');
  },
}));
// Fallback, falls `npm run build` noch nicht lief: Cesium direkt aus node_modules.
app.use('/vendor/cesium', express.static(path.join(here, 'node_modules/cesium/Build/Cesium'), { maxAge: '30d', immutable: true }));

app.listen(PORT, () => {
  console.log(`Neustart läuft auf http://localhost:${PORT} · KI ${kiBereit() ? 'bereit' : 'nicht eingerichtet'}`);
});
