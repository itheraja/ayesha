# Models, voice and conversational behavior

> Updated 2026-10-23: See [the voice reliability repair](BOOKING-RELIABILITY.md) for natural approval, bounded waits and reconciliation evidence.
[Documentation index](README.md) · [Architecture](ARCHITECTURE.md)

## Model inventory

| Component | Identifier or setting | Responsibility | Not responsible for |
| --- | --- | --- | --- |
| Live conversational model | `gpt-live-1` in the session route | Receives live audio, responds with audio, emits transcript and delegation events | Direct database authorization |
| Backend reasoning model | `BACKEND_MODEL`, default `gpt-6-luna` | Processes supplied context and selects structured tools through `/v1/responses` | Direct microphone playback or independently approved commits |
| Voice selection | `LIVE_VOICE`, default `gleam` | Selects the Live session's speaking voice | A separate reasoning model or guaranteed Urdu accent |
| Optional custom voice | `LIVE_CUSTOM_VOICE_ID` | Overrides the built-in voice selection with an existing supported voice ID | A custom voice trained by this repository |
| Orb animation | Canvas and measured audio amplitude | Visual feedback | AI inference, emotion recognition or medical interpretation |

These are implementation identifiers, not claims about model parameter counts, internal training data or benchmark superiority. The project does not train or fine-tune either model. Changes to personality are inference-time prompt changes.

## Why two models?

A live conversation needs quick responses, natural interruptions and social continuity. Database work needs exact IDs, checked arguments, several possible lookups and consistent rules. Separating them lets the voice model keep the conversation moving while the backend handles structured work.

The backend does not run on every casual remark. The voice prompt asks GPT-Live to generate `<|SpawnThinking|>` when it needs backend work. The application reacts to the resulting `session.delegation.created` event; it is not searching transcript text for that special marker.

There is no application-level STT → text model → TTS chain. Transcripts exist because Live emits them; they support backend context and optional captions. The app sends text to the second model only for delegated work. There is no fallback to a different voice model if Live fails.

## The three prompt responsibilities

`src/lib/prompts.ts` defines:

### GREETING

An Urdu opening identifies Ayesha as an AI receptionist and describes the unofficial academic demo and practice-only bookings. The revised opening ends with a conversational “کیسے ہیں آپ؟”. It asks the model not to repeat the disclosure throughout ordinary conversation.

### VOICE_PROMPT

Defines the speaking persona, language policy, pronunciation examples, safe social boundaries, interruption behavior and delegation rules. The latest revision calls for youthful energy, wit, confidence, gentle teasing and innocent flirting. Harmless casual conversation has no special one- or two-turn cutoff. The overall configured call duration still applies.

The prompt permits playful exchanges but prohibits fabricated human biography, a physical body, genuine romantic feelings or an actual relationship. It asks the model to become calm and empathetic for distress, sensitive healthcare topics and emergencies. These are behavioral instructions; they require evaluation, not merely code inspection.

Pakistani Urdu guidance uses Urdu script, feminine self-reference, pronunciation examples and ordinary conversational wording. An isolated English word should not force the whole response into English. English-speaking callers should receive English. Mixed speech should retain natural Urdu pronunciation around borrowed terms.

### BACKEND_PROMPT

Defines how to use transcripts as untrusted context, resolve dates in Pakistan time, ask for missing details, use tool-returned IDs and avoid inventing facts. It emphasizes that create/cancel/reschedule tools prepare proposals. The confirmation workflow controls actual commits.

Urdu responses should use Urdu script rather than Roman Urdu while preserving exact references and database values. This improves the text supplied to the voice model; it does not guarantee accent accuracy. The prompt also prevents the backend from forcing booking redirects during casual chat.

## Backend tool loop

`runAgent` first reads the current session and checks revision/end status. If a pending proposal is followed by clear contextual verbal approval, it calls the deterministic confirmation workflow directly. A pending proposal is retained for clarification or unrelated conversation; a material correction clears it and requires fresh approval. For ordinary task work the agent prepares input containing:

