import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from 'solid-js';

/**
 * Fixed-row-height virtual list. Only the rows intersecting the scroll
 * viewport (plus a small overscan) are mounted, so a long notification stream
 * does not create an ever-growing DOM.
 */
export function VirtualList<T>(props: {
  items: readonly T[];
  rowHeight: number;
  overscan?: number;
  empty?: JSX.Element;
  children: (item: T, index: number) => JSX.Element;
}) {
  let container!: HTMLDivElement;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);

  const overscan = () => props.overscan ?? 4;
  const totalHeight = () => props.items.length * props.rowHeight;

  const startIndex = createMemo(() =>
    Math.max(0, Math.floor(scrollTop() / props.rowHeight) - overscan()),
  );
  const endIndex = createMemo(() =>
    Math.min(
      props.items.length,
      Math.ceil((scrollTop() + viewportHeight()) / props.rowHeight) + overscan(),
    ),
  );

  const visible = createMemo(() => {
    const start = startIndex();
    return props.items
      .slice(start, endIndex())
      .map((item, offset) => ({ index: start + offset, item }));
  });

  createEffect(() => {
    if (props.items.length === 0 && container) {
      container.scrollTop = 0;
      setScrollTop(0);
    }
  });

  onMount(() => {
    const updateViewport = (): void => {
      setViewportHeight(container.clientHeight);
    };
    updateViewport();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateViewport);
    observer.observe(container);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      class="notification-list"
      ref={container}
      aria-live="polite"
      onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
    >
      <Show
        when={props.items.length > 0}
        fallback={props.empty ?? <p class="empty-state">No notifications yet.</p>}
      >
        <ol class="virtual-list" style={{ height: `${totalHeight()}px` }}>
          <For each={visible()}>
            {entry => (
              <li
                class="virtual-list-row"
                style={{
                  height: `${props.rowHeight}px`,
                  transform: `translateY(${entry.index * props.rowHeight}px)`,
                }}
              >
                {props.children(entry.item, entry.index)}
              </li>
            )}
          </For>
        </ol>
      </Show>
    </div>
  );
}
