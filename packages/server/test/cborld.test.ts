import { describe, expect, it } from 'vitest';
import { decodePlainCborItem, encodePlainCborNotification } from '../src/cbor.ts';
import { splitCborSequence } from '../src/cbor-sequence.ts';
import {
  CBORLD_REGISTRY_ENTRY_ID,
  decodeCborLdItem,
  encodeCborLdNotification,
  stripContext,
  toCborLdDocument,
} from '../src/cborld.ts';
import {
  ACTIVITYSTREAMS_CONTEXT_URL,
  CACHED_CONTEXT_DOCUMENTS,
  LWS_CONTEXT_DOCUMENT,
  LWS_CONTEXT_URL,
  LWS_CONTEXT_VALUE,
  createContextDocumentLoader,
} from '../src/context.ts';
import { notificationFixtures } from '../src/notifications.ts';

describe('CBOR encodings', () => {
  it('uses the default registry with compression enabled for CBOR-LD', async () => {
    expect(CBORLD_REGISTRY_ENTRY_ID).toBe(1);
    const notification = notificationFixtures[0]!;
    const bytes = await encodeCborLdNotification(notification);

    expect(Array.from(bytes.subarray(0, 3))).toEqual([0xd9, 0xcb, 0x1d]);
    expect(bytes.length).toBeGreaterThan(10);
  });

  it('round-trips CBOR-LD with the self-contained inline context', async () => {
    for (const notification of notificationFixtures) {
      const bytes = await encodeCborLdNotification(notification);
      const decoded = await decodeCborLdItem(bytes);
      expect(decoded['@context']).toEqual(LWS_CONTEXT_VALUE);
      expect(stripContext(decoded)).toEqual(notification);
    }
  });

  it('materializes the Link context value into the CBOR-LD document', () => {
    const notification = notificationFixtures[1]!;
    expect(toCborLdDocument(notification)).toEqual({
      '@context': LWS_CONTEXT_VALUE,
      ...notification,
    });
  });

  it('encodes plain CBOR without a CBOR-LD tag or context', () => {
    const notification = notificationFixtures[2]!;
    const bytes = encodePlainCborNotification(notification);

    expect(Array.from(bytes.subarray(0, 3))).not.toEqual([0xd9, 0xcb, 0x1d]);
    const decoded = decodePlainCborItem(bytes);
    expect(decoded).toEqual(notification);
    expect(decoded).not.toHaveProperty('@context');
  });

  it('frames both plain CBOR and CBOR-LD items as an RFC 8742 sequence', async () => {
    const plainItems = notificationFixtures
      .slice(0, 2)
      .map(notification => encodePlainCborNotification(notification));
    const cborLdItems = await Promise.all(
      notificationFixtures.slice(2, 4).map(notification => encodeCborLdNotification(notification)),
    );
    const items = [...plainItems, ...cborLdItems];

    const total = items.reduce((sum, item) => sum + item.length, 0);
    const sequence = new Uint8Array(total);
    let offset = 0;
    for (const item of items) {
      sequence.set(item, offset);
      offset += item.length;
    }

    const framed = splitCborSequence(sequence);
    expect(framed).toHaveLength(items.length);
    expect(framed.map(item => item.length)).toEqual(items.map(item => item.length));

    expect(decodePlainCborItem(framed[0]!)).toEqual(notificationFixtures[0]);
    expect(decodePlainCborItem(framed[1]!)).toEqual(notificationFixtures[1]);
    expect(stripContext(await decodeCborLdItem(framed[2]!))).toEqual(notificationFixtures[2]);
    expect(stripContext(await decodeCborLdItem(framed[3]!))).toEqual(notificationFixtures[3]);
  });
});

describe('context handling', () => {
  it('serves only the official context URL array', () => {
    expect(LWS_CONTEXT_DOCUMENT).toEqual({
      '@context': [LWS_CONTEXT_URL, ACTIVITYSTREAMS_CONTEXT_URL],
    });
    expect(LWS_CONTEXT_VALUE).toEqual([LWS_CONTEXT_URL, ACTIVITYSTREAMS_CONTEXT_URL]);
  });

  it('provides cached documents for every public context URL', async () => {
    expect(Object.keys(CACHED_CONTEXT_DOCUMENTS).sort()).toEqual(
      [LWS_CONTEXT_URL, ACTIVITYSTREAMS_CONTEXT_URL].sort(),
    );
    const loader = createContextDocumentLoader();
    await expect(loader(LWS_CONTEXT_URL)).resolves.toMatchObject({
      document: CACHED_CONTEXT_DOCUMENTS[LWS_CONTEXT_URL],
    });
    await expect(loader(ACTIVITYSTREAMS_CONTEXT_URL)).resolves.toMatchObject({
      document: CACHED_CONTEXT_DOCUMENTS[ACTIVITYSTREAMS_CONTEXT_URL],
    });
    await expect(loader('https://example.org/unknown.jsonld')).rejects.toThrow(
      /No cached context document/,
    );
  });
});
