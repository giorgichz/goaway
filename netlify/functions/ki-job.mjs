// GET /api/job/:id – Stand eines KI-Auftrags; fertige Ergebnisse werden beim Abholen gelöscht.
import { getStore } from '@netlify/blobs';
import { hole } from '../../core/jobs.js';
import { fehlerText } from '../../core/ki.js';
import { blobSpeicher, json } from '../lib/netlify.mjs';

export default async (req, context) => {
  try {
    return json(await hole(blobSpeicher(getStore), context.params.id, req.headers.get('x-zugang')));
  } catch (err) {
    const { status, fehler } = fehlerText(err);
    return json({ fehler }, status);
  }
};

export const config = { path: '/api/job/:id' };
