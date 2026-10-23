import { For, Show, createMemo, createSignal } from 'solid-js';
import { StreamPanel } from './components/StreamPanel.tsx';
import { createStreamSession } from './lib/session.ts';
import {
  formatPercent,
  sizeReduction,
} from './lib/stats.ts';

const INITIAL_INTERVAL_MS = 500;

export default function App() {
  const [intervalMs, setIntervalMs] = createSignal(INITIAL_INTERVAL_MS);
  const [ndjsonInlineContext, setNdjsonInlineContext] = createSignal(false);
  const [cborInlineContext, setCborInlineContext] = createSignal(true);

  const ndjson = createStreamSession('ndjson');
  const cbor = createStreamSession('cbor-seq');
  const jelly = createStreamSession('jelly');

  const isRunning = createMemo(() =>
    [ndjson, cbor, jelly].some(session => {
      const status = session.stats().status;
      return status === 'connecting' || status === 'streaming';
    }),
  );

  const hasStarted = createMemo(() =>
    [ndjson, cbor, jelly].some(session => session.stats().status !== 'idle'),
  );

  const ndjsonIds = createMemo(() => new Set(ndjson.items().map(item => item.id)));
  const cborIds = createMemo(() => new Set(cbor.items().map(item => item.id)));

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

  const startAll = (): void => {
    const nextInterval = clamp(Math.round(intervalMs()), 0, 5000);
    setIntervalMs(nextInterval);
    ndjson.start({
      intervalMs: nextInterval,
      inlineContext: ndjsonInlineContext(),
    });
    cbor.start({
      intervalMs: nextInterval,
      inlineContext: cborInlineContext(),
    });
    jelly.start({
      intervalMs: nextInterval,
      inlineContext: false,
    });
  };

  const restartAll = (event?: SubmitEvent): void => {
    event?.preventDefault();
    startAll();
  };

  const toggleNdjsonContext = (): void => {
    setNdjsonInlineContext(value => !value);
    if (isRunning()) {
      startAll();
    }
  };

  const toggleCborContext = (): void => {
    setCborInlineContext(value => !value);
    if (isRunning()) {
      startAll();
    }
  };

  const stopAll = (): void => {
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
          Start all three HTTP streams to carry the same ordered LWS notifications:
          compact NDJSON, an RFC 8742 CBOR Sequence, and a length-delimited Jelly-RDF
          stream. With @context off the CBOR items are plain CBOR; with @context on they
          are compressed CBOR-LD. Every byte shown below comes from the actual response
          bodies. Stop aborts all three response streams, and a context change restarts
          all three so their sequences stay aligned.
        </p>
      </header>

      <section class="controls" aria-label="Stream controls">
        <form onSubmit={restartAll}>
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
            {hasStarted() ? 'Re-start all streams' : 'Start all streams'}
          </button>
          <button
            type="button"
            class="secondary"
            onClick={stopAll}
            disabled={!isRunning()}
          >
            Stop all streams
          </button>
        </form>
        <p class="hint">
          Start opens all three streams and keeps them running until you stop them.
          Re-start aborts the current responses and opens a fresh set with the current
          settings. Stop is available only while a stream is connecting or running; it
          aborts every fetch so the server-side producers stop. Toggling @context while
          streams are running reopens all three with the new mode, keeping the comparison
          aligned. Jelly-RDF has no context toggle.
        </p>
      </section>

      <section class="summary" aria-label="Comparison summary">
        <div class="summary-card summary-count">
          <span>Count</span>
          <strong>{ndjson.items().length}</strong>
          <small>
            {ndjson.items().length} NDJSON · {cbor.items().length} CBOR ·{' '}
            {jelly.items().length} Jelly
          </small>
        </div>
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
              'Committed generated fixtures keep all three requests byte-comparable.',
              'The first chunk is flushed immediately; later chunks are spaced by the interval.',
              'Stopping aborts every fetch and reader, which stops each server-side producer.',
              'Changing either @context toggle restarts all three streams from the same fixture sequence.',
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
