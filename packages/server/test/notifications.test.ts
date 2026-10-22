import { describe, expect, it } from 'vitest';
import { notificationFixtures } from '../src/notifications.ts';

const uuidUrn = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actorUrl = /^https:\/\/[a-z]+\.id\.example$/;
const flatStorageUrl = /^https:\/\/storage\.example\/[a-z][0-9a-z]{5}$/;

describe('generated notification fixtures', () => {
  it('uses randomUUID()-shaped URNs and name.id.example actors', () => {
    for (const notification of notificationFixtures) {
      expect(notification.id).toMatch(uuidUrn);
      for (const activity of Array.isArray(notification.activity)
        ? notification.activity
        : [notification.activity]) {
        expect(activity.id).toMatch(uuidUrn);
        expect(activity.actor).toMatch(actorUrl);
      }
    }
  });

  it('uses flat six-character cuid2 paths for object, target, and origin', () => {
    for (const notification of notificationFixtures) {
      for (const activity of Array.isArray(notification.activity)
        ? notification.activity
        : [notification.activity]) {
        expect(activity.object.id).toMatch(flatStorageUrl);
        if (activity.target !== undefined) {
          expect(activity.target).toMatch(flatStorageUrl);
        }
        if (activity.origin !== undefined) {
          expect(activity.origin).toMatch(flatStorageUrl);
        }
      }
    }
  });

  it('keeps generated resource identifiers unique', () => {
    const ids = notificationFixtures.flatMap(notification =>
      (Array.isArray(notification.activity)
        ? notification.activity
        : [notification.activity]
      ).flatMap(activity => [
        activity.id,
        activity.object.id,
        ...(activity.target ? [activity.target] : []),
        ...(activity.origin ? [activity.origin] : []),
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
