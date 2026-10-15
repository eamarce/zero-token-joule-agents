/* Message strip above the launchpad when the agent runs on the simulated model (no API key).
   Reads the same status() function the cockpit and ctl use. No key is ever typed or stored here:
   the person puts it in .env and restarts the server. */
(function () {
  'use strict';

  var TEXT = {
    simulated:
      'Simulated model: no API key found, so token counts are estimates. ' +
      'To try a live model, add an Anthropic, OpenAI or Google (Gemini) key to .env and restart the server.',
  };
  var DISMISSED = 'zt.modelStrip.dismissed';

  function stored(read, value) {
    try {
      if (read) return window.sessionStorage.getItem(DISMISSED);
      window.sessionStorage.setItem(DISMISSED, value);
    } catch (e) { /* storage blocked: the strip just shows again next time */ }
    return null;
  }

  function onHome() {
    var hash = window.location.hash.replace(/^#/, '');
    return hash === '' || hash === 'Shell-home' || hash.indexOf('Shell-home') === 0;
  }

  function isSimulated() {
    return fetch('/odata/v4/agent/status()', { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) { return body ? JSON.parse(body.value).model.provider === 'simulated' : false; })
      .catch(function () { return false; });
  }

  sap.ui.require(['sap/m/MessageStrip'], function (MessageStrip) {
    var holder = document.getElementById('model-strip');
    if (!holder || stored(true) === '1') return;

    isSimulated().then(function (simulated) {
      if (!simulated) return;

      var strip = new MessageStrip({
        text: TEXT.simulated,
        type: 'Information',
        showIcon: true,
        showCloseButton: true,
        close: function () { stored(false, '1'); holder.hidden = true; },
      });
      strip.placeAt(holder);

      function sync() { holder.hidden = !onHome() || stored(true) === '1'; }
      window.addEventListener('hashchange', sync);
      sync();
    });
  });
})();
