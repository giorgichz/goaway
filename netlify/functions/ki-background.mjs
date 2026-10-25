// Background-Function (bis zu 15 Minuten): führt einen angelegten KI-Auftrag aus.
// Sie bekommt nur die Auftrags-ID; Inhalte liegen im Blob, den ki-start geschrieben hat.
import { getStore } from '@netlify/blobs';
import { bearbeite } from '../../core/jobs.js';
import { blobSpeicher } from '../lib/netlify.mjs';

export default async (req) => {
  const { id } = await req.json().catch(() => ({}));
  if (typeof id === 'string') await bearbeite(blobSpeicher(getStore), id);
};
