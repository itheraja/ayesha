import { z } from 'zod';
import { watchSession } from '@/lib/server/watchdog';
import { admin } from '@/lib/server/security';
import { database } from '@/lib/server/db';
import { body, checkOrigin, HttpError, route, sessionId, rateLimit } from '@/lib/server/security';
import { settings } from '@/lib/server/config';
import { GREETING, VOICE_PROMPT } from '@/lib/prompts';
export const maxDuration = 60;
export async function POST(req: Request) {
  return route(async () => {
    checkOrigin(req);
    if (
      process.env.VERCEL ||
      !(process.env.APP_ORIGIN ?? 'http://localhost:3000').match(
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
      )
    )
      await admin();
    const id = await sessionId();
    await rateLimit('live-start', 8);
    if (!process.env.OPENAI_API_KEY)
      throw new HttpError(
        503,
        'Voice is not configured yet. Add OPENAI_API_KEY to .env.local and restart the app.',
      );
    const { sdp } = z
      .object({ sdp: z.string().min(10).max(64000).startsWith('v=0') })
      .parse(await body(req));
    const db = await database();
    const cfg = settings();
    await db.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock(18976234)');
      const usage = await tx.query<{ cost: string; count: string }>(
        `select coalesce(sum(greatest(voice_seconds,case when started_at is not null and ended_at is null then $2 else 0 end)*$1/60+backend_cost),0) cost,count(*) filter(where started_at is not null) count from app_sessions`,
        [cfg.voiceRate, cfg.maxSeconds],
      );
      if (
        Number(usage.rows[0].cost) + (cfg.maxSeconds / 60) * cfg.voiceRate > cfg.budget ||
        Number(usage.rows[0].count) >= cfg.maxSessions
      )
        throw new HttpError(
          429,
          'Local experiment allowance reached. Review API usage before changing limits.',
        );
      const claim = await tx.query(
        'update app_sessions set started_at=now(),voice_seconds=15 where id=$1 and started_at is null returning id',
        [id],
      );
      if (!claim.rows.length)
        throw new HttpError(
          409,
          'A session was already requested. Start a new call instead of retrying session creation.',
        );
    });
    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/live/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: {
            model: 'gpt-live-1',
            store: false,
            audio: {
              output: {
                voice: process.env.LIVE_CUSTOM_VOICE_ID
                  ? { id: process.env.LIVE_CUSTOM_VOICE_ID }
                  : process.env.LIVE_VOICE || 'gleam',
              },
            },
            instructions: VOICE_PROMPT,
            input: [
              {
                type: 'message',
                role: 'developer',
                content: [{ type: 'input_text', text: GREETING }],
              },
            ],
            delegation: { type: 'client' },
          },
          transport: { type: 'webrtc', sdp },
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      await db.query('update app_sessions set ended_at=now() where id=$1', [id]);
      throw new HttpError(
        502,
        'Voice connection timed out. Session creation was not retried; usage may include initialization.',
      );
    }
    if (!res.ok) {
      await db.query('update app_sessions set ended_at=now() where id=$1', [id]);
      throw new HttpError(
        502,
        `OpenAI rejected the GPT-Live session (${res.status}). Check model access, API billing and voice configuration.`,
      );
    }
    const data = await res.json();
    if (!data.transport?.sdp || !data.session?.id)
      throw new HttpError(502, 'OpenAI returned an incomplete session response.');
    const recorded = await db.query<{ ended_at: string | null }>(
      'update app_sessions set live_id=$2 where id=$1 returning ended_at',
      [id, data.session.id],
    );
    watchSession(id, data.session.id, recorded.rows[0]?.ended_at ? 1 : cfg.maxSeconds);
    return { sdp: data.transport.sdp, maxSeconds: cfg.maxSeconds, voiceRate: cfg.voiceRate };
  });
}
