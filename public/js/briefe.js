// Kündigungsschreiben-Generator. Absenderdaten werden lokal gemerkt.
// Keine Rechtsberatung – Fristen stehen im jeweiligen Vertrag.

import * as db from './db.js';
import { $, esc, toast } from './util.js';

const ARTEN = {
  mobilfunk: 'Mobilfunkvertrag',
  internet: 'Internet-/Festnetzvertrag',
  strom: 'Stromliefervertrag',
  gas: 'Gasliefervertrag',
  fitness: 'Mitgliedschaft im Fitnessstudio',
  versicherung: 'Versicherungsvertrag',
  abo: 'Abonnement',
  verein: 'Vereinsmitgliedschaft',
  miete: 'Mietvertrag über die Wohnung',
};

const FELDER = ['name', 'strasse', 'ort', 'firma', 'fstrasse', 'fort', 'art', 'nummer', 'zeitpunkt', 'datum', 'neueAdresse', 'grund'];

function brief(f) {
  const heute = new Date().toLocaleDateString('de-DE');
  const zum = f.zeitpunkt === 'datum' && f.datum
    ? `zum ${new Date(f.datum).toLocaleDateString('de-DE')}, hilfsweise zum nächstmöglichen Zeitpunkt`
    : 'fristgerecht zum nächstmöglichen Zeitpunkt';
  const vertrag = ARTEN[f.art] ?? 'Vertrag';
  const nr = f.nummer ? ` (${f.art === 'miete' ? 'Mietobjekt' : 'Kunden-/Vertragsnummer'}: ${f.nummer})` : '';
  const grund = f.grund
    ? `\nGrund ist mein dauerhafter Wegzug ins Ausland. Sofern mir deshalb ein Sonderkündigungsrecht zusteht, mache ich hiermit davon Gebrauch.\n`
    : '';
  const extra = f.art === 'miete'
    ? '\nBitte teilen Sie mir einen Termin für die Wohnungsübergabe mit. Die Kaution bitte ich nach Abrechnung auf mein bekanntes Konto zu überweisen.\n'
    : '\nEiner weiteren Nutzung meiner Daten zu Werbezwecken widerspreche ich. Eine Einzugsermächtigung bzw. ein SEPA-Lastschriftmandat widerrufe ich zum Vertragsende.\n';
  const post = f.neueAdresse ? `\nMeine neue Anschrift ab Vertragsende:\n${f.neueAdresse}\n` : '';

  return `${f.name || '[Dein Name]'}
${f.strasse || '[Straße Hausnummer]'}
${f.ort || '[PLZ Ort]'}

${f.firma || '[Firma]'}
${f.fstrasse || '[Straße Hausnummer]'}
${f.fort || '[PLZ Ort]'}

${f.ort ? `${f.ort.replace(/^\d+\s*/, '')}, ` : ''}${heute}

Kündigung: ${vertrag}${nr}

Sehr geehrte Damen und Herren,

hiermit kündige ich den oben genannten ${vertrag} ${zum}.
${grund}${extra}
Bitte bestätigen Sie mir den Eingang dieser Kündigung sowie das Datum des Vertragsendes schriftlich.
${post}
Mit freundlichen Grüßen


______________________
${f.name || '[Dein Name]'}`;
}

export async function render() {
  const el = $('#briefe');
  const f = await db.get('brief', { art: 'mobilfunk', zeitpunkt: 'naechst', grund: true });
  const inp = (k, label, ph = '') => `<div><label for="b-${k}">${label}</label><input id="b-${k}" data-f="${k}" value="${esc(f[k] ?? '')}" placeholder="${esc(ph)}"></div>`;

  el.innerHTML = `
    <h2>Kündigungen</h2>
    <div class="card">
      <div class="grid">
        <div class="stack"><h3>Du</h3>${inp('name', 'Name')}${inp('strasse', 'Straße, Nr.')}${inp('ort', 'PLZ Ort', '33602 Bielefeld')}</div>
        <div class="stack"><h3>Empfänger</h3>${inp('firma', 'Firma')}${inp('fstrasse', 'Straße, Nr. / Postfach')}${inp('fort', 'PLZ Ort')}</div>
      </div>
      <div class="grid" style="margin-top:12px">
        <div><label for="b-art">Vertrag</label><select id="b-art" data-f="art">${Object.entries(ARTEN).map(([k, v]) => `<option value="${k}" ${f.art === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        ${inp('nummer', 'Kunden-/Vertragsnummer')}
        <div><label for="b-zeitpunkt">Zeitpunkt</label><select id="b-zeitpunkt" data-f="zeitpunkt">
          <option value="naechst" ${f.zeitpunkt !== 'datum' ? 'selected' : ''}>nächstmöglich</option>
          <option value="datum" ${f.zeitpunkt === 'datum' ? 'selected' : ''}>zu einem Datum</option></select></div>
        <div><label for="b-datum">Datum</label><input type="date" id="b-datum" data-f="datum" value="${esc(f.datum ?? '')}"></div>
      </div>
      <div style="margin-top:12px"><label for="b-neueAdresse">Neue Adresse (optional)</label><textarea id="b-neueAdresse" data-f="neueAdresse">${esc(f.neueAdresse ?? '')}</textarea></div>
      <label class="row" style="margin-top:8px"><input type="checkbox" data-f="grund" ${f.grund ? 'checked' : ''}> Wegzug ins Ausland als Grund nennen</label>
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:10px">
        <button id="b-print">Drucken / als PDF</button>
        <button class="ghost" id="b-copy">Text kopieren</button>
      </div>
      <div class="letter" id="b-letter"></div>
      <p class="muted" style="margin-top:8px">Keine Rechtsberatung. Kündigungen am besten per Einschreiben oder über das Kündigungsformular („Verträge hier kündigen“) auf der Website des Anbieters senden.</p>
    </div>`;

  const update = () => {
    FELDER.forEach((k) => {
      const i = el.querySelector(`[data-f="${k}"]`);
      if (i) f[k] = i.type === 'checkbox' ? i.checked : i.value;
    });
    $('#b-letter').textContent = brief(f);
    db.set('brief', f);
  };
  el.querySelectorAll('[data-f]').forEach((i) => { i.oninput = update; i.onchange = update; });
  update();

  $('#b-print').onclick = () => window.print();
  $('#b-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(brief(f)); toast('Kopiert'); } catch { toast('Kopieren nicht möglich.'); }
  };
}
