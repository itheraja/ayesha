# Source-code walkthrough

> Updated 2026-10-23: See [the voice reliability repair](BOOKING-RELIABILITY.md) for natural approval, bounded waits and reconciliation evidence.
[Documentation index](README.md)

Use this as a guided code tour during questions. Paths are relative to the repository root. The critical reading order is `page.tsx` → `call-experience.tsx` → `live-client.ts` → session/delegate routes → `agent.ts` → `workflow.ts` → `appointments.ts` → SQL schema.

## Pages and presentation

| File | What it does | What to explain |
| --- | --- | --- |
| `src/app/layout.tsx` | Root document structure, metadata and global CSS import | Shared application shell |
| `src/app/page.tsx` | Renders the public call experience | The page delegates interactive behavior to a client component |
| `src/app/admin/page.tsx` | Renders the admin workspace | A separate route does not itself provide authorization; server endpoints do |
| `src/app/error.tsx` | Route error fallback and recovery UI | Unhandled rendering failures should not leave a blank page |
| `src/app/globals.css` | Public experience, dialogs, transcript, admin styles and responsive rules | Public hospital theme is scoped under `.experience`; admin retains its separate theme |
| `src/components/call-experience.tsx` | Call state, consent, controls, service cards, transcript, proposal review and summary | React renders callbacks from `LiveClient`; buttons do not fabricate success |
| `src/components/orb.tsx` | Canvas sphere, gradient waves, audio amplitude response | Uses `requestAnimationFrame`, refs and cleanup; no AI image or emotion model runs here |
| `src/components/admin-workspace.tsx` | Login, records, booking forms, slots, knowledge, usage and reset UI | A trusted demonstration operator can exercise the backend without paid voice calls |
| `public/images/hospital-logo.jpeg` | User-supplied logo asset | Branding is accompanied by an unofficial academic-demo disclosure |

The public frontend uses a light background, hospital red for primary actions, teal for supporting elements and a coral/teal orb. Service cards show relevant guidance and then open consent. Clicking a card does not silently begin a paid call or book an appointment.

The call component uses effects for initialization, disposal, transcript scrolling and modal keyboard handling. The Live client is stored in a ref because the connection object should survive renders without becoming serializable UI state. Audio levels are sent into the orb; the orb keeps current levels in a ref used by its animation loop. Reduced-motion preference is considered.

## Browser-side voice modules

### `src/lib/live-client.ts`

This is the transport coordinator. It owns microphone streams, the peer connection, event channel, output audio element, AudioContext, analyzers, timers, transcript fragments, revision counters and pending backend jobs.

Important methods:

| Method | Purpose |
| --- | --- |
| `start()` | Checks configuration, requests microphone, bootstraps session and negotiates WebRTC |
| `event()` | Deduplicates and handles readiness, captions, delegation, usage and closure events |
| `send()` | Sends documented event envelopes and splits long text content |
| `flush()` | Posts the current context/revision to the application backend |
| `schedule()` / `delegate()` | Waits for input quiet time and coordinates a backend task |
| `confirm()` | Sends proposal ID and current revision for server approval |
| `mute()` / `speaker()` | Controls microphone tracks and output playback mute independently |
| `resumeAudio()` | Retries playback after browser autoplay blocking |
| `end()` | Stops microphone, requests model closure, cleans resources and saves summary state |
| `cleanup()` / `dispose()` | Releases browser resources and supports page/component teardown |

`api()` is a small same-origin JSON request helper. It selects GET when no data is provided, POST otherwise, and raises readable errors for non-success responses.

`epoch` and disposed/ending flags prevent asynchronous startup work from resurrecting a call the user already ended. The `jobs` set and server job table address repeated task dispatch. Neither should be described as a complete distributed job queue.

### `src/lib/live-content.ts`

Splits outgoing append content conservatively at 450 UTF-8 bytes without breaking Unicode characters. The implementation uses byte sizing as a conservative transport limit strategy; it is not a model tokenizer. Tests cover long and multilingual input reconstruction.

### `src/lib/types.ts`

Defines shared shapes such as `CallState`, `Fragment`, `Proposal`, `TaskResult`, `Appointment`, `Doctor`, `Campus` and `Slot`, plus Pakistan-time display formatting. Shared types reduce accidental disagreement between UI and backend. Incoming data still requires runtime validation.

### `src/lib/prompts.ts`

Contains `GREETING`, `VOICE_PROMPT` and `BACKEND_PROMPT`. Prompt changes affect newly created sessions; an already-running Live session retains its startup instructions unless explicitly updated. No model weights are changed.

### `src/lib/knowledge.ts`

Defines the curated fact list and retrieval helper. Facts carry source dates and URLs. This is the runtime source of public hospital knowledge; it is not a crawler or a medical knowledge engine.

## Server modules

| File | Main responsibility | Important boundary |
| --- | --- | --- |
| `src/lib/server/agent.ts` | Tool definitions, strict schemas, Responses loop and token accounting | Chooses from known functions; does not execute arbitrary model-generated SQL |
| `src/lib/server/workflow.ts` | Session reads, context saving, contextual voice approval, proposals, expiry and commit gate | Caller approval is checked in code rather than accepted solely from a model assertion |
| `src/lib/server/appointments.ts` | Input schemas, phone normalization, SQL lookup helpers and mutation wrapper | Parameterized SQL and exact reference-plus-phone matching |
| `src/lib/server/db.ts` | Common DB interface, PGlite adapter, hosted pool and transactions | Data access implementation is replaceable without changing the workflow API |
| `src/lib/server/seed.ts` | Synthetic campuses/departments/doctors/patients/slots and knowledge rows | Demonstration data is explicitly fictional; reset preserves usage accounting |
| `src/lib/server/security.ts` | HMAC cookie signing, admin checks, origin/body/rate limits and route errors | Authorization belongs on the server, not in hidden UI controls |
| `src/lib/server/config.ts` | Numeric defaults and bounds from environment variables | Cost estimates are configurable, not authoritative provider billing |
| `src/lib/server/watchdog.ts` | Local Live sideband observation and close request | Best-effort process-local timer, disabled on Vercel |

