import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContextDocumentLoader, parseContextLink } from '../src/api.ts';

const base = 'https://demo.example/notifications';
const rel = 'http://www.w3.org/ns/json-ld#context';

describe('Link header context parsing', () => {
  it('extracts the JSON-LD context target', () => {
    expect(
      parseContextLink(
        `</contexts/lws-v1.jsonld>; rel="${rel}"; type="application/ld+json"`,
        base,
      ),
    ).toBe('https://demo.example/contexts/lws-v1.jsonld');
  });

  it('resolves relative context targets against the response URL', () => {
    expect(parseContextLink(`<../contexts/lws-v1.jsonld>; rel="${rel}"`, base)).toBe(
      'https://demo.example/contexts/lws-v1.jsonld',
    );
  });

  it('finds the context link among unrelated links', () => {
    const header = [
      '<https://demo.example/help>; rel="help"',
      `<https://demo.example/contexts/lws-v1.jsonld>; rel="alternate ${rel}"`,
      '<https://demo.example/next>; rel="next"',
    ].join(', ');
    expect(parseContextLink(header, base)).toBe(
      'https://demo.example/contexts/lws-v1.jsonld',
    );
  });

  it('returns null when the header has no context link', () => {
    expect(parseContextLink(null, base)).toBeNull();
    expect(parseContextLink('<https://demo.example/next>; rel="next"', base)).toBeNull();
  });

  it('rejects ambiguous context links', () => {
    const header = [
      `<https://one.example/contexts/lws-v1.jsonld>; rel="${rel}"`,
      `<https://two.example/contexts/lws-v1.jsonld>; rel="${rel}"`,
    ].join(', ');
    expect(() => parseContextLink(header, base)).toThrow(/more than one/i);
  });

  it('handles quoted commas in parameters', () => {
    const header = `<https://demo.example/contexts/lws-v1.jsonld>; rel="${rel}"; title="a,b"`;
    expect(parseContextLink(header, base)).toBe(
      'https://demo.example/contexts/lws-v1.jsonld',
    );
  });
});

describe('client context loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the Link context and rejects a mismatched encoded context', async () => {
    const link = 'https://loader.example/contexts/lws-v1.jsonld';
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ '@context': { id: '@id' } }), {
        headers: { 'Content-Type': 'application/ld+json' },
      });
    });

    const loader = createContextDocumentLoader(link);
    await expect(loader(link)).resolves.toMatchObject({
      document: { '@context': { id: '@id' } },
      documentUrl: link,
    });
    await expect(
      loader('https://loader.example/contexts/other.jsonld'),
    ).rejects.toThrow(/does not match the Link context/i);
    await expect(loader('https://other.example/contexts/lws-v1.jsonld')).resolves.toBeTruthy();
    expect(requested).toEqual([link]);
  });
});
