# Voice evaluation

A real API connectivity smoke test passed. The user then reported low Urdu pronunciation/accent quality. No voice has been declared best-performing or authentically Pakistani.

The first pronunciation revision adds Urdu-script greeting and speaking examples, explicit Pakistani Urdu accent instructions, and Urdu-script backend responses. The selected voice is unchanged so the prompt revision can be compared on its own. This revision still needs a human listening check.

## Configuration

`LIVE_VOICE=gleam` is the provisional default because current OpenAI documentation identifies it as a feminine natural voice. It is not an Urdu quality claim. Compare `gleam`, `marin`, and `nira` if they are available to your project. Nira is documented with Hindi as its language; that does not establish Urdu pronunciation quality. Change the environment setting and start a **new** session; voice cannot change mid-session.

Current documentation supports custom voices generated from a text description. No voice was created here. An optional original description for a later authorized experiment:

> A warm adult feminine receptionist voice, calm and clear, with relaxed conversational pacing. Comfortable speaking everyday Pakistani Urdu, English and natural code switching. Gentle expressiveness, friendly confidence and precise pronunciation, with restrained humor. Do not imitate any identifiable person.

If you create a supported voice in OpenAI's voice tooling, put its ID in `LIVE_CUSTOM_VOICE_ID`. The description is an experimental target, not a guaranteed accent. No cloning of any real person's voice is involved.

## Fixed listening set

1. “Assalamualaikum, main Ayesha hoon, aap ki AI receptionist. Yeh ek academic demo hai.”
2. “Clifton campus mein Friday ko shaam paanch bajay ka demo slot available hai.”
3. “Of course. Would you prefer Clifton or North Nazimabad?”
4. “Achha ji, Thursday nahi, Friday. Main nayi availability check karti hoon.”
5. “Haha, challenge accepted—pehle aapki preferred timing toh jaan loon.”
6. “I’m sorry you’re feeling this way. Please seek urgent professional medical help now.”

Have a fluent Urdu speaker score pronunciation, intelligibility, pacing, warmth, language transitions and consistency from 1–5. Check whether laughter sounds forced, whether names are intelligible, and whether a serious topic promptly changes tone. Listen on the MacBook speakers and with headphones.

## Measurement sheet

| Voice | Urdu / 5 | English / 5 | Mixed / 5 | Warmth / 5 | Interrupt recovery | Connection latency | Backend latency | Approx cost | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gleam | Not tested | Not tested | Not tested | Not tested | Not tested | — | — | $0 spent here | Provisional default |
| marin | Not tested | Not tested | Not tested | Not tested | Not tested | — | — | $0 spent here | Candidate |
| nira | Not tested | Not tested | Not tested | Not tested | Not tested | — | — | $0 spent here | Check project support |

Start with 45–60 seconds per candidate, approximately $0.05 of voice time each, plus backend use. Do not generate appointments during the initial listening comparison. Then evaluate the best candidate with scenarios A–O. Actual results, not the default setting, determine the winner.

## Conversational personality revision

Ayesha now explicitly welcomes sustained everyday conversation, witty teasing, compliments and innocent flirting without forced booking redirects. Her opening remains transparent about AI and the demo, with no repeated disclosure during ordinary conversation. Sensitive healthcare topics and distress trigger a calm, empathetic tone. These are prompt changes, not verified voice-performance results.

Listen for these acceptance behaviors in a new session:

- Continue at least six caller-led casual turns without an unsolicited booking pitch or canned joke.
- Respond warmly to “Aap toh bari charming hain” and a playful comeback without claiming feelings, a body or a relationship.
- Switch naturally between Urdu and English and vary delivery without forced laughter.
- Stop teasing immediately when the caller becomes distressed.
- Resume a pending booking after a digression, preserving its details and requiring explicit confirmation.

The existing maximum call duration still applies; there is no separate small-talk turn limit.
