// Dokumenten-Tresor. Nutzt den Master-Schlüssel der App: Dateien und ihre
// Namen werden einzeln mit AES-256-GCM verschlüsselt.

import * as db from './db.js';
import { encrypt, decrypt, encryptJson, decryptJson, encodeText, decodeText } from './crypto.js';
import { $, esc, fmtDate, toast, dialog } from './util.js';

export async function render() {
  const el = $('#tresor');
  const items = await db.get('tresorItems', []);
  const metas = await Promise.all(items.map(async (it) => ({ id: it.id, ...(await decryptJson(it.meta)) })));

  el.innerHTML = `
    <h2>Tresor <span class="badge ok">AES-256 · entsperrt</span></h2>
    <div class="card stack">
      <h3>Dokument hinzufügen</h3>
      <input id="t-name" placeholder="Bezeichnung, z. B. Reisepass Seite 1">
      <input type="file" id="t-file" accept="image/*,application/pdf">
      <textarea id="t-note" placeholder="… oder eine geheime Notiz (PINs, Kontonummern, Zugangsdaten)"></textarea>
      <button id="t-add">Verschlüsselt speichern</button>
    </div>
    <div class="card">
      <h3>${metas.length} Einträge</h3>
      <ul class="list">${metas.map((m) => `
        <li><div class="row">
          <span><strong>${esc(m.name)}</strong><br><span class="muted">${esc(m.type || 'Notiz')} · ${fmtDate(m.date)} · ${Math.ceil((m.size || 0) / 1024)} KB</span></span>
          <span class="row"><button class="ghost" data-view="${m.id}">Ansehen</button><button class="ghost" data-del="${m.id}">Löschen</button></span>
        </div><div id="v-${m.id}"></div></li>`).join('') || '<li class="muted">Noch leer.</li>'}
      </ul>
    </div>
    <p class="muted">Sicherung und Notfall-Löschung findest du im Cockpit unter „System“.</p>`;

  $('#t-add').onclick = addItem;
  el.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => view(b.dataset.view); });
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!(await dialog({ titel: 'Eintrag löschen?', text: 'Das Dokument wird endgültig aus dem Tresor entfernt.', ok: 'Löschen', gefahr: true }))) return;
      await db.set('tresorItems', items.filter((i) => i.id !== b.dataset.del));
      render();
    };
  });
}

async function addItem() {
  const file = $('#t-file').files[0];
  const note = $('#t-note').value;
  const name = $('#t-name').value.trim() || file?.name || 'Notiz';
  if (!file && !note.trim()) { toast('Datei wählen oder Notiz schreiben.'); return; }
  const data = file ? await file.arrayBuffer() : encodeText(note);
  const meta = { name, type: file ? file.type : '', date: Date.now(), size: data.byteLength };
  const item = { id: crypto.randomUUID(), meta: await encryptJson(meta), data: await encrypt(data) };
  const items = await db.get('tresorItems', []);
  items.push(item);
  await db.set('tresorItems', items);
  toast('Verschlüsselt gespeichert');
  render();
}

async function view(id) {
  const box = $(`#v-${id}`);
  if (box.innerHTML) { box.innerHTML = ''; return; }
  const item = (await db.get('tresorItems', [])).find((i) => i.id === id);
  const meta = await decryptJson(item.meta);
  const data = await decrypt(item.data);
  if (!meta.type) {
    box.innerHTML = `<pre class="card" style="white-space:pre-wrap">${esc(decodeText(data))}</pre>`;
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type: meta.type }));
  box.innerHTML = meta.type.startsWith('image/')
    ? `<img class="thumb" src="${url}" alt="${esc(meta.name)}">`
    : `<p><a class="btn ghost" href="${url}" target="_blank" rel="noopener">PDF öffnen</a></p>`;
}
