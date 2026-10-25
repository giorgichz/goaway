// Notfall: Nummern des Ziellands, eigene Kontakte, medizinische Infos, Sätze.

import * as db from './db.js';
import { $, esc } from './util.js';
import { LAENDER, SAETZE, SPRACHEN } from './laender.js';

const tel = (n) => `<a href="tel:${esc(n.replace(/[^\d+]/g, ''))}">${esc(n)}</a>`;

export async function render() {
  const el = $('#notfall');
  const { zielland } = await db.settings();
  const land = LAENDER[zielland];
  const kontakte = await db.get('kontakte', []);
  const med = await db.get('medizin', '');
  const sprache = await db.get('sprache', 'en');

  el.innerHTML = `
    <h2>Notfall</h2>
    <div class="card">
      <h3>Notrufnummern ${land ? `– ${esc(land.name)}` : ''}</h3>
      ${land
        ? `<table>${Object.entries(land.notruf).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="big" style="font-size:24px">${tel(v)}</td></tr>`).join('')}</table>`
        : `<p>${zielland ? 'Für dieses Land sind keine Nummern hinterlegt.' : 'Im „Cockpit“ ein Zielland wählen.'} In der EU und vielen weiteren Ländern gilt <strong>${tel('112')}</strong>.</p>`}
      <p class="muted">Bitte vor Ort gegenprüfen.</p>
    </div>

    <div class="card">
      <h3>Hilfe für Deutsche im Ausland</h3>
      <p>Bürgerservice des Auswärtigen Amts (rund um die Uhr): ${tel('+49 30 1817 2000')}</p>
      <p class="muted">Die zuständige Botschaft bzw. das Konsulat unten als Kontakt speichern – Adresse und Notfallnummer stehen auf der Website der Botschaft.</p>
    </div>

    <div class="card">
      <h3>Meine Kontakte</h3>
      <ul class="list">${kontakte.map((k, i) => `
        <li><div class="row"><span><strong>${esc(k.name)}</strong><br>${tel(k.nummer)}${k.notiz ? `<br><span class="muted">${esc(k.notiz)}</span>` : ''}</span>
        <button class="ghost" data-kdel="${i}">✕</button></div></li>`).join('') || '<li class="muted">Noch keine Kontakte.</li>'}
      </ul>
      <div class="grid" style="margin-top:8px">
        <input id="k-name" placeholder="Name (z. B. Deutsche Botschaft)">
        <input id="k-nummer" placeholder="Telefonnummer" inputmode="tel">
        <input id="k-notiz" placeholder="Notiz / Adresse">
      </div>
      <button style="margin-top:8px" id="k-add">Kontakt speichern</button>
    </div>

    <div class="card">
      <h3>Medizinische Infos</h3>
      <p class="muted">Blutgruppe, Allergien, Medikamente, Vorerkrankungen. Verschlüsselt gespeichert – für Helfer zusätzlich auf Papier im Portemonnaie tragen.</p>
      <textarea id="med">${esc(med)}</textarea>
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h3 style="margin:0">Wichtige Sätze</h3>
        <select id="sprache" style="width:auto">${Object.entries(SPRACHEN).map(([k, v]) => `<option value="${k}" ${k === sprache ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div>
      <ul class="list">${SAETZE.map((s) => `<li><div class="muted">${esc(s.de)}</div><div style="font-size:18px;font-weight:600">${esc(s[sprache])}</div></li>`).join('')}</ul>
    </div>`;

  $('#k-add').onclick = async () => {
    const k = { name: $('#k-name').value.trim(), nummer: $('#k-nummer').value.trim(), notiz: $('#k-notiz').value.trim() };
    if (!k.name || !k.nummer) return;
    await db.set('kontakte', [...kontakte, k]);
    render();
  };
  el.querySelectorAll('[data-kdel]').forEach((b) => {
    b.onclick = async () => { kontakte.splice(b.dataset.kdel, 1); await db.set('kontakte', kontakte); render(); };
  });
  $('#med').oninput = (e) => db.set('medizin', e.target.value);
  $('#sprache').onchange = async (e) => { await db.set('sprache', e.target.value); render(); };
}
