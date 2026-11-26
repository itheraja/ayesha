-- Synthetic academic demo. Run with a dedicated database owner.
create table if not exists campuses (id text primary key, name text not null, address text not null, official_contact text not null, active boolean not null default true);
create table if not exists departments (id text primary key, name text not null unique, description text not null);
create table if not exists doctors (id text primary key, name text not null, department_id text not null references departments, campus_id text not null references campuses, consultation_fee integer not null check (consultation_fee>=0), active boolean not null default true, is_demo_record boolean not null default true check(is_demo_record));
create table if not exists doctor_slots (id uuid primary key default gen_random_uuid(), doctor_id text not null references doctors, start_time timestamptz not null, end_time timestamptz not null, status text not null default 'available' check(status in ('available','blocked')), check(end_time>start_time), unique(doctor_id,start_time));
create table if not exists patients (id uuid primary key default gen_random_uuid(), name text not null, contact_number text not null, created_at timestamptz not null default now());
create table if not exists appointments (id uuid primary key default gen_random_uuid(), reference text not null unique default ('AY-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))), patient_id uuid not null references patients, doctor_id text not null references doctors, slot_id uuid not null references doctor_slots, status text not null default 'confirmed' check(status in ('confirmed','cancelled')), is_demo_record boolean not null default true check(is_demo_record), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index if not exists one_active_booking_per_slot on appointments(slot_id) where status='confirmed';
create index if not exists slots_time on doctor_slots(start_time,doctor_id);
create table if not exists appointment_operations (idempotency_key text primary key, fingerprint jsonb not null, result jsonb not null, created_at timestamptz not null default now());
create table if not exists appointment_audit_events (id uuid primary key default gen_random_uuid(), appointment_id uuid references appointments, action text not null, created_at timestamptz not null default now());
create table if not exists app_sessions (id uuid primary key, created_at timestamptz not null default now(), expires_at timestamptz not null, revision integer not null default 0, fragments jsonb not null default '[]', pending jsonb, last_result jsonb, live_id text, started_at timestamptz, ended_at timestamptz, voice_seconds numeric not null default 0, finalized boolean not null default false, input_tokens bigint not null default 0, output_tokens bigint not null default 0, backend_cost numeric not null default 0, delegation_count integer not null default 0);
alter table app_sessions add column if not exists last_appointment_result jsonb;
create table if not exists delegation_jobs (session_id uuid references app_sessions on delete cascade, id text not null, revision integer not null, result jsonb, primary key(session_id,id));
create table if not exists rate_limits (bucket text primary key, window_start timestamptz not null default now(), count integer not null default 0);
create table if not exists hospital_knowledge_sources (id text primary key, topic text not null, content text not null, source_url text not null, verified_at date not null, campus text);

create or replace function appointment_detail(p_id uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('id',a.id,'reference',a.reference,'patient_name',p.name,'doctor',d.name,'campus',c.name,'start_time',s.start_time,'status',a.status,'slot_id',a.slot_id,'is_demo_record',true)
 from appointments a join patients p on p.id=a.patient_id join doctors d on d.id=a.doctor_id join campuses c on c.id=d.campus_id join doctor_slots s on s.id=a.slot_id where a.id=p_id
$$;

create or replace function mutate_appointment(p_action text,p_args jsonb,p_key text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare old_op appointment_operations%rowtype; a appointments%rowtype; s doctor_slots%rowtype; patient uuid; result jsonb; fingerprint jsonb;
begin
 if p_key is null or length(p_key)<8 then raise exception 'Invalid idempotency key'; end if;
 fingerprint=jsonb_build_object('action',p_action,'args',p_args);
 -- A per-key transaction lock makes retries serialize before any patient is inserted.
 perform pg_advisory_xact_lock(hashtextextended(p_key,0));
 select * into old_op from appointment_operations where idempotency_key=p_key;
 if found then
   if old_op.fingerprint<>fingerprint then raise exception 'Idempotency key reused with different input'; end if;
   return old_op.result;
 end if;
 if p_action not in ('create_appointment','cancel_appointment','reschedule_appointment') then raise exception 'Unsupported operation'; end if;
 if p_action<>'create_appointment' then
  select ap.* into a from appointments ap join patients p on p.id=ap.patient_id where ap.reference=upper(p_args->>'reference') and p.contact_number=p_args->>'contact_number' for update of ap;
  if not found then raise exception 'Booking not found or identity does not match'; end if;
  if a.status<>'confirmed' then raise exception 'Booking is already cancelled'; end if;
 end if;
 if p_action in ('create_appointment','reschedule_appointment') then
  select * into s from doctor_slots where id=(p_args->>'slot_id')::uuid for update;
  if not found then raise exception 'Slot not found'; end if;
  if s.status<>'available' or s.start_time<=now() then raise exception 'Slot is not available'; end if;
  if not exists(select 1 from doctors d join campuses c on c.id=d.campus_id where d.id=s.doctor_id and d.active and c.active) then raise exception 'Doctor unavailable'; end if;
  if exists(select 1 from appointments where slot_id=s.id and status='confirmed' and (a.id is null or id<>a.id)) then raise exception 'Slot already booked'; end if;
 end if;
 if p_action='create_appointment' then
  if length(trim(coalesce(p_args->>'name','')))<2 or coalesce(p_args->>'contact_number','') !~ '^\+[0-9]{10,15}$' then raise exception 'Invalid patient details'; end if;
  insert into patients(name,contact_number) values(trim(p_args->>'name'),p_args->>'contact_number') returning id into patient;
  insert into appointments(patient_id,doctor_id,slot_id) values(patient,s.doctor_id,s.id) returning * into a;
 elsif p_action='cancel_appointment' then
  update appointments set status='cancelled',updated_at=now() where id=a.id returning * into a;
 else
  update appointments set slot_id=s.id,doctor_id=s.doctor_id,updated_at=now() where id=a.id returning * into a;
 end if;
 result=appointment_detail(a.id);
 insert into appointment_operations values(p_key,fingerprint,result,now());
 insert into appointment_audit_events(appointment_id,action) values(a.id,p_action);
 return result;
end $$;

-- No browser/database role gets access. Only the trusted server connection owns data.
do $$ declare t text; r text; begin
 foreach t in array array['campuses','departments','doctors','doctor_slots','patients','appointments','appointment_operations','appointment_audit_events','app_sessions','delegation_jobs','rate_limits','hospital_knowledge_sources'] loop
  execute format('alter table public.%I enable row level security',t);
  foreach r in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on public.%I from %I',t,r); end if;
  end loop;
 end loop;
end $$;
revoke all on function mutate_appointment(text,jsonb,text) from public;
revoke all on function appointment_detail(uuid) from public;

-- Prevent overlapping schedule entries for a doctor, including concurrent inserts.
create or replace function validate_slot_overlap() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from doctors where id=new.doctor_id for update;
 if exists(select 1 from doctor_slots where doctor_id=new.doctor_id and id<>new.id and start_time<new.end_time and end_time>new.start_time) then
  raise exception 'Doctor schedule overlaps an existing slot';
 end if;
 return new;
end $$;
drop trigger if exists no_overlapping_doctor_slots on doctor_slots;
create trigger no_overlapping_doctor_slots before insert or update of doctor_id,start_time,end_time on doctor_slots for each row execute function validate_slot_overlap();
revoke all on function validate_slot_overlap() from public;

-- Durable voice-approval attempts. A proposal ID identifies one immutable operation.
create table if not exists booking_attempts (
 session_id uuid not null references app_sessions on delete cascade,
 proposal_id uuid not null,
 proposal jsonb not null,
 revision integer not null,
 state text not null check(state in ('VERBAL_CONFIRMATION_RECEIVED','BOOKING_IN_PROGRESS','BOOKING_CONFIRMED','BOOKING_FAILED','BOOKING_STATUS_UNKNOWN','BOOKING_CANCELLED')),
 result jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(session_id,proposal_id)
);
alter table booking_attempts enable row level security;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on public.booking_attempts from %I',r); end if;
 end loop;
end $$;
