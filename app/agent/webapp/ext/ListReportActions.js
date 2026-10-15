sap.ui.define(
  ["sap/m/MessageBox", "sap/m/MessageToast", "sap/ui/core/EventBus"],
  function (MessageBox, MessageToast, EventBus) {
    "use strict";

    // Unbound actions of AgentService are addressed through the entity container.
    var PROCESS_NEXT = "AgentService.EntityContainer/processNext";
    var RESET = "AgentService.EntityContainer/reset";
    // A run that reports this event means a playbook now waits for a signature (gate 2).
    var SIGNATURE_EVENT = "eligible for gate 2";

    var busy = false;

    function bundleOf(oApi) {
      return oApi.getModel("i18n").getResourceBundle();
    }

    /** Calls processNext once and resolves with the RunResult object. */
    function processOnce(oApi) {
      return oApi.editFlow.invokeAction(PROCESS_NEXT, { model: oApi.getModel() }).then(function (oContext) {
        return oContext.getObject();
      });
    }

    /**
     * Without a filter bar the list report cannot be refreshed with refresh(), so the views are refreshed
     * directly: the selected view immediately, the others when they are opened. The tab counts and the
     * ratio area are refreshed too.
     */
    function refreshAll(oApi) {
      oApi.setTabContentToBeRefreshedOnNextOpening();
      oApi.refreshTabsCount();
      EventBus.getInstance().publish("zt.agent", "changed");
      return Promise.resolve();
    }

    /** Runs processNext `iCount` times in a row; stops early when a playbook waits for a signature. */
    function process(oApi, iCount) {
      if (busy) {
        return Promise.resolve();
      }
      busy = true;
      var oBundle = bundleOf(oApi);
      var iDone = 0;
      var bSignature = false;
      var oLast = null;
      var pChain = Promise.resolve();
      for (var i = 0; i < iCount; i++) {
        pChain = pChain.then(function () {
          if (bSignature) {
            return null;
          }
          return processOnce(oApi).then(function (oRun) {
            iDone++;
            oLast = oRun;
            bSignature = (oRun.events || []).some(function (sEvent) {
              return sEvent.indexOf(SIGNATURE_EVENT) >= 0;
            });
          });
        });
      }
      return pChain
        .then(function () {
          return refreshAll(oApi);
        })
        .then(function () {
          if (iCount === 1 && oLast) {
            MessageToast.show(oBundle.getText("processedToast", [oLast.runId, oLast.runType, oLast.tokens]));
          } else if (iDone > 0) {
            MessageToast.show(oBundle.getText(bSignature ? "stoppedForSignature" : "processedFiveToast", [iDone]));
          }
        })
        .catch(function () {
          // The framework already shows the error message of the failed action (for example: no email left).
          return refreshAll(oApi);
        })
        .finally(function () {
          busy = false;
        });
    }

    // The handler `this` is the ExtensionAPI of the list report.
    return {
      processNext: function () {
        return process(this, 1);
      },

      processFive: function () {
        return process(this, 5);
      },

      /**
       * Reads the lists and the ratio again, for runs that started elsewhere (the terminal, Joule).
       * Nothing refreshes by itself: the person decides when.
       */
      refresh: function () {
        var oApi = this;
        var oModel = oApi.getModel();
        var oBundle = bundleOf(oApi);
        if (busy || oModel.hasPendingChanges()) {
          return Promise.resolve();
        }
        oModel.refresh();
        return refreshAll(oApi).then(function () {
          MessageToast.show(oBundle.getText("refreshedToast"));
        });
      },

      reset: function () {
        var oApi = this;
        var oBundle = bundleOf(oApi);
        if (busy) {
          return;
        }
        var sConfirm = oBundle.getText("resetConfirmButton");
        MessageBox.confirm(oBundle.getText("resetConfirm"), {
          title: oBundle.getText("resetTitle"),
          actions: [sConfirm, MessageBox.Action.CANCEL],
          emphasizedAction: sConfirm,
          onClose: function (sAction) {
            if (sAction !== sConfirm) {
              return;
            }
            busy = true;
            oApi.editFlow
              .invokeAction(RESET, { model: oApi.getModel() })
              .then(function () {
                return refreshAll(oApi);
              })
              .then(function () {
                MessageToast.show(oBundle.getText("resetDone"));
              })
              .catch(function () {
                // The framework shows the error (for example: 403 when the user is not an Approver).
              })
              .finally(function () {
                busy = false;
              });
          }
        });
      }
    };
  }
);
