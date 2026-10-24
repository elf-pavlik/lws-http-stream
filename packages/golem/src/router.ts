import { Duration, Effect, Layer, Schedule, Stream } from 'effect';
import {
  HttpRouter as Routes,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import { Http, HttpRouter } from '@golemcloud/effect-golem';
import {
  LWS_CONTEXT_DOCUMENT,
  LWS_CONTEXT_PATH,
  notificationFixtures,
  withInlineContext,
} from './notifications.js';
import {
  CBOR_SEQ_MEDIA_TYPE,
  CONTEXT_MODES,
  DEFAULT_CONTEXT_MODE,
  DEFAULT_INTERVAL_MS,
  JELLY_MEDIA_TYPE,
  MAX_COUNT,
  MAX_INTERVAL_MS,
  NDJSON_MEDIA_TYPE,
  parseContextMode,
  parseIntegerParameter,
  parseOptionalIntegerParameter,
  requestedRepresentation,
  type Representation,
} from './protocol.js';

const JSON_LD_CONTEXT_REL = 'http://www.w3.org/ns/json-ld#context';
const encoder = new TextEncoder();

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): HttpServerResponse.HttpServerResponse {
  return HttpServerResponse.jsonUnsafe(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Vary: 'Accept',
      ...headers,
    },
  });
}

function invalidQuery(
  parameter: string,
  minimum: number,
  maximum: number,
): HttpServerResponse.HttpServerResponse {
  return jsonResponse(
    {
      error: 'invalid_query',
      parameter,
      message: `"${parameter}" must be an integer between ${minimum} and ${maximum}.`,
      minimum,
      maximum,
    },
    400,
  );
}

function invalidContextMode(): HttpServerResponse.HttpServerResponse {
  return jsonResponse(
    {
      error: 'invalid_query',
      parameter: 'context',
      message: '"context" must be "link" or "inline".',
      allowed: CONTEXT_MODES,
    },
    400,
  );
}

function notImplemented(
  representation: Representation,
): HttpServerResponse.HttpServerResponse {
  return jsonResponse(
    {
      error: 'not_implemented',
      representation,
      message: 'This Golem build currently serves NDJSON only.',
      supported: [NDJSON_MEDIA_TYPE],
    },
    404,
  );
}

function notFound(): HttpServerResponse.HttpServerResponse {
  return jsonResponse(
    {
      error: 'not_found',
      message: `Supported media type: ${NDJSON_MEDIA_TYPE}.`,
      supported: [NDJSON_MEDIA_TYPE],
    },
    404,
  );
}

function contextLink(request: HttpServerRequest.HttpServerRequest): string {
  let target = LWS_CONTEXT_PATH;
  try {
    target = new URL(LWS_CONTEXT_PATH, request.originalUrl).href;
  } catch {
    // The relative target is a valid Link URI-reference on its own.
  }
  return `<${target}>; rel="${JSON_LD_CONTEXT_REL}"; type="application/ld+json"`;
}

function notificationStream(
  intervalMs: number,
  count: number | undefined,
  inlineContext: boolean,
): Stream.Stream<Uint8Array> {
  let index = 0;

  const chunks = Stream.fromEffectSchedule(
    Effect.sync(() => {
      const notification = notificationFixtures[index % notificationFixtures.length]!;
      index += 1;
      const payload = inlineContext ? withInlineContext(notification) : notification;
      return encoder.encode(`${JSON.stringify(payload)}\n`);
    }),
    Schedule.spaced(Duration.millis(intervalMs)),
  );

  return count === undefined ? chunks : chunks.pipe(Stream.take(count));
}

const notificationsRoute = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
  Effect.sync(() => {
    const representation = requestedRepresentation(request.headers.accept);

    if (representation !== 'ndjson') {
      return representation === 'unknown' ? notFound() : notImplemented(representation);
    }

    const url = new URL(request.url, 'http://localhost');
    const count = parseOptionalIntegerParameter(
      url.searchParams.get('count'),
      1,
      MAX_COUNT,
    );
    if (count === null) {
      return invalidQuery('count', 1, MAX_COUNT);
    }

    const intervalMs = parseIntegerParameter(
      url.searchParams.get('interval'),
      DEFAULT_INTERVAL_MS,
      0,
      MAX_INTERVAL_MS,
    );
    if (intervalMs === null) {
      return invalidQuery('interval', 0, MAX_INTERVAL_MS);
    }

    const contextMode = parseContextMode(url.searchParams.get('context'));
    if (contextMode === null) {
      return invalidContextMode();
    }

    const inlineContext = contextMode === 'inline';
    const headers: Record<string, string> = {
      'Cache-Control': 'no-store',
      Vary: 'Accept',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Expose-Headers': 'Link',
    };
    if (!inlineContext) {
      headers.Link = contextLink(request);
    }

    return HttpServerResponse.stream(
      notificationStream(intervalMs, count, inlineContext),
      {
        contentType: NDJSON_MEDIA_TYPE,
        headers,
      },
    );
  });

const healthRoute = HttpServerResponse.jsonUnsafe(
  {
    status: 'ok',
    service: 'lws-stream-golem',
    representations: ['ndjson'],
    mediaTypes: [NDJSON_MEDIA_TYPE],
    unsupportedMediaTypes: [CBOR_SEQ_MEDIA_TYPE, JELLY_MEDIA_TYPE],
    defaultRepresentation: 'ndjson',
    contextModes: CONTEXT_MODES,
    defaultContextMode: DEFAULT_CONTEXT_MODE,
  },
  {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
);

const contextRoute = HttpServerResponse.text(
  JSON.stringify(LWS_CONTEXT_DOCUMENT, null, 2),
  {
    contentType: 'application/ld+json; charset=utf-8',
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  },
);

const routes = Layer.mergeAll(
  Routes.add('GET', '/notifications', notificationsRoute),
  Routes.add('GET', '/health', healthRoute),
  Routes.add('GET', LWS_CONTEXT_PATH, contextRoute),
);

HttpRouter.define('LwsNotificationsRouter', {
  mount: Http.mount('/', { cors: ['*'] }),
}).implement(Routes.toHttpEffect(routes));