The database interface exposes `query` and `transaction`. Hosted transactions acquire one pool connection, issue BEGIN, invoke the callback and COMMIT or ROLLBACK, then release the connection. Nested transactions are rejected. `memoryDB()` creates a fresh database using the actual schema for tests. A global promise avoids opening repeated database instances during normal module reuse; connection failure clears the cached promise.

## HTTP route map

Every path below has a `route.ts` under `src/app/api/`.

| Endpoint | Method | Purpose and main inputs |
| --- | --- | --- |
| `/api/bootstrap` | GET | Returns non-secret configuration and key-presence flag |
| `/api/bootstrap` | POST | Creates a two-hour application session and signed cookie |
| `/api/session` | POST | Accepts browser SDP and creates the configured Live session |
| `/api/context` | POST | Validates revision and at most 500 transcript fragments, then saves context |
| `/api/delegate` | POST | Validates delegation job/revision, deduplicates and runs the backend agent |
| `/api/confirm` | POST | Confirms an identified proposal at the current revision |
| `/api/end` | POST | Stores duration/finalization, clears current transcript/proposal and returns summary result |
| `/api/admin/login` | POST | Checks administrator password and establishes signed admin cookie |
| `/api/admin/logout` | POST | Removes administrator session cookie |
| `/api/admin/data` | GET | Returns authorized workspace data |
| `/api/admin/action` | POST | Validates and executes an allowed administrative action |

Mutation routes apply origin checks. Session routes use the signed session cookie, and administrative routes require admin authentication. Non-local Live session creation additionally checks admin access. See actual route files for per-endpoint limits; these are application controls, not a public API intended for unrestricted clients.

### Administrative actions

`create`, `cancel` and `reschedule` call the same database mutation layer with admin-prefixed idempotency keys. The administrator is a privileged operator: cancellation/rescheduling can retrieve the synthetic phone from the selected record rather than ask the operator to prove caller identity again.

`add_slot`, `edit_slot` and `set_slot` manage schedules. Time edits reject slots with booking history, and availability changes reject confirmed reservations. `reset` requires the literal reset confirmation and checks for recent active calls; it reseeds synthetic records while preserving session usage totals. It is not a way to reset provider spending.

## Database, setup and configuration files

| Path | Role |
| --- | --- |
| `supabase/schema.sql` | Canonical idempotent table/function/constraint definition |
| `supabase/migrations/20261021071217_ayesha_demo.sql` | Migration copy for deployment; keep synchronized with the schema |
| `scripts/configure.ts` | Creates local environment defaults and random secrets without overwriting an existing `.env.local` |
| `scripts/setup-db.ts` | Applies schema/seed for the chosen database configuration |
| `.env.example` | Public template documenting variable names and defaults |
| `.env.local` | Private local configuration; never include its contents in a presentation or commit |
| `package.json` | Scripts and direct dependency versions |
| `package-lock.json` | Resolved dependency lockfile for repeatable installation |
| `tsconfig.json` | Compiler configuration and import aliases |
| `next.config.ts` | Framework configuration |
| `postcss.config.mjs` | CSS build integration |
| `playwright.config.ts` | Browser test server, isolated database and Chrome configuration |
| `vitest.config.ts` | Unit/integration test runner configuration |
| `.gitignore` | Excludes secrets, generated build files and local runtime data |

## Reliability repair modules

`src/lib/server/voice-approval.ts` classifies natural approval against the current proposal. `booking_attempts` persists operation state. `/api/booking-status` reads the original idempotent SQL outcome after lost responses. The public `/api/confirm` route interprets spoken context and no longer accepts a button click as standalone authorization. `scripts/evaluate-voice-approval.ts` and `scripts/live-booking-smoke.mjs` are explicit paid acceptance scripts using synthetic input; normal test commands remain offline.

## Tests and documentation

- `tests/appointments.test.ts`: uses actual local PostgreSQL to check mutation/workflow behavior, conflicts, retries, identity, stale proposals, overlaps and knowledge boundaries.
- `tests/voice-approval.test.ts`: contextual approval workflow, revision races, ambiguity/refusal, timeout reconciliation and duplicate prevention using actual local SQL.
- `scripts/evaluate-voice-approval.ts`: opt-in paid multilingual intent evaluation.
- `scripts/live-booking-smoke.mjs`: opt-in paid synthetic microphone-to-database exercise with post-commit voice evidence.
- `tests/live-content.test.ts`: checks append splitting and Unicode preservation.
- `tests/e2e/app.spec.ts`: browser interface, missing-key path, authorization and administrator lifecycle.
- `tests/e2e/voice-protocol.spec.ts`: injected transport events verify readiness, captions, controls, closure and failures. The mock is in the test harness, not the production transport.
- `docs/VALIDATION.md`: records completed checks and limitations.
- `docs/DEMO-SCENARIOS.md`: scripted acceptance exercises.
- `docs/VOICE-EVALUATION.md`: listening criteria and unverified voice changes.
- `docs/SOURCES.md`: provenance for public facts and API contracts.
- `docs/preview-*.png`: visual captures, not evidence of real speech quality.

For a short code demonstration, show a proposal in `workflow.ts`, then the unique reservation index in `schema.sql`. These two excerpts explain more about trustworthy booking than a long tour of styling code.
