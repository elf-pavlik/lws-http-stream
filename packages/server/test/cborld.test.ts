import { describe, expect, it } from 'vitest';
import { splitCborSequence } from '../src/cbor-sequence.ts';
import {
  CBORLD_REGISTRY_ENTRY_ID,
  LWS_CONTEXT_DOCUMENT,
  createContextDocumentLoader,
  decodeCborLdItem,
  encodeCborLdNotification,
  stripContext,
  toCborLdDocument,
} from '../src/cborld.ts';
import { notificationFixtures } from '../src/notifications.ts';

const contextUrl = 'https://demo.example/contexts/lws-v1.jsonld';
const documentLoader = createContextDocumentLoader(contextUrl);

describe('CBOR-LD encoding', () => {
  it('uses the default registry with compression enabled', async () => {
    expect(CBORLD_REGISTRY_ENTRY_ID).toBe(1);
    const notification = notificationFixtures[0]!;
    const bytes = await encodeCborLdNotification(notification, contextUrl, documentLoader);

    expect(Array.from(bytes.subarray(0, 3))).toEqual([0xd9, 0xcb, 0x1d]);
    expect(bytes.length).toBeGreaterThan(10);
    expect(bytes.length).toBeLessThan(
      new TextEncoder().encode(JSON.stringify(notification)).length,
    );
  });

  it('round-trips every fixture with the shared context loader', async () => {
    for (const notification of notificationFixtures) {
      const bytes = await encodeCborLdNotification(notification, contextUrl, documentLoader);
      const decoded = await decodeCborLdItem(bytes, documentLoader);
      expect(decoded['@context']).toBe(contextUrl);
      expect(stripContext(decoded)).toEqual(notification);
    }
  });

  it('materializes the Link context into the document handed to the encoder', () => {
    const notification = notificationFixtures[1]!;
    expect(toCborLdDocument(notification, contextUrl)).toEqual({
      '@context': contextUrl,
      ...notification,
    });
  });

  it('concatenates items as an RFC 8742 sequence without delimiters', async () => {
    const selected = notificationFixtures.slice(0, 3);
    const items = await Promise.all(
      selected.map(notification =>
        encodeCborLdNotification(notification, contextUrl, documentLoader),
      ),
    );

    const total = items.reduce((sum, item) => sum + item.length, 0);
    const sequence = new Uint8Array(total);
    let offset = 0;
    for (const item of items) {
      sequence.set(item, offset);
      offset += item.length;
    }

    const framed = splitCborSequence(sequence);
    expect(framed).toHaveLength(selected.length);
    expect(framed.map(item => item.length)).toEqual(items.map(item => item.length));

    for (let index = 0; index < framed.length; index += 1) {
      const decoded = await decodeCborLdItem(framed[index]!, documentLoader);
      expect(stripContext(decoded)).toEqual(selected[index]);
    }
  });
});

describe('context loading policy', () => {
  it('returns the bundled context for the expected URL and same path', async () => {
    await expect(documentLoader(contextUrl)).resolves.toMatchObject({
      document: LWS_CONTEXT_DOCUMENT,
    });
    await expect(
      documentLoader('https://other.example/contexts/lws-v1.jsonld'),
    ).resolves.toMatchObject({ document: LWS_CONTEXT_DOCUMENT });
  });

  it('rejects unrelated context URLs', async () => {
    await expect(documentLoader('https://www.w3.org/ns/activitystreams')).rejects.toThrow(
      /unexpected JSON-LD context/i,
    );
    await expect(documentLoader('not a URL')).rejects.toThrow(/Invalid JSON-LD context URL/);
  });
});
