// KI-Kern von Neustart: Prompts, Schemas und die eigentlichen Claude-Aufrufe.
// Wird vom eigenen Server (server.js) und von den Netlify-Funktionen genutzt.
// Inhalte werden weder gespeichert noch geloggt.
//
// Umgebungsvariablen:
//   ANTHROPIC_API_KEY  – Schlüssel für die Claude-API (Pflicht für die KI)
//   NEUSTART_ZUGANG    – Zugangscode, den die App mitschickt (Pflicht für die KI)
//   NEUSTART_MODEL     – optional, Standard claude-opus-5-5

import Anthropic from '@anthropic-ai/sdk';
import { timingSafeEqual } from 'node:crypto';

const MODEL = () => process.env.NEUSTART_MODEL || 'claude-opus-5-5';
const ZUGANG = () => process.env.NEUSTART_ZUGANG || '';
export const kiBereit = () => Boolean(process.env.ANTHROPIC_API_KEY && ZUGANG());
export const LIMIT_PRO_STUNDE = 40;

export class KiFehler extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function zugangOk(code) {
  const a = Buffer.from(String(code ?? ''));
  const b = Buffer.from(ZUGANG());
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

// Prüft Einrichtung und Zugangscode; wirft KiFehler mit passendem Status.
export function pruefeZugang(code) {
  if (!kiBereit()) throw new KiFehler(503, 'KI ist auf dem Server nicht eingerichtet (ANTHROPIC_API_KEY / NEUSTART_ZUGANG fehlen).');
  if (!zugangOk(code)) throw new KiFehler(401, 'Falscher Zugangscode – unter „KI“ → Server-Zugang eintragen.');
}

let client = null;
const claude = () => (client ??= new Anthropic());

// --- Prompts & Schemas -----------------------------------------------------------

export const SYSTEM = `Du bist der KI-Planer der App „Neustart“. Du hilfst Menschen aus Deutschland, ihr bisheriges Leben hinter sich zu lassen und irgendwo neu anzufangen – in einer Großstadt, auf dem Land, auf einer abgelegenen Insel, nomadisch oder als kurzfristige Notfall-Ausreise.

So arbeitest du:
- Antworte auf Deutsch, direkt, konkret und ehrlich. Nenne echte Zahlen (Kosten in EUR, Fristen in Tagen), Orte, Behörden und Schritte statt Allgemeinplätzen.
- Plane realistisch für das genannte Geld und den Zeitraum. Wenn etwas nicht reicht oder riskant ist, sag es klar und schlage Alternativen vor.
- Denk an das ganze Leben: Aufenthaltsrecht/Visum, Wohnen, Arbeit/Einkommen, Geld/Bank, Krankenversicherung, Sprache, soziale Kontakte, Sicherheit, Gesundheit, Kommunikation, Rückfalloptionen.
- Ein sauberer Neuanfang ist ein legaler: Nimm Pflichten in Deutschland immer auf (Abmeldung beim Bürgeramt, Rundfunkbeitrag, Krankenkasse, Finanzamt, Verträge). Hilf nicht bei falschen Identitäten, dem Umgehen von Haftbefehlen, Gerichtsentscheidungen, Unterhalts- oder Sorgerechtspflichten oder dem Verstecken vor Gläubigern – erkläre stattdessen den legalen Weg (z. B. Schuldnerberatung, Insolvenz).
- Wer vor einer gefährlichen Person flieht, hat legale Schutzmöglichkeiten: Auskunftssperre im Melderegister (§ 51 BMG), Hilfetelefon Gewalt gegen Frauen 116 016, Weisser Ring 116 006, Polizei 110. Weise darauf hin, wenn es passt.
- Wenn jemand Anzeichen einer seelischen Krise oder Suizidgedanken zeigt, geh einfühlsam darauf ein und nenne die Telefonseelsorge (0800 111 0 111 oder 0800 111 0 222, rund um die Uhr, anonym).
- Visa- und Einreiseregeln ändern sich. Markiere solche Angaben als „bitte bei der Botschaft/offiziellen Stelle prüfen“.`;

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titel', 'zusammenfassung', 'phasen', 'budget', 'erste_72_stunden', 'risiken', 'rechtliches', 'notfallplan', 'packliste'],
  properties: {
    titel: { type: 'string' },
    zusammenfassung: { type: 'string' },
    phasen: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['phase', 'tage', 'items'],
        properties: {
          phase: { type: 'string' },
          tage: { type: 'integer', description: 'Fälligkeit relativ zum Abreisetag (negativ = vorher, positiv = nach der Ankunft)' },
          items: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    budget: {
      type: 'object',
      additionalProperties: false,
      required: ['startkapital_eur', 'posten'],
      properties: {
        startkapital_eur: { type: 'number' },
        posten: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'betrag_eur'],
            properties: { name: { type: 'string' }, betrag_eur: { type: 'number', description: 'monatliche Kosten in EUR' } },
          },
        },
      },
    },
    erste_72_stunden: { type: 'array', items: { type: 'string' } },
    risiken: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['risiko', 'gegenmassnahme'],
        properties: { risiko: { type: 'string' }, gegenmassnahme: { type: 'string' } },
      },
    },
    rechtliches: { type: 'array', items: { type: 'string' } },
    notfallplan: { type: 'array', items: { type: 'string' } },
    packliste: { type: 'array', items: { type: 'string' } },
  },
};

