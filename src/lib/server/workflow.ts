import { interpretApproval, type ApprovalInterpreter } from './voice-approval';
import { randomUUID } from 'node:crypto';
import type { DB } from './db';
import type { Appointment, Fragment, Proposal, TaskResult } from '../types';
import { pakistanTime } from '../types';
import { find_appointment, mutate, validateMutation } from './appointments';
export type Session = {
  id: string;
  revision: number;
  fragments: Fragment[];
  pending: Proposal | null;
  last_result: TaskResult | null;
  last_appointment_result: TaskResult | null;
  live_id: string | null;
  ended_at: string | null;
  delegation_count: number;
};
export async function readSession(db: DB, id: string) {
  const r = await db.query<Session>('select * from app_sessions where id=$1', [id]);
  if (!r.rows[0]) throw Error('Session not found');
  return r.rows[0];
}
export async function saveContext(db: DB, id: string, revision: number, fragments: Fragment[]) {
  await db.query(
    'update app_sessions set revision=$2,fragments=$3::jsonb where id=$1 and revision<=$2',
    [id, revision, JSON.stringify(fragments)],
  );
}
export function voiceConfirmation(text: string, action: Proposal['action']) {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!،؟?]/g, '')
    .replace(/\s+/g, ' ');
  const words: Record<Proposal['action'], string[]> = {
    create_appointment: ['confirm booking', 'booking confirm karein', 'بکنگ کنفرم کریں'],
    cancel_appointment: [
      'confirm cancellation',
      'cancellation confirm karein',
      'کینسلیشن کنفرم کریں',
    ],
    reschedule_appointment: [
      'confirm reschedule',
      'reschedule confirm karein',
      'ری شیڈول کنفرم کریں',
    ],
  };
  return words[action].includes(normalized);
}
export function latestUserUtterance(fragments: Fragment[], afterMs = -1) {
  const selected = fragments.filter((f) => f.role === 'user' && f.start_ms > afterMs);
  if (!selected.length) return '';
  let start = selected.length - 1;
  while (start > 0 && selected[start].start_ms - selected[start - 1].end_ms < 1800) start--;
  return selected
    .slice(start)
    .map((x) => x.delta)
    .join('');
}
export async function propose(
  db: DB,
  session: string,
  revision: number,
  action: Proposal['action'],
  input: unknown,
): Promise<TaskResult> {
  const context = await readSession(db, session);
  const unresolved = await db.query(
    "select proposal_id from booking_attempts where session_id=$1 and state in ('VERBAL_CONFIRMATION_RECEIVED','BOOKING_IN_PROGRESS','BOOKING_STATUS_UNKNOWN')",
    [session],
  );
  if (unresolved.rows.length)
    return reconcileBooking(db, session, String(unresolved.rows[0].proposal_id));
  const args = validateMutation(action, input) as Record<string, string>;
  let summary = '';
  if (action !== 'create_appointment') {
    const existing = await find_appointment(
      db,
      args.reference ? { reference: args.reference, contact_number: args.contact_number } : args,
    );
    if (existing.status !== 'confirmed') throw Error('Booking is already cancelled');
    summary = `${action === 'cancel_appointment' ? 'Cancel' : 'Reschedule'} demo booking ${existing.reference}: ${existing.doctor}, ${existing.campus}, ${pakistanTime(existing.start_time)}.`;
  }
  if (action !== 'cancel_appointment') {
    const r = await db.query<{ doctor: string; campus: string; start_time: string }>(
      `select d.name doctor,c.name campus,s.start_time from doctor_slots s join doctors d on d.id=s.doctor_id join campuses c on c.id=d.campus_id where s.id=$1 and s.status='available' and s.start_time>now() and d.active and c.active and not exists(select 1 from appointments where slot_id=s.id and status='confirmed')`,
      [args.slot_id],
    );
    if (!r.rows[0]) throw Error('That slot is no longer available. Please choose another.');
    const slot = r.rows[0];
    summary += ` ${action === 'create_appointment' ? 'Create a demo booking' : 'Move to'}: ${slot.doctor}, ${slot.campus}, ${pakistanTime(slot.start_time)}${args.name ? `, for ${args.name}` : ''}.`;
  }
  const proposal: Proposal = {
    id: randomUUID(),
    action,
    args,
    summary: summary.trim(),
    createdAt: Date.now(),
    revision,
    afterFragmentId: context.fragments.at(-1)?.id,
  };
  const result: TaskResult = {
    status: 'needs_confirmation',
    message: `${proposal.summary} Nothing has changed yet. Ask the caller naturally whether to go ahead with this exact demo action, then listen for verbal approval. No screen interaction is needed.`,
    booking_state: 'READY_FOR_CONFIRMATION',
    is_demo_booking: true,
    proposal,
  };
  const r = await db.query(
    'update app_sessions set pending=$3::jsonb,last_result=$4::jsonb where id=$1 and revision=$2 and ended_at is null returning id',
    [session, revision, JSON.stringify(proposal), JSON.stringify(result)],
  );
  return r.rows.length
    ? result
    : {
        status: 'stale',
        message: 'The caller has updated their request. Recheck the latest details.',
        is_demo_booking: true,
      };
}
export async function confirm(
  db: DB,
  id: string,
  proposalId: string,
  revision: number,
  voice: boolean | { approvedRevision: number } = false,
): Promise<TaskResult> {
  return db.transaction(async (tx) => {
    const r = await tx.query<Session>('select * from app_sessions where id=$1 for update', [id]);
    const state = r.rows[0];
    if (!state || state.ended_at)
      throw Error('Call ended. Check the booking status in the administrator dashboard.');
    // Retry after a lost HTTP reply returns the verified committed outcome.
    const old = await tx.query<{ result: Appointment }>(
      'select result from appointment_operations where idempotency_key=$1',
      [`${id}:${proposalId}`],
    );
    if (old.rows.length)
      return {
        status: 'success',
        message: 'The previously confirmed demo operation succeeded.',
        is_demo_booking: true,
        appointment: old.rows[0].result,
      };
    if (state.revision !== revision || !state.pending || state.pending.id !== proposalId)
      throw Error('The proposal changed. Review the latest details.');
    const p = state.pending;
    if (
      voice
        ? typeof voice === 'object'
          ? voice.approvedRevision !== revision
          : !voiceConfirmation(latestUserUtterance(state.fragments), p.action)
        : state.revision !== p.revision
    )
      throw Error('The conversation changed. Please review a new proposal.');
    if (Date.now() - p.createdAt > 120000)
      throw Error('Confirmation expired. Please check availability again.');
    const appointment = await mutate(tx, p.action, p.args, `${id}:${p.id}`);
    const result: TaskResult = {
      status: 'success',
      booking_state: p.action === 'cancel_appointment' ? 'BOOKING_CANCELLED' : 'BOOKING_CONFIRMED',
      operation_id: p.id,
      message: `Demo ${p.action === 'create_appointment' ? 'booking confirmed' : p.action === 'cancel_appointment' ? 'booking cancelled' : 'booking rescheduled'}: ${appointment.reference}, ${appointment.doctor}, ${appointment.campus}, ${pakistanTime(appointment.start_time)}. This is not a real hospital appointment.`,
      is_demo_booking: true,
      appointment,
    };
    await tx.query(
      'update app_sessions set pending=null,last_result=$2::jsonb,last_appointment_result=$2::jsonb where id=$1',
      [id, JSON.stringify(result)],
    );
    await tx.query(
      'update booking_attempts set state=$3,result=$4::jsonb,updated_at=now() where session_id=$1 and proposal_id=$2',
      [id, p.id, result.booking_state, JSON.stringify(result)],
    );
    return result;
  });
}

