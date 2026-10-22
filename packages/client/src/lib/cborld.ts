import { decode as cborldDecode } from '@digitalbazaar/cborld';
import type { DocumentLoader } from '@digitalbazaar/cborld';
import cachedContexts from '../../../server/fixtures/contexts/cached-context.json' with { type: 'json' };

/**
 * cborld needs the resolved documents behind the public context URL array.
 * They are bundled here as an opaque decode cache. The client never fetches,
 * resolves, or expands these contexts and never performs RDF processing.
 */
const cachedContextDocuments = cachedContexts as Record<
  string,
  { '@context': Record<string, unknown> }
>;

const cachedContextLoader: DocumentLoader = async url => {
  const document = cachedContextDocuments[url];
  if (!document) {
    throw new Error(`No cached context document for ${url}.`);
  }
  return {
    document,
    documentUrl: url,
  };
};

export async function decodeCborLdItem(
  item: Uint8Array,
): Promise<Record<string, unknown>> {
  return cborldDecode({
    cborldBytes: item,
    documentLoader: cachedContextLoader,
  });
}
