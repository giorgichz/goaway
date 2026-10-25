// KI-Planer: ein Befehl → kompletter Plan. Dazu ein Chat mit Websuche.
// Die KI läuft auf dem eigenen Neustart-Server (der API-Schlüssel liegt dort),
// gespeicherte Pläne und der Chatverlauf bleiben verschlüsselt auf dem Gerät.

import * as db from './db.js';
import { $, esc, fmtDateTime, toast, dialog } from './util.js';
import { LAENDER } from './laender.js';
import { load as loadPlan } from './plan.js';

const SZENARIEN = {
  stadt: 'Großstadt',
  land: 'Kleinstadt / Land',
  abgelegen: 'Abgelegen / Insel',
  sofort: 'Sofort weg (Notfall, Tage)',
  nomade: 'Unterwegs / nomadisch',
};
const BEISPIELE = [
  'Plane meinen Neustart in Lissabon in 8 Wochen mit 7000 €, ich bin Elektriker und spreche Englisch.',
  'Ich muss innerhalb von 10 Tagen raus aus Deutschland, 3000 €, egal wohin, Hauptsache sicher und günstig.',
  'Plane ein ruhiges Leben auf einer Insel in Griechenland ab Frühling, Remote-Job als Grafiker, 12 000 € Rücklagen.',
];
let szenario = 'stadt';
let busy = false;
let offeneFrage = null;

// Von anderen Bereichen (z. B. Karte): Frage an die KI schicken und hinwechseln.
export function frageStellen(text) {
  offeneFrage = text;
  if (location.hash === '#ki') render();
  else location.hash = '#ki';
}

// KI-Aufträge laufen im Hintergrund (Netlify: Background-Function, eigener Server:
// asynchron). Die App startet den Auftrag und fragt alle 2 s nach dem Ergebnis.
// Während ein Auftrag läuft, zeigt die Statusleiste „KI arbeitet“.
let laufend = 0;
const melde = () => window.dispatchEvent(new CustomEvent('ki-status', { detail: { laufend } }));

async function anfrage(url, zugang, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', 'x-zugang': zugang, ...(init.headers ?? {}) }, cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.fehler || `Server antwortet mit ${res.status}`);
  return json;
}

export async function api(path, body) {
  if (!navigator.onLine) throw new Error('Die KI braucht Internet. Gespeicherte Ergebnisse bleiben offline lesbar.');
  const zugang = await db.get('kiZugang', '');
  if (!zugang) throw new Error('Zuerst unter „KI“ den Zugangscode deines Servers eintragen.');
  laufend += 1;
  melde();
  try {
    const { job } = await anfrage(`api/ki/${path}`, zugang, { method: 'POST', body: JSON.stringify(body) });
    const ende = Date.now() + 8 * 60000;
    while (Date.now() < ende) {
      await new Promise((r) => setTimeout(r, 2000));
      const stand = await anfrage(`api/job/${job}`, zugang);
      if (stand.status === 'fertig') return stand.ergebnis;
      if (stand.status === 'fehler') throw new Error(stand.fehler);
    }
    throw new Error('Die KI braucht ungewöhnlich lange – bitte später erneut versuchen.');
  } finally {
    laufend -= 1;
    melde();
  }
}

// Was die KI über dich wissen darf: nur Planungsdaten, nie Tresor oder Kontakte.
export async function kontext() {
  const s = await db.settings();
  const budget = await db.get('budget');
  const plan = await loadPlan();
  const lage = await db.get('lage');
  const items = plan.flatMap((p) => p.items);
  const ziel = lage?.list.find((l) => l.code === s.zielland);
  return {
    heute: new Date().toISOString().slice(0, 10),
    zielland: s.zielland ? (LAENDER[s.zielland]?.name ?? ziel?.name ?? s.zielland) : null,
    abreise: s.abreise ?? null,
    budget: budget ? { startkapital_eur: budget.start, monatlich_eur: budget.posten.reduce((a, p) => a + (Number(p.betrag) || 0), 0) } : null,
    plan_fortschritt: `${items.filter((i) => i.done).length}/${items.length}`,
    lage_zielland: ziel ? { reisewarnung: ziel.warning, teilreisewarnung: ziel.partialWarning } : null,
  };
}

