// „Mehr“: Startfläche für alle weiteren Bereiche, mit Live-Kennzahlen je Kachel.

import * as db from './db.js';
import { $, ago } from './util.js';

const KACHELN = [
  { id: 'geld', icon: 'geld', titel: 'Geld', text: 'Kurse, Umrechner, Budget-Reichweite' },
  { id: 'lage', icon: 'lage', titel: 'Weltlage', text: 'Reisewarnungen aller Länder' },
  { id: 'himmel', icon: 'himmel', titel: 'Himmel', text: 'Satelliten über dir, Überflüge' },
  { id: 'fluege', icon: 'flug', titel: 'Luftraum', text: 'Flugzeuge im Umkreis von 150 km' },
  { id: 'notfall', icon: 'notfall', titel: 'Notfall', text: 'Notrufe, Kontakte, Sätze, Medizin' },
  { id: 'briefe', icon: 'brief', titel: 'Kündigungen', text: 'Fertige Schreiben zum Drucken' },
];

export async function render() {
  const lage = await db.get('lage');
  const kurse = await db.get('kurse');
  const tle = await db.get('tle', {});
  const fl = await db.get('fluege');
  const kontakte = await db.get('kontakte', []);
  const info = {
    geld: kurse ? `Kurse ${ago(kurse.fetchedAt)}` : 'Kurse fehlen',
    lage: lage ? `${lage.list.filter((l) => l.warning).length} Reisewarnungen` : 'noch nicht geladen',
    himmel: `${Object.values(tle).reduce((n, g) => n + g.tles.length, 0)} Bahnen gespeichert`,
    fluege: fl ? `${fl.fluege.length} Flugzeuge · ${ago(fl.fetchedAt)}` : 'nur live',
    notfall: `${kontakte.length} Kontakte`,
    briefe: 'offline',
  };
  $('#mehr').innerHTML = `
    <div class="kacheln">
      ${KACHELN.map((k) => `
        <a class="kachel" href="#${k.id}">
          <svg class="ic"><use href="#i-${k.icon}"/></svg>
          <strong>${k.titel}</strong>
          <span>${k.text}</span>
          <em class="mono">${info[k.id]}</em>
        </a>`).join('')}
    </div>`;
}
