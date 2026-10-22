# LWS notification streaming: NDJSON-LD vs CBOR-LD

>[!NOTE]
> Generated with opencode-go/DeepSeek V4.1 Flash (max)

A small full-stack demonstration of streaming Linked Web Storage (LWS)
notifications over HTTP, comparing two representations of the same ordered
notification sequence:

- **NDJSON-LD**: one compact JSON-LD document per line, `application/x-ndjson`.
- **CBOR-LD**: concatenated CBOR-LD items forming an RFC 8742 CBOR Sequence,
  `application/cbor-seq`.

The SolidJS client opens both streams concurrently, decodes them incrementally,
matches notifications by ID, and computes byte statistics from the actual
response bodies.

The server is shared TypeScript using Web-standard `Request`, `Response`,
`ReadableStream`, and `Uint8Array` APIs. It runs directly on Node.js with native
type stripping, and is deployed through thin Cloudflare Worker and Vercel
Function adapters.

## Requirements

- Node.js **24** (native TypeScript type stripping is required)
- npm 11 (the repository is an npm workspace)
- Optional: Cloudflare and Vercel accounts/CLI logins for deployment

The server source uses only erasable TypeScript syntax. Nothing compiles the
server to JavaScript for local development. `npm run build` builds the client
and type-checks the server.

## Quick start

```bash
npm install
npm run dev
```

- Client: <http://localhost:5173>
- Server: <http://localhost:8787>
- Health: <http://localhost:8787/health>

Vite proxies `/notifications`, `/health`, and `/contexts` to the Node server, so
the browser makes same-origin streaming requests and does not need CORS in
local development.

The default is 8 deterministic notifications at 250 ms intervals. The client
also accepts a count and interval; use a larger count and shorter interval to
exercise streaming, or press **Stop both** to test cancellation.

## API

### `GET /notifications?count=8&interval=250`

| Query | Default | Range | Meaning |
|---|---:|---:|---|
| `count` | `8` | 1–100 | Number of notifications; fixtures repeat if needed |
| `interval` | `250` | 0–5000 ms | Delay between notifications |

Content negotiation:

| `Accept` | Response |
|---|---|
| `application/x-ndjson` | NDJSON stream |
| `application/cbor-seq` | RFC 8742 CBOR Sequence of CBOR-LD items |
| missing / empty | NDJSON (documented default) |
| `*/*` or `application/*` | NDJSON unless quality values select CBOR |
| unsupported only | `406 Not Acceptable` |

Standard quality values and specificity are honored. An exact `q=0` excludes a
representation. A malformed/unsupported `Accept` returns 406.

Response headers for either representation:

```http
Content-Type: application/x-ndjson
Link: <https://host/contexts/lws-v1.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
Cache-Control: no-store
Vary: Accept
X-Context-Url: https://host/contexts/lws-v1.jsonld
X-Notification-Count: 8
X-Notification-Interval-Ms: 250
```

The first notification is sent immediately; later notifications are separated
by the configured interval. The response is a real streaming response, not a
buffered body. Request abort and reader cancellation stop the producer.

### `GET /health`

Returns service and representation metadata.

### `GET /contexts/lws-v1.jsonld`

Serves the bundled JSON-LD context used by the demo. The URL is host-relative,
so the same deployment logic works locally, on Cloudflare, and on Vercel.

### `GET /*` (deployments)

Cloudflare serves the built client through its static-assets binding. Vercel
serves `packages/client/dist`, with API rewrites to `api/*`.

## Repository layout