export async function render() {
  const el = $('#ki');
  const plaene = await db.get('kiPlaene', []);
  const chat = await db.get('kiChat', []);
  const zugang = await db.get('kiZugang', '');

  el.innerHTML = `
    <h2>KI-Planer</h2>
    <div class="card stack">
      <h3>Ein Befehl. Ein ganzer Plan.</h3>
      <div class="row">${Object.entries(SZENARIEN).map(([k, v]) => `<button class="chip ${k === szenario ? 'on' : ''}" data-sz="${k}">${v}</button>`).join('')}</div>
      <textarea id="ki-befehl" placeholder="${esc(BEISPIELE[0])}"></textarea>
      <div class="row">
        <button id="ki-plan" ${busy ? 'disabled' : ''}>${busy ? 'KI plant …' : 'Plan erstellen'}</button>
        <button class="ghost" id="ki-beispiel">Beispiel</button>
      </div>
      <p class="muted">Mitgeschickt werden nur Zielland, Abreise, Budget-Summen und Plan-Fortschritt – nie Tresor, Kontakte oder Standort. Dauert bis zu 1–2 Minuten.</p>
    </div>

    <div id="ki-ergebnis"></div>

    ${plaene.length ? `<div class="card"><h3>Gespeicherte Pläne (verschlüsselt)</h3><ul class="list">
      ${plaene.map((p, i) => `<li><div class="row"><span><strong>${esc(p.plan.titel)}</strong><br><span class="muted">${esc(SZENARIEN[p.szenario] ?? '')} · ${fmtDateTime(p.at)}</span></span>
      <span class="row"><button class="ghost" data-open="${i}">Öffnen</button><button class="ghost" data-pdel="${i}">✕</button></span></div></li>`).join('')}
    </ul></div>` : ''}

    <div class="card">
      <h3>Frag die KI</h3>
      <p class="muted">Mit Websuche für aktuelle Infos (Visa, Mieten, Jobs). Antworten immer bei offiziellen Stellen gegenprüfen.</p>
      <div id="ki-chat">${chat.map((m) => `<div class="msg ${m.role}">${esc(m.text)}${m.quellen?.length ? `<div class="muted small" style="margin-top:6px">Quellen: ${m.quellen.map((q) => `<a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.titel || new URL(q.url).hostname)}</a>`).join(' · ')}</div>` : ''}</div>`).join('')}</div>
      <div class="row"><textarea class="grow" id="ki-frage" style="min-height:60px" placeholder="z. B. Welche Visa-Optionen habe ich als Deutscher in Kanada?"></textarea></div>
      <div class="row" style="margin-top:8px">
        <button id="ki-senden" ${busy ? 'disabled' : ''}>Senden</button>
        ${chat.length ? '<button class="ghost" id="ki-reset">Verlauf löschen</button>' : ''}
      </div>
    </div>

    <div class="card">
      <h3>Server-Zugang</h3>
      <p class="muted">Der Zugangscode schützt deinen KI-Server vor fremder Nutzung. Er wird verschlüsselt gespeichert.</p>
      <div class="row"><input class="grow" type="password" id="ki-zugang" value="${esc(zugang)}" placeholder="Zugangscode"><button class="ghost" id="ki-zugang-ok">Speichern</button></div>
      <p class="muted" id="ki-status"></p>
    </div>`;

  el.querySelectorAll('[data-sz]').forEach((b) => { b.onclick = () => { szenario = b.dataset.sz; el.querySelectorAll('[data-sz]').forEach((x) => x.classList.toggle('on', x === b)); }; });
  $('#ki-beispiel').onclick = () => { $('#ki-befehl').value = BEISPIELE[Math.floor(Math.random() * BEISPIELE.length)]; };
  $('#ki-plan').onclick = erstellePlan;
  $('#ki-senden').onclick = sendeFrage;
  $('#ki-reset')?.addEventListener('click', async () => { await db.set('kiChat', []); render(); });
  $('#ki-zugang-ok').onclick = async () => { await db.set('kiZugang', $('#ki-zugang').value.trim()); toast('Gespeichert'); pruefeServer(); };
  el.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => zeigePlan(plaene[b.dataset.open]); });
  el.querySelectorAll('[data-pdel]').forEach((b) => {
    b.onclick = async () => { plaene.splice(b.dataset.pdel, 1); await db.set('kiPlaene', plaene); render(); };
  });
  pruefeServer();
  if (offeneFrage && !busy) {
    $('#ki-frage').value = offeneFrage;
    offeneFrage = null;
    sendeFrage();
  }
}

