export function ContextToggle(props: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      class="context-toggle panel-context-toggle"
      classList={{ active: props.checked }}
      title="Toggles @context and, while streams are running, restarts all three"
      onClick={() => props.onToggle()}
    >
      <span class="context-toggle-label">@context</span>
      <span class="toggle-switch" aria-hidden="true">
        <span class="toggle-knob" />
      </span>
      <span class="context-toggle-state">
        {props.checked ? 'inline' : 'link only'}
      </span>
    </button>
  );
}
