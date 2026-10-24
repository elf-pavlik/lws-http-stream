import { describe, expect, it } from 'vitest';
import {
  deploymentBaseUrl,
  deploymentById,
  deploymentEndpoint,
  detectDeployment,
  isLocalClient,
  type DeploymentId,
} from '../src/lib/deployments.ts';

describe('local client detection', () => {
  it('treats loopback hosts as the local client', () => {
    for (const host of ['localhost', 'LOCALHOST', '127.0.0.1', '[::1]', 'app.localhost']) {
      expect(isLocalClient(host)).toBe(true);
    }
  });

  it('treats deployment hosts as remote', () => {
    for (const host of [
      'cbor-ld-stream-demo.elf-pavlik.workers.dev',
      'lws-http-stream.vercel.app',
      'lws-http-stream.apps.golem.cloud',
      'example.com',
    ]) {
      expect(isLocalClient(host)).toBe(false);
    }
  });
});

describe('deployment detection', () => {
  const cases: ReadonlyArray<readonly [string, DeploymentId | null]> = [
    ['localhost', 'local'],
    ['127.0.0.1', 'local'],
    ['cbor-ld-stream-demo.elf-pavlik.workers.dev', 'cloudflare'],
    ['cbor-ld-stream-demo-preview.elf-pavlik.workers.dev', 'cloudflare'],
    ['lws-http-stream.vercel.app', 'vercel'],
    ['lws-http-stream-git-main-elf-pavlik.vercel.app', 'vercel'],
    ['lws-http-stream.apps.golem.cloud', 'golem'],
    ['example.com', null],
    ['notworkers.dev', null],
  ];

  for (const [host, expected] of cases) {
    it(`maps ${host} to ${expected ?? 'no deployment'}`, () => {
      expect(detectDeployment(host)?.id ?? null).toBe(expected);
    });
  }
});

describe('deployment base URL', () => {
  it('uses relative URLs on the local client', () => {
    expect(deploymentBaseUrl(deploymentById('local'), 'localhost')).toBe('');
  });

  it('uses relative URLs when the deployment serves the page', () => {
    expect(
      deploymentBaseUrl(
        deploymentById('cloudflare'),
        'cbor-ld-stream-demo.elf-pavlik.workers.dev',
      ),
    ).toBe('');
    expect(
      deploymentBaseUrl(deploymentById('vercel'), 'lws-http-stream-git-main.vercel.app'),
    ).toBe('');
  });

  it('uses the absolute origin for other deployments', () => {
    expect(
      deploymentBaseUrl(
        deploymentById('vercel'),
        'cbor-ld-stream-demo.elf-pavlik.workers.dev',
      ),
    ).toBe('https://lws-http-stream.vercel.app');
    expect(deploymentBaseUrl(deploymentById('golem'), 'localhost')).toBe(
      'https://lws-http-stream.apps.golem.cloud',
    );
  });

  it('shows the backend origin in the picker', () => {
    expect(deploymentEndpoint('https://lws-http-stream.vercel.app')).toBe(
      'https://lws-http-stream.vercel.app',
    );
    expect(deploymentEndpoint('')).toBe('current origin');
  });
});
