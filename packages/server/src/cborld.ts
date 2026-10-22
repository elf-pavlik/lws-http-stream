import { decode as cborldDecode, encode as cborldEncode } from '@digitalbazaar/cborld';
import type { DocumentLoader } from '@digitalbazaar/cborld';
import contextDocument from '../fixtures/contexts/lws-v1.json' with { type: 'json' };
import type { LwsNotification } from './notifications.ts';

export const LWS_CONTEXT_PATH = '/contexts/lws-v1.jsonld';

/**
 * Registry entry 1 is the CBOR-LD 1.0 default registry. It has no preassigned
 * application terms, so compression is driven entirely by the LWS context
 * supplied through the document loader. A non-zero registry entry enables
 * payload compression in @digitalbazaar/cborld.
 */
export const CBORLD_REGISTRY_ENTRY_ID = 1;

export interface LwsContextDocument {
  '@context': Record<string, unknown>;
}

export const LWS_CONTEXT_DOCUMENT = contextDocument as LwsContextDocument;

/**
 * Build the absolute, per-request context URL. It is used both for the HTTP
 * Link header and inside the CBOR-LD document, so the decoder can resolve the
 * same context document.
 */
export function contextUrlFor(requestUrl: string): string {
  return new URL(LWS_CONTEXT_PATH, requestUrl).href;
}

export function createContextDocumentLoader(contextUrl: string): DocumentLoader {
  const expected = new URL(contextUrl);
  return async url => {
    let actual: URL;
    try {
      actual = new URL(url);
    } catch {
      throw new Error(`Invalid JSON-LD context URL: ${url}`);
    }

    const isExpectedContext =
      actual.href === expected.href ||
      (actual.pathname.endsWith(LWS_CONTEXT_PATH) && actual.pathname === expected.pathname);

    if (!isExpectedContext) {
      throw new Error(
        `Refusing to load unexpected JSON-LD context ${url}; expected ${expected.href}`,
      );
    }

    return {
      document: LWS_CONTEXT_DOCUMENT,
      documentUrl: expected.href,
    };
  };
}

/**
 * CBOR-LD needs an explicit @context in the document; it does not consume the
 * HTTP Link header. The context URL is therefore materialized into the
 * document handed to the encoder, and is carried inside each CBOR-LD item.
 */
export function toCborLdDocument(
  notification: LwsNotification,
  contextUrl: string,
): Record<string, unknown> {
  return {
    '@context': contextUrl,
    ...notification,
  };
}

export async function encodeCborLdNotification(
  notification: LwsNotification,
  contextUrl: string,
  documentLoader: DocumentLoader = createContextDocumentLoader(contextUrl),
): Promise<Uint8Array> {
  const bytes = await cborldEncode({
    jsonldDocument: toCborLdDocument(notification, contextUrl),
    documentLoader,
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
  documentLoader: DocumentLoader,
): Promise<Record<string, unknown>> {
  return cborldDecode({
    cborldBytes,
    documentLoader,
  });
}

/**
 * The @context carried inside CBOR-LD is an encoding artifact for this demo:
 * the response-level context is the Link header. Return the logical document
 * without it so both representations can be compared field-for-field.
 */
export function stripContext(document: Record<string, unknown>): Record<string, unknown> {
  const { '@context': _context, ...rest } = document;
  return rest;
}
