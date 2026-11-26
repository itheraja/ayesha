'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Coins,
  Database,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  X,
} from 'lucide-react';
import { api } from '@/lib/live-client';
import { knowledge } from '@/lib/knowledge';
import { pakistanTime, type Appointment, type Campus, type Doctor, type Slot } from '@/lib/types';
type Data = {
  campuses: Campus[];
  doctors: Doctor[];
  departments: { id: string; name: string }[];
  slots: (Slot & { booked: boolean })[];
  appointments: Appointment[];
  metrics: {
    calls: string;
    seconds: string;
    input_tokens: string;
    output_tokens: string;
    backend_cost: string;
    unconfirmed: string;
  };
  settings: {
    voiceRate: number;
    budget: number;
    warning: number;
    backendInput: number;
    backendOutput: number;
  };
  mode: string;
};
export function AdminWorkspace() {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState('Overview'),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [login, setLogin] = useState(true),
    [date, setDate] = useState(''),
    [doctor, setDoctor] = useState(''),
    [campus, setCampus] = useState(''),
    [form, setForm] = useState<'booking' | 'schedule' | null>(null),
    [editingSlot, setEditingSlot] = useState<Slot | null>(null),
    [reset, setReset] = useState(''),
    [rescheduling, setRescheduling] = useState<Appointment | null>(null),
    [targetSlot, setTargetSlot] = useState('');
  async function load() {
    try {
      const d = await api<Data>(`/api/admin/data?${new URLSearchParams({ date, doctor, campus })}`);
      setData(d);
      setLogin(false);
    } catch (e) {
      if (!(e instanceof Error && e.message.includes('sign-in')))
        setError(e instanceof Error ? e.message : 'Cannot load workspace');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(input: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/api/admin/action', input);
      setMessage('Demo database updated.');
      setForm(null);
      setRescheduling(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }
  if (login)
    return (
      <main className="admin-login">
        <section>
          <Link className="brand" href="/">
            <span className="brand-symbol">
              <AudioLines size={21} />
            </span>
            ayesha.
          </Link>
          <h1>Your demo workspace.</h1>
          <p>
            Manage fictional doctors, demonstration bookings and call usage. Administrator access
            only.
          </p>
          {error && (
            <div role="alert" className="inline-error">
              {error}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await api('/api/admin/login', { password });
                setPassword('');
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Sign-in failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Administrator password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Open workspace'}
              <ArrowUpRight size={16} />
            </button>
          </form>
          <Link className="external-link" href="/">
            <ArrowLeft size={14} />
            Back to Ayesha
          </Link>
        </section>
      </main>
    );
  if (!data) return <main className="error-page">Loading workspace…</main>;
  const total =
    (Number(data.metrics.seconds) / 60) * data.settings.voiceRate +
    Number(data.metrics.backend_cost);
  const nav = [
    ['Overview', LayoutDashboard],
    ['Appointments', CalendarDays],
    ['Doctors & slots', Stethoscope],
    ['Knowledge', BookOpen],
    ['Usage & settings', Coins],
  ] as const;
  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-symbol">
            <AudioLines size={21} />
          </span>
          ayesha.
        </Link>
        <p className="sidebar-caption">DEMO WORKSPACE</p>
        <nav>
          {nav.map(([title, Icon]) => (
            <button
              className={tab === title ? 'active' : ''}
              key={title}
              onClick={() => {
                setTab(title);
                setForm(null);
              }}
            >
              <Icon />
              {title}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/">
            <ArrowLeft size={15} />
            Back to receptionist
          </Link>
          <button
            onClick={async () => {
              await api('/api/admin/logout', {});
              setData(null);
              setLogin(true);
            }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="admin-content">
        <header className="admin-heading">
          <div>
            <span className="eyebrow" style={{ justifyContent: 'start' }}>
              AYESHA / DEMONSTRATION
            </span>
            <h1>{tab === 'Overview' ? 'A little clarity.' : tab}</h1>
            <p>Your academic demo, all in one place.</p>
          </div>
          <span className="admin-badge">
            <span className="status-dot" />
            {data.mode}
          </span>
        </header>
        <div className="banner">
          <ShieldCheck size={17} />
          All doctors, fees, schedules and patients are fictional. These bookings are never sent to
          Dr. Ziauddin Hospital.
        </div>
        {error && (
          <div className="inline-error" role="alert">
            {error}
            <button onClick={() => setError('')} aria-label="Dismiss error">
              <X size={15} />
            </button>
          </div>
        )}
        {message && (
          <div className="success-message" role="status">
            {message}
          </div>
        )}
        {(tab === 'Overview' || tab === 'Usage & settings') && (
          <div className="metric-grid">
            <Metric
              title="Demo bookings shown"
              value={String(data.appointments.length)}
              caption="Filtered results · up to 200"
              icon={<CalendarDays size={16} />}
            />
            <Metric
              title="Voice calls"
              value={data.metrics.calls}
              caption="Across this demonstration"
              icon={<AudioLines size={16} />}
            />
            <Metric
              title="Conversation time"
              value={`${(Number(data.metrics.seconds) / 60).toFixed(1)} min`}
              caption="Recorded or estimated duration"
              icon={<Clock3 size={16} />}
            />
            <Metric
              title="Estimated API cost"
              value={`$${total.toFixed(2)}`}
              caption={`$${data.settings.budget} local planning allowance`}
              icon={<Coins size={16} />}
            />
          </div>
        )}
        {(tab === 'Overview' || tab === 'Appointments' || tab === 'Doctors & slots') && (
          <section className="workspace-panel">
            <div className="workspace-panel-head">
              <div>
                <h2>{tab === 'Doctors & slots' ? 'Clinic schedule' : 'Demo appointments'}</h2>
                <p>All times in Asia/Karachi · Refresh to see the latest data</p>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setEditingSlot(null);
                  setForm(tab === 'Doctors & slots' ? 'schedule' : 'booking');
                  setRescheduling(null);
                }}
              >
                <Plus size={14} />
                {tab === 'Doctors & slots' ? 'Add slot' : 'New demo booking'}
              </button>
            </div>
            <div className="filters">
              <label>
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                Doctor
                <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
                  <option value="">All doctors</option>
                  {data.doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Campus
                <select value={campus} onChange={(e) => setCampus(e.target.value)}>
                  <option value="">All campuses</option>
                  {data.campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary" onClick={() => void load()}>
                <RefreshCw size={13} />
                Apply
              </button>
            </div>
            {form === 'booking' && (
              <form
                className="admin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action({
                    action: 'create',
                    name: f.get('name'),
                    contact_number: f.get('phone'),
                    slot_id: f.get('slot'),
                    idempotency_key: crypto.randomUUID(),
                  });
                }}
              >
                <label>
                  Synthetic patient name
                  <input name="name" required minLength={2} placeholder="Demo Patient Three" />
                </label>
                <label>
                  Synthetic contact number
                  <input name="phone" required defaultValue="+920000000003" />
                </label>
                <label className="wide">
                  Available demo slot
                  <select name="slot" required defaultValue="">
                    <option value="" disabled>
                      Choose doctor, campus and time
                    </option>
                    {data.slots
                      .filter((s) => !s.booked && s.status === 'available')
                      .map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.doctor} · {s.campus} · {pakistanTime(s.start_time)}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="form-note wide">
                  Clicking Confirm demo booking explicitly confirms the details above and creates a
                  real record in the demonstration database.
                </p>
                <div className="form-actions wide">
                  <button className="primary" disabled={busy}>
                    <Check size={15} />
                    Confirm demo booking
                  </button>
                  <button type="button" className="secondary" onClick={() => setForm(null)}>
                    Dismiss
                  </button>
                </div>
              </form>
            )}
            {form === 'schedule' && (
              <form
                className="admin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action({
                    action: editingSlot ? 'edit_slot' : 'add_slot',
                    ...(editingSlot ? { slot_id: editingSlot.id } : { doctor_id: f.get('doctor') }),
                    start_time: new Date(f.get('start') + '+05:00').toISOString(),
                    end_time: new Date(f.get('end') + '+05:00').toISOString(),
                  });
                }}
              >
                <label className="wide">
                  Demo doctor
                  <select
                    name="doctor"
                    required
                    disabled={!!editingSlot}
                    defaultValue={editingSlot?.doctor_id}
                    key={editingSlot?.id}
                  >
                    {data.doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.campus}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start (Pakistan time)
                  <input
                    key={editingSlot?.id}
                    type="datetime-local"
                    name="start"
                    required
                    defaultValue={
                      editingSlot
                        ? new Date(editingSlot.start_time)
                            .toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' })
                            .replace(' ', 'T')
                            .slice(0, 16)
                        : ''
                    }
                  />
                </label>
                <label>
                  End (Pakistan time)
                  <input
                    key={editingSlot?.id}
                    type="datetime-local"
                    name="end"
                    required
                    defaultValue={
                      editingSlot
                        ? new Date(editingSlot.end_time)
                            .toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' })
                            .replace(' ', 'T')
                            .slice(0, 16)
                        : ''
                    }
                  />
                </label>
                <div className="form-actions wide">
                  <button disabled={busy} className="primary">
                    {editingSlot ? 'Save schedule changes' : 'Add demo slot'}
                  </button>
                  <button type="button" className="secondary" onClick={() => setForm(null)}>
                    Dismiss
                  </button>
                </div>
              </form>
            )}
            {rescheduling && (
              <div className="admin-form">
                <p className="wide">
                  Reschedule {rescheduling.reference} from {pakistanTime(rescheduling.start_time)}.
                </p>
                <label className="wide">
                  New slot
                  <select value={targetSlot} onChange={(e) => setTargetSlot(e.target.value)}>
                    <option value="">Select a new time</option>
                    {data.slots
                      .filter((s) => !s.booked && s.status === 'available')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.doctor} · {s.campus} · {pakistanTime(s.start_time)}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="form-actions wide">
                  <button
                    className="primary"
                    disabled={busy || !targetSlot}
                    onClick={() =>
                      void action({
                        action: 'reschedule',
                        reference: rescheduling.reference,
                        slot_id: targetSlot,
                        idempotency_key: crypto.randomUUID(),
                      })
                    }
                  >
                    Confirm reschedule
                  </button>
                  <button className="secondary" onClick={() => setRescheduling(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            <div className="table-scroll">
              {tab === 'Doctors & slots' ? (
                <table>
                  <thead>
                    <tr>
                      <th>DOCTOR / CAMPUS</th>
                      <th>PAKISTAN DATE & TIME</th>
                      <th>STATUS</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.slots.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.doctor}</strong>
                          <small>{s.campus}</small>
                        </td>
                        <td>{pakistanTime(s.start_time)}</td>
                        <td>
                          <span className={`status-pill ${s.booked ? 'booked' : s.status}`}>
                            {s.booked ? 'booked' : s.status}
                          </span>
                        </td>
                        <td>
                          <button
                            disabled={busy || s.booked}
                            className="secondary"
                            onClick={() =>
                              void action({
                                action: 'set_slot',
                                slot_id: s.id,
                                status: s.status === 'blocked' ? 'available' : 'blocked',
                              })
                            }
                          >
                            {s.status === 'blocked' ? 'Open slot' : 'Block slot'}
                          </button>
                          <button
                            className="secondary"
                            disabled={busy || s.booked}
                            onClick={() => {
                              setEditingSlot(s);
                              setForm('schedule');
                            }}
                          >
                            Edit time
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>REFERENCE / PATIENT</th>
                      <th>DOCTOR / CAMPUS</th>
                      <th>APPOINTMENT</th>
                      <th>STATUS</th>
                      <th>MANAGE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.appointments.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.reference}</strong>
                          <small>{a.patient_name}</small>
                        </td>
                        <td>
                          <strong>{a.doctor}</strong>
                          <small>{a.campus}</small>
                        </td>
                        <td>{pakistanTime(a.start_time)}</td>
                        <td>
                          <span className={`status-pill ${a.status}`}>{a.status}</span>
                        </td>
                        <td>
                          {a.status === 'confirmed' && (
                            <>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => {
                                  setRescheduling(a);
                                  setTargetSlot('');
                                  setForm(null);
                                }}
                              >
                                Reschedule
                              </button>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Cancel demo booking ${a.reference} for ${a.patient_name}, ${a.doctor}, ${pakistanTime(a.start_time)}?`,
                                    )
                                  )
                                    void action({
                                      action: 'cancel',
                                      reference: a.reference,
                                      idempotency_key: crypto.randomUUID(),
                                    });
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {!(tab === 'Doctors & slots' ? data.slots.length : data.appointments.length) && (
              <p className="empty-state">
                No {tab === 'Doctors & slots' ? 'slots' : 'appointments'} match these filters.
                <br />
                Create a demo booking or try another date.
              </p>
            )}
          </section>
        )}
        {tab === 'Doctors & slots' && (
          <section className="workspace-panel">
            <div className="workspace-panel-head">
              <div>
                <h2>Fictional doctor directory</h2>
                <p>Fees below are made-up demonstration values, not hospital prices.</p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>DOCTOR</th>
                    <th>DEPARTMENT</th>
                    <th>CAMPUS</th>
                    <th>DEMO FEE</th>
                  </tr>
                </thead>
                <tbody>
                  {data.doctors.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.name}</strong>
                      </td>
                      <td>{d.department}</td>
                      <td>{d.campus}</td>
                      <td>PKR {d.consultation_fee.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {tab === 'Knowledge' && (
          <section className="workspace-panel">
            <div className="workspace-panel-head">
              <div>
                <h2>Verified public information</h2>
                <p>Source-dated facts. No real doctor availability or fees are inferred.</p>
              </div>
              <BookOpen size={18} />
            </div>
            <div className="source-list">
              {knowledge.map((k, i) => (
                <article key={i} className="source-item">
                  <h3>
                    {k.campus ?? 'Hospital'} · {k.topic}
                  </h3>
                  <p>{k.text}</p>
                  <a href={k.source_url} target="_blank" rel="noreferrer">
                    Official source ↗ · Checked {k.verified_at}
                  </a>
                </article>
              ))}
            </div>
          </section>
        )}
        {tab === 'Usage & settings' && (
          <>
            <section className="workspace-panel">
              <div className="workspace-panel-head">
                <h2>Experiment allowance</h2>
                <Database size={17} />
              </div>
              <div className="usage-copy">
                <p>
                  Voice estimate uses ${data.settings.voiceRate}/minute. Backend tokens:{' '}
                  {data.metrics.input_tokens} input / {data.metrics.output_tokens} output.{' '}
                  {(!data.settings.backendInput || !data.settings.backendOutput) &&
                    'Backend dollar rates are not configured; the displayed total excludes unpriced backend usage.'}
                </p>
                <p>
                  {data.metrics.unconfirmed} calls have unconfirmed final usage. This local estimate
                  is not authoritative billing and is not a guaranteed spending cap. Configure
                  spending controls in your OpenAI project and verify the billing dashboard.
                </p>
                {total >= data.settings.warning && (
                  <p className="notice">
                    You have reached the configured budget warning threshold.
                  </p>
                )}
                <p>
                  Change call limits, voice, backend model and pricing in .env.local. Restart the
                  application after changes. Voice benchmarking remains a manual task with live
                  credentials.
                </p>
              </div>
            </section>
            <section className="danger-panel">
              <h3>Reset demonstration bookings</h3>
              <p>
                Deletes all synthetic patients, appointments, audit events and slots, then reseeds
                the demo. Aggregate usage is retained. End active calls first. Type RESET DEMO DATA
                to enable this action.
              </p>
              <div className="form-actions">
                <input
                  aria-label="Reset confirmation"
                  value={reset}
                  onChange={(e) => setReset(e.target.value)}
                  placeholder="RESET DEMO DATA"
                />
                <button
                  className="secondary"
                  disabled={busy || reset !== 'RESET DEMO DATA'}
                  onClick={() => {
                    void action({ action: 'reset', confirmation: reset });
                    setReset('');
                  }}
                >
                  Reset demo
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
function Metric({
  title,
  value,
  caption,
  icon,
}: {
  title: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="metric-card">
      <span>
        {title}
        {icon}
      </span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  );
}
