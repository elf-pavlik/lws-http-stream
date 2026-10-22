export const REPRESENTATIONS = ['ndjson', 'cbor-seq'] as const;

export type Representation = (typeof REPRESENTATIONS)[number];

export const MEDIA_TYPES: Readonly<Record<Representation, string>> = {
  ndjson: 'application/x-ndjson',
  'cbor-seq': 'application/cbor-seq',
};

export const DEFAULT_REPRESENTATION: Representation = 'ndjson';

export interface NegotiationResult {
  representation: Representation;
  mediaType: string;
}

interface AcceptRange {
  type: string;
  subtype: string;
  q: number;
  order: number;
}

interface MediaTypeParts {
  type: string;
  subtype: string;
}

const SUPPORTED_TYPES: Readonly<Record<Representation, MediaTypeParts>> = {
  ndjson: { type: 'application', subtype: 'x-ndjson' },
  'cbor-seq': { type: 'application', subtype: 'cbor-seq' },
};

/**
 * Negotiate one of the two representations supported by the demo.
 *
 * A missing or empty Accept header selects NDJSON. Wildcards are accepted and
 * prefer NDJSON when both representations have the same quality. An explicit
 * q=0 excludes a representation. Returns null when no supported representation
 * is acceptable.
 */
export function negotiateAccept(header: string | null | undefined): NegotiationResult | null {
  if (header === null || header === undefined || header.trim() === '') {
    return resultFor(DEFAULT_REPRESENTATION);
  }

  const ranges = parseAccept(header);
  if (ranges.length === 0) {
    return null;
  }

  let best: { representation: Representation; q: number; specificity: number } | null = null;
  for (const representation of REPRESENTATIONS) {
    const match = bestMatchFor(ranges, representation);
    if (match === null || match.q <= 0) {
      continue;
    }
    if (
      best === null ||
      match.q > best.q ||
      (match.q === best.q && match.specificity > best.specificity) ||
      (match.q === best.q &&
        match.specificity === best.specificity &&
        representation === DEFAULT_REPRESENTATION)
    ) {
      best = { representation, q: match.q, specificity: match.specificity };
    }
  }

  return best === null ? null : resultFor(best.representation);
}

function resultFor(representation: Representation): NegotiationResult {
  return { representation, mediaType: MEDIA_TYPES[representation] };
}

function bestMatchFor(
  ranges: readonly AcceptRange[],
  representation: Representation,
): { q: number; specificity: number } | null {
  const media = SUPPORTED_TYPES[representation];
  let best: { q: number; specificity: number; order: number } | null = null;

  for (const range of ranges) {
    let specificity: number;
    if (range.type === '*' && range.subtype === '*') {
      specificity = 0;
    } else if (range.type === media.type && range.subtype === '*') {
      specificity = 1;
    } else if (range.type === media.type && range.subtype === media.subtype) {
      specificity = 2;
    } else {
      continue;
    }

    if (
      best === null ||
      specificity > best.specificity ||
      (specificity === best.specificity && range.order < best.order)
    ) {
      best = { q: range.q, specificity, order: range.order };
    }
  }

  return best === null ? null : { q: best.q, specificity: best.specificity };
}

function parseAccept(header: string): AcceptRange[] {
  const ranges: AcceptRange[] = [];
  const parts = splitOutsideQuotes(header, ',');
  let order = 0;

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') {
      continue;
    }

    const segments = splitOutsideQuotes(trimmed, ';');
    const mediaRange = segments[0]?.trim().toLowerCase() ?? '';
    const slash = mediaRange.indexOf('/');
    if (slash <= 0 || slash === mediaRange.length - 1) {
      order += 1;
      continue;
    }

    const type = mediaRange.slice(0, slash).trim();
    const subtype = mediaRange.slice(slash + 1).trim();
    if (!isToken(type) || !isToken(subtype)) {
      order += 1;
      continue;
    }

    let q = 1;
    let valid = true;
    for (const parameter of segments.slice(1)) {
      const equals = parameter.indexOf('=');
      if (equals < 0) {
        continue;
      }
      const name = parameter.slice(0, equals).trim().toLowerCase();
      if (name !== 'q') {
        continue;
      }
      const raw = parameter.slice(equals + 1).trim().replace(/^"|"$/g, '');
      if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw)) {
        valid = false;
        break;
      }
      q = Number(raw);
    }

    if (valid) {
      ranges.push({ type, subtype, q, order });
    }
    order += 1;
  }

  return ranges;
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

function isToken(value: string): boolean {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value);
}
