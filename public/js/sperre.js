// Sperrbildschirm: Master-Passwort anlegen oder entsperren. Ohne Entsperren
// zeigt die App nichts an – persönliche Daten sind nur verschlüsselt gespeichert.

import * as db from './db.js';
import { createMaster, unlockMaster } from './crypto.js';
import { $, toast } from './util.js';

const SHIELD = `<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10 11V9.5a2 2 0 0 1 4 0V11"/></svg>`;

export async function show(onUnlock) {
  const el = $('#sperre');
  el.hidden = false;
  const meta = await db.get('tresorMeta');

  el.innerHTML = meta ? `
    <div class="sperre-box">
      <div class="sperre-icon">${SHIELD}</div>
      <h1>Neustart</h1>
      <p class="muted">Alle Daten sind mit AES-256 verschlüsselt und liegen nur auf diesem Gerät.</p>
      <input type="password" id="sp-pw" placeholder="Master-Passwort" autocomplete="current-password">
      <button id="sp-open">Entsperren</button>
    </div>` : `
    <div class="sperre-box">
      <div class="sperre-icon">${SHIELD}</div>
      <h1>Neustart einrichten</h1>
      <p class="muted">Lege ein Master-Passwort fest. Damit wird alles verschlüsselt: Plan, Budget, Kontakte, KI-Pläne, Standort und Dokumente.</p>
      <p class="warn-text">Es gibt keine Wiederherstellung. Passwort vergessen = alles weg.</p>
      <input type="password" id="sp-pw1" placeholder="Master-Passwort (mind. 10 Zeichen)" autocomplete="new-password">
      <input type="password" id="sp-pw2" placeholder="Wiederholen" autocomplete="new-password">
      <button id="sp-setup">Verschlüsseln & starten</button>
      <details><summary class="muted">Vorhandene Sicherung einspielen</summary>
        <input type="file" id="sp-import" accept=".json,application/json" style="margin-top:8px">
      </details>
    </div>`;

  const done = async () => {
    await db.migratePrivate();
    el.hidden = true;
    el.innerHTML = '';
    onUnlock();
  };

  if (meta) {
    const open = async () => {
      const btn = $('#sp-open');
      btn.disabled = true;
      btn.textContent = 'Entschlüssele …';
      if (await unlockMaster($('#sp-pw').value, meta)) return done();
      toast('Falsches Passwort.');
      btn.disabled = false;
      btn.textContent = 'Entsperren';
      $('#sp-pw').select();
    };
    $('#sp-open').onclick = open;
    $('#sp-pw').onkeydown = (e) => { if (e.key === 'Enter') open(); };
    $('#sp-pw').focus();
    return;
  }

  $('#sp-setup').onclick = async () => {
    const pw = $('#sp-pw1').value;
    if (pw.length < 10) { toast('Bitte mindestens 10 Zeichen.'); return; }
    if (pw !== $('#sp-pw2').value) { toast('Passwörter stimmen nicht überein.'); return; }
    $('#sp-setup').disabled = true;
    await db.set('tresorMeta', await createMaster(pw));
    if (!(await db.get('tresorItems'))) await db.set('tresorItems', []);
    done();
  };
  $('#sp-import').onchange = async (e) => {
    try {
      await db.importAll(await e.target.files[0].text());
      toast('Sicherung eingespielt – jetzt mit ihrem Passwort entsperren.');
    } catch (err) {
      toast(err.message || 'Ungültige Sicherung.');
    }
    show(onUnlock);
  };
}
