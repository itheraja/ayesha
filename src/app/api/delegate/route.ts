import { z } from 'zod';
import { database } from '@/lib/server/db';
import { body, checkOrigin, HttpError, route, sessionId, rateLimit } from '@/lib/server/security';
import { runAgent } from '@/lib/server/agent';
import { readSession } from '@/lib/server/workflow';
export const maxDuration = 120;
export async function POST(req: Request) {
  return route(async () => {
    checkOrigin(req);
    const id = await sessionId();
    await rateLimit(`delegate:${id}`, 25);
    const p = z
      .object({
        delegation_id: z.string().min(1).max(200),
        revision: z.number().int().nonnegative(),
      })
      .parse(await body(req));
    const db = await database();
    const state = await readSession(db, id);
    if (!state.live_id || state.ended_at) throw new HttpError(409, 'No active voice session.');
    const claim = await db.query(
      'insert into delegation_jobs(session_id,id,revision) values($1,$2,$3) on conflict do nothing returning id',
      [id, p.delegation_id, p.revision],
    );
    if (!claim.rows.length) {
      const existing = await db.query<{ result: unknown }>(
        'select result from delegation_jobs where session_id=$1 and id=$2',
        [id, p.delegation_id],
      );
      if (existing.rows[0]?.result) return existing.rows[0].result;
      throw new HttpError(409, 'This request is still processing.');
    }
    const counter = await db.query<{ delegation_count: number }>(
      'update app_sessions set delegation_count=delegation_count+1 where id=$1 returning delegation_count',
      [id],
    );
    if (counter.rows[0].delegation_count > 40)
      throw new HttpError(429, 'Per-call backend request limit reached.');
    let result;
    try {
      result = await runAgent(db, id, p.revision);
    } catch {
      result = {
        status: 'error',
        is_demo_booking: true,
        message:
          'The backend could not complete that request. Do not assume a booking succeeded. Please retry or check the dashboard.',
      };
    }
    await db.query('update delegation_jobs set result=$3::jsonb where session_id=$1 and id=$2', [
      id,
      p.delegation_id,
      JSON.stringify(result),
    ]);
    await db.query(
      'update app_sessions set last_result=$3::jsonb where id=$1 and revision=$2 and ended_at is null',
      [id, p.revision, JSON.stringify(result)],
    );
    return result;
  });
}