- Current Pakistan date/time.
- Up to the most recent 240 transcript fragments.
- Previous verified result.
- Last completed appointment result.

The Responses request uses `store: false`, strict function schemas, `parallel_tool_calls: false`, and `max_output_tokens: 1200`. The loop is limited to five model-response iterations. Backend calls have a 15-second per-request bound within a 45-second model-work deadline; approval interpretation has a 12-second provider deadline. This bounds work; it does not prove that all possible requests finish within a guaranteed latency.

When the model calls a function, the server parses JSON arguments, validates them and runs a known function. Read results are returned as `function_call_output` for further reasoning. A proposal or stale result exits early. If no tool call remains, text becomes a conversational result. The `needs_information` status is also used for ordinary final text, so it should not be described as a perfect intent classifier.

## Tool catalogue

| Tool name | Inputs | Effect |
| --- | --- | --- |
| `get_hospital_information` | Query text | Retrieves curated, source-dated facts |
| `list_campuses` | None | Reads active demo campuses |
| `search_doctors` | Query and optional campus ID | Reads fictional doctors and department matches |
| `check_availability` | Doctor, exact date and campus filters | Reads future, unblocked, unreserved slots |
| `get_doctor_schedule` | Doctor ID and date | Uses the availability query for that doctor |
| `find_appointment` | Reference and synthetic phone | Reads a record only when both match |
| `create_appointment` | Slot ID, synthetic name and phone | Creates a pending proposal in the agent path |
| `cancel_appointment` | Reference and matching phone | Creates a cancellation proposal |
| `reschedule_appointment` | Reference, matching phone and new slot | Creates a rescheduling proposal |

Optional model-tool string filters use empty strings. Tool descriptions are not security controls by themselves: server validation and database checks remain necessary. The repository also exports direct mutation functions for trusted application code and tests; do not confuse those with the agent's proposal-only dispatch.

## Knowledge grounding

Public hospital information is curated in `src/lib/knowledge.ts`, with source URLs and verification dates. Retrieval uses local matching, not live web browsing, embeddings or semantic vector search. The seed also copies knowledge into a table for administrative display. Editing the table alone does not rewrite the runtime TypeScript knowledge source.

Doctor availability comes from SQL, not model memory. Public hospital facts and fictional demo doctor schedules have different provenance. Ayesha must not present synthetic fees or appointments as official hospital facts.

## Costs and configuration

The configured voice estimate is calculated as `voice_seconds × voiceRate / 60`. Backend estimate is `(inputTokens × inputPrice + outputTokens × outputPrice) / 1,000,000`. Prices are environment configuration, not dynamically fetched billing.

Zero backend price settings mean the backend dollar total is unpriced. They must not be presented as free inference. Voice initialization is accounted for with a 15-second minimum in relevant paths. See the dated sources and provider usage dashboard before quoting current commercial prices.

There are limits on call duration, session count, delegation count and backend iterations. They reduce exposure but do not create a guaranteed hard spending cap.

## Evidence and honest conclusions

A real silent-audio Live connection returned an SDP answer, reached readiness and confirmed closure. The user subsequently tested speech and reported weak Urdu pronunciation/accent. Urdu-script guidance was then added, followed by the personality revision. Neither revision has a recorded comparative listening score.

Three subsequent English synthetic-audio calls completed booking with verified records and post-commit output captions/audio; see [the reliability record](BOOKING-RELIABILITY.md). The application therefore demonstrates model integration, not proven native-quality Pakistani Urdu. Run the fixed listening set in [VOICE-EVALUATION.md](VOICE-EVALUATION.md) before asserting improvement. Test spontaneous speech, interruption, mixed languages, banter, serious tone changes and task resumption separately.

Protocol references already used for the implementation are indexed in [SOURCES.md](SOURCES.md), including the official [GPT-Live prompting guide](https://developers.openai.com/api/docs/guides/live-prompting). Product capabilities and pricing can change; this guide describes the checked-in implementation rather than promising future API behavior.
