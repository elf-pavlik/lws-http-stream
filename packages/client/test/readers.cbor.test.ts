import { describe, expect, it } from 'vitest';
import { encode as encodeCborLd } from '@digitalbazaar/cborld';
import type { DocumentLoader } from '@digitalbazaar/cborld';
import { readCborSequenceStream } from '../src/lib/readers.ts';
import type { LwsNotification, ReceivedNotification } from '../src/lib/types.ts';

const contextUrl = 'https://demo.example/contexts/lws-v1.jsonld';
const contextDocument = {
  '@context': {
    '@version': 1.1,
    '@protected': true,
    id: '@id',
    type: '@type',
    Notification: 'https://www.w3.org/ns/lws#Notification',
    DataResource: 'https://www.w3.org/ns/lws#DataResource',
    Create: 'https://www.w3.org/ns/activitystreams#Create',
    storage: {
      '@id': 'https://www.w3.org/ns/lws#storage',
      '@type': '@id',
    },
    activity: 'https://www.w3.org/ns/lws#activity',
    object: 'https://www.w3.org/ns/activitystreams#object',
    published: {
      '@id': 'https://www.w3.org/ns/activitystreams#published',
      '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
    },
  },
};

const documentLoader: DocumentLoader = async url => {
  if (url !== contextUrl) {
    throw new Error(`Unexpected context ${url}`);
  }
  return { document: contextDocument, documentUrl: contextUrl };
};

const notifications: LwsNotification[] = [1, 2, 3].map(index => ({
  id: `urn:uuid:00000000-0000-4000-8000-00000000000${index}`,
  type: 'Notification',
  storage: 'https://storage.example/',
  activity: {
    id: `urn:uuid:11111111-1111-4111-8111-11111111111${index}`,
    type: ['Create'],
    object: {
      id: `https://storage.example/item-${index}`,
      type: ['DataResource'],
    },
    published: `2026-03-26T10:30:0${index}Z`,
  },
}));

async function makeSequence(): Promise<{ sequence: Uint8Array; itemLengths: number[] }> {
  const items = [];
  for (const notification of notifications) {
    items.push(
      await encodeCborLd({
        jsonldDocument: { '@context': contextUrl, ...notification },
        documentLoader,
        registryEntryId: 1,
      }),
    );
  }
  const total = items.reduce((sum, item) => sum + item.length, 0);
  const sequence = new Uint8Array(total);
  let offset = 0;
  for (const item of items) {
    sequence.set(item, offset);
    offset += item.length;
  }
  return { sequence, itemLengths: items.map(item => item.length) };
}

function chunkedStream(bytes: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
}

describe('incremental CBOR-LD Sequence decoding', () => {
  it.each([1, 2, 3, 5, 8, 13, 64, 4096])(
    'decodes CBOR-LD items split into %i-byte transport chunks',
    async chunkSize => {
      const { sequence, itemLengths } = await makeSequence();
      const received: ReceivedNotification[] = [];
      let bytesReported = 0;
      let lastBytes = 0;

      await readCborSequenceStream(
        new Response(chunkedStream(sequence, chunkSize)),
        documentLoader,
        {
          onBytes: bytes => {
            bytesReported += 1;
            lastBytes = bytes;
          },
          onNotification: (notification, meta) => {
            received.push({
              id: notification.id,
              notification,
              index: meta.index,
              bytes: meta.bytes,
              atMs: meta.atMs,
            });
          },
        },
      );

      expect(received.map(item => item.notification)).toEqual(notifications);
      expect(received.map(item => item.bytes)).toEqual(itemLengths);
      expect(received.map(item => item.index)).toEqual([1, 2, 3]);
      expect(bytesReported).toBeGreaterThan(0);
      expect(lastBytes).toBe(sequence.byteLength);
      expect(itemLengths.reduce((sum, length) => sum + length, 0)).toBe(sequence.byteLength);
      expect(received[0]!.atMs).toBeGreaterThanOrEqual(0);
    },
  );

  it('reports a truncated trailing CBOR item', async () => {
    const { sequence } = await makeSequence();
    const truncated = sequence.subarray(0, sequence.length - 1);

    await expect(
      readCborSequenceStream(
        new Response(chunkedStream(truncated, 7)),
        documentLoader,
      ),
    ).rejects.toThrow();
  });
});
