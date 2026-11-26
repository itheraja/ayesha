# Ayesha documentation and study guide

This documentation explains the checked-in academic prototype as inspected on **2026-10-22**. Start with the presentation guide, then follow the architecture and code walkthrough. The guides distinguish implemented behavior from observed test evidence and planned improvements.

| Guide | What you will learn |
| --- | --- |
| [Project README](../README.md) | Project scope, startup and current status |
| [Presentation and viva](PRESENTATION-AND-VIVA.md) | Speaking script, timed demo plan, 26 likely questions, Roman Urdu explanation and glossary |
| [Architecture](ARCHITECTURE.md) | Components, call/booking sequence diagrams, timing, state and deployment boundaries |
| [Source-code guide](SOURCE-CODE-GUIDE.md) | File-by-file responsibilities, key methods and API route map |
| [Models and conversation](MODELS-AND-CONVERSATION.md) | GPT-Live, backend model, voice selection, prompts, tools and evidence limits |
| [Database and safeguards](DATABASE-AND-SAFEGUARDS.md) | ER diagram, tables, transactions, confirmation, security and retention |
| [Setup and operations](SETUP-AND-OPERATIONS.md) | Commands, environment variables, administration and cost controls |
| [Doctor directory](DOCTOR-DIRECTORY.md) | All 54 specialties, three fictional doctors per specialty and search behavior |
| [Validation record](VALIDATION.md) | Recorded test results and what they do not prove |
| [Demo scenarios](DEMO-SCENARIOS.md) | Functional acceptance exercises |
| [Voice evaluation](VOICE-EVALUATION.md) | Urdu/accent/personality listening criteria |
| [Troubleshooting](TROUBLESHOOTING.md) | Common startup, voice and database failures |
| [Sources](SOURCES.md) | Official hospital and API references used during implementation |

[Voice booking reliability repair](BOOKING-RELIABILITY.md) documents the latest natural-confirmation workflow and supersedes earlier exact-phrase/button descriptions in historical implementation notes.

## Three facts to remember

1. **The voice model speaks; the backend model selects tools; code and SQL control writes.**
2. **The database operations are real, but all patient/doctor appointments are fictional demonstration records.**
3. **Passing SQL/browser tests does not prove natural Urdu speech, clinical suitability or hosted production readiness.**

## Suggested study order

For a quick rehearsal, read the 60-second introduction and viva questions, then the architecture diagrams. For a full technical explanation, trace a call in `live-client.ts`, a delegation in `agent.ts`, a proposal/confirmation in `workflow.ts` and the transaction in `supabase/schema.sql`.

No document includes API keys, passwords or patient data. Configuration tables describe variable names and defaults only.
