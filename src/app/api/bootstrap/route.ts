import { randomUUID } from 'node:crypto';
import { query } from '@/lib/server/db';
import { body, checkOrigin, rateLimit, route, setCookie } from '@/lib/server/security';
import { settings } from '@/lib/server/config';
export const runtime = 'nodejs';
export async function GET() {
  return route(async () => ({
    configured: !!process.env.OPENAI_API_KEY,
    database:
      process.env.DATABASE_MODE === 'supabase' ? 'Supabase PostgreSQL' : 'Local PostgreSQL demo',
    ...settings(),
  }));
}
export async function POST(req: Request) {
  return route(async () => {
    checkOrigin(req);
    await body(req);
    await rateLimit('bootstrap', 40);
    await query(
      "update app_sessions set fragments='[]'::jsonb,pending=null where expires_at<now() and (fragments<>'[]'::jsonb or pending is not null)",
    );
    const id = randomUUID();
    await query("insert into app_sessions(id,expires_at) values($1,now()+interval '2 hours')", [
      id,
    ]);
    await setCookie('ayesha-session', id, 7200);
    return { ready: true };
  });
}