// Read-only reconciliation always consults the original SQL operation before any retry.
export async function reconcileBooking(
  db: DB,
  id: string,
  proposalId?: string,
): Promise<TaskResult> {
  const attempts = await db.query<{
    proposal_id: string;
    state: string;
    result: TaskResult | null;
    proposal: Proposal;
  }>(
    `select * from booking_attempts where session_id=$1 ${proposalId ? 'and proposal_id=$2' : ''} order by created_at desc limit 1`,
    proposalId ? [id, proposalId] : [id],
  );
  const attempt = attempts.rows[0];
  const target = proposalId ?? attempt?.proposal_id;
  if (target) {
    const op = await db.query<{ result: Appointment }>(
      'select result from appointment_operations where idempotency_key=$1',
      [`${id}:${target}`],
    );
    if (op.rows[0]) {
      const appointment = op.rows[0].result;
      const result: TaskResult = {
        status: 'success',
        booking_state:
          appointment.status === 'cancelled' ? 'BOOKING_CANCELLED' : 'BOOKING_CONFIRMED',
        operation_id: target,
        is_demo_booking: true,
        appointment,
        message: `Verified demo appointment ${appointment.reference}: ${appointment.status}, ${appointment.doctor}, ${appointment.campus}, ${pakistanTime(appointment.start_time)}. The database confirms this outcome. This is not a real hospital appointment.`,
      };
      await db.query(
        'update booking_attempts set state=$3,result=$4::jsonb,updated_at=now() where session_id=$1 and proposal_id=$2',
        [id, target, result.booking_state, JSON.stringify(result)],
      );
      return result;
    }
  }
  if (attempt?.result && ['BOOKING_FAILED', 'BOOKING_CANCELLED'].includes(attempt.state))
    return attempt.result;
  if (attempt)
    return {
      status: 'unknown',
      booking_state: 'BOOKING_STATUS_UNKNOWN',
      operation_id: attempt.proposal_id,
      is_demo_booking: true,
      message:
        'The final booking status is not verified yet. Do not claim success or failure. No duplicate booking will be attempted. Explain this uncertainty once; the original operation is being checked.',
    };
  const state = await readSession(db, id);
  if (
    state.last_appointment_result &&
    (!proposalId || state.last_appointment_result.operation_id === proposalId)
  )
    return state.last_appointment_result;
  return {
    status: 'needs_information',
    booking_state: state.pending ? 'READY_FOR_CONFIRMATION' : 'COLLECTING_DETAILS',
    is_demo_booking: true,
    proposal: state.pending ?? undefined,
    message: state.pending
      ? 'No booking operation has started. Ask the caller to confirm the pending demo proposal naturally by voice.'
      : 'No completed booking operation is verified for this request.',
  };
}

