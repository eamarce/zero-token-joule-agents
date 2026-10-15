sap.ui.define(
  [
    "sap/ui/core/mvc/ControllerExtension",
    "sap/ui/core/Fragment",
    "sap/ui/core/EventBus",
    "sap/ui/model/json/JSONModel",
    "sap/f/DynamicPageHeader",
    "sap/m/MessageToast",
    "sap/ui/core/format/NumberFormat"
  ],
  function (ControllerExtension, Fragment, EventBus, JSONModel, DynamicPageHeader, MessageToast, NumberFormat) {
    "use strict";

    var TYPE_STATE = { 1: "Success", 2: "Warning", 3: "Information" };

    return ControllerExtension.extend("zt.agent.ext.controller.ListReportExt", {
      override: {
        onInit: function () {
          this._ratioModel = new JSONModel({ ratio: "", subtitle: "", types: [], allTokensText: "0", proposalTokensText: "0", wrongServed: "0", wrongColor: "Neutral" });
          EventBus.getInstance().subscribe("zt.agent", "changed", this.loadRatio, this);
        },
        onExit: function () {
          EventBus.getInstance().unsubscribe("zt.agent", "changed", this.loadRatio, this);
        },
        routing: {
          onAfterBinding: function () {
            this.addRatioHeader();
            this.loadRatio();
          }
        }
      },

      /**
       * The list report hides its header when there is no filter bar (a worklist needs none).
       * The header of the DynamicPage is the standard place for KPI-like content, so the ratio
       * area goes there, as a collapsible, pinnable header.
       */
      addRatioHeader: function () {
        var oView = this.base.getView();
        var oPage = oView.getContent()[0];
        if (this._headerAdded || !oPage || !oPage.setHeader || oPage.getHeader()) {
          return;
        }
        this._headerAdded = true;
        Fragment.load({ id: oView.createId("ratio"), name: "zt.agent.ext.fragment.Ratio", controller: this }).then(function (oArea) {
          oArea.setModel(this._ratioModel, "ratio");
          oPage.setHeader(new DynamicPageHeader({ pinnable: true, content: [oArea] }));
          oPage.setHeaderExpanded(true);
        }.bind(this));
      },

      /**
       * The ratio is read when the page opens and after each action of this app. Runs started from the
       * terminal (npm run ctl) or from Joule show up when the person presses Refresh, which publishes
       * the same "changed" event.
       */
      loadRatio: function () {
        var oView = this.base.getView();
        var oBundle = oView.getModel("i18n").getResourceBundle();
        var oBinding = oView.getModel().bindContext("/ratio()");
        var oModel = this._ratioModel;
        return oBinding.requestObject().then(function (oRatio) {
          var oInt = NumberFormat.getIntegerInstance({ groupingEnabled: true });
          var aRows = oRatio.rows || [];
          oModel.setData({
            ratio: oRatio.ratio,
            subtitle: oBundle.getText("ratioSubtitle", [oRatio.total]),
            types: [1, 2, 3].map(function (iType) {
              var oRow = aRows.find(function (r) { return r.type === iType; }) || { runs: 0, share: 0 };
              var iPercent = Math.round(oRow.share * 1000) / 10;
              return {
                label: oBundle.getText("type" + iType),
                percent: iPercent,
                display: oBundle.getText("ratioShareDisplay", [oRow.runs, iPercent]),
                state: TYPE_STATE[iType]
              };
            }),
            allTokensText: oInt.format(oRatio.allTokens),
            proposalTokensText: oInt.format(oRatio.proposalTokens),
            wrongServed: String(oRatio.wrongServed),
            wrongColor: oRatio.wrongServed > 0 ? "Error" : "Good"
          });
        }).catch(function () {
          MessageToast.show(oBundle.getText("ratioError"));
        });
      }
    });
  }
);
