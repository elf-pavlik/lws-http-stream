import { For, Show, createMemo, createSignal } from 'solid-js';
import { StreamPanel } from './components/StreamPanel.tsx';
import { createStreamSession } from './lib/session.ts';
import {
  documentsEqual,
  formatBytes,
  formatPercent,
  sizeReduction,
} from './lib/stats.ts';

const INITIAL_COUNT = 50;
const INITIAL_INTERVAL_MS = 500;

export default function App() {
  const [count, setCount] = createSignal(INITIAL_COUNT);
  const [intervalMs, setIntervalMs] = createSignal(INITIAL_INTERVAL_MS);
  const [ndjsonInlineContext, setNdjsonInlineContext] = createSignal(false);
  const [cborInlineContext, setCborInlineContext] = createSignal(true);

  const ndjson = createStreamSession('ndjson', {
    count: INITIAL_COUNT,
    intervalMs: INITIAL_INTERVAL_MS,
    inlineContext: false,
  });
  const cbor = createStreamSession('cbor-seq', {
    count: INITIAL_COUNT,
    intervalMs: INITIAL_INTERVAL_MS,
    inlineContext: true,
  });
  const jelly = createStreamSession('jelly', {
    count: INITIAL_COUNT,
    intervalMs: INITIAL_INTERVAL_MS,
    inlineContext: false,
  });

  const ndjsonIds = createMemo(() => new Set(ndjson.items().map(item => item.id)));
  const cborIds = createMemo(() => new Set(cbor.items().map(item => item.id)));
  const jellyIds = createMemo(() => new Set(jelly.items().map(item => item.id)));

  const matchedIds = createMemo(() => {
    const cborSet = cborIds();
    const jellySet = jellyIds();
    return new Set(
      ndjson
        .items()
        .map(item => item.id)
        .filter(id => cborSet.has(id) && jellySet.has(id)),
    );
  });

  const identicalCount = createMemo(() => {
    const cborById = new Map(cbor.items().map(item => [item.id, item.notification]));
    const jellyById = new Map(jelly.items().map(item => [item.id, item.notification]));
    let identical = 0;
    for (const item of ndjson.items()) {
      const cborCounterpart = cborById.get(item.id);
      const jellyCounterpart = jellyById.get(item.id);
      if (
        cborCounterpart &&
        jellyCounterpart &&
        documentsEqual(item.notification, cborCounterpart) &&
        documentsEqual(item.notification, jellyCounterpart)
      ) {
        identical += 1;
      }
    }
    return identical;
  });

  const orderMatches = createMemo(() => {
    const ndjsonOrder = ndjson.items().map(item => item.id);
    const cborOrder = cbor.items().map(item => item.id);
    const jellyOrder = jelly.items().map(item => item.id);
    if (
      ndjsonOrder.length !== cborOrder.length ||
      ndjsonOrder.length !== jellyOrder.length
    ) {
      return null;
    }
    return (
      ndjsonOrder.every((id, index) => id === cborOrder[index]) &&
      ndjsonOrder.every((id, index) => id === jellyOrder[index])
    );
  });

  const cborReduction = createMemo(() =>
    sizeReduction(ndjson.stats().bytesReceived, cbor.stats().bytesReceived),
  );
  const jellyReduction = createMemo(() =>
    sizeReduction(ndjson.stats().bytesReceived, jelly.stats().bytesReceived),
  );

  const sharedContext = createMemo(() => {
    const left = ndjson.stats().contextUrl;
    const right = cbor.stats().contextUrl;
    return left !== null && left === right ? left : null;
  });

  const restart = (event?: SubmitEvent): void => {
    event?.preventDefault();
    const nextCount = clamp(Math.round(count()), 1, 100);
    const nextInterval = clamp(Math.round(intervalMs()), 0, 5000);
    setCount(nextCount);
    setIntervalMs(nextInterval);
    ndjson.start({
      count: nextCount,
      intervalMs: nextInterval,
      inlineContext: ndjsonInlineContext(),
    });
    cbor.start({
      count: nextCount,
      intervalMs: nextInterval,
      inlineContext: cborInlineContext(),
    });
    jelly.start({
      count: nextCount,
      intervalMs: nextInterval,
      inlineContext: false,
    });
  };

  const restartOne = (
    session: ReturnType<typeof createStreamSession>,
    inlineContext: boolean,
  ): void => {
    const nextCount = clamp(Math.round(count()), 1, 100);
    const nextInterval = clamp(Math.round(intervalMs()), 0, 5000);
    setCount(nextCount);
    setIntervalMs(nextInterval);
    session.start({ count: nextCount, intervalMs: nextInterval, inlineContext });
  };

  const toggleNdjsonContext = (): void => {
    const next = !ndjsonInlineContext();
    setNdjsonInlineContext(next);
    restartOne(ndjson, next);
  };

  const toggleCborContext = (): void => {
    const next = !cborInlineContext();
    setCborInlineContext(next);
    restartOne(cbor, next);
  };

  const stopBoth = (): void => {
    ndjson.stop();
    cbor.stop();
    jelly.stop();
  };

  return (
    <main class="app-shell">
      <header class="hero">
        <div class="eyebrow">Linked Web Storage · streaming notifications</div>
        <h1>
          NDJSON <span>vs.</span> CBOR <span>vs.</span> Jelly
        </h1>
        <p class="lede">
          Three concurrent HTTP streams carry the same ordered LWS notifications: compact
          NDJSON, an RFC 8742 CBOR Sequence, and a length-delimited Jelly-RDF stream. With
          @context off the CBOR items are plain CBOR; with @context on they are compressed
          CBOR-LD. Every byte shown below comes from the actual response bodies.
        </p>
      </header>

      <section class="controls" aria-label="Stream controls">
        <form onSubmit={restart}>
          <label>
            Notifications
            <input
              type="number"
              min="1"
              max="100"
              value={count()}
              onInput={event => setCount(Number(event.currentTarget.value))}
            />
          </label>
          <label>
            Interval (ms)
            <input
              type="number"
              min="0"
              max="5000"
              step="50"
              value={intervalMs()}
              onInput={event => setIntervalMs(Number(event.currentTarget.value))}
            />
          </label>
          <button type="submit" class="primary">
            Restart both streams
          </button>
          <button type="button" class="secondary" onClick={stopBoth}>
            Stop both
          </button>
        </form>
        <p class="hint">
          The NDJSON and CBOR panels each have their own @context toggle and re-run that stream
          immediately. Off: the context is only in the Link header. On: the context URL array is
          inlined into every notification. Jelly-RDF has no context toggle. Use a longer interval
          to exercise streaming and cancellation.
        </p>
      </section>

      <section class="summary" aria-label="Comparison summary">
        <div class="summary-card summary-reduction">
          <span>CBOR vs NDJSON</span>
          <strong>{formatPercent(cborReduction())}</strong>
          <small>plain CBOR or CBOR-LD, depending on the @context toggle</small>
        </div>
        <div class="summary-card summary-jelly">
          <span>Jelly vs NDJSON</span>
          <strong>{formatPercent(jellyReduction())}</strong>
          <small>size reduction using NDJSON as baseline</small>
        </div>
        <div class="summary-card">
          <span>Matched IDs</span>
          <strong>{matchedIds().size}</strong>
          <small>
            {ndjson.items().length} NDJSON · {cbor.items().length} CBOR ·{' '}
            {jelly.items().length} Jelly
          </small>
        </div>
        <div class="summary-card">
          <span>Identical payloads</span>
          <strong>
            {identicalCount()}/{matchedIds().size}
          </strong>
          <small>after removing any inlined @context</small>
        </div>
        <div class="summary-card">
          <span>Same order</span>
          <strong>{orderMatches() === null ? '…' : orderMatches() ? 'yes' : 'no'}</strong>
          <small>
            {formatBytes(ndjson.stats().bytesReceived)} vs{' '}
            {formatBytes(cbor.stats().bytesReceived)}
          </small>
        </div>
      </section>

      <Show when={sharedContext()}>
        {contextUrl => (
          <div class="context-banner">
            <span>NDJSON and CBOR advertise the same response-level context:</span>
            <a href={contextUrl()} target="_blank" rel="noreferrer">
              {contextUrl()}
            </a>
          </div>
        )}
      </Show>

      <div class="panels">
        <StreamPanel
          title="NDJSON"
          mediaType="application/x-ndjson"
          session={ndjson}
          counterpartIds={cborIds()}
          tone="ndjson"
          inlineContext={ndjsonInlineContext()}
          onToggleContext={toggleNdjsonContext}
        />
        <StreamPanel
          title="CBOR Sequence"
          mediaType="application/cbor-seq"
          session={cbor}
          counterpartIds={ndjsonIds()}
          tone="cbor"
          inlineContext={cborInlineContext()}
          onToggleContext={toggleCborContext}
        />
        <StreamPanel
          title="Jelly-RDF"
          mediaType="application/x-jelly-rdf"
          session={jelly}
          counterpartIds={ndjsonIds()}
          tone="jelly"
        />
      </div>

      <section class="methodology">
        <h2>How the numbers are produced</h2>
        <p>
          Each stream is read independently with a streaming reader. NDJSON is split on LF bytes;
          CBOR items are framed incrementally according to RFC 8742; Jelly frames are decoded from
          varint length-prefixed Protobuf messages. Off mode uses plain CBOR and link-only context;
          on mode inlines the context and uses CBOR-LD compression. Both reduction figures use
          NDJSON as the baseline: <code>100 × (NDJSON bytes − CBOR bytes) / NDJSON bytes</code>{' '}
          and <code>100 × (NDJSON bytes − Jelly bytes) / NDJSON bytes</code>. HTTP headers, the
          context document, and transport compression are excluded.
        </p>
        <ul>
          <For
            each={[
              'Committed generated fixtures keep both requests byte-comparable.',
              'The first chunk is flushed immediately; later chunks are spaced by the interval.',
              'Cancelling a stream aborts the fetch and stops the server-side producer.',
              'Jelly frames are decoded to RDF/JS quads only to reconstruct the same notification fields; no RDF querying or JSON-LD expansion is performed.',
            ]}
          >
            {point => <li>{point}</li>}
          </For>
        </ul>
      </section>
    </main>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, value));
}
