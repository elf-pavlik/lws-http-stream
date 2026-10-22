import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stopProcessTree } from './process-tree.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 3009;
const origin = `http://127.0.0.1:${port}`;
const vercelBin = path.join(root, 'node_modules', 'vercel', 'dist', 'vc.js');

const child = spawn(
  process.execPath,
  [
    vercelBin,
    'dev',
    '--local',
    '--listen',
    `127.0.0.1:${port}`,
    '--yes',
    '--non-interactive',
    '--runtime-cache-port',
    '4790',
    '--queue-port',
    '4791',
    '--schedules-port',
    '4792',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      CI: '1',
      VERCEL_TELEMETRY_DISABLED: '1',
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
  await checkContext();
  await checkClient();
  console.log('Vercel dev smoke test passed.');
} catch (error) {
  console.error('\nVercel smoke test failed.');
  console.error(logs);
  throw error;
} finally {
  await stopProcessTree(child);
}

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`vercel dev exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${origin}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Not ready yet.
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('Timed out waiting for vercel dev');
}

async function checkHealth() {
  const response = await fetch(`${origin}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');
  console.log(`Vercel /health: ${body.service}`);
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
  assert.deepEqual(Array.from(cborBytes.subarray(0, 3)), [0xd9, 0xcb, 0x1d]);

  assert.ok(ndjson.headers.get('link'));
  assert.equal(ndjson.headers.get('link'), cbor.headers.get('link'));
  console.log(
    `Vercel streams: ${ndjsonBytes.byteLength} NDJSON bytes, ${cborBytes.byteLength} CBOR bytes`,
  );
}

async function checkContext() {
  const response = await fetch(`${origin}/contexts/lws-v1.jsonld`);
  assert.equal(response.status, 200);
  const document = await response.json();
  assert.ok(document['@context']);
  console.log('Vercel context endpoint: ok');
}

async function checkClient() {
  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /LWS stream size lab/);
  console.log('Vercel client dev server: ok');
}
