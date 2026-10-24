import notificationData from '../fixtures/notifications.json';
import contextDocument from '../fixtures/contexts/lws-notifications-v1.json';

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

export interface LwsContextDocument {
  '@context': string[];
}

const fixtures = notificationData as unknown as readonly LwsNotification[];

if (fixtures.length === 0) {
  throw new Error('The notification fixture must not be empty.');
}

export const notificationFixtures: readonly LwsNotification[] = fixtures;

export const LWS_CONTEXT_PATH = '/contexts/lws-notifications-v1.jsonld';
export const LWS_CONTEXT_DOCUMENT = contextDocument as LwsContextDocument;

export function withInlineContext(notification: LwsNotification): Record<string, unknown> {
  return {
    '@context': [...LWS_CONTEXT_DOCUMENT['@context']],
    ...notification,
  };
}
