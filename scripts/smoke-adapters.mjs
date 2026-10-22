import assert from 'node:assert/strict';
import worker from '../packages/server/adapters/cloudflare.ts';
import contextsEntry from '../api/contexts.ts';
import healthEntry from '../api/health.ts';
import notificationsEntry from '../api/notifications.ts';

const origin = 'https://smoke.example';
const env = {
  ASSETS: {
    async fetch() {
      return new Response('<html>static client</html>', {
        headers: { 'Content-Type': 'text/html' },
      });
    },
  },
};

log('Cloudflare adapter');
const workerResponse = await worker.fetch(
  new Request(`${origin}/notifications?count=2&interval=0`, {
    headers: { Accept: 'application/x-ndjson' },
  }),
  env,
);
assert.equal(workerResponse.status, 200);
assert.equal(workerResponse.headers.get('content-type'), 'application/x-ndjson');
assert.match(workerResponse.headers.get('link') ?? '', /contexts\/lws-notifications-v1\.jsonld/);
const workerBody = await workerResponse.text();
assert.equal(workerBody.trimEnd().split('\n').length, 2);
log(`  NDJSON body: ${new TextEncoder().encode(workerBody).byteLength} bytes`);

const assetResponse = await worker.fetch(new Request(`${origin}/`), env);
assert.equal(await assetResponse.text(), '<html>static client</html>');
log('  static-assets fallback: ok');

log('Vercel adapter');
const vercelResponse = await notificationsEntry.fetch(
  new Request(`${origin}/api/notifications?count=2&interval=0`, {
    headers: { Accept: 'application/cbor-seq' },
  }),
);
assert.equal(vercelResponse.status, 200);
assert.equal(vercelResponse.headers.get('content-type'), 'application/cbor-seq');
const cborBody = new Uint8Array(await vercelResponse.arrayBuffer());
assert.ok(cborBody.byteLength > 10);
assert.notDeepEqual(Array.from(cborBody.subarray(0, 3)), [0xd9, 0xcb, 0x1d]);
assert.ok(vercelResponse.headers.get('link'));
log(`  plain CBOR body: ${cborBody.byteLength} bytes`);

const inlineResponse = await notificationsEntry.fetch(
  new Request(`${origin}/api/notifications?count=2&interval=0&context=inline`, {
    headers: { Accept: 'application/cbor-seq' },
  }),
);
const inlineBody = new Uint8Array(await inlineResponse.arrayBuffer());
assert.deepEqual(Array.from(inlineBody.subarray(0, 3)), [0xd9, 0xcb, 0x1d]);
assert.equal(inlineResponse.headers.get('link'), null);
log(`  inline CBOR-LD body: ${inlineBody.byteLength} bytes`);

const jellyResponse = await notificationsEntry.fetch(
  new Request(`${origin}/api/notifications?count=2&interval=0`, {
    headers: { Accept: 'application/x-jelly-rdf' },
  }),
);
assert.equal(jellyResponse.status, 200);
assert.equal(jellyResponse.headers.get('content-type'), 'application/x-jelly-rdf');
assert.equal(jellyResponse.headers.get('link'), null);
const jellyBody = new Uint8Array(await jellyResponse.arrayBuffer());
assert.ok(jellyBody.byteLength > 10);
assert.notEqual(jellyBody[0], 0x0a);
log(`  Jelly-RDF body: ${jellyBody.byteLength} bytes`);

const health = await healthEntry.fetch(new Request(`${origin}/api/health`));
assert.equal(health.status, 200);
assert.equal((await health.json()).status, 'ok');
log('  health: ok');

const context = await contextsEntry.fetch(new Request(`${origin}/api/contexts`));
assert.equal(context.status, 200);
assert.ok((await context.json())['@context']);
log('  context: ok');

log('Adapter smoke tests passed.');

function log(message) {
  console.log(message);
}
