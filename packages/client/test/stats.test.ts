import { describe, expect, it } from 'vitest';
import {
  averageBytesPerMessage,
  canonicalize,
  documentsEqual,
  formatPercent,
  initialStats,
  normalizeNotificationDocument,
  sizeReduction,
} from '../src/lib/stats.ts';
import type { LwsNotification } from '../src/lib/types.ts';

const notification: LwsNotification = {
  id: 'urn:uuid:11111111-1111-4111-8111-111111111111',
  type: 'Notification',
  storage: 'https://storage.example/',
  activity: {
    id: 'urn:uuid:a1111111-1111-4111-8111-111111111111',
    type: ['Create'],
    object: {
      id: 'https://storage.example/notes/a.txt',
      type: ['DataResource'],
    },
    published: '2026-03-26T10:30:00Z',
  },
};

describe('size statistics', () => {
  it('calculates average body bytes per decoded message', () => {
    const stats = {
      ...initialStats('ndjson'),
      bytesReceived: 900,
      messagesDecoded: 3,
    };
    expect(averageBytesPerMessage(stats)).toBe(300);
    expect(averageBytesPerMessage(initialStats('ndjson'))).toBeNull();
  });

  it('calculates the CBOR size reduction from response-body bytes', () => {
    expect(sizeReduction(1_000, 400)).toBe(60);
    expect(sizeReduction(1_000, 1_200)).toBe(-20);
    expect(sizeReduction(0, 0)).toBeNull();
    expect(formatPercent(46.25)).toBe('+46.3%');
    expect(formatPercent(-4)).toBe('-4.0%');
    expect(formatPercent(null)).toBe('—');
  });

  it('canonicalizes object key order without reordering arrays', () => {
    expect(canonicalize({ b: 2, a: [{ d: 4, c: 3 }] })).toEqual({
      a: [{ c: 3, d: 4 }],
      b: 2,
    });
  });

  it('compares logical notifications independent of key order', () => {
    const reordered = JSON.parse(
      JSON.stringify({
        activity: notification.activity,
        storage: notification.storage,
        type: notification.type,
        id: notification.id,
      }),
    ) as LwsNotification;
    expect(documentsEqual(notification, reordered)).toBe(true);
  });

  it('removes only the CBOR-LD encoding context', () => {
    const normalized = normalizeNotificationDocument({
      '@context': 'https://demo.example/contexts/lws-notifications-v1.jsonld',
      ...notification,
    });
    expect(normalized).toEqual(notification);
    expect(normalized).not.toHaveProperty('@context');
  });
});
