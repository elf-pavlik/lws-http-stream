import { describe, expect, it } from 'vitest';
import { encodeNdjson, encodeNdjsonNotification } from '../src/ndjson.ts';
import { notificationFixtures } from '../src/notifications.ts';

describe('NDJSON framing', () => {
  it('terminates exactly one notification with one LF byte', () => {
    const notification = notificationFixtures[0]!;
    const bytes = encodeNdjsonNotification(notification);
    expect(bytes.at(-1)).toBe(0x0a);
    expect(bytes.filter(byte => byte === 0x0a)).toHaveLength(1);
    expect(bytes.at(0)).not.toBe(0xef); // no BOM
    expect(new TextDecoder().decode(bytes)).toBe(`${JSON.stringify(notification)}\n`);
  });

  it('emits one newline per notification and preserves order', () => {
    const notifications = notificationFixtures.slice(0, 4);
    const bytes = encodeNdjson(notifications);
    const text = new TextDecoder().decode(bytes);
    const lines = text.split('\n');
    expect(lines.at(-1)).toBe('');
    expect(lines).toHaveLength(notifications.length + 1);
    expect(lines.slice(0, -1).map(line => JSON.parse(line).id)).toEqual(
      notifications.map(notification => notification.id),
    );
    expect(bytes.filter(byte => byte === 0x0a)).toHaveLength(notifications.length);
  });
});
