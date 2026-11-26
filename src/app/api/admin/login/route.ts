import { z } from 'zod';
import {
  body,
  checkOrigin,
  equal,
  HttpError,
  rateLimit,
  route,
  setCookie,
  sign,
} from '@/lib/server/security';
export async function POST(req: Request) {
  return route(async () => {
    checkOrigin(req);
    await rateLimit('admin-login', 5);
    const p = z.object({ password: z.string().max(200) }).parse(await body(req));
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)
      throw new HttpError(
        503,
        'Set ADMIN_PASSWORD to at least 12 characters in .env.local and restart.',
      );
    if (!equal(p.password, process.env.ADMIN_PASSWORD))
      throw new HttpError(401, 'Incorrect administrator password.');
    await setCookie(
      'ayesha-admin',
      `${Date.now() + 8 * 3600000}:${sign(process.env.ADMIN_PASSWORD).slice(0, 16)}`,
      8 * 3600,
    );
    return { ok: true };
  });
}
