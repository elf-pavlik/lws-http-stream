export type Representation = 'ndjson' | 'cbor-seq';

export interface LwsActivityObject {
  id: string;
  type: string[];
}

export interface LwsActivity {
  id: string;
  type: string[];
  object: LwsActivityObject;
  actor?: string;
  target?: string;
  origin?: string;
  published: string;
}

export interface LwsNotification {
  id: string;
  type: 'Notification';
  storage: string;
  activity: LwsActivity | LwsActivity[];
}

export interface ReceivedNotification {
  id: string;
  notification: LwsNotification;
  index: number;
  bytes: number;
  atMs: number;
}

export type StreamStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'complete'
  | 'cancelled'
  | 'error';

export interface StreamStats {
  representation: Representation;
  bytesReceived: number;
  messagesDecoded: number;
  firstNotificationMs: number | null;
  elapsedMs: number | null;
  status: StreamStatus;
  error: string | null;
  contextUrl: string | null;
}

export interface ReaderCallbacks {
  onBytes?: (bytesReceived: number) => void;
  onNotification?: (
    notification: LwsNotification,
    meta: { bytes: number; index: number; atMs: number; bytesReceived: number },
  ) => void;
}
