import { createSignal, onCleanup } from 'solid-js';
import { parseContextLink, requestNotificationStream } from '../api.ts';
import { decodePlainCborItem } from './cbor.ts';
import { decodeCborLdItem } from './cborld.ts';
import { readJellyStream } from './jelly.ts';
import { readCborSequenceStream, readNdjsonStream } from './readers.ts';
import { initialStats } from './stats.ts';
import type { ReceivedNotification, Representation, StreamStats } from './types.ts';

export interface SessionOptions {
  baseUrl: string;
  intervalMs: number;
  inlineContext: boolean;
}

export interface StreamSession {
  representation: Representation;
  items: () => ReceivedNotification[];
  stats: () => StreamStats;
  start: (options: SessionOptions) => void;
  stop: () => void;
}

export function createStreamSession(representation: Representation): StreamSession {
  const [items, setItems] = createSignal<ReceivedNotification[]>([]);
  const [stats, setStats] = createSignal<StreamStats>(initialStats(representation));
  const state = {
    controller: undefined as AbortController | undefined,
    ticker: undefined as ReturnType<typeof setInterval> | undefined,
    generation: 0,
    running: false,
    startedAt: 0,
  };

  const clearTicker = (): void => {
    if (state.ticker !== undefined) {
      clearInterval(state.ticker);
      state.ticker = undefined;
    }
  };

  const stop = (): void => {
    const wasRunning = state.running;
    state.running = false;
    state.generation += 1;
    state.controller?.abort();
    state.controller = undefined;
    clearTicker();

    if (wasRunning) {
      const elapsed = performance.now() - state.startedAt;
      setStats(current =>
        isTerminal(current.status)
          ? current
          : { ...current, status: 'cancelled', elapsedMs: elapsed },
      );
    }
  };

  const start = (options: SessionOptions): void => {
    stop();

    const generation = state.generation;
    const controller = new AbortController();
    state.controller = controller;
    state.running = true;
    state.startedAt = performance.now();
    const startedAt = state.startedAt;

    setItems([]);
    setStats({
      ...initialStats(representation),
      status: 'connecting',
      elapsedMs: 0,
    });

    state.ticker = setInterval(() => {
      if (generation !== state.generation) {
        return;
      }
      setStats(current =>
        isTerminal(current.status)
          ? current
          : { ...current, elapsedMs: performance.now() - startedAt },
      );
    }, 100);

    void (async () => {
      try {
        const response = await requestNotificationStream(representation, {
          baseUrl: options.baseUrl,
          intervalMs: options.intervalMs,
          inlineContext: options.inlineContext,
          signal: controller.signal,
        });

        const contextUrl = parseContextLink(
          response.headers.get('Link'),
          response.url || window.location.href,
        );
        if (generation !== state.generation) {
          return;
        }

        setStats(current => ({
          ...current,
          contextUrl,
          status: 'streaming',
        }));

        const readerStartedAt = performance.now();
        const preReaderMs = readerStartedAt - startedAt;

        const callbacks = {
          onBytes: (bytesReceived: number) => {
            if (generation !== state.generation) {
              return;
            }
            setStats(current => ({ ...current, bytesReceived }));
          },
          onNotification: (
            notification: ReceivedNotification['notification'],
            meta: { bytes: number; index: number; atMs: number; bytesReceived: number },
          ) => {
            if (generation !== state.generation) {
              return;
            }
            const atMs = preReaderMs + meta.atMs;
            const received: ReceivedNotification = {
              id: notification.id,
              notification,
              index: meta.index,
              bytes: meta.bytes,
              atMs,
            };
            setItems(current => [...current, received]);
            setStats(current => ({
              ...current,
              bytesReceived: meta.bytesReceived,
              messagesDecoded: current.messagesDecoded + 1,
              firstNotificationMs: current.firstNotificationMs ?? atMs,
              elapsedMs: atMs,
              status: 'streaming',
            }));
          },
        };

        if (representation === 'jelly') {
          await readJellyStream(response, callbacks, controller.signal);
        } else if (representation === 'cbor-seq') {
          const decodeItem = options.inlineContext ? decodeCborLdItem : decodePlainCborItem;
          await readCborSequenceStream(response, decodeItem, callbacks, controller.signal);
        } else {
          await readNdjsonStream(response, callbacks, controller.signal);
        }

        if (generation === state.generation && !controller.signal.aborted) {
          clearTicker();
          setStats(current => ({
            ...current,
            status: 'complete',
            elapsedMs: performance.now() - startedAt,
          }));
          state.running = false;
        }
      } catch (error) {
        if (generation !== state.generation) {
          return;
        }

        clearTicker();
        state.running = false;
        if (controller.signal.aborted) {
          setStats(current =>
            isTerminal(current.status)
              ? current
              : {
                  ...current,
                  status: 'cancelled',
                  elapsedMs: performance.now() - startedAt,
                },
          );
          return;
        }

        setStats(current => ({
          ...current,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: performance.now() - startedAt,
        }));
      }
    })();
  };

  onCleanup(() => {
    stop();
  });

  return {
    representation,
    items,
    stats,
    start,
    stop,
  };
}

function isTerminal(status: StreamStats['status']): boolean {
  return status === 'complete' || status === 'error' || status === 'cancelled';
}
