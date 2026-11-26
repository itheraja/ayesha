/** Paid, opt-in semantic evaluation. Run with tsx --env-file=.env.local. Synthetic data only. */
import { randomUUID } from 'node:crypto';
import { memoryDB } from '../src/lib/server/db';
import { interpretApproval } from '../src/lib/server/voice-approval';
import type { Fragment, Proposal } from '../src/lib/types';
const db = await memoryDB(),
  id = randomUUID();
await db.query("insert into app_sessions(id,expires_at) values($1,now()+interval '1 hour')", [id]);
const proposal: Proposal = {
  id: randomUUID(),
  action: 'create_appointment',
  args: {},
  summary:
    'Demo cardiologist, Clifton, 23 October 2026 at 4 PM Pakistan time, for Synthetic Caller.',
  createdAt: Date.now(),
  revision: 1,
};
const samples: [string, boolean, string][] = [
  ['Confirm kar dein', true, 'approve'],
  ['Haan ji, confirm kar do', true, 'approve'],
  ['Ji book kar dein', true, 'approve'],
  ['Yes, confirm it', true, 'approve'],
  ['Go ahead and book it', true, 'approve'],
  ['Theek hai, kar dein', true, 'approve'],
  ['Haan, ye appointment pakki kar dein', true, 'approve'],
  ['Proceed with the appointment', true, 'approve'],
  ['Okay, done', true, 'approve'],
  ['جی ہاں، بک کر دیں', true, 'approve'],
  ['okay', false, 'not_approve'],
  ['Maybe, I need to check', true, 'not_approve'],
  ['No, do not book it', true, 'decline'],
  ['Yes but change it to 5 PM', true, 'revise'],
  ['Is it confirmed?', true, 'not_approve'],
  ['If my friend agrees then book it', true, 'not_approve'],
];
let failed = 0;
for (const [text, asked, expected] of samples) {
  const fragments: Fragment[] = [
    {
      id: 'a',
      role: 'assistant',
      delta: asked
        ? 'These are the demo appointment details. Shall I go ahead and confirm this booking?'
        : 'That was a funny joke. How was your day?',
      start_ms: 100,
      end_ms: 1000,
    },
    { id: 'u', role: 'user', delta: text, start_ms: 1500, end_ms: 2300 },
  ];
  const r = await interpretApproval(db, id, proposal, fragments);
  const approved =
    r.intent === 'approve' &&
    !r.material_change &&
    (r.explicit_authorization || r.follows_final_approval_question);
  const ok =
    expected === 'approve'
      ? approved
      : expected === 'not_approve'
        ? !approved
        : r.intent === expected;
  if (!ok) failed++;
  console.log(JSON.stringify({ synthetic_phrase: text, expected, actual: r.intent, passed: ok }));
}
console.log(JSON.stringify({ total: samples.length, failed }));
process.exitCode = failed ? 1 : 0;
