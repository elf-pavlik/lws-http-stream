import { encodePlainCborNotification } from './cbor.ts';
import { encodeCborLdNotification } from './cborld.ts';
import { withInlineContext } from './context.ts';
import type { LwsNotification } from './notifications.ts';
import { encodeNdjsonNotification } from './ndjson.ts';
import type { Representation } from './negotiation.ts';

export interface ChunkEvent {
  index: number;
  notification: LwsNotification;
  bytes: Uint8Array;
}

export interface NotificationStreamOptions {
  notifications: readonly LwsNotification[];
  representation: Representation;
  inlineContext: boolean;
  intervalMs: number;
  signal?: AbortSignal;
  onChunk?: (event: ChunkEvent) => void;
}

/**
 * Produce one notification per chunk and keep only the current item in memory.
 * The first item is enqueued immediately; later items are spaced by
 * `intervalMs`. Cancellation and request abort both stop the producer.
 */
export function createNotificationStream(
  options: NotificationStreamOptions,
): ReadableStream<Uint8Array> {
  const { notifications, representation, inlineContext, intervalMs, signal, onChunk } = options;

  let cancelled = signal?.aborted ?? false;
  let consumerCancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  let signalListener: (() => void) | undefined;

  const interrupt = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    const resolve = wake;
    wake = undefined;
    resolve?.();
  };

  const stop = (): void => {
    if (cancelled) {
      return;
    }
    cancelled = true;
    interrupt();
  };

  const delay = (milliseconds: number): Promise<void> =>
    new Promise(resolve => {
      wake = resolve;
      timer = setTimeout(() => {
        timer = undefined;
        wake = undefined;
        resolve();
      }, milliseconds);
    });

  if (signal) {
    signalListener = stop;
    signal.addEventListener('abort', signalListener, { once: true });
  }

  const removeSignalListener = (): void => {
    if (signal && signalListener) {
      signal.removeEventListener('abort', signalListener);
      signalListener = undefined;
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let index = 0; index < notifications.length; index += 1) {
          if (cancelled) {
            break;
          }

          if (index > 0 && intervalMs > 0) {
            await delay(intervalMs);
          }

          if (cancelled) {
            break;
          }

          const notification = notifications[index]!;
          const bytes =
            representation === 'ndjson'
              ? encodeNdjsonNotification(
                  inlineContext ? withInlineContext(notification) : notification,
                )
              : inlineContext
                ? await encodeCborLdNotification(notification)
                : encodePlainCborNotification(notification);

          if (cancelled) {
            break;
          }

          try {
            controller.enqueue(bytes);
          } catch (error) {
            if (cancelled) {
              break;
            }
            throw error;
          }

          onChunk?.({ index, notification, bytes });
        }

        if (!consumerCancelled) {
          controller.close();
        }
      } catch (error) {
        if (!cancelled) {
          try {
            controller.error(error);
          } catch {
            // The consumer may already have cancelled the stream.
          }
        }
      } finally {
        removeSignalListener();
      }
    },

    cancel() {
      consumerCancelled = true;
      stop();
      removeSignalListener();
    },
  });
}
