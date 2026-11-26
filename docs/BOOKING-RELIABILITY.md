# Voice booking reliability repair

## Investigation

The three reported live outcomes cannot be reconstructed exactly from logs: the application deliberately does not log patient transcripts, and no trace IDs accompanied the reports. Code inspection did identify mechanisms consistent with the failures:

1. **Exact-phrase gate:** the old workflow accepted only a few operation-specific phrases. Natural replies such as “Haan ji, confirm kar dein” were not accepted as approval.
2. **Proposal invalidation:** the backend cleared pending proposals before ordinary delegated work whenever exact matching did not succeed. A natural confirmation could therefore lose the proposal it was intended to authorize.
3. **Missing visible card:** every new user fragment cleared the frontend task result, so the review card disappeared as soon as the caller spoke.
4. **Prompt/UI mismatch:** the prompt and proposal text explicitly offered the screen confirmation button. The model could fall back to that instruction after a spoken reply failed the exact gate.
5. **Delegation dependency:** the browser waited for a new Live delegation event to initiate backend work. Approval could go unprocessed when the model only spoke an acknowledgement.
6. **Unbounded browser waits:** JSON requests lacked explicit client deadlines. A pending fetch kept the client busy, preventing subsequent work from proceeding.
7. **Result routing:** proactive approval results did not retain the original Live delegation ID. The client now keeps that association for confirmation and lost-response reconciliation.
8. **No operation reconciliation:** a lost response had no dedicated status endpoint to determine whether the original transaction committed.

One successful test was consistent with an exact phrase/delegation sequence happening to match. There is no evidence that every reported hang created an appointment; the repaired status path now makes that distinction observable.

## Revised flow

`COLLECTING_DETAILS -> READY_FOR_CONFIRMATION -> VERBAL_CONFIRMATION_RECEIVED -> BOOKING_IN_PROGRESS -> BOOKING_CONFIRMED`

Alternate outcomes are `BOOKING_FAILED`, `BOOKING_STATUS_UNKNOWN` and `BOOKING_CANCELLED`. Declining a proposal means no existing appointment is cancelled; a confirmed cancellation action is a separate database operation.

- New caller speech while a proposal is pending proactively triggers `/api/confirm` after the input quiet window, even without another Live delegation.
- The server interprets the reply in the context of the immutable proposal and actual subsequent transcript.
- The existing backend model classifies approval, refusal, revision, ambiguity or unrelated conversation. It does not receive a mutation tool during this interpretation.
- Short acknowledgements require an actual preceding final-approval question. Explicit authorization can be expressed naturally in Urdu, Roman Urdu, English or mixed speech.
- Material changes invalidate the old proposal and require fresh details and approval.
- The workflow rechecks revision, call state, expiry and SQL constraints after interpretation.
- Spoken result updates retain the original known Live delegation ID, including after read-only reconciliation. The two browser regressions assert this association.
- A durable `booking_attempts` row records the original proposal and operation state. The SQL idempotency key remains `session ID : proposal ID`.
- The review panel is informational only. There is no confirmation button in the public voice workflow. `/api/confirm` itself checks spoken context; sending a proposal ID alone is not sufficient.

## Bounded waits and reconciliation

Browser requests have explicit deadlines. Session setup allows 35 seconds, delegated work 55 seconds, approval 20 seconds and status reads 8 seconds. The backend task loop has a 45-second overall model-work deadline with per-call bounds; language interpretation has a 12-second provider deadline. Hosted PostgreSQL connections/statements/locks have configured timeouts.

If a response is interrupted or invalid, the browser checks `/api/booking-status` before considering another operation. That endpoint reads `appointment_operations` using the original key. A committed result is authoritative even if the original response was lost. Pending or unverified operations are reported as unknown and are not blindly replayed. Status checking is bounded to an initial read and up to two delayed follow-ups; further caller speech can request another read. The model is told to explain uncertainty once, not invent progress.

Known validation/availability failures become terminal failed results. Unexpected transport/process failures remain unknown. This deliberately prioritizes avoiding duplicates over automatically replaying an uncertain write. A process crash may require operator investigation of an unresolved attempt.

## Verification record

- 39 offline unit/integration tests passed, including 12 new tests for the approval-to-PostgreSQL workflow. Language interpretation is injected in these deterministic tests.
- Ten Chrome browser tests passed, including new checks for approval without a GUI button or fresh delegation, reconciliation after an aborted confirmation response, and automatic retry of the newest revision when speech changes during a lookup.
- Sixteen paid semantic checks against the configured backend model passed: natural confirmations in multiple scripts/languages, context-limited okay, ambiguity, refusal, corrections, status questions and conditional approval.
- Production build/type checking passed before the live transport exercise.
- Three consecutive real GPT-Live / Responses calls passed using synthetic English caller audio, with one persisted appointment per requested slot, post-commit confirmation captions and positive received audio energy. No confirmation button was used.

## Live acceptance evidence - 23 October 2026

The final sequence used `node --env-file=.env.local scripts/live-booking-smoke.mjs 3` against the running local production build. Each call requested a future synthetic dermatologist slot at Clifton, received a proposal, and authorized it with spoken approval. The script retrieved the persisted record through the authenticated administrator API and checked its ID, confirmed status and exact requested slot.

| Run | Persisted reference | Matching records | Post-commit voice evidence |
| --- | --- | --- | --- |
| 1 | `AY-F5458B78D611` | 1 | Confirmed in output captions; received audio energy increased |
| 2 | `AY-EA8C90923777` | 1 | Confirmed in output captions; received audio energy increased |
| 3 | `AY-7FE3749939EF` | 1 | Confirmed in output captions; received audio energy increased |

The appointments were for 24 October 2026 at 4:30, 5:00 and 5:30 pm Pakistan time. Captions explicitly confirmed or booked the corresponding appointment after the authoritative response. The test also measured a positive increase in inbound WebRTC audio energy after that response. Raw synthetic-only event traces are in ignored `tmp/voice-tests/`; they are not normal application transcript logging.

Earlier diagnostic runs exposed test-harness weaknesses: synthetic input must keep an audio clock running between phrases, and valid paraphrases such as “it's set” must not be rejected solely for omitting “confirmed.” These runs were not counted as the final three passes. An append acknowledgement alone is never treated as proof of spoken confirmation.

These are English synthetic-audio transport tests, not a human microphone/speaker listening trial or a native-speaker pronunciation benchmark. The reference is also available in the persisted result; the test may end a call after sufficient confirmation evidence, before every closing remark finishes.

## Remaining limitations

Semantic intent classification is probabilistic. No finite phrase suite proves all interpretations safe. Transcript fragments and delayed corrections still require real-user acceptance testing. Browser-supplied context remains unsuitable as production patient identity. The demo still uses fictional records and a local PGlite database; hosted concurrency and production healthcare authorization are not validated by these tests.
