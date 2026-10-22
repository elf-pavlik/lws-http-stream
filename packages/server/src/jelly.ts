import {
  DataFactory,
  LogicalStreamType,
  PhysicalStreamType,
  Writer,
} from 'rdfjs-jelly/browser';
import type { LwsActivity, LwsNotification } from './notifications.ts';

const { namedNode, literal, quad, defaultGraph } = DataFactory;

export const JELLY_MEDIA_TYPE = 'application/x-jelly-rdf';

const LWS = 'https://www.w3.org/ns/lws#';
const AS = 'https://www.w3.org/ns/activitystreams#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

type JellyQuad = ReturnType<typeof DataFactory.quad>;

function activitiesOf(notification: LwsNotification): readonly LwsActivity[] {
  return Array.isArray(notification.activity) ? notification.activity : [notification.activity];
}

/**
 * Map an LWS notification to a small, deterministic RDF graph. The mapping is
 * deliberately simple and is reversed by the client to recover the logical
 * notification for side-by-side comparison.
 */
export function notificationToQuads(notification: LwsNotification): JellyQuad[] {
  const quads: JellyQuad[] = [];
  const graph = defaultGraph();
  const add = (subject: string, predicate: string, object: string | ReturnType<typeof literal>) => {
    quads.push(
      quad(
        namedNode(subject),
        namedNode(predicate),
        typeof object === 'string' ? namedNode(object) : object,
        graph,
      ),
    );
  };

  add(notification.id, `${RDF}type`, `${LWS}Notification`);
  add(notification.id, `${LWS}storage`, notification.storage);

  for (const activity of activitiesOf(notification)) {
    const activityId = activity.id;
    add(notification.id, `${LWS}activity`, activityId);

    for (const type of activity.type) {
      add(activityId, `${RDF}type`, `${AS}${type}`);
    }
    if (activity.actor !== undefined) {
      add(activityId, `${AS}actor`, activity.actor);
    }

    const objectId = activity.object.id;
    add(activityId, `${AS}object`, objectId);
    for (const type of activity.object.type) {
      add(objectId, `${RDF}type`, `${LWS}${type}`);
    }

    if (activity.target !== undefined) {
      add(activityId, `${AS}target`, activity.target);
    }
    if (activity.origin !== undefined) {
      add(activityId, `${AS}origin`, activity.origin);
    }

    add(
      activityId,
      `${AS}published`,
      literal(activity.published, namedNode(`${XSD}dateTime`)),
    );
  }

  return quads;
}

export interface JellyNotificationEncoder {
  addNotification(notification: LwsNotification): Uint8Array[];
  finish(): Uint8Array[];
}

/**
 * One RdfStreamFrame per notification. rdfjs-jelly's delimited Writer prefixes
 * each Protobuf frame with its varint length and writes it to the provided
 * output immediately.
 */
export function createJellyNotificationEncoder(): JellyNotificationEncoder {
  let pending: Uint8Array[] = [];

  const writer = new Writer(
    {
      write(chunk) {
        // Copy out of protobufjs's pooled Buffer view. Some Web Streams
        // runtimes (notably workerd) reject views with a large backing store.
        pending.push(new Uint8Array(chunk));
      },
      end(callback) {
        callback?.(null);
      },
    },
    {
      delimited: true,
      physicalType: PhysicalStreamType.QUADS,
      logicalType: LogicalStreamType.FLAT_QUADS,
      streamName: 'lws-notifications',
      namespaces: {
        lws: LWS,
        as: AS,
        rdf: RDF,
        xsd: XSD,
      },
    },
  );

  return {
    addNotification(notification) {
      pending = [];
      writer.addMessage(notificationToQuads(notification));
      return pending;
    },
    finish() {
      pending = [];
      writer.end();
      return pending;
    },
  };
}
