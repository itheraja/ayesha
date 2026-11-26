export type Campus = {
  id: string;
  name: string;
  address: string;
  official_contact: string;
  active: boolean;
};
export type Doctor = {
  id: string;
  name: string;
  department_id: string;
  campus_id: string;
  consultation_fee: number;
  is_demo_record: boolean;
  department: string;
  campus: string;
};
export type Slot = {
  id: string;
  doctor_id: string;
  start_time: string;
  end_time: string;
  status: string;
  doctor: string;
  campus: string;
  department: string;
};
export type Appointment = {
  id: string;
  reference: string;
  patient_name: string;
  contact_number?: string;
  doctor: string;
  campus: string;
  start_time: string;
  status: string;
  slot_id: string;
  is_demo_record: boolean;
};
export type Fragment = {
  id: string;
  role: 'user' | 'assistant';
  delta: string;
  start_ms: number;
  end_ms: number;
};
export type Proposal = {
  id: string;
  action: 'create_appointment' | 'cancel_appointment' | 'reschedule_appointment';
  args: Record<string, string>;
  summary: string;
  createdAt: number;
  revision: number;
  afterFragmentId?: string;
};
export type BookingState =
  | 'COLLECTING_DETAILS'
  | 'READY_FOR_CONFIRMATION'
  | 'VERBAL_CONFIRMATION_RECEIVED'
  | 'BOOKING_IN_PROGRESS'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_FAILED'
  | 'BOOKING_STATUS_UNKNOWN'
  | 'BOOKING_CANCELLED';
export type TaskResult = {
  status:
    | 'success'
    | 'needs_confirmation'
    | 'needs_information'
    | 'error'
    | 'stale'
    | 'unknown'
    | 'cancelled';
  message: string;
  is_demo_booking: boolean;
  booking_state?: BookingState;
  operation_id?: string;
  appointment?: Appointment;
  proposal?: Proposal;
  facts?: unknown;
  remaining_information?: string[];
};
export type CallState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'speaking'
  | 'processing'
  | 'recovering'
  | 'ending'
  | 'ended'
  | 'error';
export const pakistanTime = (value: string | Date) =>
  new Intl.DateTimeFormat('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
