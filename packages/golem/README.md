# Golem Effect variant

A Golem 1.6 application that exposes the demo's notification stream through a
Golem Effect HTTP router. It is intentionally independent from the root npm
workspace so Golem can resolve its own `node_modules` and the QuickJS guest wasm
shipped by `@golemcloud/effect-golem`.

The fixtures under `fixtures/` are copies of `packages/server/fixtures`; Golem
bundles the component from this directory, so they are kept local. The root
`npm run generate:fixtures` script copies the regenerated notification and
context files here automatically.

The router serves:

| Path | Response |
|---|---|
| `GET /notifications` | Streaming NDJSON (`application/x-ndjson`) |
| `GET /health` | JSON health document |
| `GET /contexts/lws-notifications-v1.jsonld` | JSON-LD context document |
| other matches | 404 |

`application/cbor-seq` and `application/x-jelly-rdf` are deliberately not
implemented and return `404` with a JSON error body. The existing SolidJS client
therefore streams the NDJSON panel and shows its normal error state for the CBOR
and Jelly panels.

## Why a custom HTTP router?

Golem agent methods map typed inputs and outputs to HTTP responses, but the
existing UI expects the literal `/notifications` path and an open-ended streaming
response body. A custom router (`HttpRouter.define` + `effect/http`) owns the
status, headers, content type, and NDJSON chunk stream directly.

## Local development

Requirements:

- The full `golem` binary with the built-in local server (`golem server run`).
  The `golem-cli` binary can build and deploy but cannot start the local server.
  Set `GOLEM_BIN` to the full binary path.
- `npm --prefix packages/golem install` (also run by the root `postinstall`).
  The root `golem:build` and `golem:deploy` scripts use the repository's
  `./golem` CLI by default; set `GOLEM_BIN` to use another binary.

The manifest fixes the local HTTP API deployment at `127.0.0.1:8787` and sets
`localServer.customRequestPort` to the same port. That is the port the Vite
client already proxies to, so the UI needs no change. The Node server also uses
8787; run only one of them at a time.

```bash
# Terminal 1
GOLEM_BIN=/path/to/golem npm run golem:server

# Terminal 2
npm run golem:deploy

# Terminal 3
npm run dev:client
```

After the Golem server is running, `npm run dev:golem` deploys and starts the
Vite client in one step.

The Vite proxy uses `changeOrigin: true` so the upstream `Host` header matches
the Golem deployment domain (`127.0.0.1:8787`). The JSON-LD `Link` target in the
NDJSON response is absolute and points at the Golem custom request port.

The `golem build` command also writes local agent skills to `.agents` and
`AGENTS.md`; those generated files are ignored by git.

## Checks

```bash
npm --prefix packages/golem run typecheck
npm --prefix packages/golem run test
```

The protocol tests cover Accept negotiation, query parameter bounds, and context
mode parsing without starting Golem.
