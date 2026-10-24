// Keep these URLs in sync with the deployment links in the root README.
export type DeploymentId = 'local' | 'cloudflare' | 'vercel' | 'golem';

export interface Deployment {
  id: DeploymentId;
  label: string;
  /**
   * Backend origin, or an empty string when the backend lives on the origin
   * that serves the client (the Vite dev proxy, or a deployment that hosts
   * both the client and its API).
   */
  baseUrl: string;
  description: string;
}

export const HONO_DEPLOYMENTS: readonly Deployment[] = [
  {
    id: 'local',
    label: 'Local',
    baseUrl: '',
    description: 'Local Hono server through the Vite proxy',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    baseUrl: 'https://cbor-ld-stream-demo.elf-pavlik.workers.dev',
    description: 'Hono on Cloudflare Workers',
  },
  {
    id: 'vercel',
    label: 'Vercel',
    baseUrl: 'https://lws-http-stream.vercel.app',
    description: 'Hono on Vercel Functions',
  },
];

export const GOLEM_DEPLOYMENTS: readonly Deployment[] = [
  {
    id: 'golem',
    label: 'Golem',
    baseUrl: 'https://lws-http-stream.apps.golem.cloud',
    description: 'Rust HTTP router on Golem Cloud (WebAssembly)',
  },
];

export const DEPLOYMENTS: readonly Deployment[] = [
  ...HONO_DEPLOYMENTS,
  ...GOLEM_DEPLOYMENTS,
];

export function deploymentById(id: DeploymentId): Deployment {
  const deployment = DEPLOYMENTS.find(candidate => candidate.id === id);
  if (deployment === undefined) {
    throw new Error(`Unknown deployment: ${id}`);
  }
  return deployment;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** True when the page is served by the local Vite client, whose proxy reaches the local server. */
export function isLocalClient(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOOPBACK_HOSTNAMES.has(host) || host.endsWith('.localhost');
}

/**
 * Deployment that serves this client, or null when the host is not recognised.
 *
 * Cloudflare and Vercel serve the built client from the same deployment as
 * their API, so the documented links, previews (`*.workers.dev`,
 * `*.vercel.app`), and custom domains that match a known base URL all resolve
 * to the backend they belong to.
 */
export function detectDeployment(hostname: string): Deployment | null {
  if (isLocalClient(hostname)) {
    return deploymentById('local');
  }
  const host = hostname.toLowerCase();
  const documented = DEPLOYMENTS.find(
    deployment =>
      deployment.baseUrl !== '' && hostnameOf(deployment.baseUrl) === host,
  );
  if (documented !== undefined) {
    return documented;
  }
  if (host.endsWith('.workers.dev')) {
    return deploymentById('cloudflare');
  }
  if (host.endsWith('.vercel.app')) {
    return deploymentById('vercel');
  }
  return null;
}

/**
 * Base URL to call for a deployment. When this page is served by that
 * deployment (production, preview, or a documented custom link), use relative
 * URLs so previews talk to their own backend instead of the production origin.
 */
export function deploymentBaseUrl(deployment: Deployment, hostname: string): string {
  if (deployment.baseUrl === '') {
    return '';
  }
  return detectDeployment(hostname)?.id === deployment.id ? '' : deployment.baseUrl;
}

/** Human-readable backend origin shown under the picker. */
export function deploymentEndpoint(baseUrl: string): string {
  if (baseUrl !== '') {
    return baseUrl;
  }
  return typeof window === 'undefined' ? 'current origin' : window.location.origin;
}

function hostnameOf(url: string): string {
  return new URL(url).hostname.toLowerCase();
}
