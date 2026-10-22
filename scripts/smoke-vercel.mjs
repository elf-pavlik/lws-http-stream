import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Parser } from 'rdfjs-jelly/browser';

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const outputDir = await mkdtemp(path.join(tmpdir(), 'lws-vercel-build-'));

try {
  console.log('Building production Vercel output...');
  await run(
    process.execPath,
    [
      path.join(root, 'node_modules', 'vercel', 'dist', 'vc.js'),
      'build',
      '--yes',
      '--local-config',
      'vercel.json',
      '--output',
      outputDir,
    ],
    {
      cwd: root,
      env: { ...process.env, CI: '1', VERCEL_TELEMETRY_DISABLED: '1' },
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const functionDir = path.join(
    outputDir,
    'functions',
    'api',
    'notifications.func',
  );
  const { default: notifications } = await import(
    path.join(functionDir, 'api', 'notifications.js')
  );
  const origin = 'https://smoke.example';

  const ndjson = await notifications.fetch(
    new Request(`${origin}/api/notifications?count=2&interval=0`, {
      headers: { Accept: 'application/x-ndjson' },
    }),
  );
  assert.equal(ndjson.status, 200);
  assert.equal(ndjson.headers.get('content-type'), 'application/x-ndjson');
  assert.ok(ndjson.headers.get('link'));
  assert.equal((await ndjson.text()).trimEnd().split('\n').length, 2);

  const cbor = await notifications.fetch(
    new Request(`${origin}/api/notifications?count=2&interval=0`, {
      headers: { Accept: 'application/cbor-seq' },
    }),
  );
  assert.equal(cbor.status, 200);
  assert.equal(cbor.headers.get('content-type'), 'application/cbor-seq');
  assert.ok(cbor.headers.get('link'));
  assert.ok((await cbor.arrayBuffer()).byteLength > 10);

  const inline = await notifications.fetch(
    new Request(`${origin}/api/notifications?count=2&interval=0&context=inline`, {
      headers: { Accept: 'application/cbor-seq' },
    }),
  );
  assert.equal(inline.status, 200);
  assert.equal(inline.headers.get('link'), null);
  assert.ok((await inline.arrayBuffer()).byteLength > 10);

  const jelly = await notifications.fetch(
    new Request(`${origin}/api/notifications?count=2&interval=0`, {
      headers: { Accept: 'application/x-jelly-rdf' },
    }),
  );
  assert.equal(jelly.status, 200);
  assert.equal(jelly.headers.get('content-type'), 'application/x-jelly-rdf');
  assert.equal(jelly.headers.get('link'), null);
  const jellyBytes = new Uint8Array(await jelly.arrayBuffer());
  assert.ok(jellyBytes.byteLength > 10);
  assert.notEqual(jellyBytes[0], 0x0a);
  const messages = new Parser({ messages: true }).parseMessages(jellyBytes);
  assert.equal(messages.length, 2);
  assert.ok(messages[0].length > 0);

  console.log('Vercel production build smoke test passed.');
  console.log(`  NDJSON: ${ndjson.headers.get('content-type')}`);
  console.log(`  CBOR: ${cbor.headers.get('content-type')}`);
  console.log(`  Jelly: ${jellyBytes.byteLength} bytes, ${messages.length} frames`);
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
