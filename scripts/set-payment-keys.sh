#!/usr/bin/env bash
# Saves payment keys as Supabase secrets. Keys are typed in hidden and never written to the repo.
#
#   bash scripts/set-payment-keys.sh paystack     # Paystack secret key (sk_test_… or sk_live_…)
#   bash scripts/set-payment-keys.sh hubtel       # Hubtel API ID/key, POS Sales ID, prepaid ID, relay
set -euo pipefail
cd "$(dirname "$0")/.."
REF="${SUPABASE_REF:-jepkzvunetajsgscoelv}"
export SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(cat ~/.supabase/access-token)}"
TMP="$(mktemp)"; chmod 600 "$TMP"; trap 'rm -f "$TMP"' EXIT
ask() { local v; read -rsp "$1: " v; echo >&2; [ -n "$v" ] || { echo "Nothing entered, stopping." >&2; exit 1; }; printf '%s=%s\n' "$2" "$v" >> "$TMP"; }
askplain() { local v; read -rp "$1: " v; [ -n "$v" ] && printf '%s=%s\n' "$2" "$v" >> "$TMP" || true; }

case "${1:-}" in
  paystack)
    echo "Paystack dashboard → Settings → API Keys & Webhooks. Paste the SECRET key (input is hidden)."
    ask "Paystack secret key" PAYSTACK_SECRET_KEY
    grep -q '^PAYSTACK_SECRET_KEY=sk_\(test\|live\)_' "$TMP" || { echo "That does not look like a Paystack secret key (sk_test_… / sk_live_…)." >&2; exit 1; }
    ;;
  hubtel)
    echo "Hubtel merchant dashboard → Developers / API keys. Inputs are hidden."
    ask "Hubtel API ID (username)" HUBTEL_API_ID
    ask "Hubtel API key (password)" HUBTEL_API_KEY
    askplain "POS Sales ID (receiving money)" HUBTEL_POS_ID
    askplain "Prepaid deposit account ID (for payouts, Enter to skip)" HUBTEL_PREPAID_ID
    askplain "Relay URL, e.g. https://relay.example.com/relay (Enter to skip)" HUBTEL_RELAY_URL
    if grep -q '^HUBTEL_RELAY_URL=' "$TMP"; then ask "Relay key (the RELAY_KEY you started the relay with)" HUBTEL_RELAY_KEY; fi
    ;;
  *) echo "Usage: bash scripts/set-payment-keys.sh paystack|hubtel" >&2; exit 1 ;;
esac

# A random key protects the Hubtel callback URLs; created once.
if ! npx -y supabase@latest secrets list --project-ref "$REF" 2>/dev/null | grep -q PAY_CALLBACK_KEY; then
  printf 'PAY_CALLBACK_KEY=%s\n' "$(openssl rand -hex 24)" >> "$TMP"
fi
printf 'PUBLIC_SITE=%s\n' "https://nyamebabaku-lab.github.io/myvotehub/" >> "$TMP"
npx -y supabase@latest secrets set --env-file "$TMP" --project-ref "$REF" > /dev/null
echo "Saved. Admin app → Settings → Payments shows the connection."
if [ "$1" = paystack ]; then
  echo
  echo "Now in the Paystack dashboard → Settings → API Keys & Webhooks, set the Webhook URL to:"
  echo "  https://$REF.supabase.co/functions/v1/pay/paystack"
  echo "For automatic payouts: Settings → Preferences → turn OFF 'Confirm transfers before sending' (OTP)."
fi
