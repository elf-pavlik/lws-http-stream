import { Show } from 'solid-js';
import { ContextToggle } from './ContextToggle.tsx';
import { HttpExchange } from './HttpExchange.tsx';
import { NotificationList } from './NotificationList.tsx';
import { Statistics } from './Statistics.tsx';
import type { StreamSession } from '../lib/session.ts';

export function StreamPanel(props: {
  title: string;
  mediaType: string;
  session: StreamSession;
  counterpartIds: Set<string>;
  tone: 'ndjson' | 'cbor' | 'jelly';
  inlineContext?: boolean;
  onToggleContext?: () => void;
}) {
  return (
    <section class={`panel panel-${props.tone}`}>
      <header class="panel-header">
        <div>
          <h2>{props.title}</h2>
          <code class="media-type">{props.mediaType}</code>
        </div>
        <div class="panel-actions">
          {props.inlineContext !== undefined && props.onToggleContext ? (
            <ContextToggle
              checked={props.inlineContext}
              onToggle={props.onToggleContext}
            />
          ) : null}
          <span class="encoding-badge">{props.tone === 'ndjson' ? 'text' : 'binary'}</span>
        </div>
      </header>

      <Statistics stats={props.session.stats()} />

      <HttpExchange
        representation={props.session.representation}
        inlineContext={props.inlineContext ?? false}
      />

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
