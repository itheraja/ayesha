# Validation record

Completed locally on **2026-10-21**, using Node.js 25.2.1 and Google Chrome on macOS. The automated suites below used no paid OpenAI API requests. A subsequent paid connectivity smoke test is recorded below.

| Check | Result |
| --- | --- |
| `npm test` | 27 passed: actual local PostgreSQL transactions, booking conflicts, identity checks, cancellation, rescheduling rollback, retries, stale/expired confirmations, overlap protection, knowledge boundaries, Unicode append sizing. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed: Next.js production compilation and route generation. |
| `npm run test:e2e` | 7 passed in Chrome: landing/mobile layout, consent, missing API key, protected endpoints, admin booking/reschedule/cancel, schedule availability editing, knowledge/usage views, mocked Live readiness/captions/mute/closure and network/delegation failures. |
| `npm run db:setup` | Passed in local mode: persistent PostgreSQL schema and synthetic seed records created. |
| Visual review | Desktop, mobile and administrator screenshots generated. Desktop/mobile reviewed directly. |
| Dependencies | Exact versions and lockfile; npm install reported no known vulnerabilities at installation time. |

The confirmation regression also verifies that subsequent conversational status updates cannot erase the last completed appointment used in the call summary.

## Live connectivity smoke test

After loading the project API key on 2026-10-21, a short Chrome call using a silent synthetic audio stream reached the actual GPT-Live API. `/api/session` returned HTTP 200 with an SDP answer; the UI reached “Ayesha is listening” without an error notice, and ending the call displayed “Session close confirmed”. This used one paid session. No human microphone audio was captured. This verifies session creation, WebRTC readiness and graceful closure; it does not evaluate spoken output or backend delegation.

## What these results do not prove

- **The initial checks did not establish human voice quality.** Automated protocol tests use mocked events; the subsequent real API smoke test uses silent synthetic media. Neither establishes human microphone behavior, natural interruption behavior, audible greeting delivery, speech latency, Urdu intelligibility, humor quality or voice suitability.
- **No hosted Supabase connection was tested.** PGlite executes the PostgreSQL schema and PL/pgSQL transactions, but serializes access. Independent-connection races, network failures, TLS and hosted RLS/role configuration need verification on the selected demo Supabase project.
- No real-world medical conversation, actual patient data, or hospital system was accessed. Emergency behavior is specified in the prompt and scenario script, not clinically validated.
- Safari, iOS and other mobile browser engines are not tested. The mobile screenshot uses Chrome with a narrow viewport.
- No Vercel deployment was performed. The serverless watchdog limitation is documented.
- Synthetic schedule time editing is implemented with transaction/overlap guards; the browser suite exercises slot availability editing. Adding/editing arbitrary time ranges should be checked on the selected hosted database as well.

## Remaining acceptance work

1. Run the short voice benchmark with the configured OpenAI project API key; actual GPT-Live session access is now verified.
2. Run scenarios A–O with a fluent Urdu speaker and record observable results. Use natural verbal approval, and inspect actual booking records; the review card is now informational only.
3. Configure the dedicated Supabase connection, apply schema/seed, run a full lifecycle and a two-connection booking race; review Supabase advisors.
4. Verify microphone/speaker behavior and recovery on the exact MacBook/network used for the presentation.
5. Configure backend token prices and provider spending controls before further paid experimentation.

## Documentation review — 2026-10-22

The architecture, source guide, model guide, database/safeguards guide, operations guide and presentation/viva guide were checked against the application source. Local Markdown links and listed configuration-file paths were checked with no missing targets. The root README's stale credentials-needed status was corrected. This documentation-only pass did not rerun application tests or make paid API requests; test counts above refer to recorded prior runs.

## Booking reliability repair - 2026-10-23

This update supersedes the original confirmation-button workflow above. Current deterministic checks passed: **39 unit/integration tests**, **10 Chrome browser tests**, TypeScript checking and production compilation. Sixteen additional paid semantic intent cases passed against the configured backend model. The browser suite covers approval without a fresh delegation event, lost-response reconciliation without repeating the write, and automatic processing of the latest revision after an interrupted lookup.

See [booking reliability](BOOKING-RELIABILITY.md) for the final live synthetic-speech exercise, root causes and remaining limitations. Native Pakistani Urdu quality and hosted database concurrency remain separate acceptance work.

The final paid live sequence completed **three consecutive English synthetic-audio bookings**, with exact persisted-slot checks and post-commit output captions plus received audio energy. The references and evidence limits are documented in the reliability record.

## Expanded directory - 24 October 2026

The catalogue now contains 54 specialties and 162 fictional doctors, exactly three per specialty. ENT and bilingual search aliases were added, and specific subspecialty queries use exact department matching. The administrator endpoint now loads the full catalogue instead of stopping at 30 doctors.

Validation: 42 offline tests and 10 browser tests passed; production build/type checking passed. Local database verification confirmed all 162 doctors have future slots, ENT returns three doctors, and all 11 pre-existing appointment IDs, references, slots and statuses are unchanged. No paid voice calls were needed for this directory update.
