#!/usr/bin/env bash
# Connects MyVoteHub's Supabase project to Brevo (free: 300 emails/day) so password-reset codes reach users,
# and puts the 6-digit code in the reset email (the link stays for apps that use it).
#
#   SMTP_USER=xxxx@smtp-brevo.com SENDER=you@example.com bash scripts/setup-email.sh
#
# The SMTP key is typed in (hidden) and sent straight to Supabase; it is never saved in this project.
set -euo pipefail
REF="${SUPABASE_REF:-jepkzvunetajsgscoelv}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-$(cat ~/.supabase/access-token)}"
: "${SMTP_USER:?Set SMTP_USER to your Brevo SMTP login (Settings → SMTP & API)}"
: "${SENDER:?Set SENDER to the verified sender email in Brevo}"
read -r -s -p "Brevo SMTP key (hidden): " SMTP_PASS; echo
python3 - "$SMTP_USER" "$SENDER" "$SMTP_PASS" > /tmp/mvh-smtp.json <<'PY'
import json, sys
user, sender, key = sys.argv[1:4]
html = """<h2>Reset your password</h2>
<p>We received a request to reset your password.</p>
<p>Your reset code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Enter it in the app within 1 hour. Or follow this link to choose a new password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>"""
print(json.dumps({
  "smtp_host": "smtp-relay.brevo.com", "smtp_port": "587", "smtp_user": user, "smtp_pass": key,
  "smtp_admin_email": sender, "smtp_sender_name": "MyVoteHub", "smtp_max_frequency": 30,
  "rate_limit_email_sent": 100,
  "mailer_subjects_recovery": "Your MyVoteHub reset code", "mailer_templates_recovery_content": html,
}))
PY
trap 'rm -f /tmp/mvh-smtp.json' EXIT
curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/$REF/config/auth" --data @/tmp/mvh-smtp.json > /dev/null
echo "Done: reset emails now go through Brevo from $SENDER. Test it with 'Forgot your password?' on the sign-in page."
