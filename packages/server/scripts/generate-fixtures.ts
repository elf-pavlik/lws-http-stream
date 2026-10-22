import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { init as initCuid2 } from '@paralleldrive/cuid2';
import type { LwsActivity, LwsNotification } from '../src/notifications.ts';

const createCuid = initCuid2({ length: 6 });
const usedCuid = new Set<string>();

function cuid(): string {
  let id = createCuid();
  while (usedCuid.has(id)) {
    id = createCuid();
  }
  usedCuid.add(id);
  return id;
}

function urnUuid(): string {
  return `urn:uuid:${randomUUID()}`;
}

function actor(name: string): string {
  return `https://${name}.id.example`;
}

function resource(): string {
  return `https://storage.example/${cuid()}`;
}

const storage = 'https://storage.example/';

const notifications: LwsNotification[] = [
  {
    id: urnUuid(),
    type: 'Notification',
    storage,
    activity: {
      id: urnUuid(),
      type: ['Create'],
      actor: actor('alice'),
      object: { id: resource(), type: ['DataResource'] },
      target: resource(),
      published: '2026-03-26T10:30:00Z',
    },
  },
  {
    id: urnUuid(),
    type: 'Notification',
    storage,
    activity: {
      id: urnUuid(),
      type: ['Update'],
      actor: actor('bob'),
      object: { id: resource(), type: ['DataResource'] },
      published: '2026-03-26T10:30:01Z',
    },
  },
  {
    id: urnUuid(),
    type: 'Notification',
    storage,
    activity: {
      id: urnUuid(),
      type: ['Delete'],
      actor: actor('alice'),
      object: { id: resource(), type: ['DataResource'] },
      origin: resource(),
      published: '2026-03-26T10:30:02Z',
    },
  },
  {
    id: urnUuid(),
    type: 'Notification',
    storage,
    activity: {
      id: urnUuid(),
      type: ['Create'],
      actor: actor('carol'),
      object: { id: resource(), type: ['DataResource'] },
      target: resource(),
      published: '2026-03-26T10:30:03Z',
    },
  },
  {
    id: urnUuid(),
    type: 'Notification',
    storage,
    activity: {
      id: urnUuid(),
      type: ['Update'],
      actor: actor('alice'),
      object: { id: resource(), type: ['DataResource'] },
      published: '2026-03-26T10:30:04Z',
    },
  },
  {
    id: urnUuid(),
    type: 'Notification',
    storage,
    activity: {
      id: urnUuid(),
      type: ['Move'],
      actor: actor('alice'),
      object: { id: resource(), type: ['DataResource'] },
      origin: resource(),
      target: resource(),
      published: '2026-03-26T10:30:05Z',
    },
  },
  {
    id: urnUuid(),
    type: 'Notification',
    storage,
    activity: {
      id: urnUuid(),
      type: ['Create'],
      actor: actor('bob'),
      object: { id: resource(), type: ['DataResource'] },
      target: resource(),
      published: '2026-03-26T10:30:06Z',
    },
  },
  {
    id: urnUuid(),
    type: 'Notification',
    storage,
    activity: [
      {
        id: urnUuid(),
        type: ['Create'],
        actor: actor('bob'),
        object: { id: resource(), type: ['DataResource'] },
        target: resource(),
        published: '2026-03-26T10:30:07Z',
      },
      {
        id: urnUuid(),
        type: ['Delete'],
        actor: actor('bob'),
        object: { id: resource(), type: ['DataResource'] },
        origin: resource(),
        published: '2026-03-26T10:30:08Z',
      },
    ],
  },
];

// Keep the activity union shape explicit for editors.
const activities: LwsActivity[] = notifications.flatMap(notification =>
  Array.isArray(notification.activity) ? notification.activity : [notification.activity],
);
if (activities.length === 0) {
  throw new Error('Generated fixture set unexpectedly has no activities.');
}

const outputPath = fileURLToPath(new URL('../fixtures/notifications.json', import.meta.url));
await writeFile(outputPath, `${JSON.stringify(notifications, null, 2)}\n`, 'utf8');
console.log(`Wrote ${notifications.length} notifications to ${outputPath}`);
