import { redis, sub } from '../../../lib/redis';
import { config } from '../../../lib/config';

export const dynamic = 'force-dynamic';   // do not let Next cache this

const PING_MS = 20_000;
const WINDOW_MS = 30_000;

const enc = new TextEncoder();
const g = globalThis;

/* module scope: one redis subscriber per pod, fanned out in process */
const clients = g.__hs_clients || (g.__hs_clients = new Set());

if (!g.__hs_subscribed) {
  g.__hs_subscribed = true;
  sub.subscribe('stages', 'presence').catch(() => {});
  sub.on('message', (channel, msg) => {
    const frame = channel === 'presence' ? `event: presence\ndata: ${msg}\n\n` : `data: ${msg}\n\n`;
    for (const c of clients) send(c, frame);
  });
}

function send(c, text) {
  try {
    c.enqueue(enc.encode(text));
  } catch {
    clients.delete(c);
  }
}

/* the viewer window is a sliding zset: no heartbeat table, no cleanup job */
async function touch(clientId) {
  const now = Date.now();
  await redis.zadd('viewers', now, clientId);
  await redis.zremrangebyscore('viewers', 0, now - WINDOW_MS);
  return redis.zcard('viewers');
}

async function announce(watching) {
  if (watching === g.__hs_watching) return;
  g.__hs_watching = watching;
  await redis.publish('presence', JSON.stringify({ watching }));
}

/* the deploy is the first celebration: fired on the first connection ever,
   not on worker startup — a celebration in an empty room is wasted */
async function greet() {
  const first = await redis.setnx('greeted', 1);
  if (!first) return;
  const job = { jobId: crypto.randomUUID(), clientId: null, kind: config.celebration, reason: 'deploy' };
  await redis.publish('stages', JSON.stringify({ ...job, stage: 'queued' }));
  await redis.lpush('jobs', JSON.stringify(job));
}

export async function GET(req) {
  const clientId = new URL(req.url).searchParams.get('clientId');
  let self;
  let ping;

  const stream = new ReadableStream({
    start(c) {
      self = c;
      clients.add(c);
      send(c, ': connected\n\n');

      touch(clientId).then(announce).catch(() => {});
      greet().catch(() => {});

      /* idle proxies drop a quiet connection; presence rides the same tick */
      ping = setInterval(() => {
        send(self, ': ping\n\n');
        touch(clientId).then(announce).catch(() => {});
      }, PING_MS);
    },
    cancel() {
      clearInterval(ping);
      clients.delete(self);
      /* a closed tab drops now rather than waiting out the 30s window */
      redis.zrem('viewers', clientId)
        .then(() => redis.zcard('viewers'))
        .then(announce)
        .catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',          // or nginx ingress holds every event
    },
  });
}
