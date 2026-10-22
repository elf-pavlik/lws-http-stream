import * as cborg from 'cborg';

/**
 * Tag decoders let cborg find the end of each CBOR-LD item without
 * interpreting the CBOR-LD payload itself. CBOR-LD 1.0 uses tag 51997;
 * the legacy tags are accepted as well so the framing layer is not tied to a
 * single encoder version.
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

/**
 * Split a complete RFC 8742 CBOR Sequence into the original encoded items.
 * No delimiters or enclosing array are expected between items.
 */
export function splitCborSequence(sequence: Uint8Array): Uint8Array[] {
  const items: Uint8Array[] = [];
  let rest = sequence;

  while (rest.length > 0) {
    const [, remainder] = cborg.decodeFirst(rest, decodeOptions);
    const consumed = rest.length - remainder.length;
    if (consumed <= 0) {
      throw new Error('CBOR Sequence decoder consumed no bytes.');
    }
    items.push(rest.subarray(0, consumed));
    rest = remainder;
  }

  return items;
}

export { decodeOptions as cborSequenceDecodeOptions };
