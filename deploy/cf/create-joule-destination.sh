#!/usr/bin/env bash
# Create the BTP subaccount destination that Joule uses to reach the agent over A2A.
# Run after `cf deploy`, logged in (`cf target`) to the same org and space.
#
#   ./deploy/cf/create-joule-destination.sh [destination-name]
#
# What it does:
#   1. finds the route of the CAP app (zt-srv); Joule calls CAP directly, not the approuter
#   2. creates a service key on zt-xsuaa: its client credentials carry the AgentCaller
#      scope (xs-security.json "authorities"), so Joule may call /a2a
#   3. creates a service key on zt-destination and uses it to write the destination
#      through the Destination service REST API
# It prints no secrets. Prefer the cockpit? docs/deploy-joule.md lists the same fields.
set -euo pipefail

DEST_NAME="${1:-ZT_A2A}"
APP="${ZT_APP:-zt-srv}"
XSUAA="${ZT_XSUAA:-zt-xsuaa}"
DEST_SERVICE="${ZT_DEST_SERVICE:-zt-destination}"

for cmd in cf curl node; do command -v "$cmd" >/dev/null || { echo "missing: $cmd" >&2; exit 1; }; done

key_json() { # service-instance key-name -> credentials JSON on stdout
  cf service-key "$1" "$2" >/dev/null 2>&1 || cf create-service-key "$1" "$2" >/dev/null
  cf service-key "$1" "$2" | sed -n '/{/,$p'
}
field() { # json-path -> value, reads JSON from stdin
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const c=j.credentials??j;const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],c);process.stdout.write(String(v??""))})' "$1"
}

GUID="$(cf app "$APP" --guid)"
ROUTE="$(cf curl "/v3/apps/${GUID}/routes" | field 'resources.0.url')"
[[ -n "$ROUTE" ]] || { echo "no route for $APP" >&2; exit 1; }
AGENT_URL="https://${ROUTE}"
echo "agent:       ${AGENT_URL}"
echo "destination: ${DEST_NAME}"

XS="$(key_json "$XSUAA" zt-joule-a2a-key)"
CLIENT_ID="$(field clientid <<<"$XS")"
CLIENT_SECRET="$(field clientsecret <<<"$XS")"
TOKEN_URL="$(field url <<<"$XS")/oauth/token"

DS="$(key_json "$DEST_SERVICE" zt-destination-key)"
DS_URI="$(field uri <<<"$DS")"
DS_TOKEN="$(curl -sf -X POST "$(field url <<<"$DS")/oauth/token" \
  -d grant_type=client_credentials --data-urlencode "client_id=$(field clientid <<<"$DS")" --data-urlencode "client_secret=$(field clientsecret <<<"$DS")" | field access_token)"
[[ -n "$DS_TOKEN" ]] || { echo "could not get a Destination service token" >&2; exit 1; }

PAYLOAD="$(DEST_NAME="$DEST_NAME" AGENT_URL="$AGENT_URL" CLIENT_ID="$CLIENT_ID" CLIENT_SECRET="$CLIENT_SECRET" TOKEN_URL="$TOKEN_URL" node -e '
const e = process.env;
process.stdout.write(JSON.stringify({
  Name: e.DEST_NAME, Type: "HTTP", URL: e.AGENT_URL, ProxyType: "Internet",
  Authentication: "OAuth2ClientCredentials", clientId: e.CLIENT_ID, clientSecret: e.CLIENT_SECRET, tokenServiceURL: e.TOKEN_URL,
  Description: "A2A endpoint of the zero-token order email agent"
}))')"

API="${DS_URI}/destination-configuration/v1/subaccountDestinations"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API" -H "Authorization: Bearer ${DS_TOKEN}" -H 'Content-Type: application/json' -d "$PAYLOAD")"
if [[ "$CODE" == "409" ]]; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$API" -H "Authorization: Bearer ${DS_TOKEN}" -H 'Content-Type: application/json' -d "$PAYLOAD")"
fi
[[ "$CODE" =~ ^2 ]] || { echo "Destination service answered HTTP ${CODE}" >&2; exit 1; }
echo "done: destination ${DEST_NAME} -> ${AGENT_URL} (OAuth2 client credentials of ${XSUAA})"
echo "check: curl -s ${AGENT_URL}/.well-known/agent.json"
