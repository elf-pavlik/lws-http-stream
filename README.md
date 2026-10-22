# LWS notification streaming: NDJSON vs CBOR Sequence

>[!NOTE]
> Generated with opencode-go/DeepSeek V4.1 Flash (max)

A small full-stack demonstration of streaming Linked Web Storage (LWS)
notifications over HTTP, comparing two representations of the same ordered
notification sequence:

- **NDJSON**: one compact JSON document per line, `application/x-ndjson`.
- **CBOR Sequence**: plain CBOR items in link-only mode, or compressed CBOR-LD
  items when `@context` is inlined, `application/cbor-seq`.

A UI toggle controls whether the context is only advertised in the HTTP `Link`
header (default) or is also inlined into every notification. The SolidJS client
opens both streams concurrently, decodes them incrementally as plain JSON,
matches notifications by ID, and computes byte statistics from the actual
response bodies. It never performs RDF processing.

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

The server defaults to 8 generated notifications at 250 ms intervals. The
client starts with a 50-notification, 500 ms stream so the page has time to
demonstrate streaming. Each stream panel has its own `@context` toggle; toggling
one immediately re-runs only that stream. Change the count/interval controls or
press **Stop both** to test cancellation.

### Get both representations with curl

With `npm run dev` running, use the Vite proxy origin:

```bash
# NDJSON: response headers and body on stdout
curl -i 'http://localhost:5173/notifications?count=3&interval=0' \
  -H 'Accept: application/x-ndjson'

# CBOR Sequence: save the body, print headers, inspect the first bytes
curl -sS -D /tmp/cbor-seq.headers \
  'http://localhost:5173/notifications?count=3&interval=0' \
  -H 'Accept: application/cbor-seq' \
  -o /tmp/cbor-seq.bin
cat /tmp/cbor-seq.headers
od -An -tx1 -N 48 /tmp/cbor-seq.bin

# The response-level JSON-LD context advertised by Link
curl -i 'http://localhost:5173/contexts/lws-notifications-v1.jsonld' \
  -H 'Accept: application/ld+json'
```

Use `http://localhost:8787` instead of `:5173` to call the Node server directly.
The CBOR output is binary, so writing it to a file and inspecting it with `od`
avoids dumping binary data into the terminal.

## API

### `GET /notifications?count=8&interval=250`

| Query | Default | Range | Meaning |
|---|---:|---:|---|
| `count` | `8` | 1–100 | Number of notifications; fixtures repeat if needed |
| `interval` | `250` | 0–5000 ms | Delay between notifications |
| `context` | `link` | `link` or `inline` | Context only in Link, or inlined into every notification |

Content negotiation:

| `Accept` | Response |
|---|---|
| `application/x-ndjson` | NDJSON stream |
| `application/cbor-seq` | RFC 8742 CBOR Sequence (plain CBOR or CBOR-LD, depending on `context`) |
| missing / empty | NDJSON (documented default) |
| `*/*` or `application/*` | NDJSON unless quality values select CBOR |
| unsupported only | `406 Not Acceptable` |

Standard quality values and specificity are honored. An exact `q=0` excludes a
representation. A malformed/unsupported `Accept` returns 406.

Link-only response headers:

```http
Content-Type: application/x-ndjson
Link: <https://host/contexts/lws-notifications-v1.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
Cache-Control: no-store
Vary: Accept
```

Inline-context responses omit the context `Link` relation:

```http
Content-Type: application/x-ndjson
Cache-Control: no-store
Vary: Accept
```

The first notification is sent immediately; later notifications are separated
by the configured interval. The response is a real streaming response, not a
buffered body. Request abort and reader cancellation stop the producer.

### `GET /health`

Returns service, representation, and context-mode metadata.

### `GET /contexts/lws-notifications-v1.jsonld`

Serves only the two official context URLs:

```json
{
  "@context": [
    "https://www.w3.org/ns/lws/v1",
    "https://www.w3.org/ns/activitystreams"
  ]
}
```

The URL is host-relative, so the same deployment logic works locally, on
Cloudflare, and on Vercel.

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
│   │   │   ├── notifications.json      # generated and committed
│   │   │   └── contexts/
│   │   │       ├── lws-notifications-v1.json  # public URL array
│   │   │       └── cached-context.json         # cborld resolver cache
│   │   ├── scripts/generate-fixtures.ts
│   │   └── src/
│   │       ├── app.ts
│   │       ├── cbor-sequence.ts
│   │       ├── cbor.ts
│   │       ├── cborld.ts
│   │       ├── context.ts
│   │       ├── ndjson.ts
│   │       ├── negotiation.ts
│   │       ├── notifications.ts
│   │       └── stream.ts
│   └── client/
│       ├── src/
│       │   ├── api.ts
│       │   ├── components/
│       │   │   ├── HttpExchange.tsx
│       │   │   ├── NotificationList.tsx
│       │   │   ├── Statistics.tsx
│       │   │   └── StreamPanel.tsx
│       │   ├── lib/
│       │   │   ├── cbor.ts
│       │   │   ├── cborSequence.ts
│       │   │   ├── cborld.ts
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

