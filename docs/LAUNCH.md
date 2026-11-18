# MyVoteHub launch checklist

Work top to bottom. ✅ = done, ⬜ = to do.

## Accounts & access
- ✅ Super Admin claimed (reserved email)
- ✅ Every new account waits for approval; admins can approve, suspend, deactivate, delete
- ✅ Password help: admins can set a temporary password (Admin → Accounts → key icon); users must change it at sign-in
- ⬜ **Email reset codes** — create a free Brevo account, verify a sender email, then run
  `SMTP_USER=… SENDER=… bash scripts/setup-email.sh` (the SMTP key is typed in, never saved).
  Until then Supabase's built-in mailer only reaches your own team's addresses (2 emails/hour).
- ⬜ Add at least one more admin (Admin app → Request admin access → approve) so you're never locked out

## Money (blocking for paid events)
- ⬜ Hubtel merchant account + API keys; ask Hubtel whether Online Checkout / Send Money need IP whitelisting
- ⬜ Connect Hubtel checkout, payment callback and payouts (next build step)
- ⬜ Turn **test mode off** (Admin → Settings) and **clear test data**

## USSD
- ⬜ Choose a provider (Hubtel recommended: same account as payments) and get a shared code, e.g. `*713*44#`
- ⬜ Set the code in Admin → USSD voting, give the provider the callback URL with the secret key
  (`supabase/functions/.env`), then test with a real phone
- ⬜ Review the USSD wording (Admin → USSD voting → Menu editor)

## SMS
- ⬜ Choose an SMS provider (Hubtel SMS or mNotify) and a sender ID (e.g. "MyVoteHub", approval takes a few days)

## Hosting
- ⬜ **Own Supabase project on Pro ($25/month).** MyVoteHub currently shares a free project with four other apps;
  free projects pause after a week without activity and have 500 MB of database. To move:
  1. Upgrade the organisation billing, create a project "myvotehub" (EU West), note its reference id
  2. `NEW_REF=<id> bash scripts/new-project.sh` (schema, functions, USSD gateway, GitHub settings)
  3. Copy accounts and data (ask Claude: copies `auth.users` for MyVoteHub profiles and every public table in order)
  4. `SUPABASE_REF=<id> … bash scripts/setup-email.sh`, update the USSD provider URL, push to rebuild the apps
- ⬜ Optional: own domain (e.g. myvotehub.com) instead of github.io

## Legal & store
- ✅ Privacy policy (/#/privacy) and terms (/#/terms) — **have a lawyer review them**
- ⬜ Register the business name; Data Protection Commission registration (Act 843)
- ⬜ Google Play: developer account, listing (screenshots, description), upload `MyVoteHub.aab` / `MyVoteHub-Admin.aab`
  from the latest GitHub release (the Admin app can stay unlisted/internal)
- ⬜ Keep `/home/BrandsME/projects/myvotehub-signing` backed up (needed for every app update)

## Marketing
- ✅ QR flyers for organisers and voters (`/home/BrandsME/projects/myvotehub-marketing`)
- ⬜ Short link: `myvotehub.github.io` (GitHub organisation "myvotehub")

## Day-one checks
- ⬜ Create a real event end to end on a phone: sign up → approval → build event → admin approves → open voting
- ⬜ Vote by web, app and USSD; check the organiser dashboard, nominee dashboard and big-screen reveal
- ⬜ Request a withdrawal and pay it out
