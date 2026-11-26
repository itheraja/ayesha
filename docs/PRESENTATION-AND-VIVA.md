# Presenting Ayesha to your teacher

> Updated 2026-10-23: See [the voice reliability repair](BOOKING-RELIABILITY.md) for natural approval, bounded waits and reconciliation evidence.
[Documentation index](README.md)

## A 60-second introduction

> Ayesha is a bilingual AI voice receptionist prototype for an unofficial Dr. Ziauddin Hospital academic demonstration. A caller can speak in Urdu, English or a mixture, ask for information, and manage synthetic appointments. The interface uses React and Next.js. The live conversation uses OpenAI GPT-Live over WebRTC, while a separate backend model selects structured tools. The important engineering distinction is that conversation does not directly authorize a booking: application checks and PostgreSQL transactions control the final write. We have tested database workflows and browser interactions, and verified a real Live connection. Urdu accent quality still needs improvement and systematic evaluation. This is a demonstration with fictional patient and doctor records, not a deployed hospital system.

Rehearse the ideas rather than memorizing every sentence. State your actual role and acknowledge any AI-assisted development if your course requires it.

## Suggested 12-minute presentation

| Time | Topic | What to show | Main point |
| --- | --- | --- | --- |
| 0–1 min | Problem and scope | Landing page | Natural bilingual access to receptionist tasks; synthetic academic setting |
| 1–2 min | User experience | Service cards and consent | Clear entry point, microphone consent, demo identity |
| 2–4 min | Architecture | Diagram in ARCHITECTURE.md | Voice, reasoning and transactional authority are separate |
| 4–5 min | Models and language | Prompt constants and model table | Two models have different responsibilities; prompts are not training |
| 5–8 min | Demonstration | Short call, proposal, confirmation, admin record | A spoken request becomes a verified database action |
| 8–9 min | Data integrity | Proposal gate and unique index | Prevent stale changes, duplicates and conflicting bookings |
| 9–10 min | Testing | VALIDATION.md | Distinguish actual SQL tests, mocked events and live audio evidence |
| 10–11 min | Limitations | Evidence table | Urdu accent, hosted concurrency and deployment remain open work |
| 11–12 min | Future work and questions | Prioritized roadmap below | Explain what you would improve and how you would measure it |

## Demonstration preparation

1. Use the same Chrome/network/microphone you rehearsed with. Headphones reduce feedback.
2. Confirm the application is available at `http://localhost:3000`. Use localhost consistently because exact origin checks reject mismatched origins.
3. Verify a usable future demo slot in the admin workspace. Slots and relative dates change over time; choose an exact date available on the day.
4. Keep the admin workspace open in another tab, signed in privately. Do not project `.env.local` or enter the administrator password where the audience can read it.
5. Prepare a synthetic name, a synthetic phone and a planned specialty/campus. Do not use a classmate's real patient details.
6. Keep the architecture diagram and validation record open for questions. Do not reset data while calls are active.
7. Rehearse one short end-to-end call before class. Check provider usage after paid experiments.

## Demonstration script

### Part A: Show the interface

Explain: “This frontend is the caller's interface. It contains microphone/speaker controls, captions, an explicit confirmation panel and a call summary. The visual orb reflects measured sound amplitude; it is not a separate intelligence.”

Open one service card to show guidance, then return and start a call through consent.

### Part B: Show bilingual conversation

Say: “Assalamualaikum Ayesha, aap kaisi hain?” Then briefly switch to English: “Can we look for a demo appointment?”

Explain after the exchange: “The same live session handles both languages. We did not build a language-selection screen or a separate Urdu text-to-speech pipeline.”

Do not claim that a single good reply proves robust bilingual accuracy. If pronunciation is weak, acknowledge the known issue and continue with clear, short requests or English for the database demonstration.

### Part C: Show the booking boundary

Ask for the available specialty/campus and an exact date. Provide synthetic details when asked. When the proposal appears, pause before confirming.

Explain: “At this point, the system has a proposal. It has not saved an appointment. Availability will be checked again during the transaction.”

Give clear verbal approval, such as “Yes, please book this demo appointment.” No confirmation button is required or shown. Then open the administrator view and locate the returned reference. Show the doctor, time and status. This is the strongest evidence that a real database operation occurred.

### Part D: Show a change

If time permits, reschedule using the reference and matching synthetic phone, confirm the new proposal and verify the new slot in the dashboard. Alternatively demonstrate the trusted administrator flow and say clearly that this is the admin path, not voice authorization.

