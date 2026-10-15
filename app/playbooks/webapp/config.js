/* Runs before the UI5 bootstrap: picks the Quartz theme that matches the system setting.
   The URL parameter sap-theme (for example ?sap-theme=sap_fiori_3_dark) overrides it. */
(function () {
	"use strict";
	var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
	window["sap-ui-config"] = { theme: dark ? "sap_fiori_3_dark" : "sap_fiori_3" };
})();
