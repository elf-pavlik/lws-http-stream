import { For, Show } from 'solid-js';
import { activitiesOf, formatBytes } from '../lib/stats.ts';
import type { ReceivedNotification } from '../lib/types.ts';

export function NotificationList(props: {
  items: ReceivedNotification[];
  counterpartIds: Set<string>;
}) {
  return (
    <div class="notification-list" aria-live="polite">
      <Show
        when={props.items.length > 0}
        fallback={<p class="empty-state">Waiting for the first decoded notification…</p>}
      >
        <ol>
          <For each={props.items}>
            {item => (
              <li class="notification">
                <div class="notification-topline">
                  <span class="sequence">#{item.index}</span>
                  <span class="notification-id" title={item.id}>
                    {item.id}
                  </span>
                  <span
                    class={
                      props.counterpartIds.has(item.id) ? 'match match-yes' : 'match match-wait'
                    }
                  >
                    {props.counterpartIds.has(item.id) ? 'matched' : 'waiting'}
                  </span>
                </div>
                <div class="notification-body">
                  <div class="activity-types">
                    <For each={activitiesOf(item.notification)}>
                      {activity => (
                        <For each={activity.type}>
                          {type => <span class="type-pill">{type}</span>}
                        </For>
                      )}
                    </For>
                  </div>
                  <div class="resources">
                    <For each={activitiesOf(item.notification)}>
                      {activity => <code>{activity.object.id}</code>}
                    </For>
                  </div>
                  <div class="notification-meta">
                    <span>{item.bytes > 0 ? `${formatBytes(item.bytes)} encoded` : 'stream frame'}</span>
                    <span>{activitiesOf(item.notification).length} activity(ies)</span>
                    <span>at {Math.round(item.atMs)} ms</span>
                  </div>
                </div>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </div>
  );
}
