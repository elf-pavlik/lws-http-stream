import cachedContexts from '../fixtures/contexts/cached-context.json' with { type: 'json' };
import contextDocument from '../fixtures/contexts/lws-notifications-v1.json' with { type: 'json' };
import type { DocumentLoader } from '@digitalbazaar/cborld';
import type { LwsNotification } from './notifications.ts';

export const LWS_CONTEXT_PATH = '/contexts/lws-notifications-v1.jsonld';
export const LWS_CONTEXT_URL = 'https://www.w3.org/ns/lws/v1';
export const ACTIVITYSTREAMS_CONTEXT_URL = 'https://www.w3.org/ns/activitystreams';

export interface LwsContextDocument {
  '@context': string[];
}

export const LWS_CONTEXT_DOCUMENT = contextDocument as LwsContextDocument;
export const LWS_CONTEXT_VALUE = LWS_CONTEXT_DOCUMENT['@context'];

/**
 * The public context document only contains the official context URLs. cborld
 * needs the resolved documents behind those URLs; this cache supplies them to
 * the serializer/deserializer without any network access.
 */
export const CACHED_CONTEXT_DOCUMENTS = cachedContexts as Record<
  string,
  { '@context': Record<string, unknown> }
>;

/**
 * Build the absolute, per-request context URL used by the HTTP Link header.
 */
export function contextUrlFor(requestUrl: string): string {
  return new URL(LWS_CONTEXT_PATH, requestUrl).href;
}

/**
 * cborld document loader backed by cached official context documents.
 */
export function createContextDocumentLoader(): DocumentLoader {
  return async url => {
    const document = CACHED_CONTEXT_DOCUMENTS[url];
    if (!document) {
      throw new Error(`No cached context document for ${url}.`);
    }
    return {
      document,
      documentUrl: url,
    };
  };
}

/**
 * Inline the public context array into a notification. The client treats the
 * result as plain JSON; no RDF expansion is performed.
 */
export function withInlineContext(notification: LwsNotification): Record<string, unknown> {
  return {
    '@context': [...LWS_CONTEXT_VALUE],
    ...notification,
  };
}
