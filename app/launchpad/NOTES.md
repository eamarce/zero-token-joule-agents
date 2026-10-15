# Launchpad

Entry point: http://localhost:4004/launchpad/index.html (user alice, password alice).

It is the UI5 sandbox Fiori launchpad (UI5 1.136.20 from ui5.sap.com) with one home page group and four tiles.

| Tile | Intent | Opens |
|---|---|---|
| Agent | #Agent-display | /agent/webapp/index.html |
| Playbooks | #Playbook-manage | /playbooks/webapp/index.html |
| Calculator | #TokenSavings-display | /calculator/webapp/index.html |
| Joule | #JouleAgent-display | /joule/webapp/index.html |

Files

- index.html: sandbox bootstrap, no inline script.
- flp-config.js: window['sap-ushell-config'] with the group, the tiles and the app targets. To add an app, add one entry to the `apps` array.
- strip.js: when status() says the model is `simulated` (no API key), shows a blue message strip fixed at the bottom of the home page: token counts are estimates, add a key to `.env` and restart to try a live model. Dismissible for the browser session (sessionStorage). It never takes a key; the shell header is fixed, so the strip floats instead of taking layout space. It disappears on its own once a key is set and the server restarted.
- theme.js: sets the UI5 theme before the core loads, sap_fiori_3 or sap_fiori_3_dark by system preference, and follows later changes.

How it works, and what to know

- The apps are applicationType "URL" with additionalInformation "managed=FioriWave1". That value makes the shell open them in an iframe inside the shell. Without it the sandbox opens URL apps in a new browser window.
- The sandbox merges its own sample content over the page config. The group and catalog in flp-config.js are therefore pinned with getters, so the sample tiles do not appear.
- Content density is chosen by the shell: compact with mouse and keyboard, cozy on touch.
- The shell theme is not passed into the iframes. Each app chooses its own theme.
- The sandbox always shows the SAP logo, the label "Home" in the header, and "My Home" as the title of the first group. They cannot be changed by configuration.
- The browser console shows noise from the sandbox: a 404 for /appconfig/fioriSandboxConfig.json, "Event Listener 'init' must not have a return value", and an endsWith error in sap/ushell/services/AppLifeCycle.js when a URL app opens. None of them affect the page.
