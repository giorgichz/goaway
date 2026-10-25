# Neustart – verschlüsselte Notfall- und Neustart-App mit KI-Planer

Einmal online öffnen, zum
Startbildschirm hinzufügen, Daten laden – danach läuft alles außer der KI ohne Internet.

## Sicherheit

- **Master-Passwort** beim ersten Start. Daraus wird per PBKDF2 (600 000 Runden,
  SHA-256) ein AES-256-GCM-Schlüssel, der nur im Arbeitsspeicher liegt.
- **Alles Persönliche ist verschlüsselt** in IndexedDB: Einstellungen/Standort,
  Plan, Budget, Briefe, Kontakte, medizinische Infos, KI-Pläne, Chatverlauf,
  Zugangscode und der Dokumenten-Tresor. Öffentliche Daten (Weltlage, Kurse,
  Bahndaten) bleiben unverschlüsselt.
- **Gesperrt** zeigt die App nichts an. Sperrt sich nach 60 s im Hintergrund
  oder 10 Min. ohne Bedienung; „Sperren“-Knopf oben rechts.
- **Sicherung** (Start → System) enthält das ganze System, weiterhin verschlüsselt.
  **Notfall-Löschung** entfernt alles vom Gerät.
- Kein Passwort-Reset: Passwort vergessen = Daten weg.
- Ausnahme: Angesehene Kartenkacheln liegen unverschlüsselt im Browser-Cache
  (max. 4000). Die Notfall-Löschung entfernt sie mit. Kartendienste sehen,
  welche Gegend du dir anschaust.

## Bereiche

| Bereich | Was | Offline? |
|---|---|---|
| Start | Countdown, Zielland, Standort, Datenstand, System (Sicherung/Löschung) | ja |
| KI-Planer | Ein Befehl → kompletter Plan (Phasen, Budget, 72 h, Risiken, Rechtliches, Notfallplan, Packliste) für Szenarien Großstadt, Land, Insel, Sofort-Ausreise, nomadisch; Übernahme in Plan/Budget; Chat mit Websuche | Pläne ja, KI nur online |
| Globus | 3D-Erde (CesiumJS) mit Sternen, Atmosphäre und echter Tag-Nacht-Grenze; Oberfläche Satellit/Dunkel/Gelände, Zoom bis auf die Straße; Ebenen Stadtlichter (Nachtseite), Beschriftung, Bevölkerungsdichte (NASA GPWv4), Weltlage (Länder nach AA-Warnstufe), Satelliten live inkl. ISS-Bahn, Flüge; „Was ist hier?“ (Unterkünfte, Arbeit/Coworking, Versorgung, Botschaften, Wasser/Treibstoff, Verkehr; Orte als Säulen nach Einwohnerzahl); Scan der Bildmitte: Höhe, Wetter, Straßenansicht, Wohnungs- und Jobportale, KI ; Live-GPS mit Lichtsäule; leuchtende animierte Bögen von dir zum Zielland und zu gemerkten Orten (Distanz, Flugzeit); 3 KI-Routen pro Ziel mit Kameraflug Stopp für Stopp, Vor-/Nachteilen und Buchungs-Links (Google Flights, Skyscanner, Kayak, Booking, Airbnb, Rome2Rio, Direct Ferries) mit Ziel und Datum; Dossier zu jedem Ort (aktuell per Websuche, Geschichte, Vor-/Nachteile, Kosten, Visum, Sicherheit, Eignung) | angesehene Kacheln, Treffer, Routen und Dossiers |
| Stadtansicht | Unter ca. 15 km Höhe blendet der Globus in eine scharfe Vektorkarte mit 3D-Gebäuden über (MapLibre GL + OpenFreeMap, eigener dunkler Stil): Gebäude wachsen animiert aus dem Boden, Straßen- und Ortsnamen, GPS, Treffer, Säulen und Routen. Wahlweise „Satellit + 3D“. Herauszoomen führt zurück zum Globus | angesehene Vektor-Kacheln |
| Recherche | KI-Websuche direkt in der App: Flüge, Unterkünfte, Wohnungen, Jobs, Papiere, Kosten – als Ergebniskarten mit Preisen, Vor-/Nachteilen und Quellen; aus Scan, Route und Tour erreichbar | gespeicherte Ergebnisse |
| Gefahren | Ebene „Gefahren live“: Erdbeben M4.5+ (USGS) und Naturereignisse (NASA EONET: Waldbrände, Stürme, Vulkane, Fluten) | letzter Stand |
| Lage | Reise- und Sicherheitshinweise des Auswärtigen Amts | letzter Stand |
| Satelliten | Himmelskarte, Überflüge (SGP4 lokal) | ja, ca. 2 Wochen genau |
| Flüge | Flugzeuge im Umkreis von 150 km (OpenSky) | nur live |
| Geld | EZB-Kurse, eigene Kurse, Budget-Reichweite | ja |
| Plan | Checkliste mit Fristen | ja |
| Tresor | Dokumente/Notizen | ja |
| Briefe | Kündigungsschreiben | ja |
| Notfall | Notrufnummern, Kontakte, medizinische Infos, Sätze in 6 Sprachen | ja |

