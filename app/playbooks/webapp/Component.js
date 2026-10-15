sap.ui.define(["sap/fe/core/AppComponent", "sap/ui/Device", "sap/ui/core/Theming"], function (AppComponent, Device, Theming) {
	"use strict";

	var LIGHT = "sap_fiori_3";
	var DARK = "sap_fiori_3_dark";

	return AppComponent.extend("zt.playbooks.Component", {
		metadata: {
			manifest: "json"
		},

		onServicesStarted: function () {
			// Opened by its own URL there is no shell and no app state service to store the selected
			// section in, so Fiori elements must not try. Inside a launchpad the capability stays on.
			var capabilities = this.getEnvironmentCapabilities();
			var inShell = capabilities && typeof capabilities.getCapabilities === "function" && capabilities.getCapabilities().UShell;
			if (!inShell && capabilities && typeof capabilities.setCapability === "function") {
				capabilities.setCapability("AppState", false);
			}
			return AppComponent.prototype.onServicesStarted.apply(this, arguments);
		},

		init: function () {
			AppComponent.prototype.init.apply(this, arguments);

			// Content density is set once for the whole app: compact for mouse and keyboard, cozy for touch.
			document.body.classList.add(Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact");

			// Quartz follows the system setting, also while the app is open.
			if (window.matchMedia) {
				window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (event) {
					Theming.setTheme(event.matches ? DARK : LIGHT);
				});
			}
		}
	});
});
