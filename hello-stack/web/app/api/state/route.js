import { redis } from '../../../lib/redis';

export const dynamic = 'force-dynamic';

/* everything the page needs on first paint, in one round trip */
export async function GET() {
  try {
    const [total, born, watching] = await Promise.all([
      redis.get('celebrations'),
      redis.get('born'),
      redis.zcard('viewers'),
    ]);
    return Response.json({ ok: true, total: +total || 0, born: +born, watching });
  } catch (err) {
    /* redis down: the page still renders, with the count suppressed */
    return Response.json({ ok: false });
  }
}
