# Call the agent from SAP Joule

The agent is a pro-code agent that Joule reaches over A2A. That is one of the two ways SAP's [reference architecture for agentic AI](https://architecture.learning.sap.com/docs/ref-arch/ca1d2a3e) describes: the agent exposes an A2A endpoint, and in Joule a scenario with a dialog function using the `agent-request` action points at it through a BTP destination. Joule sends A2A 0.3 `message/send`.

What has been tested from this repository: the A2A endpoint (the end-to-end test calls it as Joule does), `joule lint` and `joule compile` on the capability with `@sap/joule-studio-cli` 2.0.4. What has not: deploying this capability to a Joule tenant. The steps below follow the CLI's documentation and my notes from setting up another prototype. Check them against the documentation for your CLI version.

## What you need

- The app deployed to Cloud Foundry ([deploy-btp.md](deploy-btp.md))
- A Joule tenant with Joule Studio, and a user who may deploy capabilities (in the setup I used, the roles were `capability_admin` and `extensibility_developer`)
- `npm install -g @sap/joule-studio-cli` (Node 22 to 24)

## 1. The destination

Joule calls the CAP app (`zt-srv`) directly, authenticated with client credentials of `zt-xsuaa`. Those carry the `AgentCaller` scope, because `xs-security.json` lists it under `authorities`.

With the script, logged in to the same org and space:

```bash
./deploy/cf/create-joule-destination.sh            # creates destination ZT_A2A; prints no secrets
```

Or by hand in the BTP cockpit, Connectivity, Destinations, after creating a service key on `zt-xsuaa`:

| Field | Value |
|---|---|
| Name | `ZT_A2A` |
| Type | HTTP |
| URL | `https://<zt-srv route>` |
| Proxy type | Internet |
| Authentication | OAuth2ClientCredentials |
| Client ID, Client Secret | from the `zt-xsuaa` service key (`clientid`, `clientsecret`) |
| Token Service URL | the key's `url` + `/oauth/token` |

If you use another name, change `destination:` in `joule/zt_capability/capability.sapdas.yaml`.

## 2. The capability

```
joule/
  da.sapdas.yaml                          a test assistant that contains only this capability
  zt_capability/
    capability.sapdas.yaml                namespace joule.ext, system alias -> destination ZT_A2A
    capability_context.yaml               keeps the A2A contextId across turns
    functions/call_agent.yaml             status-update, agent-request (remote), message
    scenarios/process_supplier_email.yaml when Joule should use it, with example utterances
```

The function shows `result.body.status.message.parts[0].text`, which is the first text part of the agent's A2A answer.

Check it locally first:

```bash
cd joule
joule lint .
```

## 3a. Deploy to a test assistant

```bash
joule login              # prompts for your Joule tenant's login details
cd joule
joule deploy ./da.sapdas.yaml --compile -n zt_order_email_agent
joule launch zt_order_email_agent
```

In the web client that opens, try "Process the next supplier email" or "What is the run ratio of the order email agent?". If `joule login` fails while resolving the tenant, the flow I used needed `joule login --no-app-tid` (CLI 2.0.2).

## 3b. Add it to your main Joule assistant

Once it works in the test assistant, add the capability to the assistant your users already have. In the setup I used, that assistant was named `sap_digital_assistant`; `joule list` shows yours.

```bash
cd joule
joule update <your-assistant> --capability-file zt_capability/capability.sapdas.yaml
```

## 3c. Joule Work CLI (`jl`)

Version 2 of the CLI also installs `jl`, which manages solutions made of assets (agents, MCP servers) and deploys them to the Joule Studio runtime, and can send A2A messages. I have not used it with this repository. See SAP's [CLI reference for pro-code development in Joule Studio](https://help.sap.com/docs/joule-studio/joule-studio/joule-studio-for-cli-pro-code-development-in-joule-studio).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Joule says it cannot reach the system | destination name in `capability.sapdas.yaml` differs from the one in the subaccount, or the URL points at the approuter instead of `zt-srv` |
| 401 from `/a2a` | the destination has no token service, or the client credentials are from another XSUAA instance |
| 403 from `/a2a` | the token lacks `AgentCaller`: `authorities` in `xs-security.json` must include it, and the service instance needs an update after a change (`cf update-service zt-xsuaa -c xs-security.json`) |
| Joule times out | a real model on a slow call. Joule gives an agent-request about 60 seconds. One email takes a few model calls; the simulated model answers at once |
| The answer is empty | the function reads `status.message.parts[0].text`; test the endpoint directly (below) |

Test the endpoint the way Joule calls it:

```bash
TOKEN=$(curl -s -u "<clientid>:<clientsecret>" "<xsuaa url>/oauth/token" -d grant_type=client_credentials | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
curl -s https://<zt-srv route>/a2a -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"role":"user","kind":"message","messageId":"t1","parts":[{"kind":"text","text":"What is the run ratio?"}]}}}'
```