```text
.
├── api/                               # Vercel function entry points
│   ├── notifications.ts
│   ├── health.ts
│   └── contexts.ts
├── packages/
│   ├── server/
│   │   ├── adapters/
│   │   │   ├── node.ts
│   │   │   ├── cloudflare.ts
│   │   │   └── vercel.ts
│   │   ├── fixtures/
│   │   │   ├── notifications.json
│   │   │   └── contexts/lws-v1.json
│   │   └── src/
│   │       ├── app.ts
│   │       ├── cbor-sequence.ts
│   │       ├── cborld.ts
│   │       ├── ndjson.ts
│   │       ├── negotiation.ts
│   │       ├── notifications.ts
│   │       └── stream.ts
│   └── client/
│       ├── src/
│       │   ├── api.ts
│       │   ├── components/
│       │   │   ├── NotificationList.tsx
│       │   │   ├── Statistics.tsx
│       │   │   └── StreamPanel.tsx
│       │   ├── lib/
│       │   │   ├── cborSequence.ts
│       │   │   ├── ndjson.ts
│       │   │   ├── readers.ts
│       │   │   ├── session.ts
│       │   │   └── stats.ts
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   └── styles.css
│       └── vite.config.ts
├── scripts/                           # deployment smoke tests
├── package.json
├── tsconfig.json
├── vercel.json
└── wrangler.jsonc
```

## Encoding and context policy

### One response-level context for both media types

Both streams include the same HTTP `Link` relation:

```text
Link: <https://host/contexts/lws-v1.jsonld>;
      rel="http://www.w3.org/ns/json-ld#context";
      type="application/ld+json"
```

NDJSON documents omit `@context`; the response-level Link is the context
policy. The client requires this Link for both representations.

The CBOR-LD encoder does **not** read the HTTP Link header. For each
notification, the server materializes the context URL into the JSON-LD document
handed to `@digitalbazaar/cborld`:

```json
{
  "@context": "https://host/contexts/lws-v1.jsonld",
  "id": "urn:uuid:...",
  "type": "Notification",
  "storage": "https://storage.example/",
  "activity": { "...": "..." }
}
```

A server-side document loader maps that URL to the bundled context document.
The encoded CBOR-LD item therefore carries the context URL so it is
self-contained.

On the client, the decoder:

1. Parses the context URL from the response `Link` header.
2. Loads that context document and caches it per URL.
3. Passes a `documentLoader` to `@digitalbazaar/cborld`.
4. Verifies that any context URL embedded in a CBOR-LD item matches the Link
   context (same URL or same `/contexts/lws-v1.jsonld` path).
5. Removes the encoding-internal `@context` before displaying or comparing the
   logical notification.

The bundled context is a minimal demo context for the LWS notification
envelope and ActivityStreams terms used by the fixtures. The official LWS
context URL is not used because the LWS context document is still being
finalized. The demo does not claim to implement a frozen LWS context; it
demonstrates the response-level context mechanism consistently.

### CBOR-LD registry configuration

The server uses `@digitalbazaar/cborld` with:

- `format: 'cbor-ld-1.0'` (default, tag `0xcb1d`)
- `registryEntryId: 1` (the default registry, with compression enabled)
- a document loader backed by the bundled LWS demo context

Registry entry `1` has no preassigned application terms, so term compression is
derived from the supplied context. The full context URL is carried in each
item. A production deployment could register a custom context code and term
table to reduce bytes further, at the cost of distributing registry metadata.

### NDJSON framing

For each notification:

1. `JSON.stringify(document)` produces compact JSON.
2. UTF-8 encode.
3. Append exactly one LF byte (`0x0a`).

There is no BOM, no blank line, and no trailing partial line.

### CBOR Sequence framing

Each `@digitalbazaar/cborld` `encode()` result is a complete CBOR item. Items are
written back-to-back with no delimiter, length prefix, enclosing array, or
self-described CBOR tag. That concatenation is an RFC 8742 CBOR Sequence.

The client frames the sequence incrementally with `cborg.decodeFirst()`, using
tag decoders for CBOR-LD 1.0 tag `51997` and the legacy CBOR-LD tags. The
decoder computes the exact item boundary, then passes the original item bytes
unchanged to `@digitalbazaar/cborld.decode()`. This works even when an item is
split across arbitrary transport chunks.

## Client statistics

For each stream the client reports:

- actual response-body bytes received (HTTP headers excluded)
- complete messages decoded
- average bytes per message
- time from request start to first decoded notification
- elapsed time
- status: connecting, streaming, complete, cancelled, or error

