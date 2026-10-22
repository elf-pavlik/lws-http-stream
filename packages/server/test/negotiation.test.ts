import { describe, expect, it } from 'vitest';
import { negotiateAccept } from '../src/negotiation.ts';

describe('content negotiation', () => {
  it('defaults to NDJSON when Accept is missing or empty', () => {
    expect(negotiateAccept(null)?.representation).toBe('ndjson');
    expect(negotiateAccept(undefined)?.representation).toBe('ndjson');
    expect(negotiateAccept('')?.representation).toBe('ndjson');
    expect(negotiateAccept('   ')?.representation).toBe('ndjson');
  });

  it('accepts both exact media types, case-insensitively and with parameters', () => {
    expect(negotiateAccept('application/x-ndjson')?.mediaType).toBe('application/x-ndjson');
    expect(negotiateAccept('Application/CBOR-Seq')?.representation).toBe('cbor-seq');
    expect(negotiateAccept('application/x-ndjson; charset=utf-8')?.representation).toBe('ndjson');
    expect(negotiateAccept('application/cbor-seq; q=0.5')?.representation).toBe('cbor-seq');
  });

  it('uses quality values and prefers the default on ties', () => {
    expect(
      negotiateAccept('application/cbor-seq;q=0.9, application/x-ndjson;q=0.4')
        ?.representation,
    ).toBe('cbor-seq');
    expect(
      negotiateAccept('application/cbor-seq;q=1, application/x-ndjson;q=1')
        ?.representation,
    ).toBe('ndjson');
    expect(
      negotiateAccept('application/cbor-seq, application/x-ndjson;q=0.9')
        ?.representation,
    ).toBe('cbor-seq');
  });

  it('handles wildcards', () => {
    expect(negotiateAccept('*/*')?.representation).toBe('ndjson');
    expect(negotiateAccept('application/*')?.representation).toBe('ndjson');
    expect(negotiateAccept('text/html, */*;q=0.1')?.representation).toBe('ndjson');
    expect(negotiateAccept('*/*;q=1, application/cbor-seq;q=0.9')?.representation).toBe(
      'ndjson',
    );
  });

  it('respects specificity precedence for q=0 exclusions', () => {
    expect(
      negotiateAccept('application/x-ndjson;q=0, application/*;q=1')?.representation,
    ).toBe('cbor-seq');
    expect(
      negotiateAccept('application/cbor-seq;q=0, application/*;q=0.5')?.representation,
    ).toBe('ndjson');
  });

  it('returns null when no supported representation is acceptable', () => {
    expect(negotiateAccept('text/html')).toBeNull();
    expect(negotiateAccept('application/json')).toBeNull();
    expect(negotiateAccept('application/x-ndjson;q=0, application/cbor-seq;q=0')).toBeNull();
    expect(negotiateAccept('not a media type')).toBeNull();
    expect(negotiateAccept('application/x-ndjson;q=bogus')).toBeNull();
  });

  it('parses quoted parameters without splitting the list incorrectly', () => {
    expect(
      negotiateAccept('text/html;profile="a,b", application/cbor-seq;q=0.8')?.representation,
    ).toBe('cbor-seq');
  });
});
