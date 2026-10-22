import type { LwsNotification } from './notifications.ts';

export const NDJSON_MEDIA_TYPE = 'application/x-ndjson';

const encoder = new TextEncoder();

/**
 * Encode exactly one logical notification as one compact JSON line.
 * The returned bytes include the terminating LF byte.
 */
export function encodeNdjsonNotification(notification: LwsNotification): Uint8Array {
  const line = `${JSON.stringify(notification)}\n`;
  return encoder.encode(line);
}

export function encodeNdjson(notifications: readonly LwsNotification[]): Uint8Array {
  return encoder.encode(
    notifications.map(notification => JSON.stringify(notification)).join('\n') + '\n',
  );
}
