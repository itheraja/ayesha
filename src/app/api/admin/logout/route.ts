import { cookies } from 'next/headers';
import { checkOrigin, route } from '@/lib/server/security';
export async function POST(req: Request) {
  return route(async () => {
    checkOrigin(req);
    (await cookies()).delete('ayesha-admin');
    return { ok: true };
  });
}
