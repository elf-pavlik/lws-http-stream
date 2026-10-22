import { app } from '../src/app.ts';
import { LWS_CONTEXT_PATH } from '../src/context.ts';

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
