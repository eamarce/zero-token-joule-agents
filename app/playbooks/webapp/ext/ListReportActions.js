sap.ui.define(["sap/m/MessageToast"], function (MessageToast) {
	"use strict";

	// The handler `this` is the ExtensionAPI of the list report.
	return {
		/**
		 * Reads the lists, and the open playbook, again. Playbooks created or closed elsewhere (the agent,
		 * the terminal, Joule) show up when the person presses Refresh. Nothing refreshes by itself.
		 */
		refresh: function () {
			var model = this.getModel();
			var bundle = this.getModel("i18n").getResourceBundle();
			if (model.hasPendingChanges()) {
				return Promise.resolve();
			}
			model.refresh();
			this.setTabContentToBeRefreshedOnNextOpening();
			this.refreshTabsCount();
			MessageToast.show(bundle.getText("refreshedToast"));
			return Promise.resolve();
		}
	};
});
