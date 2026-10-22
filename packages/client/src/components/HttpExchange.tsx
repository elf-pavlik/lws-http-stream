import type { Representation } from '../lib/types.ts';

const LINK_PATH = 'https://your-host/contexts/lws-notifications-v1.jsonld';

const EXCHANGES: Record<
  Representation,
  Record<'link' | 'inline', { request: string; response: string }>
> = {
  ndjson: {
    link: {
      request: `GET /notifications?count=8&interval=250&context=link HTTP/1.1
Accept: application/x-ndjson`,
      response: `HTTP/1.1 200 OK
Content-Type: application/x-ndjson
Link: <${LINK_PATH}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
Cache-Control: no-store
Vary: Accept
Transfer-Encoding: chunked`,
    },
    inline: {
      request: `GET /notifications?count=8&interval=250&context=inline HTTP/1.1
Accept: application/x-ndjson`,
      response: `HTTP/1.1 200 OK
Content-Type: application/x-ndjson
Cache-Control: no-store
Vary: Accept
Transfer-Encoding: chunked`,
    },
  },
  'cbor-seq': {
    link: {
      request: `GET /notifications?count=8&interval=250&context=link HTTP/1.1
Accept: application/cbor-seq`,
      response: `HTTP/1.1 200 OK
Content-Type: application/cbor-seq
Link: <${LINK_PATH}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"
Cache-Control: no-store
Vary: Accept
Transfer-Encoding: chunked`,
    },
    inline: {
      request: `GET /notifications?count=8&interval=250&context=inline HTTP/1.1
Accept: application/cbor-seq`,
      response: `HTTP/1.1 200 OK
Content-Type: application/cbor-seq
Cache-Control: no-store
Vary: Accept
Transfer-Encoding: chunked`,
    },
  },
  jelly: {
    link: {
      request: `GET /notifications?count=8&interval=250 HTTP/1.1
Accept: application/x-jelly-rdf`,
      response: `HTTP/1.1 200 OK
Content-Type: application/x-jelly-rdf
Cache-Control: no-store
Vary: Accept
Transfer-Encoding: chunked`,
    },
    inline: {
      request: `GET /notifications?count=8&interval=250 HTTP/1.1
Accept: application/x-jelly-rdf`,
      response: `HTTP/1.1 200 OK
Content-Type: application/x-jelly-rdf
Cache-Control: no-store
Vary: Accept
Transfer-Encoding: chunked`,
    },
  },
};

export function HttpExchange(props: {
  representation: Representation;
  inlineContext: boolean;
}) {
  const exchange = () =>
    EXCHANGES[props.representation][props.inlineContext ? 'inline' : 'link'];

  return (
    <section class="http-exchange" aria-label="Illustrative HTTP exchange">
      <div class="http-exchange-heading">
        <span>Illustrative HTTP exchange</span>
        <span>
          {props.representation === 'jelly'
            ? 'static example'
            : `static example · ${props.inlineContext ? 'inline context' : 'link-only'}`}
        </span>
      </div>
      <div class="http-exchange-grid">
        <div>
          <span class="http-label">Request</span>
          <pre><code>{exchange().request}</code></pre>
        </div>
        <div>
          <span class="http-label">Response headers</span>
          <pre><code>{exchange().response}</code></pre>
        </div>
      </div>
    </section>
  );
}
