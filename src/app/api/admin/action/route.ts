import { z } from 'zod';
import { database } from '@/lib/server/db';
import { admin, body, checkOrigin, route, HttpError } from '@/lib/server/security';
import { mutate } from '@/lib/server/appointments';
import { seed } from '@/lib/server/seed';
export async function POST(req: Request) {
  return route(async () => {
    checkOrigin(req);
    await admin();
    const p = z
      .discriminatedUnion('action', [
        z.object({
          action: z.literal('create'),
          name: z.string().min(2).max(100),
          contact_number: z.string(),
          slot_id: z.string().uuid(),
          idempotency_key: z.string().uuid(),
        }),
        z.object({ action: z.literal('reset'), confirmation: z.literal('RESET DEMO DATA') }),
        z.object({
          action: z.enum(['cancel', 'reschedule']),
          reference: z.string(),
          slot_id: z.string().uuid().optional(),
          idempotency_key: z.string().uuid(),
        }),
        z.object({
          action: z.literal('add_slot'),
          doctor_id: z.string().max(100),
          start_time: z.string().datetime({ offset: true }),
          end_time: z.string().datetime({ offset: true }),
        }),
        z.object({
          action: z.literal('edit_slot'),
          slot_id: z.string().uuid(),
          start_time: z.string().datetime({ offset: true }),
          end_time: z.string().datetime({ offset: true }),
        }),
        z.object({
          action: z.literal('set_slot'),
          slot_id: z.string().uuid(),
          status: z.enum(['available', 'blocked']),
        }),
      ])
      .parse(await body(req));
    const db = await database();
    try {
      if (p.action === 'create')
        return {
          ok: true,
          appointment: await mutate(
            db,
            'create_appointment',
            { name: p.name, contact_number: p.contact_number, slot_id: p.slot_id },
            `admin:${p.idempotency_key}`,
          ),
        };
      if (p.action === 'reset') {
        const active = await db.query(
          "select id from app_sessions where started_at>now()-interval '20 minutes' and ended_at is null",
        );
        if (active.rows.length) throw Error('End active calls before resetting.');
        await seed(db, true);
        await db.query(
          'update app_sessions set pending=null,last_result=null,last_appointment_result=null',
        );
        return { ok: true, message: 'Synthetic booking data reset. Usage records preserved.' };
      }
      if (p.action === 'add_slot') {
        if (new Date(p.start_time) <= new Date() || new Date(p.end_time) <= new Date(p.start_time))
          throw Error('Use a future start time and a later end time.');
        await db.query('insert into doctor_slots(doctor_id,start_time,end_time) values($1,$2,$3)', [
          p.doctor_id,
          p.start_time,
          p.end_time,
        ]);
        return { ok: true };
      }
      if (p.action === 'edit_slot') {
        if (new Date(p.start_time) <= new Date() || new Date(p.end_time) <= new Date(p.start_time))
          throw Error('Use a future start and a later end.');
        await db.transaction(async (tx) => {
          const slot = await tx.query('select id from doctor_slots where id=$1 for update', [
            p.slot_id,
          ]);
          if (!slot.rows.length) throw Error('Slot not found.');
          if (
            (await tx.query('select id from appointments where slot_id=$1', [p.slot_id])).rows
              .length
          )
            throw Error('Cannot edit a slot with booking history. Add a new slot instead.');
          await tx.query('update doctor_slots set start_time=$2,end_time=$3 where id=$1', [
            p.slot_id,
            p.start_time,
            p.end_time,
          ]);
        });
        return { ok: true };
      }
      if (p.action === 'set_slot') {
        const r = await db.query(
          "update doctor_slots set status=$2 where id=$1 and not exists(select 1 from appointments where slot_id=$1 and status='confirmed') returning id",
          [p.slot_id, p.status],
        );
        if (!r.rows.length) throw Error('Cannot modify a booked or missing slot.');
        return { ok: true };
      }
      const record = await db.query<{ contact_number: string }>(
        'select p.contact_number from appointments a join patients p on p.id=a.patient_id where a.reference=$1',
        [p.reference],
      );
      if (!record.rows[0]) throw Error('Booking not found.');
      const args = {
        reference: p.reference,
        contact_number: record.rows[0].contact_number,
        ...(p.action === 'reschedule' ? { slot_id: p.slot_id } : {}),
      };
      return {
        ok: true,
        appointment: await mutate(
          db,
          p.action === 'cancel' ? 'cancel_appointment' : 'reschedule_appointment',
          args,
          `admin:${p.idempotency_key}`,
        ),
      };
    } catch (e) {
      throw new HttpError(409, e instanceof Error ? e.message : 'Database action failed.');
    }
  });
}
