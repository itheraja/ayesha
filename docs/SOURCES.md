# Sources and verification notes

Checked **2026-10-21**. API implementation is based on current primary documentation, not guessed Realtime event names.

## OpenAI

- [Getting started with GPT-Live](https://developers.openai.com/api/docs/guides/live)
- [Browser WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc): JSON `session` and `transport` creation request; SDP answer; `oai-events` channel; wait for `session.started`.
- [Client delegation](https://developers.openai.com/api/docs/guides/live-delegation): transcript deltas are fragments; delegation events contain metadata, not task text; append results with the original delegation ID.
- [Live prompting](https://developers.openai.com/api/docs/guides/live-prompting): separate voice style from backend rules; explicit SpawnThinking instructions.
- [Managing Live sessions](https://developers.openai.com/api/docs/guides/live-conversations): voice selection, greeting sequence, cumulative usage and graceful close.
- [Server controls](https://developers.openai.com/api/docs/guides/voice-server-controls): sideband `/v1/live/sessions/{id}/attach`, one owner for delegated work.
- [GPT-Live 1 model](https://developers.openai.com/api/docs/models/gpt-live-1): voice pricing and direct endpoint.
- [Voice costs](https://developers.openai.com/api/docs/guides/voice-latency-cost): initialization accounting; backend usage billed separately.
- [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling): tools, function-call output and continuation.
- [Custom voices](https://developers.openai.com/api/docs/guides/custom-voices): optional future voice evaluation; no custom voice created by this project.

## Hospital

- [Official homepage](https://www.ziauddinhospital.com/)
- [Campus listing](https://www.ziauddinhospital.com/campuses/)
- [Clifton](https://www.ziauddinhospital.com/campuses/clifton/)
- [North Nazimabad](https://www.ziauddinhospital.com/campuses/north-nazimabad/)
- [Keamari](https://www.ziauddinhospital.com/campuses/keamari/)
- [Boat Basin](https://www.ziauddinhospital.com/campuses/boat-basin/)
- [Find a doctor](https://www.ziauddinhospital.com/for-patients/find-a-doctor/)
- [Official contact page](https://www.ziauddinhospital.com/contact-dr-ziauddin-hospital/)

Structured, concise facts with their individual source URLs and dates are in `src/lib/knowledge.ts` and are copied to `hospital_knowledge_sources` during seeding. Public facts and fictional database records are distinct. Some direct retrievals timed out or encountered the site's browser challenge; official pages were also read through indexed first-party results. No claim of real-time hospital availability is made.

The Keamari page has FAQs that incorrectly name Sukkur; those answers are not treated as Keamari facts. North Nazimabad publishes an OPD window, while general 24/7 operations at other campuses do not establish doctor availability. Fees, insurance arrangements and current individual schedules remain unverified.

## Supabase

- [Changelog](https://supabase.com/changelog.md): reviewed for relevant changes. The upcoming November 2026 TLS cipher retirement does not require legacy-client workarounds here; TLS verification stays enabled.
- [Database functions](https://supabase.com/docs/guides/database/functions)
- [Row level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

The schema uses security-invoker functions and revokes public execution. No browser receives database credentials. Hosted Supabase setup and advisor checks remain pending until a project is configured.
