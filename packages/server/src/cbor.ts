import * as cborg from 'cborg';
import type { LwsNotification } from './notifications.ts';

/**
 * Plain CBOR alternative used when the @context is only advertised in the
 * HTTP Link header. It encodes the notification object directly and emits no
 * CBOR-LD tag and no JSON-LD context.
 */
export function encodePlainCborNotification(notification: LwsNotification): Uint8Array {
  return cborg.encode(notification);
}

export function decodePlainCborItem(bytes: Uint8Array): Record<string, unknown> {
  const value = cborg.decode(bytes) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Plain CBOR item did not contain a JSON object.');
  }
  return value as Record<string, unknown>;
}
