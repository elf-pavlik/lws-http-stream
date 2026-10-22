import type {
  LwsActivity,
  LwsNotification,
  Representation,
  StreamStats,
} from './types.ts';

export function initialStats(representation: Representation): StreamStats {
  return {
    representation,
    bytesReceived: 0,
    messagesDecoded: 0,
    firstNotificationMs: null,
    elapsedMs: null,
    status: 'idle',
    error: null,
    contextUrl: null,
  };
}

export function averageBytesPerMessage(stats: StreamStats): number | null {
  if (stats.messagesDecoded === 0) {
    return null;
  }
  return stats.bytesReceived / stats.messagesDecoded;
}

/**
 * 100 × (NDJSON bytes − CBOR Sequence bytes) / NDJSON bytes.
 * Returns null until both streams have received body bytes.
 */
export function sizeReduction(
  ndjsonBytes: number,
  cborSequenceBytes: number,
): number | null {
  if (!Number.isFinite(ndjsonBytes) || ndjsonBytes <= 0) {
    return null;
  }
  return (100 * (ndjsonBytes - cborSequenceBytes)) / ndjsonBytes;
}

export function normalizeNotificationDocument(
  document: Record<string, unknown>,
): LwsNotification {
  const { '@context': _context, ...logical } = document;
  const candidate = logical as Partial<LwsNotification>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw new Error('Decoded CBOR notification has no string id.');
  }
  if (candidate.type !== 'Notification') {
    throw new Error('Decoded CBOR document is not an LWS Notification.');
  }
  if (typeof candidate.storage !== 'string' || candidate.activity === undefined) {
    throw new Error('Decoded CBOR notification is missing envelope properties.');
  }
  return candidate as LwsNotification;
}

export function activitiesOf(notification: LwsNotification): readonly LwsActivity[] {
  return Array.isArray(notification.activity) ? notification.activity : [notification.activity];
}

export function notificationId(notification: LwsNotification): string {
  return notification.id;
}

export function documentsEqual(left: LwsNotification, right: LwsNotification): boolean {
  return (
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
  );
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  return value;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function formatAverage(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} B`;
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) {
    return '—';
  }
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export function formatPercent(value: number | null): string {
  if (value === null) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}
