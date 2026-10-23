import notificationData from '../fixtures/notifications.json' with { type: 'json' };

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

function assertNotification(value: unknown, index: number): asserts value is LwsNotification {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`Notification fixture ${index} must be an object.`);
  }
  const candidate = value as Partial<LwsNotification>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw new TypeError(`Notification fixture ${index} has no id.`);
  }
  if (candidate.type !== 'Notification') {
    throw new TypeError(`Notification fixture ${index} must have type "Notification".`);
  }
  if (typeof candidate.storage !== 'string') {
    throw new TypeError(`Notification fixture ${index} has no storage.`);
  }
  if (candidate.activity === undefined) {
    throw new TypeError(`Notification fixture ${index} has no activity.`);
  }
}

const fixtures = notificationData as unknown as readonly LwsNotification[];
fixtures.forEach(assertNotification);

export const notificationFixtures: readonly LwsNotification[] = fixtures;

export function getNotificationId(notification: LwsNotification): string {
  return notification.id;
}

export function getActivities(notification: LwsNotification): readonly LwsActivity[] {
  return Array.isArray(notification.activity) ? notification.activity : [notification.activity];
}
