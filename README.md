# LWS notification streaming: NDJSON, CBOR Sequence, and Jelly-RDF

>[!NOTE]
> Generated with opencode-go/DeepSeek V4.1 Flash (max)

>[!TIP]
> * https://cbor-ld-stream-demo.elf-pavlik.workers.dev
> * https://lws-http-stream.vercel.app

A small full-stack demonstration of streaming Linked Web Storage (LWS)
notifications over HTTP, comparing three representations of the same ordered
notification sequence:

- **NDJSON**: one compact JSON document per line, `application/x-ndjson`.
- **CBOR Sequence**: plain CBOR items in link-only mode, or compressed CBOR-LD
  items when `@context` is inlined, `application/cbor-seq`.
- **Jelly-RDF**: length-delimited `RdfStreamFrame` messages with RDF/JS quads,
  `application/x-jelly-rdf`.

Each NDJSON/CBOR panel has its own `@context` toggle controlling whether the
context is only advertised in the HTTP `Link` header or is also inlined into
every notification. NDJSON starts in link-only mode; CBOR starts with the
context inlined. The Jelly panel has no context toggle; it is a binary RDF
stream. The SolidJS client opens all three streams concurrently after you press
**Start all streams**, decodes them incrementally, matches notifications by ID,
and computes byte statistics from the actual response bodies. The notification
lists are virtualized, so only the visible rows are mounted. The Jelly panel
reconstructs notifications from decoded RDF/JS quads for display; no RDF
querying or JSON-LD expansion is performed.

The server is shared TypeScript using Web-standard `Request`, `Response`,
`ReadableStream`, and `Uint8Array` APIs. It runs directly on Node.js with native
type stripping, and is deployed through thin Cloudflare Worker and Vercel
Function adapters.

## References

