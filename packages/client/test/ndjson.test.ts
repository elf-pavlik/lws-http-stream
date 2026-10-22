import { describe, expect, it } from 'vitest';
import { NdjsonDecoder } from '../src/lib/ndjson.ts';

const encoder = new TextEncoder();

function line(id: string): string {
  return `${JSON.stringify({
    id,
    type: 'Notification',
    storage: 'https://storage.example/',
    activity: {
      id: `urn:uuid:${id}`,
      type: ['Create'],
      object: { id: `https://storage.example/${id}`, type: ['DataResource'] },
      published: '2026-03-26T10:30:00Z',
    },
  })}\n`;
}

describe('incremental NDJSON decoding', () => {
  it('decodes a line split at every possible single boundary', () => {
    const payload = line('one') + line('two') + line('three');
    const bytes = encoder.encode(payload);

    for (let cut = 1; cut < bytes.length; cut += 1) {
      const decoder = new NdjsonDecoder();
      const messages = [
        ...decoder.push(bytes.subarray(0, cut)),
        ...decoder.push(bytes.subarray(cut)),
      ];
      decoder.finish();
      expect(messages.map(message => message.notification.id), `cut ${cut}`).toEqual([
        'one',
        'two',
        'three',
      ]);
      expect(messages.reduce((sum, message) => sum + message.bytes, 0)).toBe(
        bytes.length,
      );
    }
  });

  it('decodes when fed one byte at a time', () => {
    const bytes = encoder.encode(line('one') + line('two'));
    const decoder = new NdjsonDecoder();
    const messages = [];

    for (const byte of bytes) {
      messages.push(...decoder.push(Uint8Array.of(byte)));
    }
    decoder.finish();

    expect(messages.map(message => message.notification.id)).toEqual(['one', 'two']);
    expect(messages.map(message => message.bytes)).toEqual([
      line('one').length,
      line('two').length,
    ]);
  });

  it('keeps partial lines buffered until LF arrives', () => {
    const first = line('one');
    const second = line('two');
    const decoder = new NdjsonDecoder();
    expect(decoder.push(encoder.encode(first + second.slice(0, 20)))).toHaveLength(1);
    expect(decoder.bufferedBytes).toBe(20);
    expect(decoder.push(encoder.encode(second.slice(20)))).toHaveLength(1);
    decoder.finish();
  });

  it('rejects an incomplete final line', () => {
    const decoder = new NdjsonDecoder();
    decoder.push(encoder.encode('{"id":"partial"'));
    expect(() => decoder.finish()).toThrow(/incomplete byte/i);
  });

  it('strips an inlined @context and treats the line as plain JSON', () => {
    const document = {
      '@context': { Notification: 'https://www.w3.org/ns/lws#Notification' },
      id: 'one',
      type: 'Notification',
      storage: 'https://storage.example/',
      activity: {
        id: 'urn:uuid:one',
        type: ['Create'],
        object: { id: 'https://storage.example/one', type: ['DataResource'] },
        published: '2026-03-26T10:30:00Z',
      },
    };
    const decoder = new NdjsonDecoder();
    const [message] = decoder.push(encoder.encode(`${JSON.stringify(document)}\n`));
    decoder.finish();

    expect(message!.notification).not.toHaveProperty('@context');
    expect(message!.notification.id).toBe('one');
  });

  it('rejects empty lines and malformed JSON', () => {
    const decoder = new NdjsonDecoder();
    expect(() => decoder.push(encoder.encode('\n'))).toThrow(/empty NDJSON line/i);
    const invalid = new NdjsonDecoder();
    expect(() => invalid.push(encoder.encode('{not json}\n'))).toThrow();
  });
});
