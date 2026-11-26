# Setup, configuration and demonstration operations

[Documentation index](README.md) · [Troubleshooting](TROUBLESHOOTING.md)

## Local startup

Use the tested Node/Chrome environment where possible; the recorded environment used Node 25 on macOS. For a fresh checkout:

```sh
npm ci
npm run setup
npm run dev
```

`npm ci` installs locked dependencies. `setup` creates `.env.local` if absent, including generated administrator and signing secrets; it does not overwrite your existing file. `dev` starts the development server on the loopback interface. Open `http://localhost:3000`.

For the production-mode local presentation, stop the development server first:

```sh
npm run build
npm run start
```

Production mode needs a successful build. Code/prompt changes require rebuilding before restarting `next start`. Environment-only changes require restarting the server. A new voice session is required to apply startup prompt/voice settings. Do not start a second local database owner while the original server is running.

## Environment reference

Keep real values in `.env.local`. The table below contains defaults and descriptions, not your credentials.

| Variable | Default / expected value | Effect |
| --- | --- | --- |
| `DATABASE_MODE` | `local` or `supabase` | Chooses embedded or hosted PostgreSQL adapter |
| `DATABASE_URL` | Private PostgreSQL URI in hosted mode | Server connection only |
| `LOCAL_DATABASE_PATH` | `.data/postgres` when omitted | Optional isolated local storage path; used by browser tests |
| `OPENAI_API_KEY` | Private project key | Authenticates server calls to Live/Responses |
| `LIVE_VOICE` | `gleam` | Built-in voice selection |
| `LIVE_CUSTOM_VOICE_ID` | Empty | Existing supported voice ID; takes priority when set |
| `BACKEND_MODEL` | `gpt-6-luna` | Reasoning/tool model for Responses |
| `ADMIN_PASSWORD` | Generated locally | Demonstration workspace sign-in |
| `SESSION_SECRET` | Random value of at least 32 characters | Signs cookies; stable secret needed in production |
| `APP_ORIGIN` | `http://localhost:3000` | Exact allowed origin for mutation requests |
| `MAX_CALL_SECONDS` | 600 | Clamped to 30–900 seconds by settings helper |
| `MAX_DEMO_SESSIONS` | 60 | Local cumulative session allowance; clamped to 1–10,000 |
| `BUDGET_WARNING_USD` | 15 | Estimate warning threshold |
| `BUDGET_LIMIT_USD` | 20 | Local estimated allowance check |
| `VOICE_USD_PER_MINUTE` | 0.05 | Configured estimate rate, not a live pricing feed |
| `BACKEND_INPUT_USD_PER_MILLION` | 0 | Set current model input rate; default means unpriced |
| `BACKEND_OUTPUT_USD_PER_MILLION` | 0 | Set current model output rate; default means unpriced |
| `PLAYWRIGHT_CHANNEL` | Chrome behavior from test config | Use bundled Chromium only after installing it and selecting the configured option |

Never rename secrets with a `NEXT_PUBLIC_` prefix. That prefix is intended for browser-visible configuration.

## Database setup

Local mode initializes the schema and synthetic seed when connecting. Explicit setup is also available:

```sh
npm run db:setup
```

Stop an app that owns the same local path before running this command. The seed creates four campuses, 54 specialties, 162 fictional doctors (three per specialty), two synthetic patients and fourteen days of sample slots. It is not a copy of actual hospital schedules.

For Supabase, use a dedicated demonstration database, configure the server-side connection URI with verified TLS, set `DATABASE_MODE=supabase`, apply schema/seed and restart. The migration file provides the schema deployment copy. Hosted validation, role review and a two-connection race test remain required. Do not claim that local tests alone validate hosted concurrency.

## Administrator operations

Open `/admin` and use the locally configured password. The workspace can view/filter records, create/reschedule/cancel synthetic appointments, manage slots, show knowledge sources and inspect usage. The administrator path does not require a paid model call.

Reset requires explicit text confirmation and should only be used after all calls end. It removes/reseeds synthetic booking data but preserves usage accounting. Record references will change; prepare your presentation after any reset.

## Cost controls

At session start the application reserves the estimated cost of a full allowed call when checking its local budget. It counts started sessions and limits delegation work. Browser and local watchdog timers request closure, and the UI warns near the end.

These controls cannot guarantee provider-side spending: processes can stop, timers can be throttled, network closure can fail and backend token prices may be missing. Check provider usage and configure provider controls appropriate to the account. Avoid repeatedly restarting paid calls just to inspect a CSS change; browser tests cover UI behavior without keys.

## Verification commands

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Offline tests exercise actual local SQL and deterministic logic. E2E tests start an isolated test server on port 3100 with a separate local database and an empty OpenAI key; protocol tests inject events. Leave port 3100 available. Default Chrome avoids needing a fresh browser download.

The existing validation record is evidence of past runs. Running these commands now creates a new verification run; do not describe a documentation edit as rerunning tests. Live speech acceptance remains a separate paid/manual exercise.

## Operational checks before class

- Verify future slots, browser permissions and speakers/headphones.
- Ensure the application origin matches the URL you use.
- Keep secrets off the projector and use only synthetic caller details.
- Test one short voice call and end it explicitly.
- Keep the admin flow available if model/network access fails.
- Use [VALIDATION.md](VALIDATION.md) to distinguish confirmed results from unfinished evaluation.

## Interpreting errors

A 401 generally means a missing/expired application or administrator session. A 403 can indicate an unexpected origin. A 409 can mean a conflicting/stale operation, duplicate session creation or ongoing job. A 429 indicates an application request/allowance limit. A provider rejection surfaced by the session route is different from a microphone-permission failure. The server intentionally avoids exposing arbitrary internal errors to callers.

After an ambiguous network error, check the database outcome before recreating a booking. A lost HTTP response is not proof that the transaction failed.

## Opt-in paid booking checks

With the local server running on `http://localhost:3000` and the configured API key/admin password available, run:

```sh
node --env-file=.env.local scripts/live-booking-smoke.mjs 3
npx tsx --env-file=.env.local scripts/evaluate-voice-approval.ts
```

These commands use paid inference. The first uses installed Google Chrome and macOS `say` to synthesize caller speech; it does not record a human microphone or add a speech-synthesis service to Ayesha. It selects future synthetic slots, asks for a proposal, speaks approval, verifies the persisted booking, and checks post-commit output captions and received audio energy. It leaves successful synthetic appointments in the demo database. It stops on failure and stores synthetic-only traces under ignored `tmp/voice-tests/` for review. Natural-language paraphrases still need trace review; this is not a pronunciation score or proof of physical speaker audibility. The second exercises contextual intent classification against an isolated in-memory database.
