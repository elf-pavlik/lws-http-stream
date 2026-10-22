import { describe, expect, it } from 'vitest';
import { Parser } from 'rdfjs-jelly/browser';
import { decodePlainCborItem } from '../src/cbor.ts';
import { splitCborSequence } from '../src/cbor-sequence.ts';
import { decodeCborLdItem, stripContext } from '../src/cborld.ts';
import { notificationToQuads } from '../src/jelly.ts';
import { app } from '../src/app.ts';
import { LWS_CONTEXT_DOCUMENT, LWS_CONTEXT_VALUE } from '../src/context.ts';
import { notificationFixtures } from '../src/notifications.ts';

const origin = 'https://demo.example';
const contextUrl = `${origin}/contexts/lws-notifications-v1.jsonld`;

async function request(path: string, accept?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accept !== undefined) {
    headers.Accept = accept;
  }
  return app.request(`${origin}${path}`, { headers });
}

function parseNdjson(text: string): Record<string, unknown>[] {
  return text
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

describe('notification endpoint — link-only mode (default)', () => {
  it('returns NDJSON without an inlined context and with only the Link header', async () => {
    const response = await request('/notifications?count=3&interval=0', 'application/x-ndjson');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(response.headers.get('x-context-url')).toBeNull();
    expect(response.headers.get('x-notification-count')).toBeNull();
    expect(response.headers.get('x-notification-interval-ms')).toBeNull();
    expect(response.headers.get('link')).toBe(
      `<${contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
    );

    const documents = parseNdjson(await response.text());
    expect(documents).toEqual(notificationFixtures.slice(0, 3));
    expect(documents.every(document => !('@context' in document))).toBe(true);
  });

  it('returns a plain CBOR Sequence with no CBOR-LD tag and no context', async () => {
    const response = await request('/notifications?count=3&interval=0', 'application/cbor-seq');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/cbor-seq');
    expect(response.headers.get('link')).toContain(`<${contextUrl}>`);

    const sequence = new Uint8Array(await response.arrayBuffer());
    const items = splitCborSequence(sequence);
    expect(items).toHaveLength(3);

    const decoded = items.map(item => {
      expect(Array.from(item.subarray(0, 3))).not.toEqual([0xd9, 0xcb, 0x1d]);
      const document = decodePlainCborItem(item);
      expect(document).not.toHaveProperty('@context');
      return document;
    });
    expect(decoded).toEqual(notificationFixtures.slice(0, 3));
  });

  it('returns a length-delimited Jelly-RDF stream without a Link header', async () => {
    const response = await request('/notifications?count=3&interval=0', 'application/x-jelly-rdf');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-jelly-rdf');
    expect(response.headers.get('link')).toBeNull();

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes[0]).not.toBe(0x0a);
    const messages = new Parser({ messages: true }).parseMessages(bytes);
    expect(messages).toHaveLength(3);
    expect(messages.map(message => message.length)).toEqual(
      notificationFixtures.slice(0, 3).map(notification => notificationToQuads(notification).length),
    );
    expect(
      messages[0]!.some(
        quad =>
          quad.predicate.value ===
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
          quad.object.value === 'https://www.w3.org/ns/lws#Notification',
      ),
    ).toBe(true);
  });

  it('carries exactly the same logical notifications in both representations', async () => {
    const count = notificationFixtures.length;
    const [ndjsonResponse, cborResponse] = await Promise.all([
      request(`/notifications?count=${count}&interval=0`, 'application/x-ndjson'),
      request(`/notifications?count=${count}&interval=0`, 'application/cbor-seq'),
    ]);

    const ndjsonDocuments = parseNdjson(await ndjsonResponse.text());
    const cborDocuments = splitCborSequence(
      new Uint8Array(await cborResponse.arrayBuffer()),
    ).map(item => decodePlainCborItem(item));

    expect(cborDocuments).toEqual(ndjsonDocuments);
  });
});

describe('notification endpoint — inline-context mode', () => {
  it('inlines the Link context value into every NDJSON notification', async () => {
    const response = await request(
      '/notifications?count=3&interval=0&context=inline',
      'application/x-ndjson',
    );
    expect(response.headers.get('link')).toBeNull();
    const documents = parseNdjson(await response.text());
    expect(documents).toHaveLength(3);
    for (const document of documents) {
      expect(document['@context']).toEqual(LWS_CONTEXT_VALUE);
    }
    expect(documents.map(document => stripContext(document))).toEqual(
      notificationFixtures.slice(0, 3),
    );
  });

  it('returns a CBOR-LD sequence with the same inlined context', async () => {
    const response = await request(
      '/notifications?count=3&interval=0&context=inline',
      'application/cbor-seq',
    );
    expect(response.headers.get('link')).toBeNull();
    const items = splitCborSequence(new Uint8Array(await response.arrayBuffer()));
    expect(items).toHaveLength(3);

    const decoded = [];
    for (const item of items) {
      expect(Array.from(item.subarray(0, 3))).toEqual([0xd9, 0xcb, 0x1d]);
      const document = await decodeCborLdItem(item);
      expect(document['@context']).toEqual(LWS_CONTEXT_VALUE);
      decoded.push(stripContext(document));
    }
    expect(decoded).toEqual(notificationFixtures.slice(0, 3));
  });

  it('carries the same logical notifications in both representations', async () => {
    const count = notificationFixtures.length;
    const [ndjsonResponse, cborResponse] = await Promise.all([
      request(`/notifications?count=${count}&interval=0&context=inline`, 'application/x-ndjson'),
      request(`/notifications?count=${count}&interval=0&context=inline`, 'application/cbor-seq'),
    ]);

    const ndjsonDocuments = parseNdjson(await ndjsonResponse.text()).map(stripContext);
    const cborDocuments = [];
    for (const item of splitCborSequence(
      new Uint8Array(await cborResponse.arrayBuffer()),
    )) {
      cborDocuments.push(stripContext(await decodeCborLdItem(item)));
    }

    expect(cborDocuments).toEqual(ndjsonDocuments);
  });

  it('includes the Link context relation only in link-only mode', async () => {
    const [linkOnly, inline] = await Promise.all([
      request('/notifications?count=1&interval=0', 'application/x-ndjson'),
      request('/notifications?count=1&interval=0&context=inline', 'application/x-ndjson'),
    ]);
    expect(linkOnly.headers.get('link')).toBe(
      `<${contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
    );
    expect(inline.headers.get('link')).toBeNull();
  });
});

describe('request validation and routes', () => {
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
      'application/x-ndjson, application/cbor-seq, application/x-jelly-rdf',
    );
    expect(await response.json()).toMatchObject({
      error: 'not_acceptable',
      supported: [
        'application/x-ndjson',
        'application/cbor-seq',
        'application/x-jelly-rdf',
      ],
    });
  });

  it('validates count, interval, and context query parameters', async () => {
    for (const query of [
      'count=0',
      'count=101',
      'count=abc',
      'count=1.5',
      'interval=-1',
      'interval=5001',
      'interval=abc',
      'context=remote',
    ]) {
      const response = await request(`/notifications?${query}`, 'application/x-ndjson');
      expect(response.status, query).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'invalid_query' });
    }
  });

  it('repeats the fixture sequence for longer streams', async () => {
    const response = await request('/notifications?count=10&interval=0', 'application/x-ndjson');
    const documents = parseNdjson(await response.text());
    expect(documents).toHaveLength(10);
    expect(documents[8]!.id).toBe(notificationFixtures[0]!.id);
    expect(documents[9]!.id).toBe(notificationFixtures[1]!.id);
  });
});

describe('context and health routes', () => {
  it('serves the public context URL array at the Link target', async () => {
    const response = await request('/contexts/lws-notifications-v1.jsonld');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/ld+json; charset=utf-8');
    expect(await response.json()).toEqual(LWS_CONTEXT_DOCUMENT);
  });

  it('returns health metadata including context modes', async () => {
    const response = await request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      service: 'lws-http-stream',
      representations: ['ndjson', 'cbor-seq', 'jelly'],
      defaultRepresentation: 'ndjson',
      contextModes: ['link', 'inline'],
      defaultContextMode: 'link',
      cborldRegistryEntryId: 1,
    });
  });
});
