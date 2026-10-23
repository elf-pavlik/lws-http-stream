import { Hono } from 'hono';
import type { Context } from 'hono';
import { CBORLD_REGISTRY_ENTRY_ID } from './cborld.ts';
import {
  LWS_CONTEXT_DOCUMENT,
  LWS_CONTEXT_PATH,
  contextUrlFor,
} from './context.ts';
import { notificationFixtures } from './notifications.ts';
import {
  DEFAULT_REPRESENTATION,
  MEDIA_TYPES,
  REPRESENTATIONS,
  negotiateAccept,
} from './negotiation.ts';
import { createNotificationStream } from './stream.ts';

export interface AppOptions {
  defaultIntervalMs?: number;
  onChunk?: Parameters<typeof createNotificationStream>[0]['onChunk'];
}

export const DEFAULT_INTERVAL_MS = 250;
export const MAX_COUNT = 100;
export const MAX_INTERVAL_MS = 5_000;

const JSON_LD_CONTEXT_REL = 'http://www.w3.org/ns/json-ld#context';
const CONTEXT_MODES = ['link', 'inline'] as const;
const DEFAULT_CONTEXT_MODE = 'link';

export function createApp(options: AppOptions = {}): Hono {
  const defaultIntervalMs = options.defaultIntervalMs ?? DEFAULT_INTERVAL_MS;
  const app = new Hono();

  app.get('/health', c =>
    c.json(
      {
        status: 'ok',
        service: 'lws-http-stream',
        representations: REPRESENTATIONS,
        mediaTypes: REPRESENTATIONS.map(representation => MEDIA_TYPES[representation]),
        defaultRepresentation: DEFAULT_REPRESENTATION,
        contextModes: CONTEXT_MODES,
        defaultContextMode: DEFAULT_CONTEXT_MODE,
        cborldRegistryEntryId: CBORLD_REGISTRY_ENTRY_ID,
      },
      200,
      {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    ),
  );

  app.get(LWS_CONTEXT_PATH, c =>
    c.body(JSON.stringify(LWS_CONTEXT_DOCUMENT, null, 2), 200, {
      'Content-Type': 'application/ld+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    }),
  );

  app.get('/notifications', c => {
    const negotiation = negotiateAccept(c.req.header('Accept'));
    if (negotiation === null) {
      return c.json(
        {
          error: 'not_acceptable',
          message:
            'Supported media types are application/x-ndjson, application/cbor-seq, ' +
            'and application/x-jelly-rdf.',
          supported: REPRESENTATIONS.map(representation => MEDIA_TYPES[representation]),
        },
        406,
        {
          Accept: REPRESENTATIONS.map(representation => MEDIA_TYPES[representation]).join(', '),
          'Cache-Control': 'no-store',
          Vary: 'Accept',
          'Access-Control-Allow-Origin': '*',
        },
      );
    }

    const count = parseOptionalIntegerParameter(
      c.req.query('count'),
      1,
      MAX_COUNT,
    );
    if (count === null) {
      return invalidQuery(c, 'count', 1, MAX_COUNT);
    }

    const intervalMs = parseIntegerParameter(
      c.req.query('interval'),
      defaultIntervalMs,
      0,
      MAX_INTERVAL_MS,
    );
    if (intervalMs === null) {
      return invalidQuery(c, 'interval', 0, MAX_INTERVAL_MS);
    }

    const isJelly = negotiation.representation === 'jelly';
    const contextMode = c.req.query('context') ?? DEFAULT_CONTEXT_MODE;
    if (!isJelly && contextMode !== 'link' && contextMode !== 'inline') {
      return invalidContextMode(c);
    }

    const notifications = notificationFixtures;

    const body = createNotificationStream({
      notifications,
      representation: negotiation.representation,
      inlineContext: !isJelly && contextMode === 'inline',
      intervalMs,
      count: count ?? Number.POSITIVE_INFINITY,
      signal: c.req.raw.signal,
      onChunk: options.onChunk,
    });

    const headers: Record<string, string> = {
      'Content-Type': negotiation.mediaType,
      'Cache-Control': 'no-store',
      Vary: 'Accept',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Link',
    };

    if (!isJelly && contextMode === 'link') {
      headers.Link =
        `<${contextUrlFor(c.req.url)}>; rel="${JSON_LD_CONTEXT_REL}"; ` +
        'type="application/ld+json"';
    }

    return new Response(body, {
      status: 200,
      headers,
    });
  });

  app.notFound(c =>
    c.json(
      {
        error: 'not_found',
        path: c.req.path,
      },
      404,
      {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    ),
  );

  app.onError((error, c) => {
    console.error('Unhandled request error', error);
    return c.json(
      {
        error: 'internal_error',
        message: 'The notification stream failed unexpectedly.',
      },
      500,
      {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    );
  });

  return app;
}

function parseIntegerParameter(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (raw === undefined) {
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

function parseOptionalIntegerParameter(
  raw: string | undefined,
  minimum: number,
  maximum: number,
): number | undefined | null {
  if (raw === undefined) {
    return undefined;
  }
  return parseIntegerParameter(raw, minimum, minimum, maximum);
}

function invalidContextMode(c: Context): Response {
  return c.json(
    {
      error: 'invalid_query',
      parameter: 'context',
      message: '"context" must be "link" or "inline".',
      allowed: CONTEXT_MODES,
    },
    400,
    {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  );
}

function invalidQuery(
  c: Context,
  parameter: string,
  minimum: number,
  maximum: number,
): Response {
  return c.json(
    {
      error: 'invalid_query',
      parameter,
      message: `"${parameter}" must be an integer between ${minimum} and ${maximum}.`,
      minimum,
      maximum,
    },
    400,
    {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  );
}

export const app = createApp();
export default app;