## Context and encoding modes

The endpoint supports two context modes, controlled by the `context` query
parameter:

| Mode | Query | Link context relation | NDJSON | CBOR Sequence |
|---|---|---|---|---|
| Link-only (default) | `context=link` | included | no inlined `@context` | plain CBOR, no CBOR-LD tag, no `@context` |
| Inline | `context=inline` | omitted | `@context` in every line | CBOR-LD with `@context` in every item |

In link-only mode the response includes:

```text
Link: <https://host/contexts/lws-notifications-v1.jsonld>;
      rel="http://www.w3.org/ns/json-ld#context";
      type="application/ld+json"
```

The Link target is the public context URL document served by the app. cborld
resolves those URLs through the cached context documents; no network fetch is
performed. Inline-context responses omit this Link relation because the context
URL array is already in every notification.

### Link-only mode (`context=link`, default)

The notification objects contain no `@context`. The Link header is the only
place the context is advertised.

- NDJSON lines are plain compact JSON.
- CBOR items are produced by the plain-CBOR encoder in `src/cbor.ts` using
  `cborg.encode(notification)`. They have no CBOR-LD tag and no context.
- The client decodes the plain CBOR items with `cborg` and treats the result as
  plain JSON. It parses the Link header for display only.

### Inline-context mode (`context=inline`)

Every notification in both representations includes the public URL array:

```json
{
  "@context": [
    "https://www.w3.org/ns/lws/v1",
    "https://www.w3.org/ns/activitystreams"
  ],
  "id": "urn:uuid:...",
  "type": "Notification",
  "storage": "https://storage.example/",
  "activity": { "...": "..." }
}
```

- NDJSON lines include that `@context` array.
- CBOR items are compressed with `@digitalbazaar/cborld`. The URL array alone is
  not enough for cborld: the server supplies a document loader backed by
  `cached-context.json`, keyed by the two official URLs. No network fetch occurs.
- The client uses `cborld` only to decompress the item back to JSON. It does not
  fetch, resolve, validate, or expand the public context, and it performs no RDF
  processing. For decompression, the client bundles the same cached context
  documents as opaque decoder data.
- No context `Link` relation is sent in inline mode.

### CBOR-LD registry configuration

Only inline-context mode uses `@digitalbazaar/cborld`, with:

- `format: 'cbor-ld-1.0'` (default, tag `0xcb1d`)
- `registryEntryId: 1` (the default registry, with compression enabled)
- a document loader backed by `cached-context.json`

The public `@context` array is carried inside each CBOR-LD item. cborld resolves
the two URLs through the cached document loader to perform compression. Link-only
mode does not use cborld at all; it emits plain CBOR. A production deployment
could register context codes and a custom term table to reduce inline-mode
bytes further, at the cost of distributing registry metadata.

### NDJSON framing

For each notification:

1. `JSON.stringify(document)` produces compact JSON.
2. UTF-8 encode.
3. Append exactly one LF byte (`0x0a`).

There is no BOM, no blank line, and no trailing partial line.

### CBOR Sequence framing

Each encoded notification is one complete CBOR item. Items are written
back-to-back with no delimiter, length prefix, enclosing array, or
self-described CBOR tag. That concatenation is an RFC 8742 CBOR Sequence.

- Link-only mode: plain `cborg.encode(notification)` items.
- Inline mode: tagged CBOR-LD 1.0 items.

The client frames the sequence incrementally with `cborg.decodeFirst()`, using
tag decoders for CBOR-LD 1.0 tag `51997` and the legacy CBOR-LD tags. It then
passes the exact item bytes to the mode-appropriate decoder: `cborg` for plain
CBOR or `@digitalbazaar/cborld` for inline-context CBOR-LD. This works even when
an item is split across arbitrary transport chunks.

## Client statistics

Each panel displays an illustrative HTTP request and response-header snippet
before its decoded notification list. The snippet follows that panel's
link-only/inline mode; the live values below it are computed from the stream.

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

