import { describe, expect, it } from 'vitest';
import worker from '../adapters/cloudflare.ts';
import {
  context as vercelContext,
  health as vercelHealth,
  notifications as vercelNotifications,
} from '../adapters/vercel.ts';

describe('Cloudflare Worker adapter', () => {
  it('streams API requests through the shared app', async () => {
    const response = await worker.fetch(
      new Request('https://demo.example/notifications?count=2&interval=0', {
        headers: { Accept: 'application/x-ndjson' },
      }),
      {
        ASSETS: {
          async fetch() {
            throw new Error('assets should not be used for API requests');
          },
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    expect(response.headers.get('link')).toContain(
      '<https://demo.example/contexts/lws-v1.jsonld>',
    );
    expect((await response.text()).trimEnd().split('\n')).toHaveLength(2);
  });

  it('serves the context through the Worker', async () => {
    const response = await worker.fetch(
      new Request('https://demo.example/contexts/lws-v1.jsonld'),
      {
        ASSETS: {
          async fetch() {
            throw new Error('assets should not be used for context requests');
          },
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty('@context');
  });

  it('falls back to the static-assets binding for page requests', async () => {
    let requestedPath = '';
    const response = await worker.fetch(new Request('https://demo.example/notes/42'), {
      ASSETS: {
        async fetch(request) {
          requestedPath = new URL(request.url).pathname;
          return new Response('<html>client</html>', {
            headers: { 'Content-Type': 'text/html' },
          });
        },
      },
    });

    expect(requestedPath).toBe('/notes/42');
    expect(await response.text()).toBe('<html>client</html>');
  });
});

describe('Vercel function adapter', () => {
  it('normalizes /api/notifications back to the shared route', async () => {
    const response = await vercelNotifications(
      new Request('https://demo.example/api/notifications?count=2&interval=0', {
        headers: { Accept: 'application/cbor-seq' },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/cbor-seq');
    expect(response.headers.get('link')).toContain(
      '<https://demo.example/contexts/lws-v1.jsonld>',
    );
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(20);
  });

  it('normalizes health and context functions', async () => {
    const health = await vercelHealth(
      new Request('https://demo.example/api/health'),
    );
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });

    const context = await vercelContext(
      new Request('https://demo.example/api/contexts'),
    );
    expect(context.status).toBe(200);
    expect(await context.json()).toHaveProperty('@context');
  });
});