- [Linked Web Storage (LWS) Protocol - Notifications](https://w3c.github.io/lws-protocol/lws10-core/#notifications)
- [RDF Messages](https://w3c-cg.github.io/rsp/spec/messages)
- [Solid Notifications: StreamingHTTPChannel2023](https://solid.github.io/notifications/streaming-http-channel-2023)
- [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/)
- [CBOR-LD](https://w3c.github.io/cbor-ld/)
- [NDJSON Specification](https://github.com/ndjson/ndjson-spec)
- [RFC 8742 — Concise Binary Object Representation (CBOR) Sequences](https://www.rfc-editor.org/rfc/rfc8742)
- [Jelly-RDF — Delimited Variant of Jelly Serialization](https://jelly-rdf.github.io/dev/specification/serialization/#delimited-variant-of-jelly)

## Requirements

- Node.js **24** (native TypeScript type stripping is required)
- npm 11 (the repository is an npm workspace)
- Optional: `devbox shell` provides Node 24, rustup, and the `wasm32-wasip2`
  target used by the Golem variant
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

The server defaults to a 250 ms interval. The client uses a 500 ms interval and
streams indefinitely until you press **Stop all streams**; it does not start
until you press **Start all streams**. While a stream is running, the same
button becomes **Re-start all streams**, and **Stop all streams** aborts every
response body. The NDJSON and CBOR panels each have their own `@context`
toggle; toggling either one restarts all three streams so their sequences stay
aligned. The Jelly stream is independent of the context mode.

### Get all three representations with curl

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

# Jelly-RDF: binary length-delimited frames, no newline delimiters
curl -sS -D /tmp/jelly.headers \
  'http://localhost:5173/notifications?count=3&interval=0' \
  -H 'Accept: application/x-jelly-rdf' \
  -o /tmp/notifications.jelly
cat /tmp/jelly.headers
od -An -tx1 -N 48 /tmp/notifications.jelly

# The response-level JSON-LD context advertised by Link
curl -i 'http://localhost:5173/contexts/lws-notifications-v1.jsonld' \
  -H 'Accept: application/ld+json'
```

Use `http://localhost:8787` instead of `:5173` to call the Node server directly.
The CBOR output is binary, so writing it to a file and inspecting it with `od`
avoids dumping binary data into the terminal. These examples pass `count=3` so
`curl` exits on its own; omit `count` for an infinite stream and use
`--max-time` or a limiting consumer.

## Golem variant: Rust NDJSON, CBOR-LD, and Jelly-RDF

`packages/golem` is an independent Golem 1.6 application with one Rust
component:

| Component | Domain | What it serves |
|---|---|---|
| `lws-http-stream:rust-main` | `127.0.0.1:8787` | NDJSON, plain CBOR Sequence, CBOR-LD, Jelly-RDF |

The Rust router owns the existing Vite proxy port and serves the same
`/notifications`, `/health`, and `/contexts/lws-notifications-v1.jsonld` paths
as the Node server. All three representations work:

- `application/x-ndjson` → NDJSON
- `application/cbor-seq` → CBOR-LD (`context=inline`) or plain CBOR
  (`context=link`), using [spruceid/cbor-ld](https://github.com/spruceid/cbor-ld)
- `application/x-jelly-rdf` → length-delimited Jelly-RDF frames

The Jelly writer uses the Jelly-RDF protobuf schema from the Jelly-RDF project
(the schema used by `jelly_rs`). Upstream `jelly_rs` currently implements
deserialization only, so the Rust router supplies the row-layout v2 writer; its
output is verified with both `jelly_rs` and the client's `rdfjs-jelly` parser.

The local Node server and the Golem Rust router both listen on **8787**. Run one
at a time. The manifest sets `localServer.customRequestPort: 8787` and registers
the Rust deployment at `127.0.0.1:8787`.

### Requirements

- The full `golem` binary with the built-in local server. The `./golem` file in
  this repository root is the `golem-cli` binary; it can build and deploy but
  does not implement `golem server run`. Download the
  `golem-x86_64-unknown-linux-gnu` asset from the Golem v1.6.0 release, or point
  `GOLEM_BIN` at an existing full binary.
- A Rust toolchain with the `wasm32-wasip2` target on `PATH`, for the Rust
  component. For example:
  ```bash
  rustup target add wasm32-wasip2
  ```
  Or use Devbox: `devbox shell` installs Node 24, rustup, and the
  `wasm32-wasip2` target from the repo's `devbox.json`.
- No npm install is needed inside `packages/golem`; it has no npm dependencies.

### Run

```bash
# Terminal 1: local Golem server (custom request port from golem.yaml = 8787)
GOLEM_BIN=/path/to/golem npm run golem:server

# Terminal 2: build the Rust component and deploy it
npm run golem:deploy

# Terminal 3: Vite client only; do not run `npm run dev`, which starts the
# Node server on 8787 as well
npm run dev:client
```

After the server is running, `npm run dev:golem` performs the deploy and starts
the Vite client in one step. The `golem:build` and `golem:deploy` scripts use the
repository's `./golem` CLI by default; set `GOLEM_BIN` to use another binary.
From a Devbox shell, `devbox run -- npm run golem:deploy` works as well.

Test the Golem routes directly or through the Vite proxy:

```bash
# NDJSON
curl -i 'http://127.0.0.1:8787/notifications?count=3&interval=0' \
  -H 'Accept: application/x-ndjson'

# CBOR-LD (inline context)
curl -sS -o /tmp/cborld.bin \
  'http://127.0.0.1:8787/notifications?count=3&interval=0&context=inline' \
  -H 'Accept: application/cbor-seq'

# Plain CBOR Sequence (link-only context)
curl -sS -o /tmp/cbor-seq.bin \
  'http://127.0.0.1:8787/notifications?count=3&interval=0&context=link' \
  -H 'Accept: application/cbor-seq'

# Jelly-RDF: length-delimited frames, no newline delimiters
curl -sS -o /tmp/jelly.bin \
  'http://127.0.0.1:8787/notifications?count=3&interval=0' \
  -H 'Accept: application/x-jelly-rdf'
od -An -tx1 -N 32 /tmp/jelly.bin
```

The Rust HTTP router (`packages/golem/rust/src/router.rs`) uses
`golem_rust::http_router` and `AgentStream<Vec<u8>>`. Jelly frame construction
lives in `packages/golem/rust/src/jelly.rs`; the RDF mapping matches
`packages/server/src/jelly.ts`.

### Deploy the Rust server to Golem Cloud

`packages/golem/golem.cloud.yaml` is a cloud-only manifest that deploys only the
Rust server component and exposes it at
`https://lws-http-stream.apps.golem.cloud`.

Authenticate once (GitHub OAuth2):

```bash
./golem -C account get
```

Cloud deployments reject uncommitted tracked changes and `versionCheck: true`
rejects reusing a version, so commit first and bump the version for each cloud
deploy. Then:

```bash
npm run golem:deploy:cloud
```

The URL comes from the `subdomain` in `golem.cloud.yaml`; change it if
`lws-http-stream` is already taken. Verify:

```bash
curl -i https://lws-http-stream.apps.golem.cloud/health
curl -N 'https://lws-http-stream.apps.golem.cloud/notifications?interval=500' \
  -H 'Accept: application/x-ndjson'
curl -N 'https://lws-http-stream.apps.golem.cloud/notifications?interval=500&context=inline' \
  -H 'Accept: application/cbor-seq'
curl -sS -o /tmp/cloud.jelly \
  'https://lws-http-stream.apps.golem.cloud/notifications?count=3&interval=0' \
  -H 'Accept: application/x-jelly-rdf'
```

The Vite client uses relative URLs, so it keeps talking to the local server by
default. To use the cloud server, point the Vite proxy targets in
`packages/client/vite.config.ts` at the cloud host, or deploy the client
separately behind the same origin.

## API

### `GET /notifications?interval=250`

| Query | Default | Range | Meaning |
|---|---:|---:|---|
| `count` | omitted (infinite) | 1–100 | Optional finite number of notifications; the fixture sequence repeats |
| `interval` | `250` | 0–5000 ms | Delay between notifications |
| `context` | `link` | `link` or `inline` | NDJSON/CBOR only; ignored for Jelly |

Content negotiation:

| `Accept` | Response |
|---|---|
| `application/x-ndjson` | NDJSON stream |
| `application/cbor-seq` | RFC 8742 CBOR Sequence (plain CBOR or CBOR-LD, depending on `context`) |
| `application/x-jelly-rdf` | Length-delimited Jelly-RDF `RdfStreamFrame` stream |
| missing / empty | NDJSON (documented default) |
| `*/*` or `application/*` | NDJSON unless quality values select another representation |
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

Inline-context responses omit the context `Link` relation. Jelly responses also
have no context `Link` relation:

```http
Content-Type: application/x-jelly-rdf
Cache-Control: no-store
Vary: Accept
```

The first notification is sent immediately; later notifications are separated
by the configured interval. If `count` is omitted, the fixture sequence repeats
indefinitely until the client disconnects. The response is a real streaming
response, not a buffered body. Request abort and reader cancellation stop the
producer.

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
│   │       ├── jelly.ts
│   │       ├── ndjson.ts
│   │       ├── negotiation.ts
│   │       ├── notifications.ts
│   │       └── stream.ts
│   ├── golem/
│   │   ├── fixtures/                    # copied LWS fixtures and cached contexts
│   │   ├── rust/
│   │   │   ├── proto/rdf.proto          # Jelly-RDF protobuf schema
│   │   │   ├── src/jelly.rs             # Jelly row-layout v2 writer
│   │   │   ├── src/router.rs            # Rust router, NDJSON + CBOR + Jelly
│   │   │   ├── build.rs                 # prost/protoc generation
│   │   │   ├── vendor/tokio-stub/       # wasm-friendly tokio stub for cbor-ld
│   │   │   ├── Cargo.toml
│   │   │   └── Cargo.lock
│   │   ├── golem.yaml                   # local custom request port 8787
│   │   └── golem.cloud.yaml             # cloud-only Rust deployment
│   └── client/
│       ├── src/
│       │   ├── api.ts
│       │   ├── components/
│       │   │   ├── ContextToggle.tsx
│       │   │   ├── HttpExchange.tsx
│       │   │   ├── NotificationList.tsx
│       │   │   ├── Statistics.tsx
│       │   │   └── StreamPanel.tsx
│       │   ├── lib/
│       │   │   ├── cbor.ts
│       │   │   ├── cborSequence.ts
│       │   │   ├── cborld.ts
│       │   │   ├── jelly.ts
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

The endpoint supports two context modes for NDJSON and CBOR, controlled by the
`context` query parameter. The server default is `link`; the client's CBOR panel
starts with `inline` enabled, while the NDJSON panel starts in link-only mode.
Jelly-RDF ignores this parameter and is always a binary RDF stream.

| Mode | Query | Link context relation | NDJSON | CBOR Sequence |
|---|---|---|---|---|
| Link-only (server default) | `context=link` | included | no inlined `@context` | plain CBOR, no CBOR-LD tag, no `@context` |
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

Every notification in both NDJSON and CBOR representations includes the public URL array:

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

## Jelly-RDF streaming

### Media type and framing

The Jelly representation uses `application/x-jelly-rdf` (the media type
recommended by the current Jelly-RDF specification) and the `.jelly` extension.

An ordinary HTTP response body uses Jelly's **delimited variant**: a sequence of
`RdfStreamFrame` Protobuf messages, each preceded by a Protobuf varint containing
the message length in bytes. There are no newline delimiters, no enclosing array,
and no gRPC message envelope. gRPC provides its own message framing; this demo
uses HTTP/1.1 or HTTP/2 response-body streaming instead.

The server writes one `RdfStreamFrame` per notification:

- `rdfjs-jelly`'s delimited `Writer` is created once per response.
- `addMessage(quads)` flushes exactly one frame.
- The Writer immediately writes the length-prefixed frame to the response
  `ReadableStream`.
- The first frame contains the stream options and lookup entries; later frames
  reuse the stream's lookup state.

### Implementation version

This repository uses `rdfjs-jelly` 0.1.6. That implementation:

- reads Jelly protocol versions 1 and 2
- writes Jelly protocol version 2 only (Jelly-RDF 1.1)
- supports delimited output, lookup compression, namespaces, and RDF/JS quads

The current Jelly-RDF specification in development is 1.2 (protocol version 3).
`rdfjs-jelly` 0.1.6 does not yet write version 1.2 streams. The media type and
delimited framing used here are the same; the stream's version tag identifies the
protocol version. Upgrade `rdfjs-jelly` when version-1.2 writing support becomes
available.

### RDF mapping

Each notification is mapped to a small deterministic RDF graph using RDF/JS
quads:

- `<notification> rdf:type lws:Notification`
- `<notification> lws:storage <storage>`
- `<notification> lws:activity <activity>` for each activity
- `<activity> rdf:type as:Create|Update|Delete|Move`
- `<activity> as:actor <actor>`
- `<activity> as:object <object>`
- `<object> rdf:type lws:DataResource|...`
- `<activity> as:target <target>` / `as:origin <origin>` when present
- `<activity> as:published "..."^^xsd:dateTime`

The client decodes RDF/JS quads and reverses this mapping to recover the logical
notification for the side-by-side display and equivalence checks. It does not
query or expand RDF.

### Incremental client decoding

The client uses the browser `StreamParser` from `rdfjs-jelly/browser`:

```ts
const parser = new StreamParser({ messages: true });
const decoded = response.body.pipeThrough(countedBytes).pipeThrough(parser);
```

`StreamParser` handles varint length prefixes and frames split across arbitrary
transport reads. The reader groups emitted `MessageQuad` entries by
`messageCounter`; each complete frame becomes one decoded notification. No
assumption is made that HTTP chunks align with Jelly frames.

The Jelly panel has no `@context` toggle. Its response has no JSON-LD context
`Link` relation and does not depend on the NDJSON/CBOR context mode.

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

The comparison headlines use NDJSON as the baseline:

```text
CBOR reduction:  100 × (NDJSON bytes − CBOR bytes) / NDJSON bytes
Jelly reduction: 100 × (NDJSON bytes − Jelly bytes) / NDJSON bytes
```

The context document, cached context data, and HTTP headers are not included.
When inline mode is active for NDJSON/CBOR, the inlined `@context` array is part
of those response bodies and is counted. The Jelly body is independent of the
context toggle. The client matches notifications by top-level `id` across all
three streams. The summary shows a running notification count plus the
independent per-stream counts.

Jelly frame byte sizes are not exposed by the incremental parser, so the
per-message list shows “stream frame” for Jelly. Total body bytes, decoded message
counts, and average bytes per message are exact.

### Sample measurement

With `count=8`, one run produced:

**Link-only mode (default)**

| Representation | Body bytes | Average |
|---|---:|---:|
| NDJSON | 3,272 | 409.0 B |
| Plain CBOR Sequence | 2,896 | 362.0 B |
| Jelly-RDF | 3,193 | 399.1 B |
| CBOR reduction | | **11.5%** |
| Jelly reduction | | **2.4%** |

**Inline-context mode**

| Representation | Body bytes | Average |
|---|---:|---:|
| NDJSON | 3,944 | 493.0 B |
| CBOR-LD Sequence | 2,097 | 262.1 B |
| Jelly-RDF | 3,193 | 399.1 B |
| CBOR reduction | | **46.8%** |
| Jelly reduction | | **19.0%** |

These totals use the generated fixture file in this repository. The
representations carry fixed-length UUIDs and six-character cuid2 segments, so
rerunning the fixture generator does not change their size. The public context
array is fixed and the payloads do not depend on the host name. Jelly is
independent of the context toggle, so its size is identical in both tables; its
reduction percentage changes with the NDJSON baseline. Timing depends on machine
and network; the first-item figure in particular is not a benchmark. Always
measure the deployment being evaluated.

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

The generated JSON is committed so all three representations observe the same
sequence across concurrent requests and separate serverless instances. Re-run
the generator only when you intentionally want new random identifiers.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Node server and Vite client together |
| `npm run generate:fixtures` | Regenerate notification IDs and paths, and sync the Golem fixtures |
| `npm run dev:server` | `node --watch` the TypeScript server |
| `npm run dev:client` | Start Vite |
| `npm run build` | Build client and type-check server + client + root API |
| `npm run build:client` | Build only the Solid client |
| `npm run typecheck` | Type-check all TypeScript packages and API entry points |
| `npm test` | Run server and client unit/integration tests |
| `npm run smoke:adapters` | Invoke Cloudflare and Vercel adapters with Web Requests |
| `npm run smoke:cloudflare` | Build, start `wrangler dev` in workerd, verify all three streams |
| `npm run smoke:vercel` | Build production Vercel output and invoke the built function |
| `npm run deploy:cloudflare` | Build client and run `wrangler deploy` |
| `npm run deploy:vercel` | Build client and run `vercel deploy --prod` |
| `npm run preview:cloudflare` | Build client and run local `wrangler dev` |
| `npm run dev:golem` | Deploy the Golem app and start the Vite client |
| `npm run golem:server` | Start the local Golem server on custom request port 8787 |
| `npm run golem:build` | Build the Rust Golem component |
| `npm run golem:deploy` | Build and deploy the Rust Golem component locally |
| `npm run golem:deploy:cloud` | Deploy the Rust server component to Golem Cloud |

Server environment variables (Node adapter only):

- `PORT` (default `8787`)
- `NOTIFICATION_INTERVAL_MS` (default `250`)

Cloudflare and Vercel use the shared defaults; query parameters work on every
platform. Set deployment environment variables only if you add platform-specific
configuration to those adapters.

## Local development details

`packages/server/adapters/node.ts` uses `@hono/node-server` and executes the
shared Hono app. The Vite proxy uses `changeOrigin: true`, so the upstream Host
is `127.0.0.1:8787`. The Node server builds the context URL in the Link header
from that host; the Golem deployment also needs the Host to match its registered
domain (`127.0.0.1:8787`). The client displays the URL but does not fetch it.

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
- `@digitalbazaar/cborld`, `rdfjs-jelly`, and their transitive dependencies are
  bundled by Wrangler and have been smoke-tested in workerd.
- The Cloudflare adapter temporarily hides workerd's partial Node `Buffer`
  shim while loading `rdfjs-jelly`. This makes protobufjs select its
  `Uint8Array` writer instead of the workerd `BufferWriter`, whose
  `utf8Write` fails on longer strings.

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
health, all three negotiated streams, the context route, and static assets, then
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
apply to infinite UI streams. For a finite stream, keep
`(count − 1) × interval` within the selected plan's function duration. Longer
experiments can be run locally on the Node server.

Deploy:

```bash
npx vercel login            # once
npx vercel link             # once, from the repository root
npm run deploy:vercel
```

Run a Vercel check:

```bash
npm run smoke:vercel
# or interactively for the dev server:
npx vercel dev --local
```

`npm run smoke:vercel` runs an actual `vercel build`, imports the built
`api/notifications` function, and checks NDJSON, CBOR, and Jelly against the
production output. This is the check that catches deployment-time issues such as
unrewritten `.ts` import specifiers. The interactive `vercel dev --local` command
is still useful for testing the Vite client and local routing.

Actual `vercel deploy --prod` requires a linked project and authentication.

The root `tsconfig.json` enables `rewriteRelativeImportExtensions`. This is
required for Vercel's TypeScript transpilation: server source imports use
explicit `.ts` extensions for Node native type stripping, and Vercel must rewrite
them to `.js` in the deployed function output. `npm run smoke:vercel` builds the
actual production output and invokes the built function, covering NDJSON, CBOR,
and Jelly.

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
- Jelly-RDF frame encoding, length-delimited framing, and RDF/JS decoding
- Link-only and inline-context behavior for NDJSON and CBOR
- Logical equivalence and ordering across all three representations
- Public context URL array and cached-context resolution
- Context Link parsing for display only
- Conditional Link context relation: included in link-only mode, omitted inline
- Generated fixture shape: UUID URNs, actor hosts, and flat six-character cuid2
  paths
- Chunk-boundary robustness: NDJSON, plain CBOR, CBOR-LD, and Jelly frames fed
  one byte at a time
- Incremental plain-CBOR, CBOR-LD, and Jelly-RDF decoding through the client
  readers
- Size-reduction and average-byte calculations
- Client reader cancellation with `AbortController`
- Server stream cancellation on request abort
- Cloudflare Worker and Vercel Function adapter smoke tests
- Real workerd and Vercel production-build smoke tests

## Design notes and limitations

- The fixtures are synthetic and committed; no external storage or auth is
  involved. This is a benchmark/demo, not a production LWS notification service.
- Jelly-RDF uses `application/x-jelly-rdf` and the delimited Protobuf variant:
  each `RdfStreamFrame` is prefixed by its varint byte length. No newline or
  gRPC envelope is added. `rdfjs-jelly` 0.1.6 writes protocol version 2
  (Jelly-RDF 1.1); version 1.2 writing is not yet available in that JS
  implementation.
- Jelly has no `@context` toggle and no JSON-LD context `Link` relation. Its RDF
  mapping is a simple deterministic projection of the notification envelope,
  activity, object, and published fields.
- The fixture generator uses `crypto.randomUUID()` for UUID URNs and
  `@paralleldrive/cuid2` with `length: 6` for flat storage paths. Generation is
  a one-time authoring step; the committed JSON keeps all three representations
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

## License

[MIT](./LICENSE) © 2026 elf Pavlik
