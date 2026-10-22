import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { notificationFixtures } from '../src/notifications.ts';
import { createNotificationStream } from '../src/stream.ts';

describe('notification stream production', () => {
  it('emits one chunk per notification with no interval', async () => {
    const chunks: Uint8Array[] = [];
    const stream = createNotificationStream({
      notifications: notificationFixtures.slice(0, 3),
      representation: 'ndjson',
      inlineContext: false,
      intervalMs: 0,
      onChunk: event => chunks.push(event.bytes),
    });

    const response = new Response(stream);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(chunks).toHaveLength(3);
    expect(bytes.at(-1)).toBe(0x0a);
    expect(bytes.filter(byte => byte === 0x0a)).toHaveLength(3);
  });

  it('closes an already-aborted stream without producing data', async () => {
    const controller = new AbortController();
    controller.abort();

    const stream = createNotificationStream({
      notifications: notificationFixtures.slice(0, 2),
      representation: 'ndjson',
      inlineContext: false,
      intervalMs: 0,
      signal: controller.signal,
    });

    const reader = stream.getReader();
    await expect(reader.read()).resolves.toMatchObject({ done: true });
  });

  it('stops producing after request abort', async () => {
    let sent = 0;
    const app = createApp({
      defaultCount: 20,
      defaultIntervalMs: 1_000,
      onChunk: () => {
        sent += 1;
      },
    });
    const controller = new AbortController();
    const request = new Request(
      'https://demo.example/notifications?count=20&interval=1000',
      {
        headers: { Accept: 'application/x-ndjson' },
        signal: controller.signal,
      },
    );

    const response = await app.fetch(request);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(sent).toBe(1);

    controller.abort();
    await reader.cancel();

    await new Promise(resolve => setTimeout(resolve, 150));
    expect(sent).toBe(1);
  });

  it('flushes the first notification before the interval elapses', async () => {
    const app = createApp({ defaultIntervalMs: 2_000 });
    const startedAt = performance.now();
    const response = await app.fetch(
      new Request('https://demo.example/notifications?count=2&interval=2000', {
        headers: { Accept: 'application/x-ndjson' },
      }),
    );
    const reader = response.body!.getReader();
    const first = await reader.read();
    const firstChunkMs = performance.now() - startedAt;

    expect(first.done).toBe(false);
    expect(firstChunkMs).toBeLessThan(1_500);
    await reader.cancel();
  });
});
