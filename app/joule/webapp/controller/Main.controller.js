sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/ui/core/format/NumberFormat",
    "sap/ui/core/format/DateFormat",
    "../model/A2AClient",
    "../model/AgentCard",
  ],
  function (Controller, MessageBox, NumberFormat, DateFormat, A2AClient, AgentCard) {
    "use strict";

    const STATE_TYPE = { completed: "Success", failed: "Error", working: "Warning", submitted: "Information" };

    return Controller.extend("zt.joule.controller.Main", {
      onInit() {
        this._config = this.getOwnerComponent().getManifestEntry("/sap.ui5/config");
        this._appModel = this.getOwnerComponent().getModel("app");
        this._cardModel = this.getOwnerComponent().getModel("card");
        this.loadCard();
      },

      _text(key, args) {
        return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(key, args);
      },

      _hasText(key) {
        return this.getOwnerComponent().getModel("i18n").getResourceBundle().hasText(key);
      },

      // ------------------------------------------------------------------ agent card
      async loadCard() {
        this._appModel.setProperty("/cardBusy", true);
        this._appModel.setProperty("/cardError", "");
        try {
          const card = await A2AClient.getCard(this._config.cardPath);
          const bundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
          this._cardModel.setData(AgentCard.toViewData(card, bundle));
        } catch (e) {
          this._appModel.setProperty("/cardError", this._text("cardLoadError", [e.message]));
        } finally {
          this._appModel.setProperty("/cardBusy", false);
        }
      },

      onReloadCard() {
        this.loadCard();
      },

      // ------------------------------------------------------------------ request
      onExample(event) {
        this._appModel.setProperty("/request/text", event.getSource().getText());
        this.byId("requestInput").focus();
      },

      async onSend() {
        const text = (this._appModel.getProperty("/request/text") || "").trim();
        if (!text) {
          this._appModel.setProperty("/error", this._text("requestEmpty"));
          return;
        }
        const request = A2AClient.buildMessageSend(text);
        this._appModel.setProperty("/sending", true);
        this._appModel.setProperty("/error", "");
        try {
          const res = await A2AClient.post(this._config.a2aPath, request);
          this._showResponse(request, res);
        } catch (e) {
          MessageBox.error(this._text("sendErrorText", [e.message]), { title: this._text("sendErrorTitle") });
        } finally {
          this._appModel.setProperty("/sending", false);
        }
      },

      // ------------------------------------------------------------------ response
      _showResponse(request, res) {
        const body = res.json;
        const response = {
          stateText: "",
          stateType: "None",
          taskId: "",
          contextId: "",
          time: "",
          answer: "",
          dataRows: [],
          rawRequest: JSON.stringify(request, null, 2),
          rawResponse: body ? JSON.stringify(body, null, 2) : res.text,
        };
        let error = "";
        if (body && body.error) {
          error = this._text("rpcErrorText", [body.error.code, body.error.message]);
        } else if (!res.ok) {
          error = this._text("httpErrorText", [res.status]);
        } else if (!body || !body.result) {
          error = this._text("noResultText");
        } else {
          this._parseTask(body.result, response);
        }
        this._appModel.setProperty("/response", response);
        this._appModel.setProperty("/hasResponse", true);
        this._appModel.setProperty("/error", error);
      },

      /** Reads what the Joule function reads (status.message.parts[0].text) plus the data artifact. */
      _parseTask(task, response) {
        const state = task.status && task.status.state;
        response.stateText = this._hasText("state." + state) ? this._text("state." + state) : String(state || "");
        response.stateType = STATE_TYPE[state] || "None";
        response.taskId = task.id || "";
        response.contextId = task.contextId || "";
        const stamp = task.status && task.status.timestamp;
        response.time = stamp ? DateFormat.getDateTimeInstance({ style: "medium" }).format(new Date(stamp)) : "";
        const parts = (task.status && task.status.message && task.status.message.parts) || [];
        response.answer = parts[0] && parts[0].text ? parts[0].text : "";
        const dataPart = ((task.artifacts && task.artifacts[0] && task.artifacts[0].parts) || []).find((p) => p.kind === "data");
        response.dataRows = dataPart ? this._dataRows(dataPart.data) : [];
      },

      /** One row per field of the data artifact, with a label from i18n. */
      _dataRows(data) {
        const integer = NumberFormat.getIntegerInstance({ groupingEnabled: true });
        const rows = [];
        Object.entries(data || {}).forEach(([key, value]) => {
          if (value === null || value === undefined || key === "rows" || key === "summary") {
            return;
          }
          let text;
          if (key === "runType") {
            text = this._hasText("runType." + value) ? this._text("runType." + value) : String(value);
          } else if (Array.isArray(value)) {
            text = value.join("\n");
          } else if (typeof value === "boolean") {
            text = this._text(value ? "yes" : "no");
          } else if (typeof value === "number") {
            text = integer.format(value);
          } else if (typeof value === "object") {
            text = JSON.stringify(value);
          } else {
            text = String(value);
          }
          if (text === "") {
            return;
          }
          rows.push({ label: this._hasText("data." + key) ? this._text("data." + key) : key, text });
        });
        return rows;
      },
    });
  }
);
