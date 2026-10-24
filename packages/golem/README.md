# Golem variant: Rust NDJSON, CBOR-LD, and Jelly-RDF

A Golem 1.6 application that exposes the demo's notification stream through a
Rust HTTP router. It is the only Golem component in this package: there is no
Effect/TypeScript implementation and no npm dependency tree here.

The Rust router uses:

- [spruceid/cbor-ld][cbor-ld] for CBOR-LD
- the Jelly-RDF protobuf schema for Jelly-RDF
- `golem_rust::http_router` with `AgentStream<Vec<u8>>` for streaming

[cbor-ld]: https://github.com/spruceid/cbor-ld

## Component

| Component | Domain | What it serves |
|---|---|---|
| `lws-http-stream:rust-main` | `127.0.0.1:8787` | NDJSON, plain CBOR Sequence, CBOR-LD, Jelly-RDF |

Routes:

| Path | Response |
|---|---|
| `GET /notifications` | NDJSON, CBOR Sequence, or Jelly-RDF, depending on `Accept` |
| `GET /health` | JSON health document |
| `GET /contexts/lws-notifications-v1.jsonld` | JSON-LD context document |
| other matches | 404 |

`application/cbor-seq` uses CBOR-LD when `context=inline` and plain CBOR when
`context=link`. `application/x-jelly-rdf` returns length-delimited Jelly-RDF
frames.

## Why a custom HTTP router?

Golem code-first agent methods map typed inputs and outputs to HTTP responses,
but the existing UI expects the literal `/notifications` path and an open-ended
streaming response body. `rust/src/router.rs` owns the status, headers, content
type, and byte stream directly.

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
bundles the component from this directory. The root `npm run generate:fixtures`
script copies the notification, public context, and cached context files here
automatically.

## Local development

Requirements:

- The full `golem` binary with the built-in local server (`golem server run`).
  The `golem-cli` binary can build and deploy but cannot start the local server.
  Set `GOLEM_BIN` to the full binary path.
- A Rust toolchain with the `wasm32-wasip2` target on `PATH`:
  ```bash
  rustup target add wasm32-wasip2
  ```
  Or use Devbox: `devbox shell` installs rustup and the `wasm32-wasip2` target
  from the repo's `devbox.json`.

The manifest fixes the local custom request port to 8787, matching the Vite
proxy. The Node server also uses 8787; run only one of them at a time.

From the repository root:

```bash
# Terminal 1
GOLEM_BIN=/path/to/golem npm run golem:server

# Terminal 2 — builds the Rust component, then deploys
npm run golem:deploy

# Terminal 3
npm run dev:client
```

Or after the Golem server is running:

```bash
npm run dev:golem
```

The root scripts use the repository's `./golem` CLI for build/deploy by default;
set `GOLEM_BIN` to use another binary. The Vite proxy uses `changeOrigin: true`
so the upstream `Host` header matches `127.0.0.1:8787`.

The build writes local agent skills to `.agents` and `AGENTS.md`; those generated
files are ignored by git.

## Deploy the Rust server to Golem Cloud

`golem.cloud.yaml` is a cloud-only manifest containing only
`lws-http-stream:rust-main`. It exposes the Rust router at
`https://lws-http-stream.apps.golem.cloud` (change the `subdomain` if taken).

From the repository root:

```bash
# Authenticate once (GitHub OAuth2)
./golem -C account get

# Commit tracked changes first; cloud deploys reject dirty trees
npm run golem:deploy:cloud
```

The cloud manifest has `versionCheck: true`, so each deployment must use a new
git commit/version. The local Vite client still points at `127.0.0.1:8787`; use
the cloud URL directly with `curl`, or change the Vite proxy target to test the
UI against cloud.

## Checks

```bash
devbox run -- sh -c 'cd packages/golem/rust && cargo fmt --check'
devbox run -- npm run golem:build
```

No npm install is required inside `packages/golem`.
