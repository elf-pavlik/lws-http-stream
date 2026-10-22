import * as cborg from 'cborg';

/**
 * Plain CBOR mode: the notification is encoded directly, with no CBOR-LD tag
 * and no inlined JSON-LD context.
 */
export function decodePlainCborItem(item: Uint8Array): Record<string, unknown> {
  const value = cborg.decode(item) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Plain CBOR item did not contain a JSON object.');
  }
  return value as Record<string, unknown>;
}