The comparison headline uses:

```text
100 × (NDJSON body bytes − CBOR body bytes) / NDJSON body bytes
```

The context document fetch and HTTP headers are not included. The CBOR-LD
`@context` string is part of the CBOR body and is counted. The client also
matches notifications by top-level `id`, checks order, and deep-compares the
logical payloads after removing the CBOR-LD encoding `@context`.

### Sample measurement

With the default 8 fixtures on local development, one run produced:

| Representation | Body bytes | Average |
|---|---:|---:|
| NDJSON | 3,451 | 431.4 B |
| CBOR Sequence | 2,023 | 252.9 B |
| Reduction | | **41.4%** |

Exact CBOR bytes vary by a few bytes with the length of the host's context URL.
Timing depends on machine and network; the first-item figure in particular is
not a benchmark. Always measure the deployment being evaluated.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Node server and Vite client together |
| `npm run dev:server` | `node --watch` the TypeScript server |
| `npm run dev:client` | Start Vite |
| `npm run build` | Build client and type-check server + client + root API |
| `npm run build:client` | Build only the Solid client |
| `npm run typecheck` | Type-check all TypeScript packages and API entry points |
| `npm test` | Run server and client unit/integration tests |
| `npm run smoke:adapters` | Invoke Cloudflare and Vercel adapters with Web Requests |
| `npm run smoke:cloudflare` | Build, start `wrangler dev` in workerd, verify both streams |
| `npm run smoke:vercel` | Start `vercel dev --local`, verify functions and client |
| `npm run deploy:cloudflare` | Build client and run `wrangler deploy` |
| `npm run deploy:vercel` | Build client and run `vercel deploy --prod` |
| `npm run preview:cloudflare` | Build client and run local `wrangler dev` |

Server environment variables (Node adapter only):

- `PORT` (default `8787`)
- `NOTIFICATION_COUNT` (default `8`)
- `NOTIFICATION_INTERVAL_MS` (default `250`)

Cloudflare and Vercel use the shared defaults; query parameters work on every
platform. Set deployment environment variables only if you add platform-specific
configuration to those adapters.

## Local development details

`packages/server/adapters/node.ts` uses `@hono/node-server` and executes the
shared Hono app. The Vite proxy preserves the browser Host (`changeOrigin:
false`), so the context URL in the Link header and CBOR-LD payload is the
client-visible origin (`http://localhost:5173`) and can be fetched through the
proxy.

If you change the server port, update the Vite proxy targets in
`packages/client/vite.config.ts` or set `PORT` and keep the proxy in sync.

For a production-like local check:

```bash
npm run preview:cloudflare   # workerd + built static assets
# or
npx vercel dev --local
```

`vercel dev` uses the same root project, starts Vite through `devCommand`, and
routes the rewrites to the local Vercel Functions. `vercel.json` sets
`devCommand`, and the Vite config reads `PORT` and disables the Node proxy when
running under Vercel.

## Cloudflare deployment

Configuration: [`wrangler.jsonc`](./wrangler.jsonc)

- Entry point: `packages/server/adapters/cloudflare.ts`
- Static assets: `packages/client/dist`, bound as `ASSETS`
- SPA fallback for unknown page routes
- API paths run the Worker first: `/notifications`, `/health`, `/contexts/*`
- Compatibility date: `2026-10-01`
- No `nodejs_compat` flag is required; shared code uses Web-standard APIs.
- `@digitalbazaar/cborld` and its transitive dependencies are bundled by
  Wrangler and have been smoke-tested in workerd.

Deploy:

```bash
npx wrangler login          # once
npm run deploy:cloudflare
```

`npm run deploy:cloudflare` builds the client and runs `wrangler deploy` from the
repository root. The Worker serves the client for page requests and streams API
responses for `/notifications`.

Run a local workerd check:

```bash
npm run smoke:cloudflare
# or interactively:
npm run preview:cloudflare
```

