import { describe, expect, it } from 'vitest';
import {
  Parser,
  RdfStreamType,
  RdfVersion,
  StreamParser,
} from 'rdfjs-jelly/browser';
import type { StreamOptions } from 'rdfjs-jelly/browser';
import { createJellyNotificationEncoder, notificationToQuads } from '../src/jelly.ts';
import { notificationFixtures } from '../src/notifications.ts';

function quadValues(quads: readonly { subject: { value: string }; predicate: { value: string }; object: { value: string } }[]) {
  return quads.map(quad => [quad.subject.value, quad.predicate.value, quad.object.value]);
}

function encodeFixtures(): Uint8Array {
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

describe('Jelly-RDF encoding', () => {
  it('emits one delimited Jelly-RDF 1.2 message per notification', () => {
    const bytes = encodeFixtures();

    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).not.toBe(0x0a);
    const messages = new Parser({ messages: true }).parseMessages(bytes);
    expect(messages).toHaveLength(notificationFixtures.length);
    expect(messages.map(message => message.messageCounter)).toEqual(
      notificationFixtures.map((_, index) => index),
    );
    expect(messages.map(message => message.length)).toEqual(
      notificationFixtures.map(notification => notificationToQuads(notification).length),
    );
    expect(quadValues(messages[0]!)).toEqual(quadValues(notificationToQuads(notificationFixtures[0]!)));
  });

  it('declares Jelly-RDF 1.2 messages with a flat quad stream', async () => {
    const parser = new StreamParser({ messages: true });
    let options: StreamOptions | undefined;
    parser.on('options', value => {
      options = value as StreamOptions;
    });

    const reader = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeFixtures());
        controller.close();
      },
    })
      .pipeThrough(parser)
      .getReader();
    let decoded = 0;
    while (true) {
      const { done } = await reader.read();
      if (done) {
        break;
      }
      decoded += 1;
    }

    expect(options).toMatchObject({
      version: 3,
      streamType: RdfStreamType.MESSAGES,
      rdfVersion: RdfVersion.RDF_1_2,
    });
    expect(decoded).toBe(
      notificationFixtures.reduce(
        (sum, notification) => sum + notificationToQuads(notification).length,
        0,
      ),
    );
  });

  it('maps notification fields to deterministic RDF quads', () => {
    const notification = notificationFixtures[0]!;
    const quads = notificationToQuads(notification);
    const values = quadValues(quads);

    expect(values).toContainEqual([
      notification.id,
      'https://www.w3.org/ns/lws#storage',
      notification.storage,
    ]);
    expect(values).toContainEqual([
      notification.id,
      'https://www.w3.org/ns/lws#activity',
      Array.isArray(notification.activity)
        ? notification.activity[0]!.id
        : notification.activity.id,
    ]);
    expect(
      values.some(
        value => value[1]?.endsWith('#type') && value[2]?.endsWith('#Notification'),
      ),
    ).toBe(true);
  });
});