export async function resolveVoiceApproval(
  db: DB,
  id: string,
  proposalId: string,
  revision: number,
  interpret?: ApprovalInterpreter,
  signal?: AbortSignal,
): Promise<TaskResult> {
  const existing = await db.query(
    'select proposal_id from booking_attempts where session_id=$1 and proposal_id=$2',
    [id, proposalId],
  );
  if (existing.rows.length) return reconcileBooking(db, id, proposalId);
  const state = await readSession(db, id),
    pending = state.pending;
  if (state.ended_at || !pending || pending.id !== proposalId || state.revision !== revision)
    return {
      status: 'stale',
      is_demo_booking: true,
      message: 'The request changed or the call ended. No new booking is authorized.',
    };
  if (Date.now() - pending.createdAt > 120000) {
    await db.query('update app_sessions set pending=null where id=$1 and revision=$2', [
      id,
      revision,
    ]);
    return {
      status: 'needs_information',
      booking_state: 'COLLECTING_DETAILS',
      is_demo_booking: true,
      message: 'The proposal expired. Check availability and ask for fresh verbal approval.',
    };
  }
  const anchor = pending.afterFragmentId
    ? state.fragments.findIndex((f) => f.id === pending.afterFragmentId)
    : -1;
  const continuation = state.fragments.slice(anchor + 1);
  if (revision <= pending.revision || !continuation.some((f) => f.role === 'user'))
    return {
      status: 'needs_confirmation',
      booking_state: 'READY_FOR_CONFIRMATION',
      proposal: pending,
      is_demo_booking: true,
      message:
        'Ask for verbal approval of the pending demo appointment and listen. No action has been taken.',
    };
  let decision;
  try {
    decision = await (interpret ?? ((p, f, s) => interpretApproval(db, id, p, f, s)))(
      pending,
      continuation,
      signal,
    );
  } catch {
    return {
      status: 'needs_confirmation',
      booking_state: 'READY_FOR_CONFIRMATION',
      proposal: pending,
      is_demo_booking: true,
      message:
        'I could not verify your approval, so I have not submitted a booking. Please tell me again whether to go ahead with these exact details.',
    };
  }
  // The caller may have corrected details while interpretation was running.
  const current = await readSession(db, id);
  if (current.revision !== revision || current.pending?.id !== proposalId || current.ended_at)
    return {
      status: 'stale',
      is_demo_booking: true,
      message:
        'The caller changed the request. Listen to the latest correction before asking for fresh approval.',
    };
  if (decision.material_change || decision.intent === 'revise') {
    await db.query('update app_sessions set pending=null where id=$1 and revision=$2', [
      id,
      revision,
    ]);
    return {
      status: 'needs_information',
      booking_state: 'COLLECTING_DETAILS',
      is_demo_booking: true,
      message:
        'The caller changed the details. Nothing was booked. Check the revised request, prepare updated details and ask for fresh verbal approval.',
    };
  }
  if (decision.intent === 'decline') {
    await db.query('update app_sessions set pending=null where id=$1 and revision=$2', [
      id,
      revision,
    ]);
    return {
      status: 'cancelled',
      booking_state: 'BOOKING_CANCELLED',
      is_demo_booking: true,
      message:
        'The pending proposal was declined. No appointment was changed. Acknowledge naturally and follow the caller’s lead.',
    };
  }
  if (
    decision.intent !== 'approve' ||
    (!decision.explicit_authorization && !decision.follows_final_approval_question)
  )
    return {
      status: 'needs_confirmation',
      booking_state: 'READY_FOR_CONFIRMATION',
      proposal: pending,
      is_demo_booking: true,
      message:
        decision.intent === 'unrelated'
          ? 'Respond naturally to the caller. Keep the demo proposal pending; do not claim it is booked or force a booking redirect.'
          : 'Approval is ambiguous. Briefly ask whether to go ahead with this exact demo appointment. Verbal approval is sufficient; do not mention a button.',
    };
  if (signal?.aborted)
    return {
      status: 'unknown',
      booking_state: 'BOOKING_STATUS_UNKNOWN',
      is_demo_booking: true,
      message:
        'The request was interrupted before booking authorization could be submitted. Check the original status before any new attempt.',
    };
  const claimed = await db.query(
    `insert into booking_attempts(session_id,proposal_id,proposal,revision,state) select id,$2::uuid,$3::jsonb,$4,'VERBAL_CONFIRMATION_RECEIVED' from app_sessions where id=$1 and revision=$4 and ended_at is null and pending->>'id'=($2::uuid)::text on conflict do nothing returning proposal_id`,
    [id, proposalId, JSON.stringify(pending), revision],
  );
  if (!claimed.rows.length) return reconcileBooking(db, id, proposalId);
  await db.query(
    "update booking_attempts set state='BOOKING_IN_PROGRESS',updated_at=now() where session_id=$1 and proposal_id=$2",
    [id, proposalId],
  );
  try {
    return await confirm(db, id, proposalId, revision, { approvedRevision: revision });
  } catch (error) {
    // Known validation/constraint failures mean the SQL transaction rolled back.
    // Transport/process failures remain unknown and never trigger a fresh mutation.
    const known =
      error instanceof Error &&
      /proposal changed|conversation changed|expired|Call ended|already booked|not available|Doctor unavailable|Slot not found|identity does not match|already cancelled|Invalid patient|different input/.test(
        error.message,
      );
    const reconciled = await reconcileBooking(db, id, proposalId);
    if (reconciled.status === 'success') return reconciled;
    if (!known) return reconciled;
    const result: TaskResult = {
      status: 'error',
      booking_state: 'BOOKING_FAILED',
      operation_id: proposalId,
      is_demo_booking: true,
      message:
        'The booking could not be completed; no change was committed by this attempt. Explain the failure and ask whether to check fresh details before trying again.',
    };
    await db.query(
      "update booking_attempts set state='BOOKING_FAILED',result=$3::jsonb,updated_at=now() where session_id=$1 and proposal_id=$2",
      [id, proposalId, JSON.stringify(result)],
    );
    await db.query("update app_sessions set pending=null where id=$1 and pending->>'id'=$2", [
      id,
      proposalId,
    ]);
    return result;
  }
}
