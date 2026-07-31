import Redis from 'ioredis';
import { config } from './config';

/* ioredis needs a separate connection for subscribe mode: one for commands,
   one for the `stages` / `presence` subscriber. Sharing one throws. */

const options = {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  connectTimeout: 4000,
  retryStrategy: (times) => Math.min(times * 300, 5000),
};

function client(name) {
  const c = new Redis(config.redisUrl, options);
  /* a listener is required or an unreachable redis takes the process down */
  c.on('error', (err) => console.error(`[redis:${name}] ${err.message}`));
  c.connect().catch(() => {});
  return c;
}

const g = globalThis;

export const redis = g.__hs_redis || (g.__hs_redis = client('cmd'));
export const sub = g.__hs_sub || (g.__hs_sub = client('sub'));

/* born is written once, ever — every later SETNX is a no-op, so the value is
   the timestamp of the very first start. Re-armed on every (re)connect so a
   redis that was down at boot still gets it. */
if (!g.__hs_born) {
  g.__hs_born = true;
  redis.on('ready', () => {
    redis.setnx('born', Date.now()).catch(() => {});
  });
}
