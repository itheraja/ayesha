import { z } from 'zod';
import { specialties, specialtySearchTerm } from '../specialties';
import type { DB } from './db';
import type { Appointment, Campus, Doctor, Slot } from '../types';
import { get_hospital_information } from '../knowledge';
export { get_hospital_information };
export function normalizePhone(input: string) {
  let p = input.replace(/[\s()\-]/g, '');
  if (p.startsWith('03')) p = '+92' + p.slice(1);
  if (p.startsWith('0092')) p = '+' + p.slice(2);
  if (/^92\d+$/.test(p)) p = '+' + p;
  if (!/^\+\d{10,15}$/.test(p)) throw Error('Use a valid synthetic international phone number.');
  return p;
}
const uuid = z.string().uuid();
export const createInput = z
  .object({
    slot_id: uuid,
    name: z.string().trim().min(2).max(100),
    contact_number: z.string().transform(normalizePhone),
  })
  .strict();
export const lookupInput = z
  .object({
    reference: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^AY-[A-F0-9]{12}$/),
    contact_number: z.string().transform(normalizePhone),
  })
  .strict();
export const rescheduleInput = lookupInput.extend({ slot_id: uuid });
export function validateMutation(action: string, args: unknown) {
  if (action === 'create_appointment') return createInput.parse(args);
  if (action === 'reschedule_appointment') return rescheduleInput.parse(args);
  if (action === 'cancel_appointment') return lookupInput.parse(args);
  throw Error('Unsupported appointment action');
}
export async function list_campuses(db: DB) {
  return (await db.query<Campus>('select * from campuses where active order by name')).rows;
}
export async function search_doctors(
  db: DB,
  params: { query?: string; campus_id?: string } = {},
  limit = 30,
) {
  params = { ...params, query: specialtySearchTerm(params.query ?? '') };
  return (
    await db.query<Doctor>(
      `select d.*,dep.name department,c.name campus from doctors d join departments dep on dep.id=d.department_id join campuses c on c.id=d.campus_id where d.active and c.active and ($1='' or (case when $3 then dep.name=$1 else d.name ilike '%'||$1||'%' or dep.name ilike '%'||$1||'%' end)) and ($2='' or c.id=$2) order by d.name limit $4`,
      [
        params.query ?? '',
        params.campus_id ?? '',
        specialties.some(([name]) => name === params.query),
        Math.max(1, Math.min(500, Math.trunc(limit))),
      ],
    )
  ).rows;
}
export async function check_availability(
  db: DB,
  params: { doctor_id?: string; date?: string; campus_id?: string } = {},
) {
  if (params.date && !/^\d{4}-\d{2}-\d{2}$/.test(params.date))
    throw Error('Use an exact YYYY-MM-DD date');
  return (
    await db.query<Slot>(
      `select s.*,d.name doctor,c.name campus,dep.name department from doctor_slots s join doctors d on d.id=s.doctor_id join campuses c on c.id=d.campus_id join departments dep on dep.id=d.department_id where s.status='available' and s.start_time>now() and d.active and c.active and not exists(select 1 from appointments a where a.slot_id=s.id and a.status='confirmed') and ($1='' or d.id=$1) and ($2='' or (s.start_time at time zone 'Asia/Karachi')::date::text=$2) and ($3='' or c.id=$3) order by s.start_time,d.name limit 18`,
      [params.doctor_id ?? '', params.date ?? '', params.campus_id ?? ''],
    )
  ).rows;
}
export const get_doctor_schedule = async (db: DB, doctor_id: string, date?: string) =>
  check_availability(db, { doctor_id, date });
export async function find_appointment(db: DB, args: unknown) {
  const p = lookupInput.parse(args);
  const r = await db.query<{ result: Appointment }>(
    `select appointment_detail(a.id) result from appointments a join patients p on p.id=a.patient_id where a.reference=$1 and p.contact_number=$2`,
    [p.reference, p.contact_number],
  );
  if (!r.rows[0]) throw Error('Booking not found or identity does not match');
  return r.rows[0].result;
}
export async function mutate(db: DB, action: string, args: unknown, key: string) {
  const valid = validateMutation(action, args);
  return (
    await db.query<{ result: Appointment }>('select mutate_appointment($1,$2::jsonb,$3) result', [
      action,
      JSON.stringify(valid),
      key,
    ])
  ).rows[0].result;
}
export const create_appointment = (db: DB, args: unknown, key: string) =>
  mutate(db, 'create_appointment', args, key);
export const cancel_appointment = (db: DB, args: unknown, key: string) =>
  mutate(db, 'cancel_appointment', args, key);
export const reschedule_appointment = (db: DB, args: unknown, key: string) =>
  mutate(db, 'reschedule_appointment', args, key);
