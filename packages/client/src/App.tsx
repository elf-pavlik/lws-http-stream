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
  const [cborInlineContext, setCborInlineContext] = createSignal(false);

  const ndjson = createStreamSession('ndjson', {
    count: INITIAL_COUNT,
    intervalMs: INITIAL_INTERVAL_MS,
    inlineContext: false,
  });
  const cbor = createStreamSession('cbor-seq', {
    count: INITIAL_COUNT,
    intervalMs: INITIAL_INTERVAL_MS,
    inlineContext: false,
  });

  const ndjsonIds = createMemo(() => new Set(ndjson.items().map(item => item.id)));
  const cborIds = createMemo(() => new Set(cbor.items().map(item => item.id)));

  const matchedIds = createMemo(() => {
    const other = cborIds();
    return new Set(ndjson.items().map(item => item.id).filter(id => other.has(id)));
  });

  const identicalCount = createMemo(() => {
    const byId = new Map(cbor.items().map(item => [item.id, item.notification]));
    let identical = 0;
    for (const item of ndjson.items()) {
      const counterpart = byId.get(item.id);
      if (counterpart && documentsEqual(item.notification, counterpart)) {
        identical += 1;
      }
    }
    return identical;
  });

  const orderMatches = createMemo(() => {
    const left = ndjson.items().map(item => item.id);
    const right = cbor.items().map(item => item.id);
    if (left.length !== right.length) {
      return null;
    }
    return left.every((id, index) => id === right[index]);
  });

  const reduction = createMemo(() =>
    sizeReduction(ndjson.stats().bytesReceived, cbor.stats().bytesReceived),
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
  };

  return (
    <main class="app-shell">
      <header class="hero">
        <div class="eyebrow">Linked Web Storage · streaming notifications</div>
        <h1>
          NDJSON <span>vs.</span> CBOR
        </h1>
        <p class="lede">
          Two concurrent HTTP streams carry the same ordered LWS notifications. The left stream
          is compact NDJSON; the right stream is an RFC 8742 CBOR Sequence. With @context off the
          CBOR items are plain CBOR; with @context on they are compressed CBOR-LD. Every byte
          shown below comes from the actual response bodies.
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
          Each panel has its own @context toggle and re-runs that stream immediately. Off: the
          context is only in the Link header. On: the context URL array is inlined into every
          notification. Use a longer interval to exercise streaming and cancellation.
        </p>
      </section>

      <section class="summary" aria-label="Comparison summary">
        <div class="summary-card summary-reduction">
          <span>CBOR size reduction</span>
          <strong>{formatPercent(reduction())}</strong>
          <small>plain CBOR or CBOR-LD, depending on the @context toggle</small>
        </div>
        <div class="summary-card">
          <span>Matched IDs</span>
          <strong>{matchedIds().size}</strong>
          <small>
            {ndjson.items().length} NDJSON · {cbor.items().length} CBOR
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
            <span>Both responses advertise the same response-level context:</span>
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
      </div>

      <section class="methodology">
        <h2>How the numbers are produced</h2>
        <p>
          Each stream is read independently with a streaming reader. NDJSON is split on LF bytes;
          CBOR items are framed incrementally according to RFC 8742, including when an item spans
          transport chunks. Off mode uses plain CBOR and link-only context; on mode inlines the
          context and uses CBOR-LD compression. Size reduction is{' '}
          <code>100 × (NDJSON bytes − CBOR bytes) / NDJSON bytes</code>, using response-body bytes
          only. HTTP headers, the context document, and transport compression are excluded.
        </p>
        <ul>
          <For
            each={[
              'Committed generated fixtures keep both requests byte-comparable.',
              'The first chunk is flushed immediately; later chunks are spaced by the interval.',
              'Cancelling a stream aborts the fetch and stops the server-side producer.',
              'The client treats every decoded item as plain JSON and never performs RDF processing.',
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
