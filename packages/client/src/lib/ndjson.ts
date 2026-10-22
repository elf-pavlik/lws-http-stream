import { concatBytes } from './bytes.ts';
import type { LwsNotification } from './types.ts';

export interface NdjsonMessage {
  notification: LwsNotification;
  /** UTF-8 bytes of the JSON line plus its LF terminator. */
  bytes: number;
}

const NEWLINE = 0x0a;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Incremental NDJSON framing. LF is unambiguous inside UTF-8, so complete
 * lines can be decoded independently of transport chunk boundaries.
 */
export class NdjsonDecoder {
  private buffer: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): NdjsonMessage[] {
    this.buffer = concatBytes(this.buffer, chunk);
    const messages: NdjsonMessage[] = [];
    let lineStart = 0;

    for (let index = 0; index < this.buffer.length; index += 1) {
      if (this.buffer[index] !== NEWLINE) {
        continue;
      }

      const line = this.buffer.subarray(lineStart, index);
      if (line.length === 0) {
        throw new Error('Encountered an empty NDJSON line.');
      }

      const document = JSON.parse(textDecoder.decode(line)) as unknown;
      messages.push({
        notification: normalizeNdjsonDocument(document),
        bytes: line.length + 1,
      });
      lineStart = index + 1;
    }

    this.buffer = this.buffer.subarray(lineStart);
    return messages;
  }

  finish(): void {
    if (this.buffer.length > 0) {
      throw new Error(
        `NDJSON stream ended with ${this.buffer.length} incomplete byte(s) instead of a newline.`,
      );
    }
  }

  get bufferedBytes(): number {
    return this.buffer.length;
  }
}

function normalizeNdjsonDocument(value: unknown): LwsNotification {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('NDJSON line did not contain a JSON object.');
  }
  const candidate = value as Partial<LwsNotification>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw new Error('NDJSON notification has no string id.');
  }
  if (candidate.type !== 'Notification') {
    throw new Error('NDJSON document is not an LWS Notification.');
  }
  return candidate as LwsNotification;
}
