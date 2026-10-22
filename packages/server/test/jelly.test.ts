import { describe, expect, it } from 'vitest';
import { Parser } from 'rdfjs-jelly/browser';
import { createJellyNotificationEncoder, notificationToQuads } from '../src/jelly.ts';
import { notificationFixtures } from '../src/notifications.ts';

function quadValues(quads: readonly { subject: { value: string }; predicate: { value: string }; object: { value: string } }[]) {
  return quads.map(quad => [quad.subject.value, quad.predicate.value, quad.object.value]);
}

describe('Jelly-RDF encoding', () => {
  it('emits one delimited frame per notification', () => {
    const encoder = createJellyNotificationEncoder();
    const chunks: Uint8Array[] = [];
    for (const notification of notificationFixtures) {
      const encoded = encoder.addNotification(notification);
      expect(encoded).toHaveLength(1);
      chunks.push(...encoded);
    }
    chunks.push(...encoder.finish());

    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).not.toBe(0x0a);
    const messages = new Parser({ messages: true }).parseMessages(bytes);
    expect(messages).toHaveLength(notificationFixtures.length);
    expect(messages.map(message => message.length)).toEqual(
      notificationFixtures.map(notification => notificationToQuads(notification).length),
    );
    expect(quadValues(messages[0]!)).toEqual(quadValues(notificationToQuads(notificationFixtures[0]!)));
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
