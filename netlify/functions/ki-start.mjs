// POST /api/ki/:typ – legt einen KI-Auftrag an und stößt die Background-Function an.
import { getStore } from '@netlify/blobs';
import { starte } from '../../core/jobs.js';
import { fehlerText } from '../../core/ki.js';
import { blobSpeicher, json } from '../lib/netlify.mjs';

export default async (req, context) => {
  if (req.method !== 'POST') return json({ fehler: 'Nur POST.' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const store = blobSpeicher(getStore);
    const id = await starte(store, { typ: context.params.typ, body, zugang: req.headers.get('x-zugang'), ip: context.ip });
    const res = await fetch(new URL('/.netlify/functions/ki-background', req.url), { method: 'POST', body: JSON.stringify({ id }) });
    if (res.status >= 400) throw new Error(`Background-Function antwortet mit ${res.status}`);
    return json({ job: id }, 202);
  } catch (err) {
    const { status, fehler } = fehlerText(err);
    return json({ fehler }, status);
  }
};

export const config = { path: '/api/ki/:typ' };
