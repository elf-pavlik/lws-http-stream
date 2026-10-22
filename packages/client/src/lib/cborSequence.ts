import * as cborg from 'cborg';

/**
 * Tag decoders let cborg determine where a CBOR-LD item ends without needing
 * the CBOR-LD decompression tables. The bytes of the item are then passed to
 * @digitalbazaar/cborld unchanged.
 */
const tags: Record<number, (decode: () => unknown) => unknown> = {
  51997: decode => decode(),
  1280: decode => decode(),
  1281: decode => decode(),
};

for (let tag = 1536; tag <= 1791; tag += 1) {
  tags[tag] = decode => decode();
}

const decodeOptions: cborg.DecodeOptions = {
  useMaps: true,
  tags,
};

export interface CborItemFrame {
  /** The exact bytes of the first complete CBOR item. */
  item: Uint8Array;
  /** Remaining bytes, which may contain more items or a partial item. */
  rest: Uint8Array;
}

/**
 * Return the first complete CBOR item and the remainder, or null when more
 * transport bytes are needed. Malformed data is also reported as null here;
 * call `takeCborItem` at end-of-stream to surface the real decode error.
 */
export function tryTakeCborItem(buffer: Uint8Array): CborItemFrame | null {
  if (buffer.length === 0) {
    return null;
  }

  try {
    return takeCborItem(buffer);
  } catch {
    return null;
  }
}

/**
 * Return the first complete CBOR item, throwing if the buffer does not contain
 * one. This is used at end-of-stream so truncated items are reported.
 */
export function takeCborItem(buffer: Uint8Array): CborItemFrame {
  if (buffer.length === 0) {
    throw new Error('Cannot read a CBOR item from an empty buffer.');
  }

  const [, remainder] = cborg.decodeFirst(buffer, decodeOptions);
  const consumed = buffer.length - remainder.length;
  if (consumed <= 0) {
    throw new Error('CBOR decoder consumed no bytes.');
  }

  return {
    item: buffer.slice(0, consumed),
    rest: remainder,
  };
}
