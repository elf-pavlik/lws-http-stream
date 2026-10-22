import { describe, expect, it } from 'vitest';
import * as cborg from 'cborg';
import { takeCborItem, tryTakeCborItem } from '../src/lib/cborSequence.ts';

function sequenceOfThree(): { sequence: Uint8Array; lengths: number[] } {
  const items = [
    cborg.encode(new cborg.Tagged(51997, [1, { name: 'one' }])),
    cborg.encode(new cborg.Tagged(51997, [1, { name: 'two', nested: [1, 2, 3] }])),
    cborg.encode(new cborg.Tagged(51997, [1, { name: 'three' }])),
  ];
  const total = items.reduce((sum, item) => sum + item.length, 0);
  const sequence = new Uint8Array(total);
  let offset = 0;
  for (const item of items) {
    sequence.set(item, offset);
    offset += item.length;
  }
  return { sequence, lengths: items.map(item => item.length) };
}

describe('incremental CBOR Sequence framing', () => {
  it('finds the first item at every possible transport boundary', () => {
    const { sequence, lengths } = sequenceOfThree();
    const firstLength = lengths[0]!;

    for (let cut = 0; cut <= sequence.length; cut += 1) {
      const frame = tryTakeCborItem(sequence.subarray(0, cut));
      if (cut < firstLength) {
        expect(frame, `cut ${cut}`).toBeNull();
      } else {
        expect(frame, `cut ${cut}`).not.toBeNull();
        expect(frame!.item.byteLength).toBe(firstLength);
        expect(frame!.item).toEqual(sequence.subarray(0, firstLength));
      }
    }
  });

  it('consumes concatenated items with no delimiters', () => {
    const { sequence, lengths } = sequenceOfThree();
    const collected: number[] = [];
    let rest = sequence;

    while (rest.length > 0) {
      const frame = tryTakeCborItem(rest);
      expect(frame).not.toBeNull();
      collected.push(frame!.item.byteLength);
      rest = frame!.rest;
    }

    expect(collected).toEqual(lengths);
    expect(rest).toHaveLength(0);
  });

  it('works when fed one byte at a time', () => {
    const { sequence, lengths } = sequenceOfThree();
    const collected: number[] = [];
    let buffer: Uint8Array = new Uint8Array(0);

    for (const byte of sequence) {
      buffer = new Uint8Array([...buffer, byte]);
      let frame = tryTakeCborItem(buffer);
      while (frame !== null) {
        collected.push(frame.item.byteLength);
        buffer = frame.rest;
        frame = tryTakeCborItem(buffer);
      }
    }

    expect(collected).toEqual(lengths);
    expect(buffer).toHaveLength(0);
  });

  it('surfaces a truncated final item at end of stream', () => {
    const { sequence } = sequenceOfThree();
    const truncated = sequence.subarray(0, sequence.length - 1);
    expect(() => {
      let rest = truncated;
      while (rest.length > 0) {
        rest = takeCborItem(rest).rest;
      }
    }).toThrow();
  });
});