### Part E: End cleanly

End the call. Show the summary and closure status. Explain that ending audio does not cancel the saved appointment. If closure is unconfirmed, report that accurately rather than treating the UI timer as provider billing proof.

## If the demonstration encounters a failure

| Symptom | How to explain and continue |
| --- | --- |
| Microphone permission denied | Show permission handling and use the admin flow while resolving browser access |
| API unavailable or account access rejected | Demonstrate the working database/admin path; do not describe it as a successful voice call |
| Urdu pronunciation poor | Identify it as a known quality limitation and use the fixed listening evaluation as future work |
| Slot disappears before confirmation | Explain the concurrency rule and select another slot; this is a valid conflict, not permission to invent availability |
| Network drops after confirmation | Check the actual database record before repeating the action |
| A joke or digression is handled awkwardly | Explain that personality is prompted and requires behavioral testing; keep the technical demo moving |

## Likely viva questions and answers

### 1. What exactly have you built?

A full-stack browser voice receptionist prototype with a conversational frontend, server-side model integration, validated tools, PostgreSQL booking workflows and an administrator workspace. It simulates receptionist duties using synthetic records.

### 2. What is the main technical contribution?

The integration and control architecture: connecting continuous speech to a structured backend while keeping booking authorization deterministic. The project combines a useful interface with confirmation, revision handling, idempotency and transactional consistency. It does not claim invention of the underlying AI model.

### 3. Which models are used?

`gpt-live-1` handles the live conversation. The backend Responses agent defaults to `gpt-6-luna`, configurable through `BACKEND_MODEL`. `gleam` is the default voice selection, not a third reasoning model. The model inventory is in MODELS-AND-CONVERSATION.md.

### 4. Did you train the model?

No. The application calls pretrained models. We designed prompts, tool schemas, data handling and evaluation scenarios. Changing Ayesha's personality changes instructions at inference time; it does not train new weights.

### 5. Why not let one model do everything?

Separating voice from task reasoning keeps responsibilities clearer. The voice model handles conversational timing and delivery. The backend handles tool selection, while code and SQL control writes. This is a design rationale, not a measured claim that it always outperforms every single-model alternative.

### 6. How does the voice reach the model?

The browser captures a microphone MediaStream, negotiates a WebRTC connection using SDP through our server, and exchanges audio with OpenAI. A data channel carries Live events such as transcripts and delegation requests. The server authenticates session creation using the private API key.

### 7. What is SDP? What is ICE?

SDP describes media/session parameters used to negotiate a connection. ICE gathers and tests possible connection routes through networks. Neither is the user's transcript or a database record.

### 8. Is this a speech-to-text and text-to-speech system?

Not as an application pipeline. It uses a direct audio conversation session. Transcript events are supplied by Live for captions and backend context; there is no separate STT service feeding a separate TTS service in this code.

### 9. How does the AI call a database function?

The backend model returns a structured function call with a name and JSON arguments. The server permits only known functions, validates the arguments and executes parameterized queries or prepares a proposal. The model does not get an unrestricted SQL console.

### 10. Can the AI book without permission?

In the agent path, mutation tools prepare proposals. The workflow checks an on-screen confirmation or an clear contextual verbal approval before committing. The administrator path is separately privileged. No system should claim perfect speech authorization; the current voice gate is conservative and still needs live testing.

### 11. When is “yes” enough?

A clear yes immediately after the final approval question can authorize the unchanged proposal. A yes referring to a joke, clarification or different topic cannot. The semantic interpreter checks context and the workflow binds approval to the proposal and revision; no desktop button is needed.

### 12. How do you prevent double bookings?

The database uses slot locks and a partial unique index allowing at most one confirmed appointment per slot. It rechecks availability when committing. An earlier model lookup alone cannot guarantee the slot remains free.

### 13. What is idempotency?

Repeating the same logical request with the same key returns the same committed result instead of creating a second appointment. The database stores the input fingerprint and rejects reuse of that key with different arguments.

### 14. What happens when the caller changes their mind mid-sentence?

Each user transcript fragment increments a revision. Pending work checks that revision. Stale proposals are discarded, and confirmation must still match the current state. A correction after an already completed transaction must be handled as a new change.

### 15. Is Supabase running in the cloud?

