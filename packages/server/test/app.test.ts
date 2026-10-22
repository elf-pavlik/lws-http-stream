import { describe, expect, it } from 'vitest';
import { splitCborSequence } from '../src/cbor-sequence.ts';
import { createContextDocumentLoader, decodeCborLdItem, stripContext } from '../src/cborld.ts';
import { app } from '../src/app.ts';
import { notificationFixtures } from '../src/notifications.ts';

const origin = 'https://demo.example';
const contextUrl = `${origin}/contexts/lws-v1.jsonld`;
const documentLoader = createContextDocumentLoader(contextUrl);

async function request(path: string, accept?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accept !== undefined) {
    headers.Accept = accept;
  }
  return app.request(`${origin}${path}`, { headers });
}

describe('notification endpoint', () => {
  it('returns deterministic NDJSON with the response-level context link', async () => {
    const response = await request('/notifications?count=3&interval=0', 'application/x-ndjson');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(response.headers.get('x-context-url')).toBe(contextUrl);
    expect(response.headers.get('link')).toBe(
      `<${contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
    );

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.at(-1)).toBe(0x0a);
    const text = new TextDecoder().decode(bytes);
    const lines = text.split('\n');
    expect(lines.at(-1)).toBe('');
    const documents = lines.slice(0, -1).map(line => JSON.parse(line));
    expect(documents).toEqual(notificationFixtures.slice(0, 3));
    expect(documents.map((document: { id: string }) => document.id)).toEqual(
      notificationFixtures.slice(0, 3).map(notification => notification.id),
    );
  });

  it('returns an RFC 8742 CBOR Sequence of CBOR-LD items', async () => {
    const response = await request('/notifications?count=3&interval=0', 'application/cbor-seq');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/cbor-seq');
    expect(response.headers.get('link')).toContain(`<${contextUrl}>`);

    const sequence = new Uint8Array(await response.arrayBuffer());
    const items = splitCborSequence(sequence);
    expect(items).toHaveLength(3);

    const decoded = [];
    for (const item of items) {
      expect(Array.from(item.subarray(0, 3))).toEqual([0xd9, 0xcb, 0x1d]);
      const document = await decodeCborLdItem(item, documentLoader);
      decoded.push(stripContext(document));
    }
    expect(decoded).toEqual(notificationFixtures.slice(0, 3));
  });

  it('carries exactly the same logical notifications in both representations', async () => {
    const count = notificationFixtures.length;
    const [ndjsonResponse, cborResponse] = await Promise.all([
      request(`/notifications?count=${count}&interval=0`, 'application/x-ndjson'),
      request(`/notifications?count=${count}&interval=0`, 'application/cbor-seq'),
    ]);

    const ndjsonText = await ndjsonResponse.text();
    const ndjsonDocuments = ndjsonText
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line));

    const sequence = new Uint8Array(await cborResponse.arrayBuffer());
    const cborDocuments = [];
    for (const item of splitCborSequence(sequence)) {
      const document = await decodeCborLdItem(item, documentLoader);
      cborDocuments.push(stripContext(document));
    }

    expect(cborDocuments).toEqual(ndjsonDocuments);
    expect(cborDocuments.map(document => String(document['id']))).toEqual(
      ndjsonDocuments.map(document => String(document['id'])),
    );
  });

  it('defaults a missing Accept header to NDJSON', async () => {
    const response = await request('/notifications?count=1&interval=0');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
  });

  it('returns 406 for unsupported Accept headers', async () => {
    const response = await request('/notifications', 'application/json');
    expect(response.status).toBe(406);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('accept')).toBe(
      'application/x-ndjson, application/cbor-seq',
    );
    expect(await response.json()).toMatchObject({
      error: 'not_acceptable',
      supported: ['application/x-ndjson', 'application/cbor-seq'],
    });
  });

  it('validates count and interval query parameters', async () => {
    for (const query of [
      'count=0',
      'count=101',
      'count=abc',
      'count=1.5',
      'interval=-1',
      'interval=5001',
      'interval=abc',
    ]) {
      const response = await request(`/notifications?${query}`, 'application/x-ndjson');
      expect(response.status, query).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'invalid_query' });
    }
  });

  it('repeats the fixture sequence for longer streams', async () => {
    const response = await request('/notifications?count=10&interval=0', 'application/x-ndjson');
    const documents = (await response.text())
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(documents).toHaveLength(10);
    expect(documents[8].id).toBe(notificationFixtures[0]!.id);
    expect(documents[9].id).toBe(notificationFixtures[1]!.id);
  });
});

describe('context and health routes', () => {
  it('serves the bundled JSON-LD context at the Link target', async () => {
    const response = await request('/contexts/lws-v1.jsonld');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/ld+json; charset=utf-8');
    const document = await response.json();
    expect(document).toMatchObject({
      '@context': {
        '@version': 1.1,
        Notification: 'lws:Notification',
        storage: { '@id': 'lws:storage', '@type': '@id' },
      },
    });
  });

  it('returns health metadata', async () => {
    const response = await request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      service: 'lws-http-stream',
      representations: ['ndjson', 'cbor-seq'],
      defaultRepresentation: 'ndjson',
      cborldRegistryEntryId: 1,
    });
  });

  it('uses the same Link context for both media types', async () => {
    const [ndjson, cbor] = await Promise.all([
      request('/notifications?count=1&interval=0', 'application/x-ndjson'),
      request('/notifications?count=1&interval=0', 'application/cbor-seq'),
    ]);
    expect(ndjson.headers.get('link')).toBe(cbor.headers.get('link'));
  });
});
