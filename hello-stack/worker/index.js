import os from 'node:os';
import Redis from 'ioredis';

const url = process.env.REDIS_URL || 'redis://redis:6379';
const name = `worker-${os.hostname().slice(-4)}`;

/* one connection for the blocking pop, one for publishing */
const redis = new Redis(url, { maxRetriesPerRequest: null });
const pub = new Redis(url, { maxRetriesPerRequest: null });
redis.on('error', (err) => console.error(`[redis] ${err.message}`));
pub.on('error', (err) => console.error(`[redis:pub] ${err.message}`));

let stopping = false;
let working = false;

/* drain the job in flight before exiting, so SIGTERM never loses work */
function bye() {
  stopping = true;
  if (!working) shutdown();
}
async function shutdown() {
  await Promise.allSettled([redis.quit(), pub.quit()]);
  process.exit(0);
}
process.on('SIGTERM', bye);
process.on('SIGINT', bye);

console.log(`${name} watching jobs`);

while (!stopping) {
  const popped = await redis.brpop('jobs', 0);   // timeout 0: block until a job arrives
  if (!popped) continue;
  working = true;

  const job = JSON.parse(popped[1]);
  const say = (stage, extra = {}) =>
    pub.publish('stages', JSON.stringify({ ...job, stage, worker: name, ...extra }));

  try {
    await say('claimed');
    const total = await redis.incr('celebrations');
    await say('done', { total });                // no artificial delay: the dwell is a client concern
  } catch (err) {
    console.error(`${name} failed ${job.jobId}: ${err.message}`);
    await say('failed', { error: err.message }).catch(() => {});
  }

  working = false;
  if (stopping) await shutdown();
}
