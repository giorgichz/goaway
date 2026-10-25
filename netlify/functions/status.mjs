// GET /api/status – ob die KI auf diesem Deployment eingerichtet ist.
import { kiBereit } from '../../core/ki.js';
import { json } from '../lib/netlify.mjs';

export default async () => json({ ki: kiBereit(), host: 'netlify' });

export const config = { path: '/api/status' };
