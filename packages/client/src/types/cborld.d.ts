declare module '@digitalbazaar/cborld' {
  export interface DocumentLoaderResult {
    document: unknown;
    documentUrl?: string;
    contextUrl?: string | null;
  }

  export type DocumentLoader = (url: string) => Promise<DocumentLoaderResult>;

  export interface EncodeOptions {
    jsonldDocument: Record<string, unknown>;
    documentLoader: DocumentLoader;
    format?: 'cbor-ld-1.0' | 'legacy-range' | 'legacy-singleton';
    registryEntryId?: number;
    diagnose?: (message: string) => void;
  }

  export interface DecodeOptions {
    cborldBytes: Uint8Array;
    documentLoader: DocumentLoader;
    typeTableLoader?: (options: {
      registryEntryId: number;
    }) => Promise<Map<unknown, unknown> | undefined>;
    diagnose?: (message: string) => void;
  }

  export function encode(options: EncodeOptions): Promise<Uint8Array>;
  export function decode(options: DecodeOptions): Promise<Record<string, unknown>>;
}
