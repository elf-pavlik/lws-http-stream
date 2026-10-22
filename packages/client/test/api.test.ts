import { describe, expect, it } from 'vitest';
import { notificationsUrl, parseContextLink } from '../src/api.ts';

const base = 'https://demo.example/notifications';
const rel = 'http://www.w3.org/ns/json-ld#context';

describe('Link header context parsing', () => {
  it('extracts the JSON-LD context target', () => {
    expect(
      parseContextLink(
        `</contexts/lws-notifications-v1.jsonld>; rel="${rel}"; type="application/ld+json"`,
        base,
      ),
    ).toBe('https://demo.example/contexts/lws-notifications-v1.jsonld');
  });

  it('resolves relative context targets against the response URL', () => {
    expect(
      parseContextLink(`<../contexts/lws-notifications-v1.jsonld>; rel="${rel}"`, base),
    ).toBe('https://demo.example/contexts/lws-notifications-v1.jsonld');
  });

  it('finds the context link among unrelated links', () => {
    const header = [
      '<https://demo.example/help>; rel="help"',
      `<https://demo.example/contexts/lws-notifications-v1.jsonld>; rel="alternate ${rel}"`,
      '<https://demo.example/next>; rel="next"',
    ].join(', ');
    expect(parseContextLink(header, base)).toBe(
      'https://demo.example/contexts/lws-notifications-v1.jsonld',
    );
  });

  it('returns null when the header has no context link', () => {
    expect(parseContextLink(null, base)).toBeNull();
    expect(parseContextLink('<https://demo.example/next>; rel="next"', base)).toBeNull();
  });

  it('rejects ambiguous context links', () => {
    const header = [
      `<https://one.example/contexts/lws-notifications-v1.jsonld>; rel="${rel}"`,
      `<https://two.example/contexts/lws-notifications-v1.jsonld>; rel="${rel}"`,
    ].join(', ');
    expect(() => parseContextLink(header, base)).toThrow(/more than one/i);
  });

  it('handles quoted commas in parameters', () => {
    const header = `<https://demo.example/contexts/lws-notifications-v1.jsonld>; rel="${rel}"; title="a,b"`;
    expect(parseContextLink(header, base)).toBe(
      'https://demo.example/contexts/lws-notifications-v1.jsonld',
    );
  });
});

describe('notification URLs', () => {
  it('always includes the context mode', () => {
    expect(
      notificationsUrl({ count: 8, intervalMs: 250, inlineContext: false }),
    ).toBe('/notifications?count=8&interval=250&context=link');
    expect(
      notificationsUrl({ count: 8, intervalMs: 250, inlineContext: true }),
    ).toBe('/notifications?count=8&interval=250&context=inline');
  });
});
