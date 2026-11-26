import { z } from 'zod';
import { database } from '@/lib/server/db';
import { body, checkOrigin, route, sessionId, rateLimit } from '@/lib/server/security';
import { saveContext } from '@/lib/server/workflow';
const contextInput = z.object({
  revision: z.number().int().min(0),
  fragments: z
    .array(
      z.object({
        id: z.string().max(200),
        role: z.enum(['user', 'assistant']),
        delta: z.string().max(2000),
        start_ms: z.number().nonnegative(),
        end_ms: z.number().nonnegative(),
      }),
    )
    .max(500),
});
export async function POST(req: Request) {
  return route(async () => {
    checkOrigin(req);
    const id = await sessionId();
    await rateLimit(`context:${id}`, 600);
    const p = contextInput.parse(await body(req));
    await saveContext(await database(), id, p.revision, p.fragments);
    return { saved: true };
  });
}
