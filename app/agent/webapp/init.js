/* Bootstrap helper, loaded before sap-ui-core.js. The HTML has no inline script; this file does that job.
   - Theme: Quartz (sap_fiori_3), dark variant when the system prefers dark.
   - Content density: sapUiSizeCompact for mouse and keyboard, sapUiSizeCozy on touch devices. Set once, never mixed. */
(function () {
  "use strict";
  var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  window["sap-ui-config"] = Object.assign(window["sap-ui-config"] || {}, {
    theme: dark ? "sap_fiori_3_dark" : "sap_fiori_3",
    "xx-componentPreload": "off",
    flexibilityServices: JSON.stringify([{ connector: "SessionStorageConnector" }])
  });

  var touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  document.addEventListener("DOMContentLoaded", function () {
    document.body.classList.add(touch ? "sapUiSizeCozy" : "sapUiSizeCompact");
  });
})();
