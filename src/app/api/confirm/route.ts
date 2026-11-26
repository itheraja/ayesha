import { z } from 'zod';
import { database } from '@/lib/server/db';
import { body, checkOrigin, route, sessionId, rateLimit, HttpError } from '@/lib/server/security';
import { resolveVoiceApproval } from '@/lib/server/workflow';
export async function POST(req: Request) {
  return route(async () => {
    checkOrigin(req);
    const id = await sessionId();
    await rateLimit(`confirm:${id}`, 20);
    const p = z
      .object({ proposal_id: z.string().uuid(), revision: z.number().int().nonnegative() })
      .parse(await body(req));
    try {
      return await resolveVoiceApproval(
        await database(),
        id,
        p.proposal_id,
        p.revision,
        undefined,
        req.signal,
      );
    } catch (e) {
      throw new HttpError(409, e instanceof Error ? e.message : 'Confirmation failed');
    }
  });
}
