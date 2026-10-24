import { describe, expect, it } from 'vitest';
import {
  CBOR_SEQ_MEDIA_TYPE,
  JELLY_MEDIA_TYPE,
  NDJSON_MEDIA_TYPE,
  parseContextMode,
  parseIntegerParameter,
  parseOptionalIntegerParameter,
  requestedRepresentation,
} from '../src/protocol.ts';

describe('requestedRepresentation', () => {
  it('defaults to NDJSON for an absent or wildcard Accept header', () => {
    expect(requestedRepresentation(undefined)).toBe('ndjson');
    expect(requestedRepresentation('')).toBe('ndjson');
    expect(requestedRepresentation('*/*')).toBe('ndjson');
    expect(requestedRepresentation('application/*')).toBe('ndjson');
  });

  it('selects each explicitly requested representation', () => {
    expect(requestedRepresentation(NDJSON_MEDIA_TYPE)).toBe('ndjson');
    expect(requestedRepresentation(CBOR_SEQ_MEDIA_TYPE)).toBe('cbor-seq');
    expect(requestedRepresentation(JELLY_MEDIA_TYPE)).toBe('jelly');
  });

  it('honors quality values', () => {
    expect(
      requestedRepresentation(
        `${NDJSON_MEDIA_TYPE};q=0.9, ${CBOR_SEQ_MEDIA_TYPE};q=0.5`,
      ),
    ).toBe('ndjson');
    expect(
      requestedRepresentation(
        `${NDJSON_MEDIA_TYPE};q=0.5, ${CBOR_SEQ_MEDIA_TYPE};q=0.9`,
      ),
    ).toBe('cbor-seq');
    expect(
      requestedRepresentation(
        `${NDJSON_MEDIA_TYPE}, ${CBOR_SEQ_MEDIA_TYPE};q=0`,
      ),
    ).toBe('ndjson');
    expect(
      requestedRepresentation(
        `${NDJSON_MEDIA_TYPE};q=0, application/*;q=0.5`,
      ),
    ).toBe('cbor-seq');
  });

  it('reports unsupported media types as unknown', () => {
    expect(requestedRepresentation('text/plain')).toBe('unknown');
    expect(requestedRepresentation(`${NDJSON_MEDIA_TYPE};q=0`)).toBe('unknown');
  });
});

describe('query parameter parsing', () => {
  it('parses counts and intervals within their bounds', () => {
    expect(parseOptionalIntegerParameter(null, 1, 100)).toBeUndefined();
    expect(parseOptionalIntegerParameter('3', 1, 100)).toBe(3);
    expect(parseOptionalIntegerParameter('0', 1, 100)).toBeNull();
    expect(parseOptionalIntegerParameter('1.5', 1, 100)).toBeNull();
    expect(parseIntegerParameter(null, 250, 0, 5000)).toBe(250);
    expect(parseIntegerParameter('0', 250, 0, 5000)).toBe(0);
    expect(parseIntegerParameter('5001', 250, 0, 5000)).toBeNull();
  });

  it('accepts only link and inline context modes', () => {
    expect(parseContextMode(null)).toBe('link');
    expect(parseContextMode('link')).toBe('link');
    expect(parseContextMode('inline')).toBe('inline');
    expect(parseContextMode('other')).toBeNull();
  });
});
