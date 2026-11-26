import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { memoryDB, type DB } from '../src/lib/server/db';
import { seed } from '../src/lib/server/seed';
import { check_availability } from '../src/lib/server/appointments';
import {
  propose,
  saveContext,
  resolveVoiceApproval,
  reconcileBooking,
  readSession,
} from '../src/lib/server/workflow';
import type { ApprovalDecision, ApprovalInterpreter } from '../src/lib/server/voice-approval';
import type { Fragment, Proposal } from '../src/lib/types';
let db: DB;
const decision =
  (
    intent: ApprovalDecision['intent'],
    explicit = false,
    asked = false,
    changed = false,
  ): ApprovalInterpreter =>
  async () => ({
    intent,
    explicit_authorization: explicit,
    follows_final_approval_question: asked,
    material_change: changed,
  });
const fragment = (role: Fragment['role'], delta: string, start_ms: number): Fragment => ({
  id: randomUUID(),
  role,
  delta,
  start_ms,
  end_ms: start_ms + 400,
});
beforeAll(async () => {
  db = await memoryDB();
  await seed(db);
});
async function pending(reply = 'Confirm kar dein', ask = true) {
  const id = randomUUID();
  await db.query(
    "insert into app_sessions(id,expires_at,live_id) values($1,now()+interval '1 hour','test-live')",
    [id],
  );
  const slot = (await check_availability(db))[0];
  const original = fragment('user', 'A demo appointment please', 0);
  await saveContext(db, id, 1, [original]);
  const result = await propose(db, id, 1, 'create_appointment', {
    slot_id: slot.id,
    name: 'Synthetic Voice Caller',
    contact_number: '+920000000077',
  });
  const fragments = [
    original,
    ...(ask
      ? [
          fragment(
            'assistant',
            `${result.proposal!.summary} Shall I go ahead and book this demo appointment?`,
            1000,
          ),
        ]
      : []),
    fragment('user', reply, 2500),
  ];
  await saveContext(db, id, 2, fragments);
  return { id, p: result.proposal!, fragments };
}
async function records(p: Proposal) {
  return (await db.query('select id from appointments where slot_id=$1', [p.args.slot_id])).rows;
}
describe('Voice approval to actual PostgreSQL (language interpreter injected)', () => {
  for (const phrase of [
    'Confirm kar dein',
    'Yes, book it',
    'Haan ji, ye appointment confirm kar dein',
    'جی بک کر دیں',
  ]) {
    it(`commits with spoken ${phrase} and no GUI`, async () => {
      const { id, p } = await pending(phrase);
      const r = await resolveVoiceApproval(db, id, p.id, 2, decision('approve', true));
      expect(r.booking_state).toBe('BOOKING_CONFIRMED');
      expect(await records(p)).toHaveLength(1);
      expect((await reconcileBooking(db, id, p.id)).appointment?.id).toBe(r.appointment?.id);
    });
  }
  it('accepts short okay only with an actual final approval question', async () => {
    const { id, p } = await pending('okay');
    expect(
      (await resolveVoiceApproval(db, id, p.id, 2, decision('approve', false, true))).status,
    ).toBe('success');
    const other = await pending('okay', false);
    expect(
      (await resolveVoiceApproval(db, other.id, other.p.id, 2, decision('approve', false, false)))
        .status,
    ).toBe('needs_confirmation');
    expect(await records(other.p)).toHaveLength(0);
  });
  it('does not mutate on decline or ambiguity', async () => {
    for (const intent of ['decline', 'clarify'] as const) {
      const { id, p } = await pending('No, wait');
      const r = await resolveVoiceApproval(db, id, p.id, 2, decision(intent));
      expect(r.status).toBe(intent === 'decline' ? 'cancelled' : 'needs_confirmation');
      expect(await records(p)).toHaveLength(0);
    }
  });
  it('material changes invalidate the proposal even alongside approval', async () => {
    const { id, p } = await pending('Yes, but make it tomorrow');
    expect(
      (await resolveVoiceApproval(db, id, p.id, 2, decision('approve', true, true, true)))
        .booking_state,
    ).toBe('COLLECTING_DETAILS');
    expect((await readSession(db, id)).pending).toBeNull();
    expect(await records(p)).toHaveLength(0);
  });
  it('rejects a correction arriving during language interpretation', async () => {
    const { id, p, fragments } = await pending();
    const r = await resolveVoiceApproval(db, id, p.id, 2, async () => {
      await saveContext(db, id, 3, [
        ...fragments,
        fragment('user', 'Actually Friday instead', 3500),
      ]);
      return {
        intent: 'approve',
        explicit_authorization: true,
        follows_final_approval_question: true,
        material_change: false,
      };
    });
    expect(r.status).toBe('stale');
    expect(await records(p)).toHaveLength(0);
  });
  it('duplicate confirmations and lost replies resolve the same operation', async () => {
    const { id, p } = await pending();
    const results = await Promise.all([
      resolveVoiceApproval(db, id, p.id, 2, decision('approve', true)),
      resolveVoiceApproval(db, id, p.id, 2, decision('approve', true)),
    ]);
    expect(results.some((r) => r.status === 'success')).toBe(true);
    const recovered = await reconcileBooking(db, id, p.id);
    expect(recovered.status).toBe('success');
    expect(await records(p)).toHaveLength(1);
    const repeated = await resolveVoiceApproval(db, id, p.id, 2, decision('approve', true));
    expect(repeated.appointment?.id).toBe(recovered.appointment?.id);
  });
  it('a definite unavailable-slot failure is terminal', async () => {
    const { id, p } = await pending();
    await db.query("update doctor_slots set status='blocked' where id=$1", [p.args.slot_id]);
    const r = await resolveVoiceApproval(db, id, p.id, 2, decision('approve', true));
    expect(r.booking_state).toBe('BOOKING_FAILED');
    expect((await reconcileBooking(db, id, p.id)).status).toBe('error');
  });
  it('an interrupted attempt remains unknown and is never automatically retried', async () => {
    const { id, p } = await pending();
    await db.query(
      "insert into booking_attempts(session_id,proposal_id,proposal,revision,state) values($1,$2,$3::jsonb,2,'BOOKING_IN_PROGRESS')",
      [id, p.id, JSON.stringify(p)],
    );
    const r = await resolveVoiceApproval(db, id, p.id, 2, async () => {
      throw Error('must not run');
    });
    expect(r.status).toBe('unknown');
    expect(await records(p)).toHaveLength(0);
  });
  it('classifier errors retain the proposal without booking', async () => {
    const { id, p } = await pending();
    expect(
      (
        await resolveVoiceApproval(db, id, p.id, 2, async () => {
          throw Error('timeout');
        })
      ).status,
    ).toBe('needs_confirmation');
    expect(await records(p)).toHaveLength(0);
  });
});
