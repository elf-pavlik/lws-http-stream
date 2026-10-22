import { decode as cborldDecode, encode as cborldEncode } from '@digitalbazaar/cborld';
import type { DocumentLoader } from '@digitalbazaar/cborld';
import { createContextDocumentLoader, withInlineContext } from './context.ts';
import type { LwsNotification } from './notifications.ts';

/**
 * Registry entry 1 is the CBOR-LD 1.0 default registry. A non-zero registry
 * entry enables payload compression in @digitalbazaar/cborld.
 */
export const CBORLD_REGISTRY_ENTRY_ID = 1;

export function toCborLdDocument(notification: LwsNotification): Record<string, unknown> {
  return withInlineContext(notification);
}

/**
 * CBOR-LD compression for the inline-context mode. The context value is part
 * of the encoded document; the HTTP Link context is not consulted.
 */
export async function encodeCborLdNotification(
  notification: LwsNotification,
): Promise<Uint8Array> {
  const bytes = await cborldEncode({
    jsonldDocument: toCborLdDocument(notification),
    documentLoader: createContextDocumentLoader(),
    format: 'cbor-ld-1.0',
    registryEntryId: CBORLD_REGISTRY_ENTRY_ID,
  });

  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new Error('CBOR-LD encoder returned no bytes.');
  }

  return bytes;
}

export async function decodeCborLdItem(
  cborldBytes: Uint8Array,
  documentLoader: DocumentLoader = createContextDocumentLoader(),
): Promise<Record<string, unknown>> {
  return cborldDecode({
    cborldBytes,
    documentLoader,
  });
}

/**
 * Remove the inlined context so the logical notification can be compared with
 * the link-only mode. No RDF processing is involved.
 */
export function stripContext(document: Record<string, unknown>): Record<string, unknown> {
  const { '@context': _context, ...rest } = document;
  return rest;
}
