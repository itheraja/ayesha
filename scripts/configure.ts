import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
try {
  await access('.env.local');
  console.log('.env.local already exists; left unchanged.');
} catch {
  const template = await readFile('.env.example', 'utf8');
  await writeFile(
    '.env.local',
    template
      .replace('ADMIN_PASSWORD=\n', `ADMIN_PASSWORD=${randomBytes(18).toString('base64url')}\n`)
      .replace('SESSION_SECRET=\n', `SESSION_SECRET=${randomBytes(32).toString('hex')}\n`),
    { mode: 0o600 },
  );
  console.log(
    'Created .env.local with random admin credentials and session signing secret. Open that file to find the admin password and add your OpenAI API key. No paid API calls were made.',
  );
}