const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const str = { type: 'string' };
const int = { type: 'integer' };
const num = { type: 'number' };
const arr = (items) => ({ type: 'array', items });

const ROUTEN_SCHEMA = obj({
  routen: arr(obj({
    titel: str,
    typ: { type: 'string', enum: ['schnell', 'guenstig', 'ruhig', 'abenteuer', 'sicher'] },
    dauer_tage: int,
    kosten_eur: num,
    zusammenfassung: str,
    vorteile: arr(str),
    nachteile: arr(str),
    stopps: arr(obj({
      name: str,
      land: str,
      lat: num,
      lon: num,
      tag: { type: 'integer', description: 'Ankunftstag relativ zum Start (Start = 0)' },
      naechte: { type: 'integer', description: 'Übernachtungen an diesem Stopp (0 = nur Durchreise)' },
      verkehrsmittel: { type: 'string', enum: ['start', 'flug', 'zug', 'bus', 'faehre', 'auto', 'zu_fuss'], description: 'Wie man diesen Stopp vom vorherigen erreicht' },
      iata: { type: 'string', description: 'IATA-Code des Flughafens bei Flug, sonst leer' },
      info: { type: 'string', description: '1–2 Sätze: was dieser Ort ist und warum er auf der Route liegt' },
    })),
  })),
});

const DOSSIER_SCHEMA = obj({
  name: str,
  land: str,
  kurzinfo: str,
  aktuell: arr(str),
  geschichte: str,
  vorteile: arr(str),
  nachteile: arr(str),
  lebenshaltung: str,
  wohnen: str,
  arbeit: str,
  visum_fuer_deutsche: str,
  sicherheit: str,
  klima: str,
  sprache: str,
  gesundheit: str,
  internet_strom: str,
  menschen: { type: 'string', description: 'Einwohner, Dichte, wie belebt oder einsam' },
  tipps: arr(str),
  eignung: obj({ ruhe: int, kosten: int, sicherheit: int, jobs: int, natur: int }),
});

const SUCHE_SCHEMA = obj({
  zusammenfassung: str,
  ergebnisse: arr(obj({
    titel: str,
    untertitel: { type: 'string', description: 'z. B. Airline + Flugdauer, Stadtteil, Arbeitgeber' },
    preis: { type: 'string', description: 'Preis oder Spanne mit Währung, leer wenn unbekannt' },
    details: arr(str),
    vorteile: arr(str),
    nachteile: arr(str),
    quelle: { type: 'string', description: 'URL der Fundstelle oder leer' },
  })),
  tipps: arr(str),
});

const THEMEN = {
  fluege: 'Flugverbindungen (Airlines, Direkt/Umstieg, Dauer, typische Preise für das Datum, Abflughäfen, Gepäck) – nenne konkrete Verbindungen',
  unterkuenfte: 'Unterkünfte für die ersten Wochen (Hostels, Pensionen, Apartments, Langzeit-Rabatte) mit Preisen pro Nacht und Lage',
  wohnungen: 'Langfristige Mietwohnungen und WG-Zimmer: typische Mieten nach Stadtteil, Portale vor Ort, Kaution, Ablauf, Fallstricke',
  jobs: 'Jobs und Einkommen: Branchen mit Bedarf, konkrete aktuelle Stellenangebote oder Arbeitgeber, Gehälter, Remote-Optionen, Arbeit gegen Unterkunft',
  visum: 'Einreise, Aufenthalt und Papiere für Deutsche: Visum, Anmeldung, Steuernummer, Krankenversicherung, Bankkonto – Schritt für Schritt mit Behörden',
  kosten: 'Lebenshaltungskosten: Miete, Lebensmittel, Transport, Strom/Internet, Gesundheit – mit konkreten Preisen und Monatsbudget',
  frei: 'die Frage des Nutzers',
};

