sap.ui.define(
	["sap/ui/core/UIComponent", "sap/ui/Device", "sap/ui/core/Theming", "./model/models"],
	function (UIComponent, Device, Theming, models) {
		"use strict";

		var LIGHT = "sap_fiori_3";
		var DARK = "sap_fiori_3_dark";

		return UIComponent.extend("zt.calculator.Component", {
			metadata: {
				manifest: "json",
				interfaces: ["sap.ui.core.IAsyncContentCreation"]
			},

			init: function () {
				UIComponent.prototype.init.apply(this, arguments);
				this.setModel(models.createUiModel(), "ui");

				// Content density is set once for the whole app: compact for mouse and keyboard, cozy for touch.
				document.body.classList.add(Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact");

				// Quartz theme follows the system setting, also while the app is open.
				if (window.matchMedia) {
					window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (event) {
						Theming.setTheme(event.matches ? DARK : LIGHT);
					});
				}
			}
		});
	}
);
