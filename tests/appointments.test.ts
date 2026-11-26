import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { memoryDB, type DB } from '../src/lib/server/db';
import { seed } from '../src/lib/server/seed';
import { specialties } from '../src/lib/specialties';
import {
  create_appointment,
  cancel_appointment,
  reschedule_appointment,
  find_appointment,
  check_availability,
  list_campuses,
  search_doctors,
  normalizePhone,
} from '../src/lib/server/appointments';
import {
  confirm,
  propose,
  saveContext,
  readSession,
  voiceConfirmation,
  latestUserUtterance,
} from '../src/lib/server/workflow';
import { knowledge, get_hospital_information } from '../src/lib/knowledge';
import type { Fragment, Slot } from '../src/lib/types';
let db: DB;
let slots: Slot[];
const patient = { name: 'Synthetic Test Caller', contact_number: '+920000000099' };
beforeAll(async () => {
  db = await memoryDB();
  await seed(db);
  slots = await check_availability(db, { doctor_id: 'demo-doctor-1' });
});
const fragment = (delta: string, start_ms = 1000): Fragment => ({
  id: randomUUID(),
  role: 'user',
  delta,
  start_ms,
  end_ms: start_ms + 500,
});
async function session() {
  const id = randomUUID();
  await db.query("insert into app_sessions(id,expires_at) values($1,now()+interval '1 hour')", [
    id,
  ]);
  return id;
}
describe('Actual PostgreSQL booking transactions', () => {
  it('seeds 4 campuses and three fictional doctors per specialty', async () => {
    expect(await list_campuses(db)).toHaveLength(4);
    const ds = await search_doctors(db);
    expect(ds).toHaveLength(30); // Broad search stays bounded for model context.
    const all = await db.query<{ count: number }>('select count(*)::int count from doctors');
    expect(all.rows[0].count).toBe(specialties.length * 3);
    expect(ds.every((d) => d.is_demo_record)).toBe(true);
  });
  it('every specialty has three searchable doctors with future appointment slots', async () => {
    for (const [name] of specialties) {
      const doctors = await search_doctors(db, { query: name });
      expect(doctors, name).toHaveLength(3);
      expect(doctors.every((d) => d.department === name && d.name.includes('(Demo)'))).toBe(true);
      for (const doctor of doctors)
        expect(
          (await check_availability(db, { doctor_id: doctor.id })).length,
          doctor.name,
        ).toBeGreaterThan(0);
    }
  });
  it('finds ENT and common bilingual specialist requests without confusing subspecialties', async () => {
    for (const query of [
      'ENT',
      'ENT specialist',
      'ear, nose and throat doctor',
      'I need an ENT specialist',
      'kaan naak gala',
      'ناک کان گلا',
    ]) {
      const doctors = await search_doctors(db, { query });
      expect(doctors, query).toHaveLength(3);
      expect(doctors.every((d) => d.department === 'ENT (Ear, Nose & Throat)')).toBe(true);
    }
    expect(
      (await search_doctors(db, { query: 'pediatric cardiologist' })).every(
        (d) => d.department === 'Paediatric Cardiology',
      ),
    ).toBe(true);
    expect(
      (await search_doctors(db, { query: 'dentist' })).every((d) => d.department === 'Dentistry'),
    ).toBe(true);
    expect(await search_doctors(db, { query: 'ENT', campus_id: 'clifton' })).toHaveLength(1);
    expect(await search_doctors(db, { query: 'Maha Noor' })).toHaveLength(1);
    expect(await search_doctors(db, { query: 'not-a-specialty' })).toHaveLength(0);
  });
  it('repeated seeding preserves original doctors and does not duplicate the directory or slots', async () => {
    const before = await db.query('select * from doctors order by id');
    const slotsBefore = await db.query('select count(*)::int count from doctor_slots');
    await seed(db);
    expect((await db.query('select * from doctors order by id')).rows).toEqual(before.rows);
    expect((await db.query('select count(*)::int count from doctor_slots')).rows).toEqual(
      slotsBefore.rows,
    );
    expect((await search_doctors(db, { query: 'Maha Noor' }))[0]).toMatchObject({
      id: 'demo-doctor-1',
      department: 'Dermatology',
      campus: 'Clifton',
    });
  });
  it('creates a booking and removes the reserved slot from availability', async () => {
    const a = await create_appointment(db, { ...patient, slot_id: slots[0].id }, 'create-basic');
    expect(a.reference).toMatch(/^AY-[A-F0-9]{12}$/);
    expect(a.status).toBe('confirmed');
    expect(
      (await check_availability(db, { doctor_id: slots[0].doctor_id })).some(
        (s) => s.id === slots[0].id,
      ),
    ).toBe(false);
  });
  it('returns the same booking for an idempotent retry', async () => {
    const args = { ...patient, slot_id: slots[1].id };
    const a = await create_appointment(db, args, 'create-retry');
    const b = await create_appointment(db, args, 'create-retry');
    expect(a.id).toBe(b.id);
    expect(
      (await db.query('select id from appointments where slot_id=$1', [slots[1].id])).rows,
    ).toHaveLength(1);
  });
  it('rejects reuse of an idempotency key for a different request', async () => {
    await expect(
      create_appointment(db, { ...patient, slot_id: slots[2].id }, 'create-retry'),
    ).rejects.toThrow('different input');
  });
  it('allows only one of two competing requests for the same slot', async () => {
    const args = { ...patient, slot_id: slots[2].id };
    const r = await Promise.allSettled([
      create_appointment(db, args, 'race-one-123'),
      create_appointment(db, args, 'race-two-123'),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await db.query("select id from appointments where slot_id=$1 and status='confirmed'", [
          slots[2].id,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it('requires a matching reference and contact for lookup and cancellation', async () => {
    const a = await create_appointment(db, { ...patient, slot_id: slots[3].id }, 'identity-test');
    await expect(
      find_appointment(db, { reference: a.reference, contact_number: '+920000000098' }),
    ).rejects.toThrow('identity');
    await expect(
      cancel_appointment(
        db,
        { reference: a.reference, contact_number: '+920000000098' },
        'wrong-identity',
      ),
    ).rejects.toThrow('identity');
    expect(
      (
        await find_appointment(db, {
          reference: a.reference,
          contact_number: patient.contact_number,
        })
      ).status,
    ).toBe('confirmed');
  });
  it('cancels and releases a slot, with safe cancellation retries', async () => {
    const a = await create_appointment(db, { ...patient, slot_id: slots[4].id }, 'cancel-create');
    const args = { reference: a.reference, contact_number: patient.contact_number };
    const c = await cancel_appointment(db, args, 'cancel-retry');
    expect(c.status).toBe('cancelled');
    expect((await cancel_appointment(db, args, 'cancel-retry')).id).toBe(a.id);
    expect(
      (await check_availability(db, { doctor_id: slots[4].doctor_id })).some(
        (s) => s.id === slots[4].id,
      ),
    ).toBe(true);
  });
  it('reschedules atomically and frees the old slot', async () => {
    const a = await create_appointment(
      db,
      { ...patient, slot_id: slots[5].id },
      'reschedule-create',
    );
    const b = await reschedule_appointment(
      db,
      { reference: a.reference, contact_number: patient.contact_number, slot_id: slots[6].id },
      'reschedule-commit',
    );
    expect(b.id).toBe(a.id);
    expect(b.slot_id).toBe(slots[6].id);
    expect(
      (await check_availability(db, { doctor_id: slots[5].doctor_id })).some(
        (s) => s.id === slots[5].id,
      ),
    ).toBe(true);
  });
  it('failed rescheduling leaves the original booking intact', async () => {
    const a = await create_appointment(db, { ...patient, slot_id: slots[7].id }, 'rollback-create');
    await expect(
      reschedule_appointment(
        db,
        { reference: a.reference, contact_number: patient.contact_number, slot_id: slots[0].id },
        'rollback-change',
      ),
    ).rejects.toThrow('already booked');
    expect(
      (
        await find_appointment(db, {
          reference: a.reference,
          contact_number: patient.contact_number,
        })
      ).slot_id,
    ).toBe(slots[7].id);
  });
  it('rejects blocked slots and invalid patient input', async () => {
    await db.query("update doctor_slots set status='blocked' where id=$1", [slots[8].id]);
    await expect(
      create_appointment(db, { ...patient, slot_id: slots[8].id }, 'blocked-create'),
    ).rejects.toThrow('not available');
    await expect(
      create_appointment(db, { ...patient, name: '', slot_id: slots[9].id }, 'invalid-create'),
    ).rejects.toThrow();
  });
  it('rejects past slots and reports fully blocked schedules as empty', async () => {
    const s = (
      await db.query<{ id: string }>(
        "insert into doctor_slots(doctor_id,start_time,end_time) values('demo-doctor-12',now()-interval '1 day',now()-interval '23 hours') returning id",
      )
    ).rows[0];
    await expect(
      create_appointment(db, { ...patient, slot_id: s.id }, 'past-slot-create'),
    ).rejects.toThrow('not available');
    await db.query("update doctor_slots set status='blocked' where doctor_id='demo-doctor-12'");
    expect(await check_availability(db, { doctor_id: 'demo-doctor-12' })).toEqual([]);
  });
  it('rejects overlapping schedule entries', async () => {
    await expect(
      db.query(
        "insert into doctor_slots(doctor_id,start_time,end_time) select doctor_id,start_time+interval '5 minutes',end_time+interval '5 minutes' from doctor_slots where id=$1",
        [slots[0].id],
      ),
    ).rejects.toThrow('overlaps');
  });
  it('normalizes Pakistani telephone formats', () => {
    expect(normalizePhone('0300 1234567')).toBe('+923001234567');
    expect(normalizePhone('0092 300 1234567')).toBe('+923001234567');
    expect(() => normalizePhone('CNIC')).toThrow();
  });
});
describe('Confirmation and correction boundaries', () => {
  it('a proposal does not commit a booking', async () => {
    const id = await session();
    const p = await propose(db, id, 0, 'create_appointment', { ...patient, slot_id: slots[9].id });
    expect(p.status).toBe('needs_confirmation');
    expect(
      (await db.query('select id from appointments where slot_id=$1', [slots[9].id])).rows,
    ).toHaveLength(0);
    const r = await confirm(db, id, p.proposal!.id, 0);
    expect(r.status).toBe('success');
    const retry = await confirm(db, id, p.proposal!.id, 0);
    expect(retry.appointment!.reference).toBe(r.appointment!.reference);
    await db.query(
      'update app_sessions set last_result=\'{"status":"needs_information"}\'::jsonb where id=$1',
      [id],
    );
    expect((await readSession(db, id)).last_appointment_result?.appointment?.reference).toBe(
      r.appointment!.reference,
    );
  });
  it('rejects stale UI confirmation after a spoken correction', async () => {
    const id = await session();
    const p = await propose(db, id, 0, 'create_appointment', { ...patient, slot_id: slots[10].id });
    await saveContext(db, id, 1, [fragment('Nahi Friday nahi, Saturday')]);
    await expect(confirm(db, id, p.proposal!.id, 1)).rejects.toThrow('conversation changed');
  });
  it('commits only the exact operation-specific voice confirmation', async () => {
    const id = await session();
    const p = await propose(db, id, 0, 'create_appointment', { ...patient, slot_id: slots[11].id });
    await saveContext(db, id, 1, [fragment('confirm booking')]);
    const r = await confirm(db, id, p.proposal!.id, 1, true);
    expect(r.status).toBe('success');
  });
  it('rejects an ordinary yes or a partial phrase as authority to commit', async () => {
    expect(voiceConfirmation('yes', 'create_appointment')).toBe(false);
    expect(voiceConfirmation('confirm', 'create_appointment')).toBe(false);
    expect(voiceConfirmation('confirm booking no wait', 'create_appointment')).toBe(false);
    expect(voiceConfirmation('confirm cancellation', 'create_appointment')).toBe(false);
    expect(voiceConfirmation('بکنگ کنفرم کریں', 'create_appointment')).toBe(true);
  });
  it('rejects a proposal that lost its revision race', async () => {
    const id = await session();
    await saveContext(db, id, 2, [fragment('Actually change campus')]);
    const p = await propose(db, id, 1, 'create_appointment', { ...patient, slot_id: slots[12].id });
    expect(p.status).toBe('stale');
    expect((await readSession(db, id)).pending).toBeNull();
  });
  it('rejects expired proposals and ended calls', async () => {
    const id = await session();
    const p = await propose(db, id, 0, 'create_appointment', { ...patient, slot_id: slots[13].id });
    await db.query(
      "update app_sessions set pending=jsonb_set(pending,'{createdAt}',to_jsonb(0)) where id=$1",
      [id],
    );
    await expect(confirm(db, id, p.proposal!.id, 0)).rejects.toThrow('expired');
    await db.query('update app_sessions set ended_at=now() where id=$1', [id]);
    await expect(confirm(db, id, p.proposal!.id, 0)).rejects.toThrow('ended');
  });
  it('preserves literal mixed-language transcript fragments', () => {
    const fs = [
      fragment('Mujhe ', 100),
      fragment('Friday کو ', 610),
      fragment('appointment chahiye', 1120),
    ];
    expect(latestUserUtterance(fs)).toBe('Mujhe Friday کو appointment chahiye');
  });
  it('older context cannot overwrite a newer correction', async () => {
    const id = await session();
    await saveContext(db, id, 2, [fragment('Friday')]);
    await saveContext(db, id, 1, [fragment('Thursday')]);
    expect((await readSession(db, id)).fragments[0].delta).toBe('Friday');
  });
});
describe('Knowledge boundaries', () => {
  it('every hospital fact includes a first-party source and verification date', () => {
    expect(
      knowledge.every(
        (f) =>
          f.source_url.startsWith('https://www.ziauddinhospital.com/') &&
          f.verified_at === '2026-10-21',
      ),
    ).toBe(true);
  });
  it('does not fabricate real fees or blanket doctor availability', () => {
    expect(get_hospital_information('fees').unverified).toContain('not verified');
    expect(get_hospital_information('hours').unverified).toContain('not doctor schedules');
  });
  it('denies public function execution and enables row security', async () => {
    const r = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname='patients'",
    );
    expect(r.rows[0].relrowsecurity).toBe(true);
    const permissions = await db.query<{ proacl: string[] }>(
      "select proacl from pg_proc where proname='mutate_appointment'",
    );
    expect(permissions.rows[0].proacl.some((x) => x.startsWith('=X/'))).toBe(false);
  });
});
