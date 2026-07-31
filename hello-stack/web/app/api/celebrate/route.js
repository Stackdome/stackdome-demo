import { redis } from '../../../lib/redis';
import { config } from '../../../lib/config';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { clientId } = await req.json();
  const jobId = crypto.randomUUID();
  const job = { jobId, clientId, kind: config.celebration };

  try {
    await redis.publish('stages', JSON.stringify({ ...job, stage: 'queued' }));
    await redis.lpush('jobs', JSON.stringify(job));
  } catch (err) {
    /* the click must never vanish — tell the client so it can hold it */
    return Response.json({ error: 'redis unreachable' }, { status: 503 });
  }

  return Response.json({ jobId });
}
