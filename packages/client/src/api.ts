import type { DocumentLoader } from '@digitalbazaar/cborld';
import type { Representation } from './lib/types.ts';

export const MEDIA_TYPES: Readonly<Record<Representation, string>> = {
  ndjson: 'application/x-ndjson',
  'cbor-seq': 'application/cbor-seq',
};

const JSON_LD_CONTEXT_REL = 'http://www.w3.org/ns/json-ld#context';
const CONTEXT_PATH_SUFFIX = '/contexts/lws-v1.jsonld';

const contextCache = new Map<string, Promise<Record<string, unknown>>>();

export interface StreamRequestOptions {
  count: number;
  intervalMs: number;
  signal: AbortSignal;
}

export function notificationsUrl(options: { count: number; intervalMs: number }): string {
  const params = new URLSearchParams({
    count: String(options.count),
    interval: String(options.intervalMs),
  });
  return `/notifications?${params.toString()}`;
}

export async function requestNotificationStream(
  representation: Representation,
  options: StreamRequestOptions,
): Promise<Response> {
  const response = await fetch(notificationsUrl(options), {
    method: 'GET',
    headers: {
      Accept: MEDIA_TYPES[representation],
    },
    cache: 'no-store',
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Request for ${MEDIA_TYPES[representation]} failed with ${response.status}${
        detail ? `: ${detail.slice(0, 300)}` : ''
      }`,
    );
  }

  return response;
}

/**
 * Parse the response-level JSON-LD context URL from the HTTP Link header.
 * The demo uses this URL for both representations and requires exactly one
 * context link.
 */
export function parseContextLink(header: string | null, baseUrl: string): string | null {
  if (header === null || header.trim() === '') {
    return null;
  }

  const matches: string[] = [];
  for (const linkValue of splitOutsideQuotes(header, ',')) {
    const value = linkValue.trim();
    if (!value.startsWith('<')) {
      continue;
    }
    const end = value.indexOf('>');
    if (end < 0) {
      continue;
    }
    const target = value.slice(1, end).trim();
    const parameters = value.slice(end + 1);
    if (!hasRel(parameters, JSON_LD_CONTEXT_REL)) {
      continue;
    }
    try {
      matches.push(new URL(target, baseUrl).href);
    } catch {
      throw new Error(`Invalid JSON-LD context URL in Link header: ${target}`);
    }
  }

  const unique = [...new Set(matches)];
  if (unique.length > 1) {
    throw new Error('Response contains more than one JSON-LD context Link target.');
  }
  return unique[0] ?? null;
}

export function createContextDocumentLoader(linkContextUrl: string): DocumentLoader {
  return async url => {
    let requested: URL;
    let linked: URL;
    try {
      requested = new URL(url);
      linked = new URL(linkContextUrl);
    } catch {
      throw new Error(`Invalid JSON-LD context URL: ${url}`);
    }

    const isSameContext =
      requested.href === linked.href ||
      (requested.pathname === linked.pathname && requested.pathname.endsWith(CONTEXT_PATH_SUFFIX));

    if (!isSameContext) {
      throw new Error(
        `CBOR-LD item referenced context ${url}, which does not match the Link context ${linkContextUrl}.`,
      );
    }

    const document = await loadContextDocument(linkContextUrl);
    return {
      document,
      documentUrl: linkContextUrl,
    };
  };
}

async function loadContextDocument(url: string): Promise<Record<string, unknown>> {
  const cached = contextCache.get(url);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/ld+json, application/json;q=0.9',
      },
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error(`Failed to load JSON-LD context ${url}: HTTP ${response.status}`);
    }
    const document = (await response.json()) as unknown;
    if (
      typeof document !== 'object' ||
      document === null ||
      !('@context' in document)
    ) {
      throw new Error(`JSON-LD context response from ${url} is invalid.`);
    }
    return document as Record<string, unknown>;
  })();

  contextCache.set(url, promise);
  promise.catch(() => {
    contextCache.delete(url);
  });
  return promise;
}

function hasRel(parameters: string, expected: string): boolean {
  for (const parameter of splitOutsideQuotes(parameters, ';')) {
    const equals = parameter.indexOf('=');
    if (equals < 0) {
      continue;
    }
    if (parameter.slice(0, equals).trim().toLowerCase() !== 'rel') {
      continue;
    }
    const raw = parameter.slice(equals + 1).trim();
    const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    if (unquoted.split(/\s+/).includes(expected)) {
      return true;
    }
  }
  return false;
}

function splitOutsideQuotes(value: string, separator: string): string[] {
  const pieces: string[] = [];
  let current = '';
  let quoted = false;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quoted) {
      current += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }
    if (character === separator && !quoted) {
      pieces.push(current);
      current = '';
      continue;
    }
    current += character;
  }

  pieces.push(current);
  return pieces;
}
