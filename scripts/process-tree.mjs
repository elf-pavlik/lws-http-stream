import { execFileSync } from 'node:child_process';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function collectDescendants(rootPid) {
  const output = execFileSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' });
  const childrenByParent = new Map();

  for (const line of output.split('\n')) {
    const [pidText, ppidText] = line.trim().split(/\s+/);
    const pid = Number(pidText);
    const ppid = Number(ppidText);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) {
      continue;
    }
    const children = childrenByParent.get(ppid) ?? [];
    children.push(pid);
    childrenByParent.set(ppid, children);
  }

  const descendants = [];
  const pending = [rootPid];
  while (pending.length > 0) {
    const parent = pending.pop();
    for (const pid of childrenByParent.get(parent) ?? []) {
      descendants.push(pid);
      pending.push(pid);
    }
  }
  return descendants;
}

/**
 * Terminate a detached process and every descendant discovered before and
 * during shutdown. This matters for dev servers such as `vercel dev`, which
 * spawn npm and Vite/wrangler grandchildren that can otherwise survive the
 * parent process.
 */
export async function stopProcessTree(child, { graceMs = 750 } = {}) {
  if (!child || child.pid === undefined) {
    return;
  }

  const knownPids = new Set();

  const rememberDescendants = () => {
    try {
      for (const pid of collectDescendants(child.pid)) {
        knownPids.add(pid);
      }
    } catch {
      // `ps` is unavailable or the process is already gone.
    }
  };

  rememberDescendants();

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // The process group is already gone.
  }
  for (const pid of knownPids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }

  await delay(graceMs);
  rememberDescendants();

  for (const pid of knownPids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}
