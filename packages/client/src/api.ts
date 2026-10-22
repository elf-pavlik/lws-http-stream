import type { Representation } from './lib/types.ts';

export const MEDIA_TYPES: Readonly<Record<Representation, string>> = {
  ndjson: 'application/x-ndjson',
  'cbor-seq': 'application/cbor-seq',
};

const JSON_LD_CONTEXT_REL = 'http://www.w3.org/ns/json-ld#context';

export interface StreamRequestOptions {
  count: number;
  intervalMs: number;
  inlineContext: boolean;
  signal: AbortSignal;
}

export function notificationsUrl(options: {
  count: number;
  intervalMs: number;
  inlineContext: boolean;
}): string {
  const params = new URLSearchParams({
    count: String(options.count),
    interval: String(options.intervalMs),
    context: options.inlineContext ? 'inline' : 'link',
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
 * The URL is displayed for orientation only. The client never fetches or
 * resolves it and never performs RDF processing.
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
