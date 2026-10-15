sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/Device", "sap/ui/core/Theming", "./model/models"], function (UIComponent, Device, Theming, models) {
  "use strict";

  return UIComponent.extend("zt.joule.Component", {
    metadata: {
      manifest: "json",
      interfaces: ["sap.ui.core.IAsyncContentCreation"],
    },

    init() {
      UIComponent.prototype.init.apply(this, arguments);
      this.setModel(models.createDeviceModel(), "device");
      this.setModel(models.createAppModel(), "app");
      this.setModel(models.createCardModel(), "card");
      // Content density is set once for the whole app, on the body, so dialogs and message boxes follow it.
      document.body.classList.add(this.getContentDensityClass());
      this._followColorScheme();
    },

    /** Touch devices get cozy, mouse and keyboard devices get compact. Never mixed. */
    getContentDensityClass() {
      if (!this._densityClass) {
        this._densityClass = Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
      }
      return this._densityClass;
    },

    /** Quartz light, or Quartz dark when the system prefers dark. */
    _followColorScheme() {
      if (!window.matchMedia) {
        return;
      }
      const query = window.matchMedia("(prefers-color-scheme: dark)");
      this._onSchemeChange = (e) => Theming.setTheme(e.matches ? "sap_fiori_3_dark" : "sap_fiori_3");
      query.addEventListener("change", this._onSchemeChange);
      this._schemeQuery = query;
    },

    exit() {
      if (this._schemeQuery) {
        this._schemeQuery.removeEventListener("change", this._onSchemeChange);
      }
    },
  });
});
