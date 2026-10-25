// Währungen (EZB-Referenzkurse über frankfurter.dev) plus Budget-Rechner.
// Kurse werden gespeichert; offline rechnet die App mit dem letzten Stand.
// Für Währungen ohne EZB-Kurs (z. B. VND, AED) kann man einen eigenen Kurs eintragen.

import * as db from './db.js';
import { $, esc, ago, fmtNum, fetchChecked, toast } from './util.js';
import { LAENDER } from './laender.js';

const QUELLEN = [
  'https://api.frankfurter.dev/v1/latest?base=EUR',
  'https://api.frankfurter.app/latest?from=EUR',
];

export async function refresh() {
  let lastErr;
  for (const url of QUELLEN) {
    try {
      const json = await fetchChecked(url);
      if (!json?.rates) throw new Error('Unerwartetes Datenformat.');
      await db.set('kurse', { rates: { EUR: 1, ...json.rates }, date: json.date, fetchedAt: Date.now() });
      return Object.keys(json.rates).length;
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

// Alle Kurse relativ zu 1 EUR; eigene Kurse überschreiben die EZB-Werte.
async function allRates() {
  const kurse = await db.get('kurse');
  const eigene = await db.get('eigeneKurse', {});
  return { rates: { EUR: 1, ...(kurse?.rates ?? {}), ...eigene }, kurse, eigene };
}

export async function render() {
  const el = $('#geld');
  const { rates, kurse, eigene } = await allRates();
  const s = await db.settings();
  const zielW = s.zielland ? LAENDER[s.zielland]?.waehrung : null;
  const conv = await db.get('umrechner', { betrag: 100, von: 'EUR', nach: zielW && zielW !== 'EUR' && rates[zielW] ? zielW : 'USD' });
  const budget = await db.get('budget', { start: 5000, posten: [
    { name: 'Miete', betrag: 600 }, { name: 'Essen', betrag: 300 }, { name: 'Krankenversicherung', betrag: 120 },
    { name: 'Handy/Internet', betrag: 30 }, { name: 'Transport', betrag: 60 },
  ] });
  const codes = Object.keys(rates).sort();
  const opts = (sel) => codes.map((c) => `<option ${c === sel ? 'selected' : ''}>${c}</option>`).join('');

  el.innerHTML = `
    <h2>Geld</h2>
    <div class="card">
      <h3>Umrechner</h3>
      <div class="row">
        <input class="grow" type="number" id="g-betrag" value="${esc(conv.betrag)}" step="any">
        <select id="g-von" style="width:100px">${opts(conv.von)}</select>
        <span>→</span>
        <select id="g-nach" style="width:100px">${opts(conv.nach)}</select>
      </div>
      <p class="big" id="g-ergebnis" style="margin-top:12px"></p>
      <p class="muted">${kurse ? `EZB-Kurse vom ${esc(kurse.date)} · geladen ${ago(kurse.fetchedAt)}` : 'Noch keine Kurse geladen – nur eigene Kurse verfügbar.'}</p>
      <button class="ghost" id="g-laden">Kurse aktualisieren</button>
    </div>

    <div class="card">
      <h3>Eigener Kurs</h3>
      <p class="muted">Für Währungen ohne EZB-Kurs oder den echten Wechselstuben-Kurs vor Ort: wie viel bekommst du für 1 EUR?</p>
      <div class="row">
        <input id="ek-code" placeholder="z. B. VND" maxlength="3" style="width:110px;text-transform:uppercase">
        <input class="grow" id="ek-kurs" type="number" step="any" placeholder="Einheiten pro 1 EUR">
        <button id="ek-add">Speichern</button>
      </div>
      ${Object.keys(eigene).length ? `<ul class="list">${Object.entries(eigene).map(([c, k]) => `<li><div class="row"><span>1 EUR = ${fmtNum(k, 4)} ${esc(c)}</span><button class="ghost" data-ek="${esc(c)}">Löschen</button></div></li>`).join('')}</ul>` : ''}
    </div>

    <div class="card">
      <h3>Budget: Wie lange reicht mein Geld?</h3>
      <label>Startkapital in EUR</label>
      <input type="number" id="b-start" value="${esc(budget.start)}" step="any">
      <h3 style="margin-top:12px">Monatliche Kosten (EUR)</h3>
      <div id="b-posten" class="stack">
        ${budget.posten.map((p, i) => `<div class="row"><input class="grow" data-pn="${i}" value="${esc(p.name)}"><input type="number" step="any" style="width:120px" data-pb="${i}" value="${esc(p.betrag)}"><button class="ghost" data-pdel="${i}" aria-label="Entfernen">✕</button></div>`).join('')}
      </div>
      <button class="ghost" id="b-add" style="margin-top:8px">+ Posten</button>
      <div class="grid" style="margin-top:12px" id="b-ergebnis"></div>
    </div>`;

  const calc = () => {
    const betrag = parseFloat($('#g-betrag').value) || 0;
    const von = $('#g-von').value;
    const nach = $('#g-nach').value;
    const res = (betrag / rates[von]) * rates[nach];
    $('#g-ergebnis').textContent = `${fmtNum(res)} ${nach}`;
    db.set('umrechner', { betrag, von, nach });
  };
  ['#g-betrag', '#g-von', '#g-nach'].forEach((id) => { $(id).oninput = calc; });
  calc();

  $('#g-laden').onclick = async () => {
    try { toast(`${await refresh()} Kurse geladen`); } catch (err) { toast(err.message); }
    render();
  };
  $('#ek-add').onclick = async () => {
    const code = $('#ek-code').value.trim().toUpperCase();
    const kurs = parseFloat($('#ek-kurs').value);
    if (!/^[A-Z]{3}$/.test(code) || !(kurs > 0)) { toast('Bitte 3-Buchstaben-Code und Kurs > 0 eingeben.'); return; }
    await db.set('eigeneKurse', { ...eigene, [code]: kurs });
    render();
  };
  el.querySelectorAll('[data-ek]').forEach((b) => {
    b.onclick = async () => { const next = { ...eigene }; delete next[b.dataset.ek]; await db.set('eigeneKurse', next); render(); };
  });

  const zielInfo = zielW && rates[zielW] ? zielW : null;
  const calcBudget = () => {
    const monat = budget.posten.reduce((sum, p) => sum + (Number(p.betrag) || 0), 0);
    const monate = monat > 0 ? budget.start / monat : Infinity;
    $('#b-ergebnis').innerHTML = `
      <div><div class="big">${fmtNum(monat, 0)} €</div><div class="stat">Kosten pro Monat${zielInfo ? ` (≈ ${fmtNum(monat * rates[zielInfo], 0)} ${zielInfo})` : ''}</div></div>
      <div><div class="big" style="color:${monate < 3 ? 'var(--bad)' : monate < 6 ? 'var(--warn)' : 'var(--ok)'}">${Number.isFinite(monate) ? fmtNum(monate, 1) : '∞'}</div><div class="stat">Monate reicht das Geld ohne Einkommen</div></div>`;
    db.set('budget', budget);
  };
  $('#b-start').oninput = (e) => { budget.start = parseFloat(e.target.value) || 0; calcBudget(); };
  el.querySelectorAll('[data-pn]').forEach((i) => { i.oninput = () => { budget.posten[i.dataset.pn].name = i.value; calcBudget(); }; });
  el.querySelectorAll('[data-pb]').forEach((i) => { i.oninput = () => { budget.posten[i.dataset.pb].betrag = parseFloat(i.value) || 0; calcBudget(); }; });
  el.querySelectorAll('[data-pdel]').forEach((b) => { b.onclick = async () => { budget.posten.splice(b.dataset.pdel, 1); await db.set('budget', budget); render(); }; });
  $('#b-add').onclick = async () => { budget.posten.push({ name: 'Neuer Posten', betrag: 0 }); await db.set('budget', budget); render(); };
  calcBudget();
}
