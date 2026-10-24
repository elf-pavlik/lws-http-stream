# Golem variant: Rust Jelly + CBOR-LD + Effect NDJSON

A Golem 1.6 application that exposes the demo's notification stream. The main
server is a Rust HTTP router using [spruceid/cbor-ld][cbor-ld] for CBOR-LD and
the Jelly-RDF protobuf schema for Jelly. The original TypeScript Effect router
is retained on a second domain for comparison.

[cbor-ld]: https://github.com/spruceid/cbor-ld

## Components

| Component | Domain | What it serves |
|---|---|---|
| `lws-http-stream-golem:rust-main` | `127.0.0.1:8787` | NDJSON, plain CBOR Sequence, CBOR-LD, Jelly-RDF |
| `lws-http-stream-golem:effect-main` | `effect.localhost:8787` | NDJSON only |

The Rust router is the one the UI uses, because that is the port the Vite proxy
already targets. It serves:

| Path | Response |
|---|---|
| `GET /notifications` | NDJSON, CBOR Sequence, or Jelly-RDF, depending on `Accept` |
| `GET /health` | JSON health document |
| `GET /contexts/lws-notifications-v1.jsonld` | JSON-LD context document |
| other matches | 404 |

`application/cbor-seq` uses CBOR-LD when `context=inline` and plain CBOR when
`context=link`. `application/x-jelly-rdf` returns length-delimited Jelly-RDF
frames. The client's existing `@digitalbazaar/cborld` decoder decodes the
spruceid CBOR-LD output, and its `rdfjs-jelly` parser decodes the Jelly frames;
both were verified against all fixture notifications.

The Effect router remains reachable at
`http://effect.localhost:8787/notifications`. It is the original NDJSON-only
implementation and is useful for comparing the two SDK approaches.

## Why a custom HTTP router?

Golem code-first agent methods map typed inputs and outputs to HTTP responses,
but the existing UI expects the literal `/notifications` path and an open-ended
streaming response body. Custom routers own the status, headers, content type,
and byte stream directly:

- `packages/golem/rust/src/router.rs` uses `golem_rust::http_router` with
  `AgentStream<Vec<u8>>`.
- `packages/golem/src/router.ts` uses `HttpRouter.define` with `effect/http`.

## CBOR-LD implementation

- Dependency: `cbor-ld` pinned to
  `spruceid/cbor-ld@18b8219e37baede9cfd40599a367facd06dd20f1`, with default
  features disabled so the CLI and its network loader are not built.
- Contexts: the same cached LWS/ActivityStreams documents used by the Node
  server are embedded in the component. An in-memory `json_ld::Loader`
  implements resolution without network access or the agent filesystem.
- Plain CBOR: `ciborium` serializes the notification object with text keys.
- The client's default CBOR mode is inline, so the UI exercises CBOR-LD.
- `rust/vendor/tokio-stub` exists only because `cbor-ld` declares tokio for its
  optional CLI. Its library code never uses tokio, and the stub keeps
  `rt-multi-thread` out of the `wasm32-wasip2` build.

## Jelly-RDF implementation

- `rust/proto/rdf.proto` is the Jelly-RDF protobuf schema from
  [Jelly-RDF/jelly-protobuf](https://github.com/Jelly-RDF/jelly-protobuf), the
  same schema used by `jelly_rs`.
- Upstream `jelly_rs` currently implements deserialization only. The Rust
  component therefore supplies the missing **row-layout protocol version 2**
  writer in `rust/src/jelly.rs`: flat quads, one delimited frame per
  notification, name/datatype lookup tables, and no prefix table.
- The RDF mapping matches `packages/server/src/jelly.ts` so the client can
  reconstruct the same notification objects.
- The generated output was validated with `jelly_rs`'s `FrameReader` /
  `Deserializer` and with the client's `rdfjs-jelly` browser parser.
- `build.rs` compiles the proto with prost and a vendored `protoc`, so no system
  protobuf compiler is required.

## Fixtures

The files under `fixtures/` are copies of `packages/server/fixtures`; Golem
bundles each component from this directory. The root `npm run generate:fixtures`
script copies the notification, public context, and cached context files here
automatically.

## Local development

Requirements:

- The full `golem` binary with the built-in local server (`golem server run`).
  The `golem-cli` binary can build and deploy but cannot start the local server.
  Set `GOLEM_BIN` to the full binary path.
- A Rust toolchain with the `wasm32-wasip2` target on `PATH`, for the Rust
  component:
  ```bash
  rustup target add wasm32-wasip2
  ```
  Or use Devbox: `devbox shell` installs Node 24, rustup, and the
  `wasm32-wasip2` target from the repo's `devbox.json`. From that shell,
  `devbox run -- npm run golem:deploy` also works.
- `npm --prefix packages/golem install` (also run by the root `postinstall`).
  The root `golem:build` and `golem:deploy` scripts use the repository's
  `./golem` CLI by default; set `GOLEM_BIN` to use another binary.

The manifest fixes the local custom request port to 8787, matching the Vite
proxy. The Node server also uses 8787; run only one of them at a time.

```bash
# Terminal 1
GOLEM_BIN=/path/to/golem npm run golem:server

# Terminal 2 — builds both the Rust and Effect components, then deploys
npm run golem:deploy

# Terminal 3
npm run dev:client
```

After the Golem server is running, `npm run dev:golem` deploys and starts the
Vite client in one step.

The Vite proxy uses `changeOrigin: true` so the upstream `Host` header matches
the Golem deployment domain (`127.0.0.1:8787`). The JSON-LD `Link` target is
absolute and points at the Golem custom request port.

The `golem build` command also writes local agent skills to `.agents` and
`AGENTS.md`; those generated files are ignored by git.

## Checks

```bash
npm --prefix packages/golem run typecheck
npm --prefix packages/golem run test
```

The protocol tests cover Accept negotiation, query parameter bounds, and context
mode parsing for the Effect router. The Rust router was verified end-to-end
against the local Golem server with `cborg`, `@digitalbazaar/cborld`, `jelly_rs`,
and `rdfjs-jelly`.
