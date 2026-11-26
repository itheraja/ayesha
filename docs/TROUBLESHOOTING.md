# Troubleshooting

| Symptom | What to check |
| --- | --- |
| Voice setup notice | Add `OPENAI_API_KEY` to `.env.local` and restart. Never put it in a `NEXT_PUBLIC_*` variable. |
| OpenAI rejects session (401/403/404) | Check project key, billing, `gpt-live-1` access and selected supported voice. There is deliberately no alternate model fallback. |
| Microphone unavailable | Use Chrome at localhost or an HTTPS origin. Check the browser's site permission and macOS Privacy & Security → Microphone. |
| Connected but silent | Click the enable-audio control if shown. Check output device and speaker toggle. A greeting append acknowledgment is not proof of audible speech. |
| Echo or self-interruption | Try headphones and reduce speaker volume. Browser echo cancellation/noise suppression are requested but depend on hardware. |
| ICE timeout / recovering state | Turn off restrictive VPNs if permitted, or try another network. Restart with an explicit new call after failure. |
| Proposed booking does not commit | Review exact details; say the operation-specific phrase or use Confirm. Ordinary yes, partial phrases, stale revisions and expired proposals cannot authorize changes. |
| Slot no longer available | Refresh and choose a different slot. The transactional guard correctly rejects conflicts. |
| Booking response lost | Inspect the admin dashboard before repeating. Confirm retries use idempotency keys; never infer failure just from a network error. |
| Invalid phone | Use synthetic international format such as `+920000000003`. Pakistani `03…` numbers are normalized. Never use a real patient's phone during tests. |
| Administrator not configured | Run `npm run setup` or set `ADMIN_PASSWORD` with at least 12 characters. Use a stable `SESSION_SECRET` of 32+ characters. Restart after changing environment settings. |
| Origin rejected | `APP_ORIGIN` must exactly match the browser origin. `localhost` and `127.0.0.1` are different. E2E tests use localhost:3100. |
| Public deployment requires sign-in | Authenticate at `/admin`; non-local paid session creation is administrator-protected. |
| PGlite file lock / corruption warning | Stop all app/CLI processes using that path. Local PGlite supports one process; use Supabase for multi-process deployment. Never run `db:setup` against the same local directory while the app is running. |
| Supabase timeout | Verify the connection URI, pooler mode, password and network reachability. Use the session pooler on IPv4-only networks. |
| Supabase TLS certificate error | Obtain the correct project CA or repair network trust. Do not disable certificate verification. |
| Relation/function missing | Apply the SQL migration or run `npm run db:setup` with a dedicated demo database owner connection. |
| Local cost seems low | Backend pricing defaults to unknown. Configure both token rates. Check unconfirmed sessions and OpenAI's billing dashboard. |
| Tests cannot launch Chrome | Install Google Chrome, or install Playwright Chromium and use `PLAYWRIGHT_CHANNEL=chromium`. |
| A test gets login rate-limited | Rate limit is persisted and global to the test database. Wait one minute before repeating many login tests. |

If a call fails, audio resources are released and the interface reports the failure. Voice closure without `session.closed` is marked unconfirmed. A persistent local-process sideband attempts to enforce the duration limit, but it cannot guarantee termination if the entire application process dies. Check provider usage after abnormal exits.
