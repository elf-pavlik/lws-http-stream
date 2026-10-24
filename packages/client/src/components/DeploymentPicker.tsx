import { For, createMemo } from 'solid-js';
import {
  GOLEM_DEPLOYMENTS,
  HONO_DEPLOYMENTS,
  type Deployment,
  type DeploymentId,
} from '../lib/deployments.ts';
import {
  CloudflareIcon,
  GolemIcon,
  HonoIcon,
  LocalIcon,
  VercelIcon,
  WebAssemblyIcon,
} from './icons.tsx';

function DeploymentIcon(props: { id: DeploymentId; class?: string }) {
  switch (props.id) {
    case 'local':
      return <LocalIcon class={props.class} />;
    case 'cloudflare':
      return <CloudflareIcon class={props.class} />;
    case 'vercel':
      return <VercelIcon class={props.class} />;
    case 'golem':
      return <GolemIcon class={props.class} />;
  }
}

function DeploymentButton(props: {
  deployment: Deployment;
  selected: DeploymentId;
  onSelect: (id: DeploymentId) => void;
}) {
  const isSelected = () => props.selected === props.deployment.id;

  return (
    <button
      type="button"
      class={`deployment-button deployment-${props.deployment.id}${
        isSelected() ? ' selected' : ''
      }`}
      aria-pressed={isSelected()}
      title={props.deployment.description}
      onClick={() => props.onSelect(props.deployment.id)}
    >
      <DeploymentIcon id={props.deployment.id} class="deployment-button-icon" />
      <span>{props.deployment.label}</span>
    </button>
  );
}

export function DeploymentPicker(props: {
  selected: DeploymentId;
  endpoint: string;
  showLocal: boolean;
  onSelect: (id: DeploymentId) => void;
}) {
  const honoDeployments = createMemo(() =>
    props.showLocal
      ? HONO_DEPLOYMENTS
      : HONO_DEPLOYMENTS.filter(deployment => deployment.id !== 'local'),
  );

  return (
    <section class="deployment-picker" aria-label="Backend deployment">
      <div class="deployment-groups">
        <div class="deployment-group deployment-group-hono">
          <div class="deployment-group-heading">
            <HonoIcon class="deployment-group-icon" />
            <div>
              <strong>Hono</strong>
              <span>Node · Cloudflare · Vercel</span>
            </div>
          </div>
          <div class="deployment-options" role="group" aria-label="Hono deployments">
            <For each={honoDeployments()}>
              {deployment => (
                <DeploymentButton
                  deployment={deployment}
                  selected={props.selected}
                  onSelect={props.onSelect}
                />
              )}
            </For>
          </div>
        </div>

        <div class="deployment-group deployment-group-golem">
          <div class="deployment-group-heading">
            <WebAssemblyIcon class="deployment-group-icon" />
            <div>
              <strong>Golem</strong>
              <span>Rust · WebAssembly</span>
            </div>
          </div>
          <div class="deployment-options" role="group" aria-label="Golem deployment">
            <For each={GOLEM_DEPLOYMENTS}>
              {deployment => (
                <DeploymentButton
                  deployment={deployment}
                  selected={props.selected}
                  onSelect={props.onSelect}
                />
              )}
            </For>
          </div>
        </div>
      </div>

      <p class="deployment-endpoint" aria-live="polite">
        <span>Backend endpoint</span>
        <code>{props.endpoint}</code>
      </p>
    </section>
  );
}
