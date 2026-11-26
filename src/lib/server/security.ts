import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { query } from './db';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const g = globalThis as unknown as { localSessionSecret?: string };
function secret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32)
    return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL)
    throw new HttpError(503, 'Configure SESSION_SECRET (at least 32 characters).');
  return (g.localSessionSecret ??= randomBytes(32).toString('hex'));
}
export function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('hex');
}
export function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export async function setCookie(name: string, value: string, maxAge: number) {
  (await cookies()).set(name, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: (process.env.APP_ORIGIN ?? '').startsWith('https:'),
    path: '/',
    maxAge,
  });
}
export async function readCookie(name: string) {
  const raw = (await cookies()).get(name)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf('.');
  const value = raw.slice(0, i);
  return equal(sign(value), raw.slice(i + 1)) ? value : null;
}
export function checkOrigin(req: Request) {
  const origin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  if (req.headers.get('origin') !== origin) throw new HttpError(403, 'Unexpected request origin.');
}
export async function body(req: Request, max = 100000) {
  if (Number(req.headers.get('content-length') ?? 0) > max)
    throw new HttpError(413, 'Request too large.');
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'JSON body required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, 'Request too large.');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
export async function sessionId() {
  const id = await readCookie('ayesha-session');
  if (!id) throw new HttpError(401, 'Start a new session.');
  const r = await query('select id from app_sessions where id=$1 and expires_at>now()', [id]);
  if (!r.rows.length) throw new HttpError(401, 'Session expired.');
  return id;
}
export async function admin() {
  const token = await readCookie('ayesha-admin');
  if (!token) throw new HttpError(401, 'Administrator sign-in required.');
  const [expires, tag] = token.split(':');
  if (
    Number(expires) < Date.now() ||
    !process.env.ADMIN_PASSWORD ||
    tag !== sign(process.env.ADMIN_PASSWORD).slice(0, 16)
  )
    throw new HttpError(401, 'Administrator session expired.');
}
export async function rateLimit(bucket: string, limit = 30, seconds = 60) {
  const r = await query<{ count: number }>(
    `insert into rate_limits(bucket,count) values($1,1) on conflict(bucket) do update set count=case when rate_limits.window_start < now()-$2*interval '1 second' then 1 else rate_limits.count+1 end,window_start=case when rate_limits.window_start < now()-$2*interval '1 second' then now() else rate_limits.window_start end returning count`,
    [bucket, seconds],
  );
  if (r.rows[0].count > limit) throw new HttpError(429, 'Too many requests. Please wait a minute.');
}
export async function route(fn: () => Promise<unknown>) {
  try {
    return Response.json(await fn(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    const name = e instanceof Error ? e.name : '';
    if (name === 'ZodError')
      return Response.json({ error: 'Invalid or missing fields.' }, { status: 400 });
    return Response.json(
      {
        error:
          'The operation could not be completed. No success is confirmed. Please retry or check the administrator dashboard.',
      },
      { status: 500 },
    );
  }
}
