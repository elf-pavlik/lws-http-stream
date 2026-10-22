import { app } from '../src/app.ts';
import { LWS_CONTEXT_PATH } from '../src/cborld.ts';

/**
 * Vercel rewrites /notifications, /health, and /contexts/* to files under
 * api/. Normalize the URL back to the shared Hono route before dispatching so
 * there is only one implementation of the server behavior.
 */
function atPath(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
  });
}

export async function notifications(request: Request): Promise<Response> {
  return app.fetch(atPath(request, '/notifications'));
}

export async function health(request: Request): Promise<Response> {
  return app.fetch(atPath(request, '/health'));
}

export async function context(request: Request): Promise<Response> {
  return app.fetch(atPath(request, LWS_CONTEXT_PATH));
}
