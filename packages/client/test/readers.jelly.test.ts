import { describe, expect, it } from 'vitest';
import { createJellyNotificationEncoder } from '../../server/src/jelly.ts';
import { notificationFixtures } from '../../server/src/notifications.ts';
import { readJellyStream } from '../src/lib/jelly.ts';
import type { ReceivedNotification } from '../src/lib/types.ts';

function jellySequence(): Uint8Array {
  const encoder = createJellyNotificationEncoder();
  const chunks: Uint8Array[] = [];
  for (const notification of notificationFixtures) {
    chunks.push(...encoder.addNotification(notification));
  }
  chunks.push(...encoder.finish());
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
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

describe('incremental Jelly-RDF decoding', () => {
  it.each([1, 2, 3, 5, 8, 13, 64, 4096])(
    'decodes length-delimited frames split into %i-byte chunks',
    async chunkSize => {
      const sequence = jellySequence();
      const received: ReceivedNotification[] = [];
      let lastBytes = 0;

      await readJellyStream(
        new Response(chunkedStream(sequence, chunkSize)),
        {
          onBytes: bytes => {
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

      expect(received.map(item => item.notification)).toEqual(notificationFixtures);
      expect(received.map(item => item.index)).toEqual(
        notificationFixtures.map((_, index) => index + 1),
      );
      expect(received.every(item => item.bytes === 0)).toBe(true);
      expect(lastBytes).toBe(sequence.byteLength);
    },
  );

  it('rejects a truncated Jelly frame', async () => {
    const sequence = jellySequence();
    const truncated = sequence.subarray(0, sequence.length - 1);

    await expect(
      readJellyStream(new Response(chunkedStream(truncated, 7))),
    ).rejects.toThrow();
  });
});
