sap.ui.define([], function () {
  "use strict";

  const list = (a) => (Array.isArray(a) ? a.join(", ") : "");

  return {
    /**
     * Turns the raw agent card into flat texts the form can bind to.
     * @param {object} card the agent card as served by /.well-known/agent-card.json
     * @param {sap.base.i18n.ResourceBundle} bundle for Yes and No
     */
    toViewData(card, bundle) {
      const yesNo = (b) => bundle.getText(b ? "yes" : "no");
      const schemes = Object.entries(card.securitySchemes || {}).map(([name, s]) => ({
        name,
        type: s.type || "",
        description: s.description || "",
      }));
      const scopes = (card.security || []).flatMap((req) => Object.values(req).flat());
      const skills = (card.skills || []).map((s) => ({
        id: s.id,
        name: s.name || s.id,
        description: s.description || "",
        tags: list(s.tags),
        examples: (s.examples || []).join(" | "),
      }));
      return {
        name: card.name || "",
        description: card.description || "",
        version: card.version || "",
        url: card.url || "",
        protocolVersion: card.protocolVersion || "",
        transport: card.preferredTransport || "",
        streaming: yesNo(card.capabilities && card.capabilities.streaming),
        push: yesNo(card.capabilities && card.capabilities.pushNotifications),
        inputModes: list(card.defaultInputModes),
        outputModes: list(card.defaultOutputModes),
        schemes,
        scheme: schemes.map((s) => s.name).join(", "),
        schemeType: schemes.map((s) => s.type).join(", "),
        schemeDescription: schemes.map((s) => s.description).join(" "),
        scopes: scopes.join(", "),
        skills,
        examples: (card.skills || []).flatMap((s) => s.examples || []).map((text) => ({ text })),
        raw: JSON.stringify(card, null, 2),
      };
    },
  };
});