// --- Aufrufe -------------------------------------------------------------------

const basis = () => ({
  model: MODEL(),
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
});
const kontextText = (k) => `Daten aus der App des Nutzers (JSON):\n${JSON.stringify(k ?? {}, null, 2)}`;
const kurz = (s, n) => String(s ?? '').slice(0, n);

function quellenAus(content) {
  const quellen = new Map();
  content.filter((b) => b.type === 'text').flatMap((b) => b.citations ?? [])
    .forEach((c) => { if (c.url) quellen.set(c.url, { url: c.url, titel: c.title }); });
  return [...quellen.values()].slice(0, 12);
}

const textAus = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

// Aufruf mit Websuche, inklusive Fortsetzung bei pause_turn.
async function mitWebsuche({ system, messages, effort = 'low', maxUses = 5 }) {
  const params = {
    ...basis(),
    max_tokens: 16000,
    system,
    output_config: { effort },
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxUses }],
    messages,
  };
  let msg = await claude().beta.messages.create(params);
  for (let i = 0; i < 3 && msg.stop_reason === 'pause_turn'; i++) {
    params.messages = [...params.messages, { role: 'assistant', content: msg.content }];
    msg = await claude().beta.messages.create(params);
  }
  if (msg.stop_reason === 'refusal') throw new KiFehler(422, 'Die KI hat diese Anfrage abgelehnt. Bitte anders formulieren.');
  return { text: textAus(msg.content), quellen: quellenAus(msg.content) };
}

async function strukturiert(schema, inhalt, effort = 'medium') {
  const msg = await claude().beta.messages.create({
    ...basis(),
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: inhalt }],
  });
  if (msg.stop_reason === 'refusal') throw new KiFehler(422, 'Die KI hat diese Anfrage abgelehnt. Bitte anders formulieren.');
  if (msg.stop_reason === 'max_tokens') throw new KiFehler(502, 'Die Antwort wurde zu lang – bitte enger fassen.');
  return JSON.parse(textAus(msg.content));
}

const ort = (o) => (o && Number.isFinite(o.lat) && Number.isFinite(o.lon)
  ? `${kurz(o.name, 120) || 'aktueller Standort'} (${o.lat.toFixed(1)}, ${o.lon.toFixed(1)})`
  : 'Deutschland');

async function plan(b) {
  const befehl = kurz(b.befehl, 4000).trim();
  if (!befehl) throw new KiFehler(400, 'Befehl fehlt.');
  const plan = await strukturiert(PLAN_SCHEMA, `${kontextText(b.kontext)}

Szenario: ${kurz(b.szenario, 100)}

Befehl: ${befehl}

Erstelle daraus einen vollständigen, umsetzbaren Neustart-Plan. Phasen in zeitlicher Reihenfolge (z. B. -90, -30, -7, 0, +7, +30, +90 Tage), pro Phase 4–10 konkrete Aufgaben.`);
  return { plan };
}