The smoke test builds the client, starts `wrangler dev` on port 8790, checks
health, both negotiated streams, the context route, and static assets, then
tears down the process tree.

## Vercel deployment

Configuration: [`vercel.json`](./vercel.json)

**Project root:** the repository root (`.`), not `packages/client` or
`packages/server`. The Vercel project must see the root `api/`, the shared
workspace packages, and the root `vercel.json`.

If configuring in the Vercel dashboard rather than relying on `vercel.json`:

| Setting | Value |
|---|---|
| Root Directory | `.` |
| Framework Preset | Other |
| Install Command | `npm ci` |
| Build Command | `npm run build:client` |
| Output Directory | `packages/client/dist` |
| Node.js Version | `24.x` |

Do not set the Vercel project root to a single workspace: the API functions are
at the repository root and import the shared server package; a client-only root
would not deploy the API.

Function configuration:

- `api/notifications.ts`: `maxDuration: 60`, `supportsCancellation: true`
- `api/health.ts`: `maxDuration: 10`
- `api/contexts.ts`: `maxDuration: 10`

The functions use the Web-standard `Request`/`Response` signature. The shared
server's `request.signal` is used to stop production when a client disconnects.
`supportsCancellation` is enabled per route in `vercel.json`.

Rewrites map the public API paths to the functions:

```text
/notifications       -> /api/notifications
/health              -> /api/health
/contexts/:path*     -> /api/contexts
```

Static client output is served from `packages/client/dist`; the root `api/`
functions are deployed alongside it. Vercel's `maxDuration` plan limits still
apply. The default stream is about 1.75 seconds; for long streams keep
`(count − 1) × interval` within the selected plan's function duration. Longer
experiments can be run locally on the Node server.

Deploy:

```bash
npx vercel login            # once
npx vercel link             # once, from the repository root
npm run deploy:vercel
```

Run a local Vercel check:

```bash
npm run smoke:vercel
# or interactively:
npx vercel dev --local
```

The smoke test starts `vercel dev --local` on port 3009, waits for the local
Vercel Function runtime, checks health, both streams, context, and the Vite
client, then stops the process tree. It requires no Vercel account because it
uses local mode.

Actual `vercel deploy --prod` requires a linked project and authentication.

## Testing

```bash
npm test
npm run smoke:adapters
npm run smoke:cloudflare
npm run smoke:vercel
```

Coverage includes:

- Accept parsing, quality values, wildcards, defaults, and 406 responses
- NDJSON one-object-per-line framing and byte counts
- CBOR Sequence concatenation and exact item boundaries
- CBOR-LD encode/decode round-trips with the shared context
- Logical equivalence and ordering across both representations
- Context Link parsing and context-loader URL validation
- Chunk-boundary robustness: NDJSON and CBOR-LD items fed one byte at a time
- Incremental CBOR-LD decoding through the client reader
- Size-reduction and average-byte calculations
- Client reader cancellation with `AbortController`
- Server stream cancellation on request abort
- Cloudflare Worker and Vercel Function adapter smoke tests
- Real workerd and `vercel dev --local` deployment smoke tests

## Design notes and limitations

- The fixtures are synthetic and deterministic; no external storage or auth is
  involved. This is a benchmark/demo, not a production LWS notification service.
- The API returns `Access-Control-Allow-Origin: *` and exposes Link metadata for
  demonstration convenience. Tighten CORS for a real deployment.
- The context URL is derived from the request origin so it works on every host.
  Production deployments should sit behind a trusted host/proxy, or make the
  public origin explicit if Host-header manipulation is a concern.
- The context document is cached by the client and served with a one-hour cache
  lifetime by the server.
- The server emits one encoded item per stream chunk. TCP/HTTP framing and
  serverless platform buffering may regroup chunks in transit; the client
  readers are explicitly chunk-boundary independent.
- No HTTP content encoding (gzip/br) is used, so the comparison isolates the
  representation size rather than transport compression.
- The default Node process is watch-mode during development. Stopping/restarting
  the client aborts its requests; the generator stops rather than finishing the
  remaining sequence.
