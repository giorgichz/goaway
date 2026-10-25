// Weltlage: Reise- und Sicherheitshinweise des Auswärtigen Amts (Open Data).
// Die Liste wird gespeichert; für das Zielland zusätzlich der volle Text,
// damit er offline lesbar bleibt.

import * as db from './db.js';
import { $, esc, ago, fmtDate, fetchChecked, toast } from './util.js';

const API = 'https://www.auswaertiges-amt.de/opendata/travelwarning';
const root = () => $('#lage');
let filter = '';

function parseList(json) {
  const resp = json?.response ?? {};
  return Object.entries(resp)
    .filter(([, v]) => v && typeof v === 'object' && v.countryName)
    .map(([id, v]) => ({
      id,
      name: v.countryName,
      code: v.countryCode,
      warning: !!v.warning,
      partialWarning: !!v.partialWarning,
      situationWarning: !!v.situationWarning,
      situationPartWarning: !!v.situationPartWarning,
      lastModified: v.lastModified ? v.lastModified * (v.lastModified < 1e12 ? 1000 : 1) : null,
    }));
}

function stufe(l) {
  if (l.warning) return { rang: 4, text: 'Reisewarnung', cls: 'bad' };
  if (l.partialWarning) return { rang: 3, text: 'Teilreisewarnung', cls: 'warn' };
  if (l.situationWarning) return { rang: 2, text: 'Lagehinweis', cls: 'warn' };
  if (l.situationPartWarning) return { rang: 1, text: 'Lagehinweis (Teile)', cls: 'info' };
  return { rang: 0, text: 'keine Warnung', cls: 'ok' };
}

// Entfernt Skripte, Styles und Event-Handler aus dem AA-HTML.
function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,img').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => {
    [...n.attributes].forEach((a) => {
      if (a.name.startsWith('on') || a.name === 'style') n.removeAttribute(a.name);
      if (a.name === 'href' && !/^https?:/i.test(a.value)) n.removeAttribute('href');
    });
    if (n.tagName === 'A') { n.target = '_blank'; n.rel = 'noopener'; }
  });
  return doc.body.innerHTML;
}

export async function refresh() {
  const json = await fetchChecked(API);
  const list = parseList(json);
  if (!list.length) throw new Error('Unerwartetes Datenformat vom Auswärtigen Amt.');
  await db.set('lage', { list, fetchedAt: Date.now() });

  const { zielland } = await db.settings();
  const ziel = list.find((l) => l.code === zielland);
  if (ziel) await loadDetail(ziel.id).catch(() => {});
  return list.length;
}

async function loadDetail(id) {
  const json = await fetchChecked(`${API}/${id}`);
  const entry = json?.response?.[id];
  if (!entry?.content) throw new Error('Kein Text gefunden.');
  const details = await db.get('lageDetails', {});
  details[id] = { title: entry.title, content: sanitize(entry.content), fetchedAt: Date.now() };
  await db.set('lageDetails', details);
  return details[id];
}

export async function render() {
  const data = await db.get('lage');
  const details = await db.get('lageDetails', {});
  const { zielland } = await db.settings();
  const el = root();

  if (!data) {
    el.innerHTML = `
      <h2>Weltlage</h2>
      <div class="card"><p>Noch keine Daten gespeichert. Einmal mit Internet laden – danach ist alles offline verfügbar.</p>
      <button id="lage-laden">Jetzt laden</button></div>`;
    $('#lage-laden').onclick = () => doRefresh();
    return;
  }

  const list = data.list.map((l) => ({ ...l, s: stufe(l) }));
  const counts = [4, 3, 2].map((r) => list.filter((l) => l.s.rang === r).length);
  const shown = list
    .filter((l) => !filter || l.name.toLowerCase().includes(filter))
    .sort((a, b) => b.s.rang - a.s.rang || a.name.localeCompare(b.name, 'de'));
  const ziel = list.find((l) => l.code === zielland);

  el.innerHTML = `
    <h2>Weltlage</h2>
    <div class="grid">
      <div class="card"><div class="big" style="color:var(--bad)">${counts[0]}</div><div class="stat">Länder mit Reisewarnung</div></div>
      <div class="card"><div class="big" style="color:var(--warn)">${counts[1]}</div><div class="stat">mit Teilreisewarnung</div></div>
      <div class="card"><div class="big">${counts[2]}</div><div class="stat">mit Lagehinweis</div></div>
    </div>
    ${ziel ? zielCard(ziel, details[ziel.id]) : '<div class="card muted">Tipp: Im „Cockpit“ ein Zielland wählen – dann wird dessen kompletter Lagebericht offline gespeichert.</div>'}
    <div class="card">
      <div class="row" style="margin-bottom:8px">
        <input class="grow" id="lage-suche" placeholder="Land suchen …" value="${esc(filter)}">
        <button class="ghost" id="lage-laden">Aktualisieren</button>
      </div>
      <p class="muted">Quelle: Auswärtiges Amt · Stand ${ago(data.fetchedAt)}</p>
      <ul class="list" id="lage-liste">
        ${shown.map((l) => `
          <li><div class="row">
            <span><strong>${esc(l.name)}</strong><br><span class="muted">geändert ${fmtDate(l.lastModified)}</span></span>
            <span class="row">
              <span class="badge ${l.s.cls}">${l.s.text}</span>
              <button class="ghost small" data-detail="${esc(l.id)}">Bericht</button>
            </span>
          </div><div class="detail" id="d-${esc(l.id)}"></div></li>`).join('')}
      </ul>
    </div>`;

  $('#lage-laden').onclick = () => doRefresh();
  $('#lage-suche').oninput = (e) => {
    filter = e.target.value.toLowerCase();
    render().then(() => { const s = $('#lage-suche'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
  };
  el.querySelectorAll('[data-detail]').forEach((b) => { b.onclick = () => showDetail(b.dataset.detail); });
}

function zielCard(l, detail) {
  return `
    <div class="card">
      <h3>Dein Zielland: ${esc(l.name)} <span class="badge ${l.s.cls}">${l.s.text}</span></h3>
      ${detail
        ? `<p class="muted">Bericht offline gespeichert (${ago(detail.fetchedAt)})</p>
           <details><summary>Bericht lesen</summary><div class="aa-content">${detail.content}</div></details>`
        : '<p class="muted">Bericht noch nicht gespeichert – „Aktualisieren“ drücken, solange du online bist.</p>'}
    </div>`;
}

async function showDetail(id) {
  const box = $(`#d-${CSS.escape(id)}`);
  if (box.innerHTML) { box.innerHTML = ''; return; }
  const details = await db.get('lageDetails', {});
  let d = details[id];
  if (!d) {
    box.innerHTML = '<p class="muted">Lade …</p>';
    try { d = await loadDetail(id); } catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; return; }
  }
  box.innerHTML = `<div class="aa-content card">${d.content}<p class="muted">gespeichert ${ago(d.fetchedAt)}</p></div>`;
}

async function doRefresh() {
  try {
    const n = await refresh();
    toast(`${n} Länder aktualisiert`);
  } catch (err) {
    toast(err.message);
  }
  render();
}
