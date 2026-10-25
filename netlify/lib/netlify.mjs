// Gemeinsames für die Netlify-Funktionen: JSON-Antworten und Blob-Speicher
// mit derselben Schnittstelle wie der Arbeitsspeicher-Speicher des eigenen Servers.

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export function blobSpeicher(getStore) {
  const store = getStore({ name: 'neustart-jobs', consistency: 'strong' });
  return {
    get: (k) => store.get(k, { type: 'json' }),
    set: (k, v) => store.setJSON(k, v),
    del: (k) => store.delete(k),
  };
}
