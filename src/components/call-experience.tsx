'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  AudioLines,
  CalendarDays,
  Check,
  ChevronRight,
  Building2,
  Stethoscope,
  ClipboardList,
  Headphones,
  Info,
  LockKeyhole,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Orb } from './orb';
import { api, LiveClient } from '@/lib/live-client';
import { pakistanTime, type CallState, type Fragment, type TaskResult } from '@/lib/types';
const services = [
  {
    title: 'Appointment Booking',
    description: 'Book, reschedule or check demo appointments',
    icon: CalendarDays,
    detail:
      'Find a suitable demo slot, review its details, and confirm before any change is saved. You can also reschedule or cancel using your demo reference and synthetic phone number.',
    example: 'Can you help me book a demo appointment for Friday?',
  },
  {
    title: 'Find a Doctor',
    description: 'Search by department or specialist',
    icon: Stethoscope,
    detail:
      'Ask Ayesha to search the fictional doctor directory by specialty, campus or availability. She checks the demo schedule before suggesting a slot.',
    example: 'Clifton mein dermatologist ka demo slot mil sakta hai?',
  },
  {
    title: 'Our Campuses',
    description: 'Clifton · North Nazimabad · Keamari · Boat Basin',
    icon: Building2,
    detail:
      'Ask about the campus you need. Ayesha can share source-dated public hospital information and help you select a campus for a demo booking. Confirm current real-world details with the hospital.',
    example: 'Where is the Clifton campus?',
  },
  {
    title: 'OPD Guidance',
    description: 'Timings and general visitor information',
    icon: ClipboardList,
    detail:
      'Ask about published OPD information or how to reach the hospital. Ayesha checks the available knowledge before answering. Doctor schedules in this demo are fictional.',
    example: 'What information do you have about OPD timings?',
  },
];
const labels: Record<CallState, string> = {
  idle: 'A conversation away',
  connecting: 'Connecting your call',
  connected: 'You’re connected',
  listening: 'Ayesha is listening',
  speaking: 'Ayesha is speaking',
  processing: 'Checking the details',
  recovering: 'Reconnecting audio',
  ending: 'Ending your call',
  ended: 'Until next time',
  error: 'Let’s reconnect',
};
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export function CallExperience() {
  const [state, setState] = useState<CallState>('idle'),
    [input, setInput] = useState(0),
    [output, setOutput] = useState(0),
    [seconds, setSeconds] = useState(0),
    [muted, setMuted] = useState(false),
    [speaker, setSpeaker] = useState(true),
    [transcript, setTranscript] = useState(false),
    [fragments, setFragments] = useState<Fragment[]>([]),
    [error, setError] = useState(''),
    [result, setResult] = useState<TaskResult | null>(null),
    [consent, setConsent] = useState(false),
    [info, setInfo] = useState(false),
    [service, setService] = useState<number | null>(null),
    [blocked, setBlocked] = useState(false),
    [latency, setLatency] = useState(0),
    [finalized, setFinalized] = useState(false),
    [config, setConfig] = useState({ maxSeconds: 600, voiceRate: 0.05, configured: false });
  const client = useRef<LiveClient | null>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void api<typeof config>('/api/bootstrap')
      .then(setConfig)
      .catch(() => {});
    return () => client.current?.dispose();
  }, []);
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [fragments]);
  useEffect(() => {
    const close = () => client.current?.dispose();
    window.addEventListener('pagehide', close);
    return () => window.removeEventListener('pagehide', close);
  }, []);
  useEffect(() => {
    if (!consent && !info && service === null) return;
    const previous = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConsent(false);
        setInfo(false);
        setService(null);
      }
      if (event.key === 'Tab') {
        const dialog = document.querySelector('[role="dialog"]');
        const nodes = dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled)',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, [consent, info, service]);
  const active = !['idle', 'ended', 'error'].includes(state);
  const ended = state === 'ended' || state === 'error';
  function start() {
    setConsent(false);
    setError('');
    setFragments([]);
    setResult(null);
    setSeconds(0);
    setMuted(false);
    setSpeaker(true);
    setFinalized(false);
    setLatency(0);
    setBlocked(false);
    const instance = new LiveClient({
      state: setState,
      transcript: setFragments,
      levels: (i, o) => {
        setInput(i);
        setOutput(o);
      },
      elapsed: setSeconds,
      result: setResult,
      error: setError,
      playback: setBlocked,
      connected: setLatency,
      finalized: setFinalized,
    });
    client.current = instance;
    void instance.start();
  }
  const grouped = fragments.reduce<{ role: string; text: string; end: number }[]>((all, f) => {
    const last = all.at(-1);
    if (last && last.role === f.role && f.start_ms - last.end < 1800) {
      last.text += f.delta;
      last.end = f.end_ms;
    } else all.push({ role: f.role, text: f.delta, end: f.end_ms });
    return all;
  }, []);
  return (
    <main className={`experience ${active ? 'is-active' : ''}`}>
      <header className="site-header">
        <Link href="/" className="hospital-brand" aria-label="Ayesha home">
          <span className="hospital-logo">
            <img
              src="/images/hospital-logo.jpeg"
              alt="Dr. Ziauddin Hospital"
              width="257"
              height="253"
            />
          </span>
        </Link>
        <div className="hospital-motto">
          <strong>
            Care begins
            <br />
            with a conversation.
          </strong>
          <span>PEOPLE · QUALITY · COMPASSION</span>
        </div>
        <div className="header-identity">
          <span className="small-tag">ACADEMIC DEMO</span>
        </div>
        <button
          className="icon-button about"
          aria-label="About this demonstration"
          onClick={() => setInfo(true)}
        >
          <Info size={19} />
        </button>
      </header>
      <div className="healthcare-backdrop" aria-hidden="true">
        <Stethoscope className="background-stethoscope" />
        <div className="care-watermark">
          <Building2 />
          <span>CONNECTED THROUGH CARE</span>
        </div>
      </div>
      <div className="main-stage">
        <div className="eyebrow">
          <span className={`status-dot ${active ? 'live' : ''}`} />
          {active ? 'LIVE VOICE CONVERSATION' : 'A MORE PERSONAL WAY TO CONNECT'}
          {active && <span className="call-clock">{clock(seconds)}</span>}
        </div>
        <div className="hero-copy">
          <h1>
            {ended ? (
              <>
                Good to hear <span>from you.</span>
              </>
            ) : active ? (
              'I’m here. Take your time.'
            ) : (
              <>
                A little care. <span>A real conversation.</span>
              </>
            )}
          </h1>
          <p>
            {ended ? (
              'Your conversation with Ayesha has ended.'
            ) : active ? (
              'Speak naturally. English, Urdu, or a little of both.'
            ) : (
              <>
                Meet Ayesha, your AI voice receptionist.
                <br />A warm welcome, in your own language.
              </>
            )}
          </p>
        </div>
        <div className="orb-stage">
          <Orb input={input} output={output} active={active} />
          <span className="orbit-label label-left">
            ENGLISH
            <AudioLines className="language-wave" />
          </span>
          <span className="orbit-label label-right" lang="ur" dir="rtl">
            اردو
            <AudioLines className="language-wave" />
          </span>
        </div>
        <div className="voice-identity">
          <span className="name">Ayesha</span>
          <span className="identity-line">
            AI VOICE RECEPTIONIST <span>·</span> URDU & ENGLISH
          </span>
        </div>
        <div className="call-action">
          {active ? (
            <>
              <div className="call-status" role="status">
                {muted ? 'Your microphone is muted' : labels[state]}
                <span className="tiny-wave">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <i
                      key={i}
                      style={{ height: 4 + Math.max(input, output) * 16 * ((i % 3) + 1) }}
                    />
                  ))}
                </span>
              </div>
              <div className="call-controls">
                <button
                  className={`circle-control ${muted ? 'selected' : ''}`}
                  disabled={state === 'connecting' || state === 'ending'}
                  aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                  aria-pressed={muted}
                  onClick={() => {
                    client.current?.mute(!muted);
                    setMuted(!muted);
                  }}
                >
                  {muted ? <MicOff /> : <Mic />}
                </button>
                <button
                  className="circle-control end-control"
                  disabled={state === 'ending'}
                  aria-label="End call"
                  onClick={() => void client.current?.end()}
                >
                  <PhoneOff />
                </button>
                <button
                  className={`circle-control ${!speaker ? 'selected' : ''}`}
                  disabled={state === 'connecting' || state === 'ending'}
                  aria-label={speaker ? 'Mute speaker' : 'Enable speaker'}
                  aria-pressed={!speaker}
                  onClick={() => {
                    client.current?.speaker(speaker);
                    setSpeaker(!speaker);
                  }}
                >
                  {speaker ? <Volume2 /> : <VolumeX />}
                </button>
              </div>
              <button
                className="text-button transcript-toggle"
                onClick={() => setTranscript(!transcript)}
              >
                <MessageSquare size={14} />
                {transcript ? 'Hide' : 'Show'} live transcript
              </button>
              <span className="cost-line">
                {clock(seconds)} / {clock(config.maxSeconds)} · ≈ $
                {((Math.max(seconds, 15) / 60) * config.voiceRate).toFixed(3)} voice estimate
              </span>
            </>
          ) : (
            <>
              <button className="primary start-call" onClick={() => setConsent(true)}>
                <Phone size={18} />
                {ended ? 'Start new call' : 'Start call'}
                <ChevronRight size={18} />
              </button>
              <span className="permission-note">
                <Mic size={12} />
                Your microphone, a quiet moment, and you.
              </span>
            </>
          )}
        </div>
        {blocked && active && (
          <button className="notice" onClick={() => void client.current?.resumeAudio()}>
            <Volume2 size={16} /> Tap to enable Ayesha’s audio
          </button>
        )}
        {active && seconds >= config.maxSeconds - 30 && (
          <p className="notice">
            Your demo call will end in {Math.max(0, config.maxSeconds - seconds)} seconds.
          </p>
        )}
        {error && (
          <div className="error-notice" role="alert">
            <Info size={18} />
            <span>{error}</span>
            <button aria-label="Dismiss notice" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {result?.proposal && active && (
          <section className="confirmation-card">
            <span className="small-tag">DEMO APPOINTMENT · REVIEW</span>
            <p>{result.proposal.summary}</p>
            <small>
              Tell Ayesha whether to go ahead. Your verbal approval is all that is needed.
            </small>
          </section>
        )}
        {ended && (
          <section className="summary-card">
            <div className="summary-title">
              <Check size={18} />
              <strong>Call summary</strong>
              <span>{clock(seconds)}</span>
            </div>
            {result?.appointment ? (
              <>
                <span className="small-tag">DEMONSTRATION BOOKING</span>
                <h3>{result.appointment.reference}</h3>
                <p>
                  {result.appointment.doctor} · {result.appointment.campus}
                </p>
                <p>
                  {pakistanTime(result.appointment.start_time)} · {result.appointment.status}
                </p>
                <small>Saved in the demo database. Not a hospital appointment.</small>
              </>
            ) : (
              <p>No completed appointment action is confirmed for this call.</p>
            )}
            <small>
              {latency ? `Connected in ${(latency / 1000).toFixed(1)}s · ` : ''}
              {finalized ? 'Session close confirmed' : 'Final voice usage unconfirmed'} ·
              Approximate voice cost $
              {((Math.max(seconds, seconds ? 15 : 0) / 60) * config.voiceRate).toFixed(3)}
            </small>
          </section>
        )}
        {!active && (
          <section className="service-grid" aria-label="How Ayesha can help">
            {services.map(({ title, description, icon: Icon }, index) => (
              <button className="service-card" key={title} onClick={() => setService(index)}>
                <Icon className="service-icon" size={31} />
                <span className="service-copy">
                  <strong>{title}</strong>
                  <span>{description}</span>
                </span>
                <span className="service-arrow">
                  <ChevronRight size={17} />
                </span>
              </button>
            ))}
          </section>
        )}
      </div>
      <footer className="site-footer">
        <span>
          <ShieldCheck size={14} />
          Unofficial academic demo. No real hospital bookings.
        </span>
        <div>
          <button onClick={() => setInfo(true)}>About & privacy</button>
          <span>·</span>
          <Link href="/admin">
            Demo workspace <ArrowUpRight size={13} />
          </Link>
        </div>
      </footer>
      {transcript && active && (
        <aside className="transcript-panel" aria-label="Live transcript">
          <div className="panel-header">
            <span>
              <MessageSquare size={16} />
              Live transcript
            </span>
            <button
              className="icon-button"
              aria-label="Close transcript"
              onClick={() => setTranscript(false)}
            >
              <X size={18} />
            </button>
          </div>
          <p className="transcript-disclaimer">
            Captions may contain mistakes. No audio recording.
          </p>
          <div className="transcript-body">
            {!grouped.length && <p className="empty-state">Your conversation will appear here.</p>}
            {grouped.map((f, i) => (
              <div className={`utterance ${f.role}`} key={i}>
                <span>{f.role === 'user' ? 'YOU' : 'AYESHA'}</span>
                <p dir="auto">{f.text}</p>
              </div>
            ))}
            <div ref={transcriptEnd} />
          </div>
        </aside>
      )}
      {service !== null && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close"
              onClick={() => setService(null)}
            >
              <X />
            </button>
            <span className="eyebrow">HOW AYESHA CAN HELP</span>
            <h2 id="service-title">{services[service].title}</h2>
            <p>{services[service].detail}</p>
            <div className="sample-question">“{services[service].example}”</div>
            <p className="muted-text">
              An unofficial academic demo. Doctors and appointment records are fictional. For real
              care, call 021-111-942-942.
            </p>
            <button
              autoFocus
              className="primary full-width"
              onClick={() => {
                setService(null);
                setConsent(true);
              }}
            >
              Talk to Ayesha <Phone size={17} />
            </button>
          </section>
        </div>
      )}
      {consent && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close"
              onClick={() => setConsent(false)}
            >
              <X />
            </button>
            <span className="modal-icon">
              <Headphones />
            </span>
            <span className="eyebrow">BEFORE WE SAY HELLO</span>
            <h2 id="consent-title">Make yourself comfortable.</h2>
            <p>
              This is an AI-powered university demonstration. Use a made-up name and phone number.
              Appointments stay in our demonstration database.
            </p>
            <div className="consent-details">
              <span>
                <Mic size={17} />
                Your browser will ask for microphone access.
              </span>
              <span>
                <LockKeyhole size={17} />
                Live audio goes to OpenAI. We do not record it.
              </span>
              <span>
                <MessageSquare size={17} />
                Temporary captions support the conversation.
              </span>
            </div>
            <p className="muted-text">
              A call lasts up to {config.maxSeconds / 60} minutes. Estimated voice cost: $
              {((config.maxSeconds / 60) * config.voiceRate).toFixed(2)}, plus backend usage. For
              real care, call 021-111-942-942.
            </p>
            <button autoFocus className="primary full-width" onClick={start}>
              Agree & start call <Phone size={17} />
            </button>
            <button className="text-button full-width" onClick={() => setConsent(false)}>
              Maybe later
            </button>
          </section>
        </div>
      )}
      {info && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
            <button
              className="modal-close icon-button"
              aria-label="Close"
              onClick={() => setInfo(false)}
            >
              <X />
            </button>
            <span className="modal-icon">
              <ShieldCheck />
            </span>
            <h2 id="about-title">A thoughtful demonstration.</h2>
            <p>
              Ayesha is an AI receptionist built for an academic project. This project is not
              affiliated with, endorsed by, or connected to Dr. Ziauddin Hospital’s patient systems.
            </p>
            <p>
              Doctors, fees, slots and patient records are synthetic. Public hospital information is
              source-dated. Real appointments and current clinical information must be confirmed
              with the hospital.
            </p>
            <p>
              We send live audio and necessary conversation context to OpenAI. Audio recording is
              disabled. Temporary transcripts are cleared from application storage at call end;
              synthetic booking records and aggregate usage remain.
            </p>
            <a
              className="external-link"
              href="https://www.ziauddinhospital.com/"
              target="_blank"
              rel="noreferrer"
            >
              Visit the official hospital website <ArrowUpRight size={16} />
            </a>
            <button autoFocus className="primary full-width" onClick={() => setInfo(false)}>
              Got it
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