## Aufbau

Die App ist eine eigene Welt: Nach dem Entsperren läuft der 3D-Globus dauerhaft im
Hintergrund, unten das Dock (Welt · Cockpit · KI · Plan · Tresor · Mehr). Jeder
Bereich öffnet sich als Glas-Panel über der Erde, auf dem Handy von unten, am großen
Bildschirm rechts. Keine Browser-Popups – Bestätigungen laufen über eigene Dialoge.

Alles Wichtige ist direkt in der App: Scan der Bildmitte (Wetter, Luft, Höhe,
Länderdaten, Wikipedia-Wissen der Umgebung), KI-Recherche zu Flügen, Unterkünften,
Wohnungen, Jobs, Papieren und Kosten als Ergebniskarten, Dossiers, Routen mit Kameraflug.
Nur Buchung und Bezahlung passieren beim jeweiligen Anbieter.

## Backend

Gleiche Schnittstelle für Netlify und eigenen Server, gemeinsamer Kern in `core/`:

| Route | Zweck |
|---|---|
| `POST /api/ki/:typ` | KI-Auftrag anlegen (`plan`, `chat`, `route`, `dossier`, `suche`) → `{ job }` |
| `GET /api/job/:id` | Stand abfragen; fertiges Ergebnis wird beim Abholen gelöscht |
| `GET /api/status` | `{ ki: true/false }` |

KI-Aufrufe mit Websuche dauern oft 30–120 s. Deshalb laufen sie als Auftrag im
Hintergrund: auf Netlify in einer Background-Function (bis 15 Min.) mit Netlify Blobs
als Zwischenspeicher, auf dem eigenen Server asynchron im Arbeitsspeicher. Die App fragt
alle 2 s nach. Schutz: Zugangscode (`x-zugang`), 40 Aufträge pro Stunde und IP (IP nur
gehasht gespeichert). Inhalte werden nicht geloggt.

Mitgeschickt werden nur Zielland, Abreisedatum, Budget-Summen, Plan-Fortschritt und die
Warnstufe des Ziellands – nie Tresor oder Kontakte. Für Routen und Recherchen geht der
Startpunkt auf ~10 km gerundet mit.

| Variable | Bedeutung |
|---|---|
| `ANTHROPIC_API_KEY` | Claude-API-Schlüssel (console.anthropic.com) |
| `NEUSTART_ZUGANG` | frei gewählter Zugangscode, den du in der App unter „KI“ einträgst |
| `NEUSTART_MODEL` | optional, Standard `claude-opus-5-5` |
| `PORT` | nur eigener Server, Standard 3002 |

## Netlify (zum Testen)

1. Auf netlify.com „Add new site → Import an existing project“ → GitHub → Repo `goaway`,
   Branch `main`. `netlify.toml` setzt alles Weitere (Build `npm ci && npm run build`,
   Publish `public`, Functions).
2. Unter „Site configuration → Environment variables“ `ANTHROPIC_API_KEY` und
   `NEUSTART_ZUGANG` anlegen, dann „Deploys → Trigger deploy“.
3. Die Netlify-Adresse öffnen, Master-Passwort festlegen, unter „KI“ den Zugangscode
   eintragen, im Cockpit „Alles aktualisieren“.

## Eigener Server

```bash
npm ci && npm run build        # kopiert CesiumJS und MapLibre nach public/vendor/
ANTHROPIC_API_KEY=... NEUSTART_ZUGANG=meincode npm start   # http://localhost:3002
```

Hinter einem Reverse-Proxy mit HTTPS betreiben (Verschlüsselung, GPS und Service Worker
brauchen HTTPS). `render.yaml` enthält eine fertige Konfiguration für Render.

Nach Änderungen an App-Dateien `VERSION` in `public/sw.js` erhöhen.

## Datenquellen

Auswärtiges Amt Open Data · EZB-Kurse über frankfurter.dev · CelesTrak ·
OpenSky Network · OpenStreetMap (Overpass, Nominatim) · CARTO · Esri World Imagery ·
OpenTopoMap · OpenFreeMap (OpenMapTiles) · NASA GIBS · NASA EONET · USGS · Natural Earth · Open-Meteo (Wetter, Luft, Höhe) ·
REST Countries · Wikipedia · [CesiumJS](https://cesium.com/platform/cesiumjs/) 1.145.0 (Apache-2.0) · [MapLibre GL JS](https://maplibre.org) 6.13.0 (BSD-3) ·
[satellite.js](https://github.com/shashwatak/satellite-js) 5.0.0 (MIT, `public/vendor/`)
