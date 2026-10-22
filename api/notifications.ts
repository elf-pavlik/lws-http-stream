import { notifications } from '../packages/server/adapters/vercel.ts';

/**
 * Vercel Node.js Function using the Web-standard fetch signature.
 * Streaming and request cancellation are enabled in vercel.json.
 */
export default {
  fetch: notifications,
};
