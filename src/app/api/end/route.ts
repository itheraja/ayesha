import { z } from 'zod';
import { closeWatchdog } from '@/lib/server/watchdog';
import { query } from '@/lib/server/db';
import { body, checkOrigin, route, sessionId } from '@/lib/server/security';
export async function POST(req: Request) {
  return route(async () => {
    checkOrigin(req);
    const id = await sessionId();
    const p = z
      .object({ seconds: z.number().min(0).max(86400), finalized: z.boolean() })
      .parse(await body(req));
    closeWatchdog(id);
    await query(
      "update app_sessions set ended_at=coalesce(ended_at,now()),voice_seconds=greatest(voice_seconds,$2),finalized=finalized or $3,pending=null,fragments='[]'::jsonb where id=$1",
      [id, p.seconds, p.finalized],
    );
    const r = await query(
      'select coalesce(last_appointment_result,last_result) last_result,voice_seconds,finalized from app_sessions where id=$1',
      [id],
    );
    return r.rows[0];
  });
}
