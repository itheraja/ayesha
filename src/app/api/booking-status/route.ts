import { z } from 'zod';
import { database } from '@/lib/server/db';
import { body, checkOrigin, rateLimit, route, sessionId } from '@/lib/server/security';
import { reconcileBooking } from '@/lib/server/workflow';
export async function POST(req: Request) {
  return route(async () => {
    checkOrigin(req);
    const id = await sessionId();
    await rateLimit(`booking-status:${id}`, 60);
    const p = z.object({ proposal_id: z.string().uuid().optional() }).parse(await body(req));
    return reconcileBooking(await database(), id, p.proposal_id);
  });
}
