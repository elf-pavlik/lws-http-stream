import { concatBytes } from './bytes.ts';
import { tryTakeCborItem, takeCborItem } from './cborSequence.ts';
import { NdjsonDecoder } from './ndjson.ts';
import { normalizeNotificationDocument } from './stats.ts';
import type { ReaderCallbacks } from './types.ts';

export type CborItemDecoder = (
  item: Uint8Array,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

const abortError = (): DOMException =>
  new DOMException('The notification stream was aborted.', 'AbortError');

export async function readNdjsonStream(
  response: Response,
  callbacks: ReaderCallbacks = {},
  signal?: AbortSignal,
): Promise<void> {
  const startedAt = performance.now();
  const decoder = new NdjsonDecoder();
  let bytesReceived = 0;
  let messageIndex = 0;

  await withReader(response, signal, async reader => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      bytesReceived += value.byteLength;
      callbacks.onBytes?.(bytesReceived);

      for (const message of decoder.push(value)) {
        messageIndex += 1;
        callbacks.onNotification?.(message.notification, {
          bytes: message.bytes,
          index: messageIndex,
          atMs: performance.now() - startedAt,
          bytesReceived,
        });
      }
    }
  });

  decoder.finish();
}

export async function readCborSequenceStream(
  response: Response,
  decodeItem: CborItemDecoder,
  callbacks: ReaderCallbacks = {},
  signal?: AbortSignal,
): Promise<void> {
  const startedAt = performance.now();
  let buffer: Uint8Array = new Uint8Array(0);
  let bytesReceived = 0;
  let messageIndex = 0;
  let endOfStream = false;

  await withReader(response, signal, async reader => {
    while (!endOfStream) {
      const { done, value } = await reader.read();
      if (done) {
        endOfStream = true;
        break;
      }

      bytesReceived += value.byteLength;
      callbacks.onBytes?.(bytesReceived);
      buffer = concatBytes(buffer, value);

      buffer = await drainCompleteItems(buffer, decodeItem, {
        callbacks,
        startedAt,
        bytesReceived,
        nextIndex: () => {
          messageIndex += 1;
          return messageIndex;
        },
      });
    }
  });

  // Drain again with strict framing so a truncated final item is reported.
  while (buffer.length > 0) {
    const frame = takeCborItem(buffer);
    const document = await decodeItem(frame.item);
    messageIndex += 1;
    callbacks.onNotification?.(normalizeNotificationDocument(document), {
      bytes: frame.item.byteLength,
      index: messageIndex,
      atMs: performance.now() - startedAt,
      bytesReceived,
    });
    buffer = frame.rest;
  }
}

async function drainCompleteItems(
  initial: Uint8Array,
  decodeItem: CborItemDecoder,
  context: {
    callbacks: ReaderCallbacks;
    startedAt: number;
    bytesReceived: number;
    nextIndex: () => number;
  },
): Promise<Uint8Array> {
  let buffer = initial;

  while (buffer.length > 0) {
    const frame = tryTakeCborItem(buffer);
    if (frame === null) {
      break;
    }

    const document = await decodeItem(frame.item);
    context.callbacks.onNotification?.(normalizeNotificationDocument(document), {
      bytes: frame.item.byteLength,
      index: context.nextIndex(),
      atMs: performance.now() - context.startedAt,
      bytesReceived: context.bytesReceived,
    });
    buffer = frame.rest;
  }

  return buffer;
}

async function withReader(
  response: Response,
  signal: AbortSignal | undefined,
  consume: (reader: ReadableStreamDefaultReader<Uint8Array>) => Promise<void>,
): Promise<void> {
  if (!response.body) {
    throw new Error('Streaming response has no body.');
  }

  if (signal?.aborted) {
    throw abortError();
  }

  const reader = response.body.getReader();
  const onAbort = (): void => {
    void reader.cancel(abortError()).catch(() => {
      // The underlying stream may already be closed.
    });
  };

  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    await consume(reader);
    if (signal?.aborted) {
      throw abortError();
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}
