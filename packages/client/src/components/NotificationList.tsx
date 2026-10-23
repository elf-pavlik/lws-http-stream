import { For } from 'solid-js';
import { VirtualList } from './VirtualList.tsx';
import { activitiesOf, formatBytes } from '../lib/stats.ts';
import type { ReceivedNotification, StreamStats } from '../lib/types.ts';

export function NotificationList(props: {
  items: ReceivedNotification[];
  counterpartIds: Set<string>;
  status: StreamStats['status'];
}) {
  const emptyMessage = (): string => {
    switch (props.status) {
      case 'idle':
        return 'Start the streams to receive notifications.';
      case 'cancelled':
        return 'Stream stopped. Re-start all streams to begin again.';
      case 'error':
        return 'The stream failed. Re-start all streams to try again.';
      default:
        return 'Waiting for the first decoded notification…';
    }
  };

  return (
    <VirtualList
      items={props.items}
      rowHeight={148}
      empty={<p class="empty-state">{emptyMessage()}</p>}
    >
      {item => (
        <article class="notification">
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
        </article>
      )}
    </VirtualList>
  );
}
