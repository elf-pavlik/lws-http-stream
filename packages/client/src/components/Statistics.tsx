import { Show } from 'solid-js';
import {
  averageBytesPerMessage,
  formatAverage,
  formatBytes,
  formatDuration,
} from '../lib/stats.ts';
import type { StreamStats } from '../lib/types.ts';

export function Statistics(props: { stats: StreamStats }) {
  const average = () => averageBytesPerMessage(props.stats);

  return (
    <dl class="statistics">
      <div class="stat">
        <dt>Status</dt>
        <dd>
          <span class={`status status-${props.stats.status}`}>{props.stats.status}</span>
        </dd>
      </div>
      <div class="stat">
        <dt>Body bytes</dt>
        <dd>{formatBytes(props.stats.bytesReceived)}</dd>
      </div>
      <div class="stat">
        <dt>Messages</dt>
        <dd>{props.stats.messagesDecoded}</dd>
      </div>
      <div class="stat">
        <dt>Avg / message</dt>
        <dd>{formatAverage(average())}</dd>
      </div>
      <div class="stat">
        <dt>First notification</dt>
        <dd>{formatDuration(props.stats.firstNotificationMs)}</dd>
      </div>
      <div class="stat">
        <dt>Elapsed</dt>
        <dd>{formatDuration(props.stats.elapsedMs)}</dd>
      </div>
      <Show when={props.stats.error}>
        {error => (
          <div class="stat stat-error">
            <dt>Error</dt>
            <dd>{error()}</dd>
          </div>
        )}
      </Show>
    </dl>
  );
}
