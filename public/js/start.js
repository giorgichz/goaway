// Startseite: Abreise-Countdown, Zielland, Standort und Datenstand aller Quellen.

import * as db from './db.js';
import { $, esc, ago, toast, download, dialog } from './util.js';
import { lockKey } from './crypto.js';
import { LAENDER } from './laender.js';
import { load as loadPlan } from './plan.js';
import * as reise from './reise.js';

export async function render({ refreshAll }) {
  const el = $('#start');
  const s = await db.settings();
  const lage = await db.get('lage');
  const kurse = await db.get('kurse');
  const tle = await db.get('tle', {});
  const fluege = await db.get('fluege');
  const plan = await loadPlan();
  const items = plan.flatMap((p) => p.items);
  const done = items.filter((i) => i.done).length;

  const tage = s.abreise ? Math.ceil((new Date(s.abreise).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
  const tleStand = Math.max(0, ...Object.values(tle).map((t) => t.fetchedAt));

  // Länder aus der AA-Liste plus kuratierte Liste, nach Namen sortiert.
  const laender = new Map(Object.entries(LAENDER).map(([code, l]) => [code, l.name]));
  lage?.list.forEach((l) => { if (l.code && !laender.has(l.code)) laender.set(l.code, l.name); });
  const options = [...laender].sort((a, b) => a[1].localeCompare(b[1], 'de'));

  // Nächste offene Schritte mit Frist (relativ zur Abreise).
  const naechste = plan.flatMap((p) => p.items.filter((i) => !i.done).map((i) => ({ ...i, phase: p.phase, frist: s.abreise ? new Date(s.abreise).getTime() + p.tage * 86400000 : null }))).slice(0, 4);
  const zielLage = lage?.list.find((l) => l.code === s.zielland);
  const zielName = s.zielland ? (LAENDER[s.zielland]?.name ?? zielLage?.name ?? s.zielland) : null;
  const stufe = zielLage ? (zielLage.warning ? ['bad', 'Reisewarnung'] : zielLage.partialWarning ? ['warn', 'Teilreisewarnung'] : (zielLage.situationWarning || zielLage.situationPartWarning) ? ['info', 'Lagehinweis'] : ['ok', 'keine Warnung']) : null;

  const zeile = (name, ts, hinweis = '') => `<tr><td>${name}</td><td>${ts ? ago(ts) : '<span class="overdue">fehlt</span>'}</td><td class="muted">${hinweis}</td></tr>`;

  el.innerHTML = `
    <h2>Dein Neustart</h2>
    <div class="grid">
      <div class="card">
        <div class="big">${tage == null ? '–' : tage > 0 ? tage : tage === 0 ? 'Heute' : `+${-tage}`}</div>
        <div class="stat">${tage == null ? 'Abreisedatum eintragen' : tage > 0 ? 'Tage bis zur Abreise' : tage === 0 ? 'ist Abreise' : 'Tage seit der Abreise'}</div>
      </div>
      <div class="card">
        <div class="big">${items.length ? Math.round((done / items.length) * 100) : 0} %</div>
        <div class="stat">vom Plan erledigt (${done}/${items.length})</div>
      </div>
    </div>

    ${zielName ? `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">Ziel: ${esc(zielName)}</h3>
        ${stufe ? `<span class="badge ${stufe[0]}">${stufe[1]}</span>` : ''}
      </div>
      <div class="row" style="margin-top:10px">
        <button class="chip on" id="s-dossier">Dossier öffnen</button>
        <button class="chip" id="s-routen">3 Routen dorthin</button>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">Nächste Schritte</h3><a class="chip" href="#plan">Ganzer Plan</a></div>
      <ul class="list">${naechste.map((i) => `<li><div class="small">${esc(i.text)}</div><div class="muted small mono">${esc(i.phase)}${i.frist ? ` · bis ${new Date(i.frist).toLocaleDateString('de-DE')}` : ''}</div></li>`).join('') || '<li class="muted">Alles erledigt.</li>'}</ul>
    </div>

    <div class="card grid">
      <div><label for="s-abreise">Abreisedatum</label><input type="date" id="s-abreise" value="${esc(s.abreise ?? '')}"></div>
      <div><label for="s-ziel">Zielland</label><select id="s-ziel"><option value="">– wählen –</option>
        ${options.map(([c, n]) => `<option value="${esc(c)}" ${c === s.zielland ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    </div>

    <div class="card">
      <h3>Standort <span class="badge ok">GPS live auf dem Globus</span></h3>
      <p>${s.standort ? `${s.standort.lat.toFixed(3)}, ${s.standort.lon.toFixed(3)} <span class="muted">(${ago(s.standort.at)})</span>` : 'Noch nicht bestimmt.'}</p>
      <p class="muted">Wird für Satelliten und Flüge gebraucht. GPS funktioniert auch ohne Internet. Der Standort bleibt nur auf diesem Gerät.</p>
      <div class="row">
        <button id="s-gps">Per GPS bestimmen</button>
        <input id="s-manuell" class="grow" placeholder="oder manuell: 52.02, 8.53">
        <button class="ghost" id="s-setzen">Setzen</button>
      </div>
    </div>

    <div class="card">
      <h3>Offline-Daten</h3>
      <div class="scroll"><table>
        <tr><th>Quelle</th><th>Stand</th><th></th></tr>
        ${zeile('Weltlage (Auswärtiges Amt)', lage?.fetchedAt, lage ? `${lage.list.length} Länder` : '')}
        ${zeile('Wechselkurse (EZB)', kurse?.fetchedAt, kurse ? `vom ${esc(kurse.date)}` : '')}
        ${zeile('Satelliten-Bahndaten', tleStand || null, `${Object.keys(tle).length} Gruppen · ca. 2 Wochen genau`)}
        ${zeile('Flüge (nur live)', fluege?.fetchedAt, 'braucht Internet')}
      </table></div>
      <button id="s-alles" style="margin-top:10px" ${navigator.onLine ? '' : 'disabled'}>Alles aktualisieren</button>
      <p class="muted" style="margin-top:8px">Tipp: Kurz vor der Abreise einmal alles aktualisieren und die App zum Startbildschirm hinzufügen – dann läuft sie komplett offline.</p>
    </div>

    <div class="card danger-zone">
      <h3>System</h3>
      <p class="muted">Die Sicherung enthält dein ganzes System – Plan, KI-Pläne, Tresor. Sie bleibt verschlüsselt und lässt sich nur mit deinem Master-Passwort öffnen. Leg sie auf einen USB-Stick oder in einen Cloud-Speicher, dann hast du alles auch auf einem neuen Gerät.</p>
      <div class="row">
        <button class="ghost" id="s-export">Sicherung herunterladen</button>
        <label class="btn ghost" style="margin:0">Sicherung einspielen<input type="file" id="s-import" accept=".json,application/json" hidden></label>
        <button class="danger" id="s-wipe">Notfall-Löschung</button>
      </div>
    </div>`;

  $('#s-export').onclick = async () => {
    download(`neustart-sicherung-${new Date().toISOString().slice(0, 10)}.json`, new Blob([await db.exportAll()], { type: 'application/json' }));
  };
  $('#s-import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file || !(await dialog({ titel: 'Sicherung einspielen?', text: 'Alle Daten auf diesem Gerät werden durch die Sicherung ersetzen. Danach mit dem Passwort der Sicherung entsperren.', ok: 'Ersetzen', gefahr: true }))) return;
    try {
      await db.importAll(await file.text());
      toast('Sicherung eingespielt – mit ihrem Passwort entsperren.');
      lockKey();
    } catch (err) {
      toast(err.message || 'Ungültige Sicherung.');
    }
  };
  $('#s-wipe').onclick = async () => {
    const best = await dialog({ titel: 'Notfall-Löschung', text: 'Plan, Tresor, KI-Pläne, Routen und Karten werden unwiderruflich von diesem Gerät gelöscht. Zum Bestätigen LÖSCHEN eintippen.', ok: 'Alles löschen', gefahr: true, eingabe: 'LÖSCHEN' });
    if (best !== 'LÖSCHEN') return;
    await db.wipeAll();
    await caches?.delete('neustart-kacheln').catch(() => {});
    lockKey();
    toast('Alle Daten gelöscht.');
  };

  $('#s-dossier')?.addEventListener('click', () => { location.hash = 'welt'; reise.dossier(zielName, zielName); });
  $('#s-routen')?.addEventListener('click', () => { location.hash = 'welt'; reise.routenPanel(zielName); });
  $('#s-abreise').onchange = async (e) => { await db.updateSettings({ abreise: e.target.value || null }); render({ refreshAll }); };
  $('#s-ziel').onchange = async (e) => { await db.updateSettings({ zielland: e.target.value || null }); reise.zeichneBalken(); render({ refreshAll }); };
  $('#s-gps').onclick = () => {
    if (!navigator.geolocation) { toast('Dieses Gerät kann keinen Standort liefern.'); return; }
    toast('Suche Standort …');
    navigator.geolocation.getCurrentPosition(
      async (p) => { await db.updateSettings({ standort: { lat: p.coords.latitude, lon: p.coords.longitude, at: Date.now() } }); toast('Standort gespeichert'); render({ refreshAll }); },
      (err) => toast(`Standort nicht verfügbar: ${err.message}`),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 600000 },
    );
  };
  $('#s-setzen').onclick = async () => {
    const m = $('#s-manuell').value.match(/(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/);
    const lat = m && parseFloat(m[1].replace(',', '.'));
    const lon = m && parseFloat(m[2].replace(',', '.'));
    if (!m || Math.abs(lat) > 90 || Math.abs(lon) > 180) { toast('Format: Breite, Länge – z. B. 52.02, 8.53'); return; }
    await db.updateSettings({ standort: { lat, lon, at: Date.now() } });
    render({ refreshAll });
  };
  $('#s-alles').onclick = async () => {
    $('#s-alles').disabled = true;
    $('#s-alles').textContent = 'Lade …';
    await refreshAll();
    render({ refreshAll });
  };
}
