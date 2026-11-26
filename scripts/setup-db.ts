import { readFile } from 'node:fs/promises';
import { database } from '../src/lib/server/db';
import { seed } from '../src/lib/server/seed';
const db = await database();
if (process.env.DATABASE_MODE === 'supabase')
  await db.query(await readFile('supabase/schema.sql', 'utf8'));
await seed(db);
console.log('Schema and synthetic demo records are ready. No OpenAI API calls were made.');
process.exit(0);
