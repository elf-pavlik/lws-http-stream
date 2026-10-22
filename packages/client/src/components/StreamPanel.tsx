import { Show } from 'solid-js';
import { NotificationList } from './NotificationList.tsx';
import { Statistics } from './Statistics.tsx';
import type { StreamSession } from '../lib/session.ts';

export function StreamPanel(props: {
  title: string;
  mediaType: string;
  session: StreamSession;
  counterpartIds: Set<string>;
  tone: 'ndjson' | 'cbor';
}) {
  return (
    <section class={`panel panel-${props.tone}`}>
      <header class="panel-header">
        <div>
          <h2>{props.title}</h2>
          <code class="media-type">{props.mediaType}</code>
        </div>
        <span class="encoding-badge">{props.tone === 'ndjson' ? 'text' : 'binary'}</span>
      </header>

      <Statistics stats={props.session.stats()} />

      <NotificationList
        items={props.session.items()}
        counterpartIds={props.counterpartIds}
      />

      <Show when={props.session.stats().contextUrl}>
        {contextUrl => (
          <footer class="panel-footer">
            <span>JSON-LD context from Link</span>
            <a href={contextUrl()} target="_blank" rel="noreferrer">
              {contextUrl()}
            </a>
          </footer>
        )}
      </Show>
    </section>
  );
}
