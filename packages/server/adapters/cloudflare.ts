import { LWS_CONTEXT_PATH } from '../src/context.ts';

/**
 * workerd exposes a partial Node Buffer shim. protobufjs (used by
 * rdfjs-jelly) detects Buffer.prototype.utf8Write and then uses a BufferWriter
 * whose utf8Write implementation fails on longer namespace/IRI strings.
 *
 * Hide Buffer while the shared app and rdfjs-jelly modules are evaluated so
 * protobufjs selects its Uint8Array writer. The original global is restored
 * afterwards for any other code that expects it.
 */
const savedBuffer = (globalThis as { Buffer?: unknown }).Buffer;
(globalThis as { Buffer?: unknown }).Buffer = undefined;
const { app } = await import('../src/app.ts');
if (savedBuffer !== undefined) {
  (globalThis as { Buffer?: unknown }).Buffer = savedBuffer;
}

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface CloudflareEnv {
  ASSETS: AssetsBinding;
}

const API_PATHS = new Set(['/notifications', '/health', LWS_CONTEXT_PATH]);

/**
 * Cloudflare Worker entry point. The static-assets binding serves the built
 * Solid client; API and context requests are handled by the shared Hono app.
 */
export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (API_PATHS.has(pathname)) {
      return app.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies { fetch(request: Request, env: CloudflareEnv): Promise<Response> };
