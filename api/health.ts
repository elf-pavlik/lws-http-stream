import { health } from '../packages/server/adapters/vercel.ts';

export default {
  fetch: health,
};
