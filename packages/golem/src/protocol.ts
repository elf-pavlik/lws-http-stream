export const NDJSON_MEDIA_TYPE = 'application/x-ndjson';
export const CBOR_SEQ_MEDIA_TYPE = 'application/cbor-seq';
export const JELLY_MEDIA_TYPE = 'application/x-jelly-rdf';

export const DEFAULT_INTERVAL_MS = 250;
export const MAX_COUNT = 100;
export const MAX_INTERVAL_MS = 5_000;

export const CONTEXT_MODES = ['link', 'inline'] as const;
export type ContextMode = (typeof CONTEXT_MODES)[number];
export const DEFAULT_CONTEXT_MODE: ContextMode = 'link';

export type Representation = 'ndjson' | 'cbor-seq' | 'jelly' | 'unknown';

interface MediaRange {
  type: string;
  subtype: string;
  q: number;
}

function parseAccept(header: string): MediaRange[] {
  return header
    .split(',')
    .map(part => {
      const [rawType = '', ...parameters] = part.trim().toLowerCase().split(';');
      const [type = '', subtype = ''] = rawType.split('/');
      const qParameter = parameters.find(parameter => parameter.trim().startsWith('q='));
      const q = qParameter === undefined
        ? 1
        : Number(qParameter.slice(qParameter.indexOf('=') + 1));
      return {
        type,
        subtype,
        q: Number.isFinite(q) && q > 0 ? q : 0,
      };
    })
    .filter(range => range.type !== '');
}

function qualityFor(ranges: readonly MediaRange[], mediaType: string): number {
  const [type, subtype] = mediaType.split('/');
  let bestSpecificity = -1;
  let quality = 0;

  for (const range of ranges) {
    const specificity =
      range.type === type && range.subtype === subtype
        ? 2
        : range.type === type && range.subtype === '*'
          ? 1
          : range.type === '*' && range.subtype === '*'
            ? 0
            : -1;

    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      quality = range.q;
    } else if (specificity === bestSpecificity && specificity >= 0) {
      quality = Math.max(quality, range.q);
    }
  }

  return quality;
}

/**
 * Select the representation to answer with. This Golem demo only implements
 * NDJSON, but it still distinguishes an explicit CBOR/Jelly request from an
 * unknown media type so both can be reported as 404 with a useful body.
 */
export function requestedRepresentation(acceptHeader: string | undefined): Representation {
  const header = acceptHeader ?? '';
  const ranges = parseAccept(header);

  if (ranges.length === 0) {
    return header.trim() === '' ? 'ndjson' : 'unknown';
  }

  const ndjson = qualityFor(ranges, NDJSON_MEDIA_TYPE);
  const cborSequence = qualityFor(ranges, CBOR_SEQ_MEDIA_TYPE);
  const jelly = qualityFor(ranges, JELLY_MEDIA_TYPE);

  if (ndjson === 0 && cborSequence === 0 && jelly === 0) {
    return 'unknown';
  }
  if (ndjson >= cborSequence && ndjson >= jelly) {
    return 'ndjson';
  }
  return cborSequence >= jelly ? 'cbor-seq' : 'jelly';
}

export function parseIntegerParameter(
  raw: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (raw === null) {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    return null;
  }
  return value;
}

export function parseOptionalIntegerParameter(
  raw: string | null,
  minimum: number,
  maximum: number,
): number | undefined | null {
  if (raw === null) {
    return undefined;
  }
  return parseIntegerParameter(raw, minimum, minimum, maximum);
}

export function parseContextMode(raw: string | null): ContextMode | null {
  const value = raw ?? DEFAULT_CONTEXT_MODE;
  return value === 'link' || value === 'inline' ? value : null;
}