async function chat(b) {
  const verlauf = Array.isArray(b.verlauf) ? b.verlauf.slice(-20) : [];
  const messages = verlauf
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text)
    .map((m) => ({ role: m.role, content: kurz(m.text, 8000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages.at(-1).role !== 'user') throw new KiFehler(400, 'Frage fehlt.');
  return mitWebsuche({ system: `${SYSTEM}\n\n${kontextText(b.kontext)}`, messages, effort: 'medium' });
}

async function route(b) {
  const ziel = kurz(b.ziel, 300).trim();
  if (!ziel) throw new KiFehler(400, 'Ziel fehlt.');
  return strukturiert(ROUTEN_SCHEMA, `${kontextText(b.kontext)}

Start: ${ort(b.von)}
Ziel: ${ziel}
Startdatum: ${kurz(b.datum, 20) || 'flexibel'}
Wünsche: ${kurz(b.wuensche, 1000) || 'keine'}

Plane genau 3 unterschiedliche, realistische Routen vom Start zum Ziel (z. B. schnell, günstig, ruhig/unauffällig – passend zu den Wünschen).
Jede Route beginnt mit dem Startort (verkehrsmittel "start", tag 0) und endet am Ziel. Nutze echte Flughäfen (IATA), Bahnhöfe, Fährhäfen und realistische Koordinaten.
Kosten pro Person in EUR inklusive Unterkünften unterwegs. Halte die Stopps auf 2–8 pro Route.`);
}

async function dossier(b) {
  const name = kurz(b.name, 200).trim();
  if (!name) throw new KiFehler(400, 'Ort fehlt.');
  const lage = `${name}${Number.isFinite(b.lat) ? ` (${b.lat.toFixed(2)}, ${b.lon.toFixed(2)})` : ''}`;
  const r = await mitWebsuche({
    system: SYSTEM,
    messages: [{ role: 'user', content: `Recherchiere die aktuelle Lage (letzte 12 Monate) für ${lage}: Sicherheit, politische Lage, Kosten und Mieten, Jobs und Wirtschaft, Visum/Aufenthalt für Deutsche, wichtige Nachrichten. Stichpunkte mit Monat/Jahr.` }],
    maxUses: 4,
  }).catch((err) => (err instanceof KiFehler ? { text: '', quellen: [] } : Promise.reject(err)));
  const dossierDaten = await strukturiert(DOSSIER_SCHEMA, `${kontextText(b.kontext)}

Erstelle ein ehrliches Dossier über ${lage} für jemanden aus Deutschland, der dort neu anfangen will.
"aktuell": die wichtigsten aktuellen Punkte aus der Recherche (mit Monat/Jahr). "geschichte": kurze Einordnung der Vergangenheit.
"eignung": Werte 1–5 (5 = sehr gut) für Ruhe, Kosten (5 = günstig), Sicherheit, Jobs, Natur.

Aktuelle Recherche:
${r.text || '(keine aktuellen Daten verfügbar – kennzeichne Angaben als möglicherweise veraltet)'}`);
  return { dossier: dossierDaten, quellen: r.quellen };
}

// Recherche direkt in der App: Flüge, Unterkünfte, Wohnungen, Jobs, Visum, Kosten.
async function suche(b) {
  const thema = THEMEN[b.thema] ? b.thema : 'frei';
  const ortName = kurz(b.ort, 200).trim();
  const details = kurz(b.details, 1000).trim();
  if (!ortName && !details) throw new KiFehler(400, 'Ort oder Frage fehlt.');
  const auftrag = `Thema: ${THEMEN[thema]}
Ort/Ziel: ${ortName || '–'}
Start: ${ort(b.von)}
Datum: ${kurz(b.datum, 20) || 'flexibel'}
Details/Frage: ${details || '–'}`;
  const r = await mitWebsuche({
    system: SYSTEM,
    messages: [{ role: 'user', content: `Recherchiere aktuell im Web und sammle konkrete Fakten mit Preisen, Namen und Fundstellen (URL) zu:\n${auftrag}` }],
    maxUses: 6,
  });
  const daten = await strukturiert(SUCHE_SCHEMA, `${kontextText(b.kontext)}

${auftrag}

Bereite die folgende Recherche als 4–10 konkrete Ergebnisse auf (Titel, Untertitel, Preis, Details, Vor- und Nachteile, Quelle-URL aus der Recherche). Erfinde keine Angebote; wenn Preise Schätzungen sind, schreibe „ca.“.

Recherche:
${r.text}`, 'low');
  return { ...daten, quellen: r.quellen };
}

const AUFGABEN = { plan, chat, route, dossier, suche };
export const TYPEN = Object.keys(AUFGABEN);

export async function fuehreAus(typ, body) {
  const fn = AUFGABEN[typ];
  if (!fn) throw new KiFehler(404, 'Unbekannte Aufgabe.');
  return fn(body ?? {});
}

export function fehlerText(err) {
  if (err instanceof KiFehler) return { status: err.status, fehler: err.message };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, fehler: 'Die KI ist gerade ausgelastet – bitte gleich nochmal.' };
  if (err instanceof Anthropic.AuthenticationError) return { status: 502, fehler: 'Der API-Schlüssel auf dem Server ist ungültig.' };
  if (err instanceof Anthropic.APIError) return { status: 502, fehler: `KI-Fehler (${err.status ?? 'Netz'}).` };
  if (err instanceof SyntaxError) return { status: 502, fehler: 'Die KI-Antwort war unvollständig – bitte erneut versuchen.' };
  console.error('KI-Fehler:', err?.name);
  return { status: 500, fehler: 'Unerwarteter Serverfehler.' };
}