The context document, cached context data, and HTTP headers are not included.
When inline mode is active, the inlined `@context` array is part of both response
bodies and is counted. The client also matches notifications by top-level `id`,
checks order, and deep-compares the logical payloads after removing any inlined
`@context`. It never performs RDF processing.

### Sample measurement

With the default 8 fixtures, one run produced:

**Link-only mode (default)**

| Representation | Body bytes | Average |
|---|---:|---:|
| NDJSON | 3,272 | 409.0 B |
| Plain CBOR Sequence | 2,896 | 362.0 B |
| Reduction | | **11.5%** |

**Inline-context mode**

| Representation | Body bytes | Average |
|---|---:|---:|
| NDJSON | 3,944 | 493.0 B |
| CBOR-LD Sequence | 2,097 | 262.1 B |
| Reduction | | **46.8%** |

These totals use the generated fixture file in this repository. The
representations carry fixed-length UUIDs and six-character cuid2 segments, so
rerunning the fixture generator does not change their size. The public context
array is fixed and the payloads do not depend on the host name. Timing depends
on machine and network; the first-item figure in particular is not a benchmark.
Always measure the deployment being evaluated.

### Fixture generation

`packages/server/fixtures/notifications.json` is generated rather than
hand-edited. The generator uses:

- `randomUUID()` from `node:crypto` for notification and activity UUID URNs
- `@paralleldrive/cuid2` initialized with `length: 6` for resource and container
  identifiers
- `https://{name}.id.example` actor URLs
- flat `https://storage.example/{cuid2}` URLs for objects, targets, and origins

Regenerate the committed fixture file with:

```bash
npm run generate:fixtures
```

The generated JSON is committed so both representations observe the same
sequence across concurrent requests and separate serverless instances. Re-run
the generator only when you intentionally want new random identifiers.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Node server and Vite client together |
| `npm run generate:fixtures` | Regenerate notification IDs and paths |
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
false`), so the context URL in the Link header uses the client-visible origin
(`http://localhost:5173`). The client displays that URL but does not fetch it.

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
- Plain-CBOR and CBOR-LD encode/decode round-trips
- Link-only and inline-context behavior for both representations
- Logical equivalence and ordering across both representations
- Public context URL array and cached-context resolution
- Context Link parsing for display only
- Conditional Link context relation: included in link-only mode, omitted inline
- Generated fixture shape: UUID URNs, actor hosts, and flat six-character cuid2
  paths
- Chunk-boundary robustness: NDJSON, plain CBOR, and CBOR-LD items fed one byte
  at a time
- Incremental plain-CBOR and CBOR-LD decoding through the client reader
- Size-reduction and average-byte calculations
- Client reader cancellation with `AbortController`
- Server stream cancellation on request abort
- Cloudflare Worker and Vercel Function adapter smoke tests
- Real workerd and `vercel dev --local` deployment smoke tests

## Design notes and limitations

- The fixtures are synthetic and committed; no external storage or auth is
  involved. This is a benchmark/demo, not a production LWS notification service.
- The fixture generator uses `crypto.randomUUID()` for UUID URNs and
  `@paralleldrive/cuid2` with `length: 6` for flat storage paths. Generation is
  a one-time authoring step; the committed JSON keeps both representations
  identical across requests and serverless instances.
- Actors use `https://{name}.id.example`. Objects, targets, and origins use flat
  `https://storage.example/{cuid2}` URLs.
- The API returns `Access-Control-Allow-Origin: *` and exposes Link metadata for
  demonstration convenience. Tighten CORS for a real deployment.
- The context URL is derived from the request origin so it works on every host.
  Production deployments should sit behind a trusted host/proxy, or make the
  public origin explicit if Host-header manipulation is a concern.
- The public Link context document contains only the official context URLs and
  is served with a one-hour cache lifetime by the server. It is advertised with
  a Link relation only in link-only mode. The client parses the Link URL for
  display when present but never fetches or resolves it.
- cborld requires resolved context documents behind those URLs. The server
  imports them from `cached-context.json`; the client bundles the same data as
  opaque decode-cache input. The client treats decoded items as plain JSON, uses
  the cache only for decompression, and strips `@context` before display and
  comparison.
- The server emits one encoded item per stream chunk. TCP/HTTP framing and
  serverless platform buffering may regroup chunks in transit; the client
  readers are explicitly chunk-boundary independent.
- No HTTP content encoding (gzip/br) is used, so the comparison isolates the
  representation size rather than transport compression.
- The default Node process is watch-mode during development. Stopping/restarting
  the client aborts its requests; the generator stops rather than finishing the
  remaining sequence.
