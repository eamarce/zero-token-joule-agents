sap.ui.define([], function () {
  "use strict";

  /** Parses a response body that may be empty or not JSON. */
  async function readBody(res) {
    const text = await res.text();
    try {
      return { text, json: text ? JSON.parse(text) : null };
    } catch (e) {
      return { text, json: null };
    }
  }

  return {
    /** The public agent card. */
    async getCard(path) {
      const res = await fetch(path, { headers: { Accept: "application/json" } });
      const body = await readBody(res);
      if (!res.ok || !body.json) {
        throw new Error("HTTP " + res.status);
      }
      return body.json;
    },

    /** The JSON-RPC message/send request Joule sends, with one text part. */
    buildMessageSend(text) {
      const stamp = Date.now();
      return {
        jsonrpc: "2.0",
        id: stamp,
        method: "message/send",
        params: {
          message: { role: "user", kind: "message", messageId: "ui-" + stamp, parts: [{ kind: "text", text }] },
        },
      };
    },

    /**
     * POST a JSON-RPC request. Authentication is the browser's (Basic prompt in local development).
     * Resolves with the HTTP status and the parsed body; rejects only when the request cannot be made.
     */
    async post(path, request) {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(request),
        credentials: "same-origin",
      });
      const body = await readBody(res);
      return { status: res.status, ok: res.ok, json: body.json, text: body.text };
    },
  };
});
