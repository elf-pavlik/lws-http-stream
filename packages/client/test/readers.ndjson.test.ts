import { describe, expect, it } from 'vitest';
import { readNdjsonStream } from '../src/lib/readers.ts';

const encoder = new TextEncoder();

function line(id: string): Uint8Array {
  return encoder.encode(
    `${JSON.stringify({
      id,
      type: 'Notification',
      storage: 'https://storage.example/',
      activity: {
        id: `urn:uuid:${id}`,
        type: ['Create'],
        object: { id: `https://storage.example/${id}`, type: ['DataResource'] },
        published: '2026-03-26T10:30:00Z',
      },
    })}\n`,
  );
}

describe('streaming reader cancellation', () => {
  it('cancels the reader and rejects with AbortError', async () => {
    let cancelled = false;
    let notifyFirst: (() => void) | undefined;
    const firstNotification = new Promise<void>(resolve => {
      notifyFirst = resolve;
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(line('one'));
      },
      cancel() {
        cancelled = true;
      },
    });

    const controller = new AbortController();
    const promise = readNdjsonStream(
      new Response(stream),
      {
        onNotification: () => {
          notifyFirst?.();
        },
      },
      controller.signal,
    );

    await firstNotification;
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(true);
  });

  it('counts every response-body byte including line terminators', async () => {
    const payload = new Uint8Array([...line('one'), ...line('two')]);
    let lastBytes = 0;
    const ids: string[] = [];

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload.slice(0, 17));
        controller.enqueue(payload.slice(17, 31));
        controller.enqueue(payload.slice(31));
        controller.close();
      },
    });

    await readNdjsonStream(
      new Response(stream),
      {
        onBytes: bytes => {
          lastBytes = bytes;
        },
        onNotification: notification => {
          ids.push(notification.id);
        },
      },
    );

    expect(ids).toEqual(['one', 'two']);
    expect(lastBytes).toBe(payload.byteLength);
  });
});
