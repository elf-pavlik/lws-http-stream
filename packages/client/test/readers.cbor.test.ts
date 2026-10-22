import { describe, expect, it } from 'vitest';
import * as cborg from 'cborg';
import { encode as encodeCborLd } from '@digitalbazaar/cborld';
import cachedContexts from '../../server/fixtures/contexts/cached-context.json' with { type: 'json' };
import contextDocument from '../../server/fixtures/contexts/lws-notifications-v1.json' with { type: 'json' };
import { decodePlainCborItem } from '../src/lib/cbor.ts';
import { decodeCborLdItem } from '../src/lib/cborld.ts';
import { readCborSequenceStream } from '../src/lib/readers.ts';
import type { LwsNotification, ReceivedNotification } from '../src/lib/types.ts';

const contextValue = contextDocument['@context'];
const cachedContextDocuments = cachedContexts as Record<
  string,
  { '@context': Record<string, unknown> }
>;
const documentLoader = async (url: string) => {
  const document = cachedContextDocuments[url];
  if (!document) {
    throw new Error(`No cached context for ${url}`);
  }
  return { document, documentUrl: url };
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

async function makeCborLdSequence(): Promise<{
  sequence: Uint8Array;
  itemLengths: number[];
}> {
  const items = [];
  for (const notification of notifications) {
    items.push(
      await encodeCborLd({
        jsonldDocument: { '@context': contextValue, ...notification },
        documentLoader,
        registryEntryId: 1,
      }),
    );
  }
  return concatenate(items);
}

function makePlainSequence(): { sequence: Uint8Array; itemLengths: number[] } {
  return concatenate(notifications.map(notification => cborg.encode(notification)));
}

function concatenate(items: Uint8Array[]): {
  sequence: Uint8Array;
  itemLengths: number[];
} {
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

async function collect(
  sequence: Uint8Array,
  chunkSize: number,
  decodeItem: (item: Uint8Array) => Promise<Record<string, unknown>>,
): Promise<{ received: ReceivedNotification[]; bytesReported: number; lastBytes: number }> {
  const received: ReceivedNotification[] = [];
  let bytesReported = 0;
  let lastBytes = 0;

  await readCborSequenceStream(
    new Response(chunkedStream(sequence, chunkSize)),
    decodeItem,
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

  return { received, bytesReported, lastBytes };
}

describe('incremental CBOR Sequence decoding', () => {
  it.each([1, 2, 3, 5, 8, 13, 64, 4096])(
    'decodes inline-context CBOR-LD items split into %i-byte chunks',
    async chunkSize => {
      const { sequence, itemLengths } = await makeCborLdSequence();
      const { received, bytesReported, lastBytes } = await collect(
        sequence,
        chunkSize,
        async item => {
          const document = await decodeCborLdItem(item);
          const { '@context': _context, ...logical } = document;
          return logical;
        },
      );

      expect(received.map(item => item.notification)).toEqual(notifications);
      expect(received.map(item => item.bytes)).toEqual(itemLengths);
      expect(received.map(item => item.index)).toEqual([1, 2, 3]);
      expect(bytesReported).toBeGreaterThan(0);
      expect(lastBytes).toBe(sequence.byteLength);
    },
  );

  it.each([1, 2, 3, 5, 8, 13, 64, 4096])(
    'decodes plain CBOR items split into %i-byte chunks',
    async chunkSize => {
      const { sequence, itemLengths } = makePlainSequence();
      const { received, lastBytes } = await collect(
        sequence,
        chunkSize,
        async item => decodePlainCborItem(item),
      );

      expect(received.map(item => item.notification)).toEqual(notifications);
      expect(received.map(item => item.bytes)).toEqual(itemLengths);
      expect(lastBytes).toBe(sequence.byteLength);
    },
  );

  it('reports a truncated trailing CBOR item', async () => {
    const { sequence } = makePlainSequence();
    const truncated = sequence.subarray(0, sequence.length - 1);

    await expect(
      readCborSequenceStream(
        new Response(chunkedStream(truncated, 7)),
        async item => decodePlainCborItem(item),
      ),
    ).rejects.toThrow();
  });
});
