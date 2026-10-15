sap.ui.define(["sap/ui/model/json/JSONModel", "sap/ui/Device"], function (JSONModel, Device) {
  "use strict";

  return {
    createDeviceModel() {
      const model = new JSONModel(Device);
      model.setDefaultBindingMode("OneWay");
      return model;
    },

    /** Page state: busy flags, the request being typed and the last response. */
    createAppModel() {
      return new JSONModel({
        cardBusy: false,
        cardError: "",
        sending: false,
        request: { text: "Process the next supplier email" },
        hasResponse: false,
        error: "",
        response: { stateText: "", stateType: "None", taskId: "", contextId: "", time: "", answer: "", dataRows: [], rawRequest: "", rawResponse: "" },
      });
    },

    /** The agent card, flattened for the form. Empty until the card is loaded. */
    createCardModel() {
      return new JSONModel({ name: "", description: "", version: "", url: "", protocolVersion: "", transport: "", streaming: "", push: "", inputModes: "", outputModes: "", scheme: "", schemeType: "", schemeDescription: "", scopes: "", skills: [], examples: [], raw: "" });
    },
  };
});
