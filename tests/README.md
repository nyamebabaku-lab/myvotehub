# Tests

- `node tests/db/rls.test.mjs` — security rules and account/money functions (PGlite, all migrations).
- `node tests/db/ussd.test.mjs` — USSD menu engine and nominee dashboard (PGlite).
- `node tests/db/ussd-config.test.mjs` — editable USSD wording/options, organiser bundles/greeting, featured/hidden events.
- `tests/live/ussd-live.mjs` and `tests/live/ussd-config-live.mjs` — live check against the real Supabase project and a local `VITE_APP=main vite preview --port 4176`
  (needs playwright-core and Chromium; uses `~/.supabase/access-token`). Run `tests/live/cleanup.mjs` afterwards:
  it deletes only E2E / e2e-* test records.
