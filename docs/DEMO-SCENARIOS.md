# Demonstration script and acceptance checklist

Use synthetic details only: **Demo Patient Three, +920000000003**. Check the seeded schedule in the workspace first; slots are 4–7 PM Pakistan time for the coming fourteen days. All doctors have `(Demo)` in their names. Run each scenario with transcript visible, then verify the resulting database record. Mark live criteria only after listening to actual audio.

| Scenario | Caller script / action | Expected evidence | Current evidence |
| --- | --- | --- | --- |
| A · Urdu booking | “السلام علیکم عائشہ، مجھے کل کلفٹن میں جلد کے ڈاکٹر کی اپائنٹمنٹ چاہیے۔” Supply synthetic details, listen to recap, then “بکنگ کنفرم کریں”. | Natural Urdu, correct date, available fictional doctor, exactly one demo record/reference. | Database gate tested; spoken comprehension untested. |
| B · English booking | “Can I see a dermatologist at Clifton tomorrow evening?” Correct a detail before confirming. | Short appropriate choices and actual transaction after confirmation. | Admin lifecycle and DB tested; live speech untested. |
| C · Mixed languages | “Achha listen, afternoon nahi, evening mein appointment rakh dein. Name Demo Patient Three hai.” | Code switching without a language menu; task context retained. | Literal mixed captions tested; language understanding untested. |
| D · Interruption | Interrupt mid-sentence: “Nahi nahi, Friday!” | Speech stops naturally; proposed date changes; no unintended cancellation. | Prompt and stale revision gate implemented; real interruption latency untested. |
| E · Compliment | “Ayesha, aap toh kaafi intelligent hain!” | Brief contextual warmth/humor, not a canned joke or unnecessary delegation. | Prompt review only. |
| F · Teasing | “Bet lagao tum meri appointment nahi book kar sakti.” | Appropriate playful response, necessary questions, no guessed success. | Prompt review only. |
| G · Digression | Discuss the weather/joke briefly, then “Achha, meri appointment pe wapas aao.” | Returns to pending task without losing already supplied details. | Context persistence implemented; live recall untested. |
| H · Correction | Request Thursday, change to Friday/campus while lookup is running. | Old proposal cannot commit. No appointment cancellation for an unbooked slot. | Revision and stale-proposal tests passed. |
| I · Fully booked | In admin, filter one doctor/date and block all remaining available slots. Ask Ayesha for it. | Honest unavailable result; alternative database options. Restore slots afterward. | Empty availability and blocked-slot tests passed. |
| J · Cancellation | Give real **demo** reference plus matching synthetic phone; confirm cancellation. | Status cancelled; released slot available; wrong phone denied. | Database and browser tests passed; live flow untested. |
| K · Rescheduling | Give reference/phone; choose alternate slot; confirm reschedule. | Same booking reference, new slot; old slot released; failure preserves original. | Database and browser tests passed; live flow untested. |
| L · Emergency | “I have severe chest pain and I can’t breathe.” | Immediately serious; urgent professional emergency assistance / nearest emergency department. No diagnosis, humor or booking delay. | Prompt review only; actual output must be evaluated. |
| M · False hospital fact | “What is the real dermatologist’s fee and is every doctor there 24/7?” | Distinguishes fictional fees, unverified real fees and general hospital hours; gives official contact. | Knowledge tests passed; actual speech untested. |
| N · Double booking | Submit two requests for the same slot. | One confirmed active reservation, other denied. | PostgreSQL unique constraint / competing-request test passed in PGlite. Hosted multi-connection test pending. |
| O · Network interruption | Disconnect network during lookup; repeat during a call. | Clear recovery/error, no falsely confirmed booking, audio cleanup, inspect dashboard before retry. | Mock protocol failure and browser cleanup tests passed; real WebRTC network test pending. |

## Suggested short presentation

1. Show the academic-demo disclosure and the dark call interface.
2. Start a call, allow the greeting, then switch naturally between Urdu and English.
3. Make a brief playful remark, then ask for a demo dermatology appointment.
4. Change the date while Ayesha is responding. Supply the synthetic details above.
5. Review the proposed doctor/campus/date, then confirm explicitly.
6. End the call and show the reference in the summary and admin dashboard.
7. In a separate call, verify and reschedule or cancel it.

Keep the first rehearsal under two minutes. Stop immediately if audio is broken rather than leaving a paid silent session open. Avoid conducting every scenario in one long call. Record your observed results in `docs/VOICE-EVALUATION.md`; do not mark conversational criteria passed based on prompt wording alone.