async function pruefeServer() {
  const st = $('#ki-status');
  if (!st) return;
  if (!navigator.onLine) { st.textContent = 'Offline – KI nicht erreichbar.'; return; }
  try {
    const res = await fetch('api/status', { cache: 'no-store' });
    const json = await res.json();
    st.textContent = json.ki ? 'KI-Server bereit.' : 'Server läuft, aber die KI ist dort noch nicht eingerichtet.';
  } catch {
    st.textContent = 'Kein KI-Server unter dieser Adresse (z. B. bei rein statischem Hosting).';
  }
}

async function erstellePlan() {
  const befehl = $('#ki-befehl').value.trim();
  if (!befehl) { toast('Schreib deinen Befehl, z. B. Ziel, Zeitraum, Geld, Beruf.'); return; }
  busy = true;
  $('#ki-plan').disabled = true;
  $('#ki-plan').textContent = 'KI plant …';
  try {
    const { plan } = await api('plan', { befehl, szenario: SZENARIEN[szenario], kontext: await kontext() });
    const eintrag = { at: Date.now(), befehl, szenario, plan };
    const plaene = await db.get('kiPlaene', []);
    plaene.unshift(eintrag);
    await db.set('kiPlaene', plaene);
    busy = false;
    await render();
    zeigePlan(eintrag);
  } catch (err) {
    busy = false;
    toast(err.message);
    render();
  }
}

function liste(items) {
  return `<ul style="margin:0;padding-left:20px">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function zeigePlan(eintrag) {
  const p = eintrag.plan;
  const box = $('#ki-ergebnis');
  const summe = p.budget.posten.reduce((a, x) => a + x.betrag_eur, 0);
  box.innerHTML = `
    <div class="card stack">
      <h3>${esc(p.titel)}</h3>
      <p>${esc(p.zusammenfassung)}</p>
      <div class="row">
        <button id="kp-plan">In Plan übernehmen</button>
        <button class="ghost" id="kp-budget">Budget übernehmen</button>
      </div>
    </div>
    <div class="card"><h3>Erste 72 Stunden</h3>${liste(p.erste_72_stunden)}</div>
    ${p.phasen.map((ph) => `<div class="card"><h3>${esc(ph.phase)} <span class="muted" style="font-weight:400">· Tag ${ph.tage > 0 ? '+' : ''}${ph.tage}</span></h3>${liste(ph.items)}</div>`).join('')}
    <div class="card"><h3>Budget</h3>
      <p>Startkapital: <strong>${p.budget.startkapital_eur.toLocaleString('de-DE')} €</strong> · laufend: <strong>${summe.toLocaleString('de-DE')} € / Monat</strong></p>
      <table>${p.budget.posten.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.betrag_eur.toLocaleString('de-DE')} €</td></tr>`).join('')}</table></div>
    <div class="card"><h3>Risiken & Gegenmaßnahmen</h3><table>${p.risiken.map((r) => `<tr><td>${esc(r.risiko)}</td><td>${esc(r.gegenmassnahme)}</td></tr>`).join('')}</table></div>
    <div class="card"><h3>Rechtliches</h3>${liste(p.rechtliches)}</div>
    <div class="card"><h3>Notfallplan</h3>${liste(p.notfallplan)}</div>
    <div class="card"><h3>Packliste</h3>${liste(p.packliste)}</div>`;
  box.scrollIntoView({ behavior: 'smooth' });

  $('#kp-plan').onclick = async () => {
    if (!(await dialog({ titel: 'KI-Plan übernehmen?', text: 'Dein aktueller Plan wird ersetzt. Erledigte Haken gehen verloren.', ok: 'Übernehmen' }))) return;
    const neu = p.phasen.map((ph) => ({ phase: ph.phase, tage: ph.tage, items: ph.items.map((text) => ({ text, done: false })) }));
    await db.set('plan', neu);
    toast('Plan übernommen – siehe „Plan“');
  };
  $('#kp-budget').onclick = async () => {
    await db.set('budget', { start: p.budget.startkapital_eur, posten: p.budget.posten.map((x) => ({ name: x.name, betrag: x.betrag_eur })) });
    toast('Budget übernommen – siehe „Geld“');
  };
}

async function sendeFrage() {
  const frage = $('#ki-frage').value.trim();
  if (!frage) return;
  const chat = await db.get('kiChat', []);
  chat.push({ role: 'user', text: frage });
  await db.set('kiChat', chat);
  busy = true;
  await render();
  $('#ki-senden').textContent = 'KI denkt nach …';
  try {
    const { text, quellen } = await api('chat', { verlauf: chat.slice(-20), kontext: await kontext() });
    chat.push({ role: 'assistant', text, quellen });
    await db.set('kiChat', chat);
  } catch (err) {
    toast(err.message);
  }
  busy = false;
  render();
}
