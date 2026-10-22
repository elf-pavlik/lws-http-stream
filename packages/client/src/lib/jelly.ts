import { StreamParser } from 'rdfjs-jelly/browser';
import type { MessageQuad } from 'rdfjs-jelly/browser';
import type { LwsActivity, LwsNotification, ReaderCallbacks } from './types.ts';

const LWS = 'https://www.w3.org/ns/lws#';
const AS = 'https://www.w3.org/ns/activitystreams#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

type JellyQuad = MessageQuad['quad'];

const abortError = (): DOMException =>
  new DOMException('The notification stream was aborted.', 'AbortError');

/**
 * Decode a length-delimited Jelly-RDF response body incrementally. The browser
 * StreamParser handles varint length prefixes and frames split across arbitrary
 * transport chunks. Each frame is one notification graph in this demo.
 */
export async function readJellyStream(
  response: Response,
  callbacks: ReaderCallbacks = {},
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) {
    throw new Error('Streaming response has no body.');
  }
  if (signal?.aborted) {
    throw abortError();
  }

  const startedAt = performance.now();
  let bytesReceived = 0;
  let messageIndex = 0;
  let currentCounter: number | null = null;
  let quads: JellyQuad[] = [];

  const counted = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesReceived += chunk.byteLength;
      callbacks.onBytes?.(bytesReceived);
      controller.enqueue(chunk);
    },
  });

  const parser = new StreamParser({ messages: true });
  const stream = response.body.pipeThrough(counted).pipeThrough(parser);
  const reader = stream.getReader();

  const flush = (): void => {
    if (currentCounter === null || quads.length === 0) {
      return;
    }
    const notification = quadsToNotification(quads);
    messageIndex += 1;
    callbacks.onNotification?.(notification, {
      // Jelly frame byte sizes are not exposed by the parser; total body bytes
      // and the average per decoded message are still exact.
      bytes: 0,
      index: messageIndex,
      atMs: performance.now() - startedAt,
      bytesReceived,
    });
    quads = [];
  };

  const onAbort = (): void => {
    void reader.cancel(abortError()).catch(() => {
      // The stream may already be closed.
    });
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const entry = value as MessageQuad;
      if (entry.messageCounter !== currentCounter) {
        flush();
        currentCounter = entry.messageCounter;
      }
      quads.push(entry.quad);
    }
    flush();
    if (signal?.aborted) {
      throw abortError();
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

/**
 * Reverse the deterministic LWS notification RDF mapping used by the server.
 * This is intentionally a plain JSON reconstruction, not an RDF/JSON-LD query.
 */
export function quadsToNotification(input: readonly JellyQuad[]): LwsNotification {
  const bySubject = new Map<string, JellyQuad[]>();
  for (const quad of input) {
    const entries = bySubject.get(quad.subject.value) ?? [];
    entries.push(quad);
    bySubject.set(quad.subject.value, entries);
  }

  const notificationType = input.find(
    quad =>
      quad.predicate.value === RDF_TYPE &&
      quad.object.value === `${LWS}Notification`,
  );
  if (!notificationType) {
    throw new Error('Jelly message does not contain an LWS Notification type.');
  }

  const notificationId = notificationType.subject.value;
  const notificationQuads = bySubject.get(notificationId) ?? [];
  const storage = notificationQuads.find(
    quad => quad.predicate.value === `${LWS}storage`,
  )?.object.value;
  if (!storage) {
    throw new Error('Jelly notification has no storage.');
  }

  const activityLinks = notificationQuads.filter(
    quad => quad.predicate.value === `${LWS}activity`,
  );
  if (activityLinks.length === 0) {
    throw new Error('Jelly notification has no activities.');
  }

  const activities = activityLinks.map(link => {
    const activityId = link.object.value;
    const activityQuads = bySubject.get(activityId) ?? [];
    const type = activityQuads
      .filter(
        quad =>
          quad.predicate.value === RDF_TYPE &&
          quad.object.value.startsWith(AS),
      )
      .map(quad => quad.object.value.slice(AS.length));

    const objectId = activityQuads.find(
      quad => quad.predicate.value === `${AS}object`,
    )?.object.value;
    if (!objectId) {
      throw new Error(`Jelly activity ${activityId} has no object.`);
    }

    const objectType = (bySubject.get(objectId) ?? [])
      .filter(
        quad =>
          quad.predicate.value === RDF_TYPE &&
          quad.object.value.startsWith(LWS),
      )
      .map(quad => quad.object.value.slice(LWS.length));

    const published = activityQuads.find(
      quad => quad.predicate.value === `${AS}published`,
    )?.object.value;
    if (!published) {
      throw new Error(`Jelly activity ${activityId} has no published value.`);
    }

    const activity: LwsActivity = {
      id: activityId,
      type,
      object: { id: objectId, type: objectType },
      published,
    };

    const actor = activityQuads.find(
      quad => quad.predicate.value === `${AS}actor`,
    )?.object.value;
    if (actor !== undefined) {
      activity.actor = actor;
    }
    const target = activityQuads.find(
      quad => quad.predicate.value === `${AS}target`,
    )?.object.value;
    if (target !== undefined) {
      activity.target = target;
    }
    const origin = activityQuads.find(
      quad => quad.predicate.value === `${AS}origin`,
    )?.object.value;
    if (origin !== undefined) {
      activity.origin = origin;
    }

    return activity;
  });

  return {
    id: notificationId,
    type: 'Notification',
    storage,
    activity: activities.length === 1 ? activities[0]! : activities,
  };
}
