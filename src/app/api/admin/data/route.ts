import { query, database } from '@/lib/server/db';
import { admin, route } from '@/lib/server/security';
import { list_campuses, search_doctors } from '@/lib/server/appointments';
import { settings } from '@/lib/server/config';
export async function GET(req: Request) {
  return route(async () => {
    await admin();
    const u = new URL(req.url);
    const filter = [
      u.searchParams.get('date') ?? '',
      u.searchParams.get('doctor') ?? '',
      u.searchParams.get('campus') ?? '',
    ];
    const db = await database();
    const [campuses, doctors, departments, slots, appointments, metrics] = await Promise.all([
      list_campuses(db),
      search_doctors(db, {}, 500),
      query('select * from departments order by name'),
      query(
        `select s.*,d.name doctor,c.name campus,exists(select 1 from appointments a where a.slot_id=s.id and a.status='confirmed') booked from doctor_slots s join doctors d on d.id=s.doctor_id join campuses c on c.id=d.campus_id where s.start_time>now() and ($1='' or (s.start_time at time zone 'Asia/Karachi')::date::text=$1) and ($2='' or d.id=$2) and ($3='' or c.id=$3) order by s.start_time,d.name limit 150`,
        filter,
      ),
      query(
        `select appointment_detail(a.id) detail from appointments a join doctors d on d.id=a.doctor_id join doctor_slots s on s.id=a.slot_id where ($1='' or (s.start_time at time zone 'Asia/Karachi')::date::text=$1) and ($2='' or d.id=$2) and ($3='' or d.campus_id=$3) order by a.created_at desc limit 200`,
        filter,
      ),
      query(
        `select count(*) filter(where started_at is not null) calls,coalesce(sum(voice_seconds),0) seconds,coalesce(sum(input_tokens),0) input_tokens,coalesce(sum(output_tokens),0) output_tokens,coalesce(sum(backend_cost),0) backend_cost,count(*) filter(where started_at is not null and not finalized) unconfirmed from app_sessions`,
      ),
    ]);
    return {
      campuses,
      doctors,
      departments: departments.rows,
      slots: slots.rows,
      appointments: appointments.rows.map((a) => a.detail),
      metrics: metrics.rows[0],
      settings: settings(),
      mode: process.env.DATABASE_MODE === 'supabase' ? 'Supabase PostgreSQL' : 'Local PostgreSQL',
    };
  });
}