The current validated setup is local PGlite PostgreSQL. A Supabase connection adapter and schema migration are provided, but hosted operation has not been validated here. Do not label the current demonstration as hosted Supabase unless you actually configure and test it.

### 16. Is PGlite a mock database?

No. It executes PostgreSQL SQL and transactional logic. However, it runs embedded and serializes access, so it is not equivalent evidence to testing concurrent clients on a hosted database server.

### 17. Where does hospital knowledge come from?

Curated official-site facts with source URLs and dates live in `knowledge.ts`. Availability and fictional doctors come from SQL. The system is not browsing the web live, and it is not using embeddings or vector retrieval.

### 18. Is this RAG?

It is tool-based grounding in a small curated knowledge set and structured database. If using “retrieval-augmented” broadly, explain that meaning. It is not a vector-search RAG pipeline with document chunking and embeddings.

### 19. Is the API key exposed?

It is read by server code from local environment configuration and used in outbound server requests. It is not sent as a browser credential. Secret hygiene still requires excluding `.env.local` from source control and projected screens.

### 20. What data is stored?

Synthetic appointment data, operation/audit records, session metadata and usage estimates persist. Transcript arrays are cleared on normal call end, but derived result objects and abandoned-session fragments may remain until cleanup. The app does not record audio. Provider processing is separate from local storage behavior.

### 21. What happens in a medical emergency?

The prompt instructs Ayesha to stop playful conversation, respond calmly and direct the caller toward immediate professional assistance rather than routine booking. This behavior is not clinically validated and the app is not a diagnostic system.

### 22. How was it tested?

Recorded checks include 39 offline unit/integration tests, ten Chrome browser tests, a production build and type checking. A real Live smoke test checked connection/readiness/closure using silent synthetic audio. The user tried spoken Urdu and reported poor accent quality. Revised prompts and personality still need measured listening evaluation.

### 23. Do the tests prove real audio works perfectly?

No. Mocked event tests establish client logic under controlled events. A silent real connection establishes connectivity. Natural pronunciation, interruption timing, emotion and conversational quality need separate human listening tests.

### 24. How much does it cost?

The app estimates voice time and backend tokens using configurable rates. The current configured voice rate is historical and must be checked against provider pricing before quoting a current bill. Backend prices default to unpriced values. The local budget checks are not a guaranteed provider spending cap.

### 25. Can it scale to a real hospital?

Not without substantial work: production authentication, least-privilege database access, real scheduling integration, privacy/retention design, concurrency/load tests, monitoring, reliable duration controls and language/clinical-safety evaluation. The present scope is a controlled academic demonstration.

### 26. What would you improve first?

Evaluate Urdu voices and pronunciation with native speakers; verify voice-driven booking/correction scenarios end to end; test hosted concurrent database access; then strengthen identity, retention, monitoring and deployment controls. Prioritize measured reliability before adding channels such as telephone or messaging.

## Simple explanation in Roman Urdu

> Ayesha ke teen main hisse hain. Pehla browser aur voice model hai jo caller se baat karta hai. Doosra backend model hai jo samajhta hai ke kaunsa tool chalana hai. Teesra application aur database ka rule system hai jo check karta hai ke booking waqai save honi chahiye ya nahi. AI ka “booking ho gayi” kehna kaafi nahi; database ka successful result zaroori hai. Is demo mein doctors aur patients fictional hain, lekin booking transactions real PostgreSQL mein hoti hain.

## Glossary

| Term | Plain meaning |
| --- | --- |
| API | A defined interface through which programs request work from other programs |
| Frontend / backend | Browser-facing interface / trusted server-side logic |
| Inference | Running an existing model on new input |
| Prompt | Instructions and context supplied to the model |
| Tool calling | Model requests a named application function using structured arguments |
| Delegation | Voice system asks the backend to handle a task |
| Transaction | A group of database changes that succeeds together or rolls back |
| Foreign key | A constraint linking a record to an existing related record |
| Unique index | Database-enforced rule preventing duplicate values under specified conditions |
| Idempotency | Safely repeating one logical operation without repeating its effect |
| Revision | A counter identifying which version of the conversation a result belongs to |
| RLS | Database row-level access policy mechanism |
| HMAC | A secret-key signature used here to detect cookie tampering |
| WebRTC | Browser technology for real-time media and data exchange |
| Latency | Delay between an action and the relevant response; define which action/response when measuring |
| Synthetic data | Invented records used for demonstration and tests |
