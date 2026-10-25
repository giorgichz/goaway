// Auswander-Checkliste mit Fristen relativ zum Abreisedatum.

import * as db from './db.js';
import { $, esc, fmtDate, dialog } from './util.js';

// tage: Fälligkeit relativ zur Abreise (negativ = vorher).
const VORLAGE = [
  { phase: '3 Monate vorher', tage: -90, items: [
    'Reisepass prüfen – mindestens 6 Monate über die geplante Einreise hinaus gültig, sonst neu beantragen',
    'Einreise- und Aufenthaltsregeln des Ziellands klären (Visum, Arbeitserlaubnis, Aufenthaltstitel)',
    'Mietvertrag fristgerecht kündigen (meist 3 Monate Kündigungsfrist)',
    'Laufende Verträge sammeln und Kündigungsfristen prüfen (Handy, Internet, Strom, Fitness, Abos)',
    'Krankenversicherung fürs Ausland klären (Auslandskrankenversicherung oder Versicherung im Zielland)',
    'Mit der Bank klären, ob das Konto bei Wohnsitz im Ausland weitergeführt wird',
    'Finanzamt: steuerliche Folgen des Wegzugs klären (ggf. Steuerberatung)',
  ] },
  { phase: '1 Monat vorher', tage: -30, items: [
    'Verträge kündigen (Briefe-Bereich nutzen)',
    'Wichtige Dokumente scannen und im Tresor ablegen (Pass, Ausweis, Geburtsurkunde, Zeugnisse, Impfpass)',
    'Beglaubigte Kopien bzw. Apostillen für wichtige Urkunden besorgen',
    'Internationalen Führerschein beantragen (falls nötig)',
    'Arzt- und Zahnarzttermine wahrnehmen, Medikamentenvorrat und Rezepte besorgen',
    'Deutsche Rentenversicherung: Versicherungskonto klären, neue Adresse mitteilen',
    'Kreditkarte besorgen, die im Ausland ohne Gebühren funktioniert',
  ] },
  { phase: 'Letzte Woche', tage: -7, items: [
    'Abmeldung beim Bürgeramt (frühestens 1 Woche vor, spätestens 2 Wochen nach Auszug) – Abmeldebescheinigung aufbewahren',
    'Rundfunkbeitrag mit der Abmeldebescheinigung abmelden',
    'Nachsendeauftrag bei der Post einrichten',
    'In die Krisenvorsorgeliste ELEFAND des Auswärtigen Amts eintragen',
    'Wohnungsübergabe mit Protokoll, Kaution zurückfordern',
    'Offline-Karten fürs Zielland laden (z. B. Organic Maps), Übersetzer-Sprachpaket laden',
    'In dieser App: alles einmal online aktualisieren (Lage, Kurse, Satelliten)',
  ] },
  { phase: 'Nach der Ankunft', tage: 14, items: [
    'Am neuen Wohnort anmelden bzw. Aufenthalt registrieren',
    'Lokale SIM-Karte besorgen',
    'Lokales Bankkonto eröffnen',
    'Steuer- bzw. Sozialversicherungsnummer im Zielland beantragen',
    'Krankenversicherung vor Ort abschließen bzw. aktivieren',
    'Adresse der deutschen Botschaft/des Konsulats notieren (Notfall-Bereich)',
    'Neue Adresse bei Bank, Versicherungen und Rentenversicherung hinterlegen',
  ] },
];

export async function load() {
  let plan = await db.get('plan');
  if (!plan) {
    plan = VORLAGE.map((p) => ({ ...p, items: p.items.map((text) => ({ text, done: false })) }));
    await db.set('plan', plan);
  }
  return plan;
}

export async function render() {
  const el = $('#plan');
  const plan = await load();
  const { abreise } = await db.settings();
  const all = plan.flatMap((p) => p.items);
  const done = all.filter((i) => i.done).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const heute = new Date().setHours(0, 0, 0, 0);

  el.innerHTML = `
    <h2>Plan</h2>
    <div class="card">
      <div class="row" style="justify-content:space-between"><strong>${done} von ${all.length} erledigt</strong><span>${pct} %</span></div>
      <div class="progress" style="margin-top:8px"><div style="width:${pct}%"></div></div>
      ${abreise ? '' : '<p class="muted" style="margin-top:8px">Trage im „Cockpit“ dein Abreisedatum ein, dann bekommt jede Phase eine Frist.</p>'}
    </div>
    ${plan.map((p, pi) => {
      const frist = abreise ? new Date(abreise).getTime() + p.tage * 86400000 : null;
      const offen = p.items.some((i) => !i.done);
      const ueberfaellig = frist && offen && frist < heute;
      return `
      <div class="card">
        <h3>${esc(p.phase)} ${frist ? `<span class="${ueberfaellig ? 'overdue' : 'muted'}" style="font-weight:500">· bis ${fmtDate(frist)}${ueberfaellig ? ' (überfällig)' : ''}</span>` : ''}</h3>
        <div class="stack">
          ${p.items.map((it, ii) => `
            <div class="check ${it.done ? 'done' : ''}">
              <input type="checkbox" id="c-${pi}-${ii}" data-p="${pi}" data-i="${ii}" ${it.done ? 'checked' : ''}>
              <label for="c-${pi}-${ii}" class="txt" style="color:inherit;font-size:15px;margin:0;flex:1">${esc(it.text)}</label>
              ${it.eigen ? `<button class="ghost small" data-del="${pi}-${ii}" aria-label="Löschen">✕</button>` : ''}
            </div>`).join('')}
        </div>
        <div class="row" style="margin-top:10px">
          <input class="grow" placeholder="Eigenen Punkt hinzufügen …" data-neu="${pi}">
          <button class="ghost" data-add="${pi}">+</button>
        </div>
      </div>`;
    }).join('')}
    <button class="ghost" id="plan-reset">Liste auf Vorlage zurücksetzen</button>`;

  el.querySelectorAll('input[type=checkbox][data-p]').forEach((c) => {
    c.onchange = async () => { plan[c.dataset.p].items[c.dataset.i].done = c.checked; await db.set('plan', plan); render(); };
  });
  const add = async (pi) => {
    const input = el.querySelector(`[data-neu="${pi}"]`);
    const text = input.value.trim();
    if (!text) return;
    plan[pi].items.push({ text, done: false, eigen: true });
    await db.set('plan', plan);
    render();
  };
  el.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => add(b.dataset.add); });
  el.querySelectorAll('[data-neu]').forEach((i) => { i.onkeydown = (e) => { if (e.key === 'Enter') add(i.dataset.neu); }; });
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => { const [pi, ii] = b.dataset.del.split('-'); plan[pi].items.splice(ii, 1); await db.set('plan', plan); render(); };
  });
  $('#plan-reset').onclick = async () => {
    if (!(await dialog({ titel: 'Plan zurücksetzen?', text: 'Alle Haken und eigenen Punkte werden gelöscht.', ok: 'Zurücksetzen', gefahr: true }))) return;
    await db.del('plan');
    render();
  };
}
