import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stopProcessTree } from './process-tree.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8790;
const origin = `http://127.0.0.1:${port}`;
const wranglerBin = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const child = spawn(
  process.execPath,
  [
    wranglerBin,
    'dev',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--inspector-port',
    String(port + 1),
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      CI: '1',
      WRANGLER_SEND_METRICS: 'false',
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let logs = '';
child.stdout.on('data', chunk => {
  logs += chunk.toString();
});
child.stderr.on('data', chunk => {
  logs += chunk.toString();
});

let stopped = false;
function stop() {
  if (stopped) {
    return;
  }
  stopped = true;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

process.on('exit', stop);

try {
  await waitForServer();
  await checkHealth();
  await checkStreams();
  await checkStaticClient();
  await checkContext();
  console.log('Cloudflare workerd smoke test passed.');
} catch (error) {
  console.error('\nCloudflare smoke test failed.');
  console.error(logs);
  throw error;
} finally {
  await stopProcessTree(child);
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${origin}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Not ready yet.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for wrangler dev');
}

async function checkHealth() {
  const response = await fetch(`${origin}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');
  console.log(`Cloudflare /health: ${body.service}`);
}

async function checkStreams() {
  const [ndjson, cbor] = await Promise.all([
    fetch(`${origin}/notifications?count=3&interval=0`, {
      headers: { Accept: 'application/x-ndjson' },
    }),
    fetch(`${origin}/notifications?count=3&interval=0`, {
      headers: { Accept: 'application/cbor-seq' },
    }),
  ]);

  assert.equal(ndjson.status, 200);
  assert.equal(ndjson.headers.get('content-type'), 'application/x-ndjson');
  const ndjsonBytes = new Uint8Array(await ndjson.arrayBuffer());
  assert.equal(new TextDecoder().decode(ndjsonBytes).trimEnd().split('\n').length, 3);

  assert.equal(cbor.status, 200);
  assert.equal(cbor.headers.get('content-type'), 'application/cbor-seq');
  const cborBytes = new Uint8Array(await cbor.arrayBuffer());
  assert.ok(cborBytes.byteLength > 10);
  assert.notDeepEqual(Array.from(cborBytes.subarray(0, 3)), [0xd9, 0xcb, 0x1d]);

  const [inlineNdjson, inlineCbor] = await Promise.all([
    fetch(`${origin}/notifications?count=2&interval=0&context=inline`, {
      headers: { Accept: 'application/x-ndjson' },
    }),
    fetch(`${origin}/notifications?count=2&interval=0&context=inline`, {
      headers: { Accept: 'application/cbor-seq' },
    }),
  ]);
  assert.match(await inlineNdjson.text(), /"@context"/);
  assert.equal(inlineNdjson.headers.get('link'), null);
  const inlineCborBytes = new Uint8Array(await inlineCbor.arrayBuffer());
  assert.deepEqual(Array.from(inlineCborBytes.subarray(0, 3)), [0xd9, 0xcb, 0x1d]);
  assert.equal(inlineCbor.headers.get('link'), null);

  const ndjsonLink = ndjson.headers.get('link');
  const cborLink = cbor.headers.get('link');
  assert.ok(ndjsonLink);
  assert.equal(ndjsonLink, cborLink);

  console.log(
    `Cloudflare streams: ${ndjsonBytes.byteLength} NDJSON bytes, ` +
      `${cborBytes.byteLength} plain CBOR bytes, ${inlineCborBytes.byteLength} inline CBOR-LD bytes`,
  );
}

async function checkStaticClient() {
  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /LWS stream size lab/);
  console.log('Cloudflare static client: ok');
}

async function checkContext() {
  const response = await fetch(`${origin}/contexts/lws-notifications-v1.jsonld`);
  assert.equal(response.status, 200);
  const document = await response.json();
  assert.ok(document['@context']);
  console.log('Cloudflare context endpoint: ok');
}
