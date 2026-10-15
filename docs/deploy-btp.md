# Deploy to SAP BTP, Cloud Foundry

A demo deployment: one CAP app with SQLite in memory, an approuter for browser login, XSUAA, and a destination service instance for Joule. A restart or a redeploy starts from an empty history and an unread mailbox. That is acceptable for a demo and wrong for anything else.

## What you need

- A BTP subaccount with Cloud Foundry enabled, and the Space Developer role in a space
- Entitlements: Authorization and Trust Management (`xsuaa`, plan `application`), Destination (`destination`, plan `lite`), and about 768 MB of Cloud Foundry runtime memory
- Locally: the `cf` CLI with the MultiApps plugin (`cf install-plugin multiapps`), the Cloud MTA Build Tool (`npm i -g mbt`), Node 22 or newer

## Build and deploy

```bash
cf login -a <api-endpoint>
cf target -o <org> -s <space>

mbt build -p=cf
cf deploy mta_archives/zero-token-joule-agents_0.2.0.mtar
```

That runs the simulated model. To use a real model, put the key in a git-ignored extension and pass it to `cf deploy` only:

```bash
cp deploy/cf/zt.mtaext.template deploy/cf/zt.mtaext
$EDITOR deploy/cf/zt.mtaext          # one provider and its key
cf deploy mta_archives/zero-token-joule-agents_0.2.0.mtar -e deploy/cf/zt.mtaext
```

Never pass the extension to `mbt build`: the key would end up inside the `.mtar`.

`cf deploy` creates `zt-xsuaa` and `zt-destination` and starts two apps:

| App | What | Route |
|---|---|---|
| `zt-srv` | the CAP app: agent, OData, A2A, cockpit files | yes; Joule calls this one |
| `zt-router` | approuter with XSUAA login for browsers | yes; people open this one |

## Give people their roles

BTP cockpit, Security, Role Collections:

- `Zero-token Agent Approver`: run the agent and sign playbooks. Assign it to the people who review.
- `Zero-token Agent Operator`: run the agent only.

## Check it

```bash
cf apps
curl -s https://<zt-srv route>/health
curl -s https://<zt-srv route>/.well-known/agent.json
```

Open `https://<zt-router route>`. After the login it opens the cockpit. Process a few emails, sign when asked, and check the ratio.

## Notes

- `ZT_ALLOW_RESET=true` is set in `mta.yaml` so the cockpit's Reset button works on a demo deployment. Remove it for anything you want to keep.
- `ZT_PROFILE=demo` keeps the small thresholds. Set `talk` in `mta.yaml` for the talk's numbers.
- The CAP app runs from source (`npm start`), not from a `cds build` output, because the agent reads `data/`, `config/` and `schema/` at runtime.
- Next: [deploy-joule.md](deploy-joule.md).
