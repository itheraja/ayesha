import { z } from 'zod';
import type { DB } from './db';
import type { TaskResult } from '../types';
import { BACKEND_PROMPT } from '../prompts';
import * as appt from './appointments';
import { propose, readSession, resolveVoiceApproval, reconcileBooking } from './workflow';
import { settings } from './config';
const string = { type: 'string' };
const definitions = [
  [
    'get_hospital_information',
    'Retrieve source-dated public hospital facts, not fictional fees.',
    { query: string },
  ],
  ['list_campuses', 'List demonstration campus IDs.', {}],
  [
    'search_doctors',
    'Search fictional demo doctors by specialty or name; optional campus ID (empty string for any).',
    { query: string, campus_id: string },
  ],
  [
    'check_availability',
    'Return available demo slots. Date must be exact YYYY-MM-DD or empty for any. Other filters may be empty.',
    { doctor_id: string, date: string, campus_id: string },
  ],
  [
    'get_doctor_schedule',
    'Return available demo schedule for one doctor.',
    { doctor_id: string, date: string },
  ],
  [
    'find_appointment',
    'Find a demo booking with reference and matching synthetic phone.',
    { reference: string, contact_number: string },
  ],
  [
    'create_appointment',
    'PROPOSE a demo booking for explicit caller confirmation. Does not commit.',
    { slot_id: string, name: string, contact_number: string },
  ],
  [
    'cancel_appointment',
    'PROPOSE cancellation of an identity-verified existing demo booking.',
    { reference: string, contact_number: string },
  ],
  [
    'reschedule_appointment',
    'PROPOSE rescheduling an identity-verified existing demo booking.',
    { reference: string, contact_number: string, slot_id: string },
  ],
] as const;
const tools = definitions.map(([name, description, properties]) => ({
  type: 'function',
  name,
  description,
  strict: true,
  parameters: {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  },
}));
const str = z.string().max(250);
async function execute(
  db: DB,
  id: string,
  revision: number,
  name: string,
  input: unknown,
): Promise<unknown> {
  const state = await readSession(db, id);
  if (state.revision !== revision || state.ended_at)
    return { status: 'stale', message: 'Caller changed the request; stop processing.' };
  if (['create_appointment', 'cancel_appointment', 'reschedule_appointment'].includes(name))
    return propose(db, id, revision, name as 'create_appointment', input);
  switch (name) {
    case 'get_hospital_information':
      return appt.get_hospital_information(z.object({ query: str }).strict().parse(input).query);
    case 'list_campuses':
      return appt.list_campuses(db);
    case 'search_doctors':
      return appt.search_doctors(
        db,
        z.object({ query: str, campus_id: str }).strict().parse(input),
      );
    case 'check_availability':
      return appt.check_availability(
        db,
        z.object({ doctor_id: str, date: str, campus_id: str }).strict().parse(input),
      );
    case 'get_doctor_schedule': {
      const p = z.object({ doctor_id: str, date: str }).strict().parse(input);
      return appt.get_doctor_schedule(db, p.doctor_id, p.date);
    }
    case 'find_appointment':
      return appt.find_appointment(db, input);
    default:
      throw Error('Unknown tool');
  }
}
export async function runAgent(db: DB, id: string, revision: number): Promise<TaskResult> {
  const state = await readSession(db, id);
  if (state.revision !== revision || state.ended_at)
    return { status: 'stale', message: 'The conversation changed.', is_demo_booking: true };
  const unsettled = await db.query(
    "select proposal_id from booking_attempts where session_id=$1 and state in ('VERBAL_CONFIRMATION_RECEIVED','BOOKING_IN_PROGRESS','BOOKING_STATUS_UNKNOWN')",
    [id],
  );
  if (unsettled.rows.length) return reconcileBooking(db, id, String(unsettled.rows[0].proposal_id));
  if (state.pending) {
    const approval = await resolveVoiceApproval(db, id, state.pending.id, revision);
    if (approval.booking_state !== 'COLLECTING_DETAILS') return approval;
  }
  if (!process.env.OPENAI_API_KEY) throw Error('OpenAI API key is not configured.');
  const input: unknown[] = [
    {
      role: 'user',
      content: JSON.stringify({
        pakistan_now: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi' }),
        transcript: state.fragments.slice(-240),
        previous_verified_result: state.last_result,
        last_completed_appointment: state.last_appointment_result,
      }),
    },
  ];
  const deadline = Date.now() + 45000;
  for (let turn = 0; turn < 5; turn++) {
    if (Date.now() >= deadline) throw Error('Backend request deadline reached');
    const current = await readSession(db, id);
    if (current.revision !== revision || current.ended_at)
      return {
        status: 'stale',
        message: 'The caller updated their request.',
        is_demo_booking: true,
      };
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.BACKEND_MODEL || 'gpt-6-luna',
        instructions: BACKEND_PROMPT,
        store: false,
        input,
        tools,
        parallel_tool_calls: false,
        max_output_tokens: 1200,
      }),
      signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))),
    });
    if (!res.ok)
      throw Error(`Backend unavailable (${res.status}). No booking success is confirmed.`);
    const data = await res.json();
    const cfg = settings();
    const usage = data.usage ?? {};
    await db.query(
      'update app_sessions set input_tokens=input_tokens+$2,output_tokens=output_tokens+$3,backend_cost=backend_cost+$4 where id=$1',
      [
        id,
        usage.input_tokens ?? 0,
        usage.output_tokens ?? 0,
        ((usage.input_tokens ?? 0) * cfg.backendInput +
          (usage.output_tokens ?? 0) * cfg.backendOutput) /
          1e6,
      ],
    );
    const output = data.output ?? [];
    input.push(...output);
    const calls = output.filter((x: { type: string }) => x.type === 'function_call');
    if (!calls.length) {
      const message = output
        .flatMap((x: { content?: { type: string; text?: string }[] }) => x.content ?? [])
        .filter((x: { type: string }) => x.type === 'output_text')
        .map((x: { text: string }) => x.text)
        .join('\n');
      return {
        status: 'needs_information',
        message: message.slice(0, 1600) || 'Please clarify the doctor, campus or appointment date.',
        is_demo_booking: true,
      };
    }
    for (const call of calls) {
      let result: unknown;
      try {
        result = await execute(db, id, revision, call.name, JSON.parse(call.arguments));
      } catch (e) {
        result = { error: e instanceof Error ? e.message : 'Tool failed', status: 'error' };
      }
      if (
        result &&
        typeof result === 'object' &&
        'status' in result &&
        ['needs_confirmation', 'stale'].includes(String(result.status))
      )
        return result as TaskResult;
      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
  }
  return {
    status: 'needs_information',
    message: 'Please narrow this down to a doctor, campus and exact date.',
    is_demo_booking: true,
  };
}
