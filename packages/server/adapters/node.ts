import { serve } from '@hono/node-server';
import { createApp, DEFAULT_INTERVAL_MS, MAX_INTERVAL_MS } from '../src/app.ts';

function integerFromEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

const app = createApp({
  defaultIntervalMs: integerFromEnv(
    'NOTIFICATION_INTERVAL_MS',
    DEFAULT_INTERVAL_MS,
    0,
    MAX_INTERVAL_MS,
  ),
});

const port = integerFromEnv('PORT', 8787, 1, 65_535);

serve(
  {
    fetch: app.fetch,
    port,
  },
  info => {
    console.log(`LWS stream server listening on http://localhost:${info.port}`);
  },
);
